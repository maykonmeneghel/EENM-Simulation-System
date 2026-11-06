"""Clinical conditions: per-article adjustments of the LITERATURE model."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from eenm_engine.domain.conditions import ADJUSTMENTS, SCI_FAST_SHIFT, Condition, apply_condition, defaults
from eenm_engine.domain.model_options import ModelOptions
from eenm_engine.interfaces.http.app import create_app
from eenm_engine.interfaces.http.schemas import SimulationRequest

client = TestClient(create_app())
LIT = ModelOptions.literature()


def _peak(body: dict[str, object]) -> float:
    lines = client.post("/v1/simulations/stream", json=body).text.splitlines()
    return float(json.loads(lines[-1])["summary"]["peakForce"])


def test_normal_changes_nothing_and_defaults_are_the_strongest_findings() -> None:
    assert apply_condition(LIT, Condition.NORMAL, None) == LIT
    assert defaults(Condition.SCI_CHRONIC) == ("SCI_FATIGABILITY",)
    assert defaults(Condition.PARKINSON) == ("PD_MOTOR_UNIT_LOSS",)


def test_sci_fatigability_shift_is_the_fitted_value() -> None:
    fitted = json.loads((Path(__file__).parents[2] / "validation/results/condition-sci-fatigability.json").read_text())
    assert fitted["fitted"]["fastShift"] == SCI_FAST_SHIFT
    assert abs(fitted["achieved"]["fatigueIndex"] - 0.19) < 0.01
    options = apply_condition(LIT, Condition.SCI_CHRONIC, None)
    assert options.fatigue is not None and options.fatigue.fast_shift == SCI_FAST_SHIFT


def test_fast_twitch_follows_scott_2006() -> None:
    o = apply_condition(LIT, Condition.SCI_CHRONIC, ("SCI_FAST_TWITCH",))
    assert o.twitch_time_scale == pytest.approx(LIT.twitch_time_scale * 0.86)
    hrt = o.twitch_time_scale * o.twitch_shape.half_relaxation_ratio()
    hrt0 = LIT.twitch_time_scale * LIT.twitch_shape.half_relaxation_ratio()
    assert hrt == pytest.approx(0.62 * hrt0, rel=1e-6)


def test_force_adjustments_multiply_and_chronaxie_changes_only_tau() -> None:
    both = apply_condition(LIT, Condition.PARKINSON, ("PD_MOTOR_UNIT_LOSS", "PD_NEUROPATHY"))
    assert both.force_scale == pytest.approx(109 / 129 * 5.35 / 10.90)
    tau = apply_condition(LIT, Condition.SCI_CHRONIC, ("SCI_CHRONAXIE",)).axon_excitability
    assert tau.chronaxie_ms == 0.13 and tau.lowest_rheobase == LIT.axon_excitability.lowest_rheobase


@pytest.mark.parametrize(
    ("condition", "ids"),
    [
        (Condition.PARKINSON, ("SCI_ATROPHY",)),  # belongs to another condition
        (Condition.PARKINSON, ("PD_TREMOR",)),  # needs the central layer
        (Condition.SCI_CHRONIC, ("NOPE",)),
    ],
)
def test_invalid_adjustments_are_rejected(condition: Condition, ids: tuple[str, ...]) -> None:
    with pytest.raises(ValueError):
        apply_condition(LIT, condition, ids)
    body = {"modelVariant": "LITERATURE", "condition": condition.value, "conditionAdjustments": list(ids)}
    assert client.post("/v1/simulations/stream", json=body).status_code == 422


def test_request_maps_condition_and_original_ignores_it() -> None:
    sci = SimulationRequest.model_validate({"modelVariant": "LITERATURE", "condition": "SCI_CHRONIC"})
    assert sci.to_config().model == apply_condition(LIT, Condition.SCI_CHRONIC, None)
    none = SimulationRequest.model_validate(
        {"modelVariant": "LITERATURE", "condition": "SCI_CHRONIC", "conditionAdjustments": []}
    )
    assert none.to_config().model == LIT  # every adjustment switched off
    assert SimulationRequest.model_validate({"condition": "PARKINSON"}).to_config().model == ModelOptions()


def test_parkinson_motor_unit_loss_scales_the_streamed_force() -> None:
    stimulus = {"durationMs": 60, "pulseWidthUs": 300, "waveform": "BIPHASIC_SYMMETRIC", "amplitude": 153}
    normal = _peak({"modelVariant": "LITERATURE", "stimulus": stimulus})
    pd = _peak({"modelVariant": "LITERATURE", "condition": "PARKINSON", "stimulus": stimulus})
    assert pd == pytest.approx(normal * 109 / 129, rel=1e-9)


def test_catalog_lists_every_condition_and_adjustment_with_its_source() -> None:
    body = client.get("/v1/conditions").json()
    assert [c["id"] for c in body] == [c.value for c in Condition]
    listed = {a["id"]: a for c in body for a in c["adjustments"]}
    assert set(listed) == {a.id for a in ADJUSTMENTS}
    for a in listed.values():
        assert a["source"]["doi"] or a["source"]["pmid"]
        assert a["evidence"] in {"FULL_TEXT", "ABSTRACT"} and a["measuredIn"]
    assert listed["PD_TREMOR"]["available"] is False

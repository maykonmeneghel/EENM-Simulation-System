"""Force as a percentage of the healthy muscle's maximal force (fused 100 Hz tetanus, all units, rested)."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from eenm_engine.interfaces.http.app import create_app

client = TestClient(create_app())
STIM = {"durationMs": 500, "pulseWidthUs": 300, "waveform": "BIPHASIC_SYMMETRIC", "amplitude": 153}


def _run(body: dict[str, object]) -> tuple[float | None, float]:
    events = [json.loads(line) for line in client.post("/v1/simulations/stream", json=body).text.splitlines()]
    return events[0]["maxForce"], float(events[-1]["summary"]["peakForce"])


def test_supramaximal_40_hz_is_close_to_the_maximal_force() -> None:
    max_force, peak = _run({"modelVariant": "LITERATURE", "stimulus": STIM})
    assert max_force is not None
    assert 0.97 < peak / max_force <= 1.01  # the force-frequency curve is at its plateau at 40 Hz (validation)


def test_the_percentage_does_not_depend_on_the_integration_step_while_model_units_do() -> None:
    fine_max, fine_peak = _run({"modelVariant": "LITERATURE", "stimulus": {**STIM, "stepMs": 0.01}})
    coarse_max, coarse_peak = _run({"modelVariant": "LITERATURE", "stimulus": {**STIM, "stepMs": 0.02}})
    assert fine_max is not None and coarse_max is not None
    assert coarse_peak == pytest.approx(2 * fine_peak, rel=0.01)  # twitches scale with the step
    assert coarse_peak / coarse_max == pytest.approx(fine_peak / fine_max, abs=0.01)


def test_partial_recruitment_and_conditions_show_as_a_lower_percentage() -> None:
    max_force, weak = _run({"modelVariant": "LITERATURE", "stimulus": {**STIM, "amplitude": 75}})
    assert max_force is not None and 0.05 < weak / max_force < 0.6
    _, normal = _run({"modelVariant": "LITERATURE", "stimulus": STIM})
    atrophy_max, atrophy = _run(
        {
            "modelVariant": "LITERATURE",
            "condition": "SCI_CHRONIC",
            "conditionAdjustments": ["SCI_ATROPHY"],
            "stimulus": STIM,
        }
    )
    assert atrophy_max == max_force  # 100 % is the healthy muscle's maximum
    assert atrophy / atrophy_max == pytest.approx(1.36 / 2.44 * normal / max_force, rel=1e-6)


def test_original_has_no_percentage() -> None:
    max_force, _ = _run({"stimulus": {"durationMs": 20}})
    assert max_force is None

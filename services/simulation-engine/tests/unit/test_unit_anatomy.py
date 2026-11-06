"""``started.units``: per-unit geometry and conduction times for the 3D view (docs/design/3d-view.md §4)."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from eenm_engine.domain import cisi_kohn
from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS, TYPE_RANGES, MotorUnitType, Muscle
from eenm_engine.interfaces.http.app import create_app

client = TestClient(create_app())
STIM = {"durationMs": 20, "amplitude": 153}


def _started(body: dict[str, object]) -> dict[str, object]:
    first = client.post("/v1/simulations/stream", json=body).text.splitlines()[0]
    event: dict[str, object] = json.loads(first)
    assert event["type"] == "started"
    return event


def test_one_entry_per_simulated_unit_in_s_fr_ff_order() -> None:
    started = _started({"modelVariant": "LITERATURE", "stimulus": STIM})
    units = started["units"]
    assert isinstance(units, dict)
    counts = started["motorUnits"]
    assert isinstance(counts, dict)
    n = sum(int(v) for v in counts.values())
    assert n == 120
    for key in ("type", "poolIndex", "somaDiameterUm", "dendriteDiameterUm", "dendriteLengthMm", "conductionMs",
                "toElectrodeMs", "toMuscleMs", "weight", "axonRheobase"):  # fmt: skip
        assert len(units[key]) == n, key
    assert units["type"] == ["S"] * counts["S"] + ["FR"] * counts["FR"] + ["FF"] * counts["FF"]


def test_booth_geometry_spans_the_type_ranges_of_the_pool() -> None:
    units = _started({"modelVariant": "LITERATURE", "stimulus": STIM})["units"]
    assert isinstance(units, dict)
    assert units["motoneuron"] == "BOOTH_1997"
    pool = MUSCLE_PRESETS[Muscle.SOLEUS].pool_size
    for t in MotorUnitType:
        rows = [i for i, x in enumerate(units["type"]) if x == t.value]
        soma = [units["somaDiameterUm"][i] for i in rows]
        r = TYPE_RANGES[t].soma_diameter_um
        lo, hi = sorted((r.first, r.last))
        assert all(lo - 1e-6 <= s <= hi + 1e-6 for s in soma), t
        # proportional selection spreads the units over the type: the last chosen index is near the pool's end
        assert max(units["poolIndex"][i] for i in rows) > 0.8 * pool[t]
        weights = {units["weight"][i] for i in rows}
        assert len(weights) == 1
        assert pytest.approx(weights.pop() * len(rows)) == pool[t]  # the simulated units stand for the whole type


def test_conduction_splits_at_the_electrode() -> None:
    started = _started({"modelVariant": "LITERATURE", "stimulus": STIM})
    units = started["units"]
    assert isinstance(units, dict)
    assert started["electrodeFraction"] == 0.9
    for whole, a, b in zip(units["conductionMs"], units["toElectrodeMs"], units["toMuscleMs"], strict=True):
        assert a + b == pytest.approx(whole)
        assert a == pytest.approx(0.9 * whole, abs=0.01)  # rounded to the 0.01 ms step


def test_drive_uses_the_cisi_kohn_geometry() -> None:
    body = {"modelVariant": "LITERATURE", "stimulus": STIM, "centralDrive": {"enabled": True, "voluntaryNa": 5}}
    units = _started(body)["units"]
    assert isinstance(units, dict)
    assert units["motoneuron"] == "CISI_KOHN_2008"
    ff_last = cisi_kohn.TYPE_PARAMETERS[MotorUnitType.FF].soma_diameter_um.last
    booth_ff_last = TYPE_RANGES[MotorUnitType.FF].soma_diameter_um.last
    assert ff_last != booth_ff_last  # 112.5 vs 113 µm: the test can tell the two models apart
    assert max(units["somaDiameterUm"]) <= ff_last + 1e-6
    assert max(units["dendriteLengthMm"]) <= cisi_kohn.TYPE_PARAMETERS[MotorUnitType.FF].dendrite_length_um.last / 1000


def test_no_electrode_when_the_current_goes_into_the_soma() -> None:
    started = _started({"modelVariant": "LITERATURE", "stimulationSite": "MOTONEURON_POOL", "stimulus": STIM})
    units = started["units"]
    assert isinstance(units, dict)
    assert started["electrodeFraction"] is None
    assert units["toElectrodeMs"] is None and units["toMuscleMs"] is None
    assert all(c > 0 for c in units["conductionMs"])

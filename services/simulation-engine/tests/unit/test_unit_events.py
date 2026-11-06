"""``chunk.unitEvents``: the per-unit events of the 3D replay add up to what the run counted (design §5.3)."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import replace

import numpy as np
from fastapi.testclient import TestClient

from eenm_engine.application.events import SimulationChunk, SimulationStarted
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.central_drive import CentralDrive, Tremor
from eenm_engine.domain.model_options import ModelOptions, StimulationSite
from eenm_engine.domain.motor_unit_pool import Muscle, proportional_units
from eenm_engine.domain.simulation import SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, Waveform
from eenm_engine.domain.unit_events import UnitEventKind as K
from eenm_engine.infrastructure.compiled_cisi_kohn import CompiledCisiKohnIntegrator
from eenm_engine.infrastructure.compiled_motoneuron import CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from eenm_engine.interfaces.http.app import create_app

STEP = 0.025


def _config(site: StimulationSite, drive: bool, amplitude: float = 153.0, seconds: float = 1.0) -> SimulationConfig:
    model = ModelOptions.literature(site=site)
    if drive:
        model = replace(model, central_drive=CentralDrive(tremor=Tremor(4.4, 3.0)))
    return SimulationConfig(
        stimulus=StimulusProtocol(
            duration_ms=seconds * 1000,
            step_ms=STEP,
            frequency_hz=30,
            pulse_width_us=300,
            amplitude=amplitude,
            waveform=Waveform.BIPHASIC_SYMMETRIC,
        ),
        model=model,
        muscle=Muscle.FLEXOR_CARPI_RADIALIS,
        units_per_type=proportional_units(Muscle.FLEXOR_CARPI_RADIALIS, 30),
        output_step_ms=1.0,
        unit_events=True,
    )


def _run(config: SimulationConfig) -> tuple[SimulationStarted, list[SimulationChunk]]:
    run = RunSimulation(
        ScipyBdfSolver(), pool_integrator=CompiledPoolIntegrator(), drive_integrator=CompiledCisiKohnIntegrator()
    )
    events = list(run.execute(config))
    started = events[0]
    assert isinstance(started, SimulationStarted)
    return started, [e for e in events if isinstance(e, SimulationChunk)]


def _all(chunks: list[SimulationChunk]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    parts = [c.unit_events for c in chunks]
    assert all(p is not None for p in parts)
    return tuple(np.concatenate([getattr(p, f) for p in parts]) for f in ("sample", "unit", "kind", "origin"))  # type: ignore[return-value]


def test_merge_events_add_up_to_the_axon_counters() -> None:
    # partial recruitment at 20 Hz under a voluntary drive: every kind of event happens (a supramaximal 30 Hz train
    # resets nearly every motoneuron instead, and an electrode collision would go untested)
    config = _config(StimulationSite.MOTOR_AXONS, drive=True, amplitude=100.0)
    config = replace(
        config,
        stimulus=replace(config.stimulus, frequency_hz=20),
        model=replace(config.model, central_drive=CentralDrive(voluntary_na=6.0)),
    )
    started, chunks = _run(config)
    sample, unit, kind, origin = _all(chunks)
    count = Counter(kind.tolist())
    totals = chunks[-1].axon_events
    assert totals is not None
    merge_kinds = (K.SOMA_SPIKE, K.FES_FIRE, K.FES_BLOCKED, K.COLLISION, K.ANTIDROMIC_RESET, K.CENTRAL_PASSED)
    assert all(count[k] > 0 for k in (*merge_kinds, K.SOMA_COLLISION)), count  # the test has something to check
    assert count[K.SOMA_SPIKE] == totals["central"]
    assert count[K.CENTRAL_PASSED] == totals["centralTransmitted"]
    assert count[K.FES_FIRE] == totals["fesTransmitted"]
    assert count[K.COLLISION] + count[K.SOMA_COLLISION] == totals["collisions"]
    assert count[K.FES_BLOCKED] == totals["fesBlocked"]
    assert count[K.ANTIDROMIC_RESET] == totals["resets"]
    # every central spike that ends at the electrode was born at a soma spike of the same unit, before it
    born = set(zip(unit[kind == K.SOMA_SPIKE].tolist(), sample[kind == K.SOMA_SPIKE].tolist(), strict=True))
    for k in (K.CENTRAL_PASSED, K.COLLISION, K.CENTRAL_BLOCKED):
        rows = kind == k
        assert all((u, o) in born for u, o in zip(unit[rows].tolist(), origin[rows].tolist(), strict=True))
        assert (origin[rows] < sample[rows]).all() or not rows.any()
    # the spikes leaving the electrode reach the muscle: one arrival per pass or FES fire (the last ones may be
    # still on their way when the run ends)
    leaving = count[K.CENTRAL_PASSED] + count[K.FES_FIRE]
    assert leaving - 30 <= count[K.MUSCLE_ARRIVAL] <= leaving
    assert started.units is not None


def test_fes_only_fires_the_recruited_axons_and_they_reach_the_muscle_after_the_electrode_delay() -> None:
    started, chunks = _run(_config(StimulationSite.MOTOR_AXONS, drive=False))
    sample, unit, kind, _ = _all(chunks)
    assert set(kind.tolist()) == {K.FES_FIRE, K.MUSCLE_ARRIVAL}
    fires = kind == K.FES_FIRE
    pulses = np.unique(sample[fires])
    assert 25 <= pulses.size <= 31  # 30 Hz for 1 s
    assert started.units is not None
    conduction = np.round(np.asarray(started.units.conduction_ms) / STEP).astype(int)
    first = {int(u): int(s) for s, u in sorted(zip(sample[fires], unit[fires], strict=True), reverse=True)}
    arrival = {}
    for s, u in sorted(zip(sample[~fires], unit[~fires], strict=True), reverse=True):
        arrival[int(u)] = int(s)
    for u, s in first.items():  # FES-only mode applies the whole soma → muscle delay after the axon fires
        assert arrival[u] - s == conduction[u]


def test_invasive_drive_streams_soma_spikes() -> None:
    _, chunks = _run(_config(StimulationSite.MOTONEURON_SOMA, drive=True, amplitude=0.0))
    _, _, kind, _ = _all(chunks)
    count = Counter(kind.tolist())
    assert count[K.SOMA_SPIKE] > 0 and set(count) <= {K.SOMA_SPIKE, K.MUSCLE_ARRIVAL}


def test_events_are_sorted_within_each_chunk_and_off_by_default() -> None:
    config = _config(StimulationSite.MOTOR_AXONS, drive=True)
    _, chunks = _run(config)
    for c in chunks:
        assert c.unit_events is not None
        assert (np.diff(c.unit_events.sample) >= 0).all()
    _, plain = _run(replace(config, unit_events=False))
    assert all(c.unit_events is None for c in plain)


client = TestClient(create_app())


def test_http_streams_unit_events_on_request_and_limits_the_duration() -> None:
    body = {
        "modelVariant": "LITERATURE",
        "muscle": "FLEXOR_CARPI_RADIALIS",
        "stimulus": {"durationMs": 50, "amplitude": 153},
    }
    lines = [
        json.loads(x)
        for x in client.post("/v1/simulations/stream", json={**body, "output": {"unitEvents": True}}).text.splitlines()
    ]
    assert lines[0]["stepMs"] > 0
    chunk = next(x for x in lines if x["type"] == "chunk")
    assert set(chunk["unitEvents"]) == {"sample", "unit", "kind", "origin"}
    plain = [json.loads(x) for x in client.post("/v1/simulations/stream", json=body).text.splitlines()]
    assert next(x for x in plain if x["type"] == "chunk")["unitEvents"] is None
    long = {**body, "stimulus": {"durationMs": 31_000}, "output": {"unitEvents": True}}
    response = client.post("/v1/simulations/stream", json=long)
    assert response.status_code == 422
    assert "30 s" in response.text

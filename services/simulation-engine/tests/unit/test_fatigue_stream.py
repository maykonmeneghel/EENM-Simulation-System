"""Fatigue reaches the stream: remaining capacity per type and of the whole muscle in every chunk."""

from __future__ import annotations

import numpy as np

from eenm_engine.application.events import SimulationChunk
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.model_options import LITERATURE_UNITS, ModelOptions
from eenm_engine.domain.motor_unit_pool import MotorUnitType, Muscle, proportional_units
from eenm_engine.domain.simulation import SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, Waveform
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from eenm_engine.interfaces.http.schemas import event_to_json


def _chunks(config: SimulationConfig) -> list[SimulationChunk]:
    return [e for e in RunSimulation(ScipyBdfSolver()).execute(config) if isinstance(e, SimulationChunk)]


def _literature(duration_ms: float) -> SimulationConfig:
    stimulus = StimulusProtocol(
        duration_ms=duration_ms,
        step_ms=0.05,
        frequency_hz=40,
        pulse_width_us=300,
        amplitude=153,
        waveform=Waveform.BIPHASIC_SYMMETRIC,
    )
    return SimulationConfig(
        stimulus=stimulus,
        model=ModelOptions.literature(),
        units_per_type=proportional_units(Muscle.SOLEUS, LITERATURE_UNITS),
        output_step_ms=1.0,
    )


def test_literature_chunks_carry_a_falling_capacity_and_fast_units_tire_first() -> None:
    chunks = _chunks(_literature(3000))
    snaps = [c.fatigue for c in chunks]
    assert all(s is not None for s in snaps)
    muscle = np.array([s.muscle for s in snaps if s is not None])
    assert muscle[0] <= 1.0 and np.all(np.diff(muscle) <= 1e-12)  # no recovery in the model
    assert muscle[-1] < 1.0
    last = snaps[-1]
    assert last is not None
    s, ff = last.by_type[MotorUnitType.S], last.by_type[MotorUnitType.FF]
    assert s is not None and ff is not None and ff < s
    times = [x.time_ms for x in snaps if x is not None]
    assert times == sorted(times) and times[-1] == chunks[-1].time_ms[-1]


def test_original_has_no_fatigue_and_the_wire_format_says_so() -> None:
    chunk = _chunks(SimulationConfig(stimulus=StimulusProtocol(duration_ms=20)))[0]
    assert chunk.fatigue is None
    assert event_to_json(chunk)["fatigue"] is None


def test_wire_format_of_the_snapshot() -> None:
    chunk = _chunks(_literature(50))[-1]
    body = event_to_json(chunk)["fatigue"]
    assert isinstance(body, dict)
    assert set(body) == {"timeMs", "muscle", "S", "FR", "FF"}

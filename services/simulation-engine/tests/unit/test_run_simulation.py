import numpy as np
import pytest

from eenm_engine.application.events import SimulationChunk, SimulationCompleted, SimulationStarted
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.motor_unit_pool import MotorUnitType
from eenm_engine.domain.simulation import SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol
from tests.fakes import SpikingSolver


def run(config: SimulationConfig, block_ms: float = 5.0, solver: SpikingSolver | None = None) -> list:  # type: ignore[type-arg]
    return list(RunSimulation(solver or SpikingSolver(), block_ms=block_ms).execute(config))


CONFIG = SimulationConfig(stimulus=StimulusProtocol(duration_ms=100, step_ms=0.01), output_step_ms=0.1)


def test_event_order_is_started_chunks_completed() -> None:
    events = run(CONFIG)
    assert isinstance(events[0], SimulationStarted)
    assert isinstance(events[-1], SimulationCompleted)
    assert all(isinstance(e, SimulationChunk) for e in events[1:-1])
    assert len(events) > 3


def test_started_reports_the_simulated_pool() -> None:
    started = run(CONFIG)[0]
    assert started.motor_units == {MotorUnitType.S: 5, MotorUnitType.FR: 2, MotorUnitType.FF: 2}
    assert started.output_step_ms == pytest.approx(0.1)


def test_chunks_cover_the_output_grid_exactly_once_in_order() -> None:
    chunks = [e for e in run(CONFIG) if isinstance(e, SimulationChunk)]
    times = np.concatenate([c.time_ms for c in chunks])
    np.testing.assert_allclose(times, np.arange(0, 1001) * 0.1)
    progress = [c.progress for c in chunks]
    assert progress == sorted(progress) and progress[-1] == 1.0


def test_chunk_arrays_are_consistent() -> None:
    for chunk in (e for e in run(CONFIG) if isinstance(e, SimulationChunk)):
        n = chunk.time_ms.size
        assert chunk.stimulus.size == chunk.emg.size == chunk.force_total.size == n
        total = sum(chunk.force_by_type.values())
        np.testing.assert_allclose(chunk.force_total, total)


def test_result_does_not_depend_on_block_size() -> None:
    def force(block_ms: float) -> np.ndarray:
        return np.concatenate([e.force_total for e in run(CONFIG, block_ms) if isinstance(e, SimulationChunk)])

    np.testing.assert_array_equal(force(1.0), force(37.0))


def test_one_integration_is_advanced_block_after_block_without_gaps() -> None:
    solver = SpikingSolver()
    run(CONFIG, block_ms=10.0, solver=solver)
    assert solver.advances[0][0] == pytest.approx(0.01) and solver.advances[-1][1] == pytest.approx(100.0)
    for (_, end), (start, _) in zip(solver.advances, solver.advances[1:], strict=False):
        assert start == pytest.approx(end + 0.01)


def test_force_is_produced_and_summarised() -> None:
    events = run(CONFIG)
    total = np.concatenate([e.force_total for e in events if isinstance(e, SimulationChunk)])
    summary = events[-1].summary
    assert summary.peak_force > 0
    assert summary.peak_force >= total.max()
    assert 0 <= summary.time_to_peak_ms <= 100


def test_block_size_must_be_positive() -> None:
    with pytest.raises(ValueError):
        RunSimulation(SpikingSolver(), block_ms=0)


def test_solver_step_is_bounded_by_half_the_pulse_width() -> None:
    solver = SpikingSolver()
    short = SimulationConfig(stimulus=StimulusProtocol(duration_ms=50, frequency_hz=40, duty_cycle_percent=1.2))
    run(short, solver=solver)
    assert solver.max_steps == [pytest.approx(0.15)]  # 0.3 ms pulses


def test_a_short_pulse_train_is_not_stepped_over_by_the_real_solver() -> None:
    from eenm_engine.domain.force_pipeline import find_peaks_matlab
    from eenm_engine.domain.simulation import MotorUnitSetup
    from eenm_engine.domain.stimulus import stimulus_current
    from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver

    protocol = StimulusProtocol(duration_ms=200, frequency_hz=40, duty_cycle_percent=1.2, amplitude=150)
    pool = MotorUnitSetup.from_config(SimulationConfig(stimulus=protocol)).motoneurons
    times = protocol.time_grid()
    integration = ScipyBdfSolver().start(
        lambda t, s: pool.derivatives(t, s, lambda u: stimulus_current(u, protocol)),
        pool.initial_state(),
        0.0,
        200.0,
        pool.jacobian_sparsity(),
        max_step=protocol.solver_max_step_ms(),
    )
    voltage = pool.soma_voltage(integration.advance(times), pool.n_units)
    assert find_peaks_matlab(voltage[:, 0])[0].size == 8  # one spike per pulse (pulses at 0, 25, ..., 175 ms)

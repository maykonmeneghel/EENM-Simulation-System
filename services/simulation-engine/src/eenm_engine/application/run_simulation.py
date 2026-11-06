"""Use case: run a simulation and stream its force as it is computed."""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator

import numpy as np
from numpy.typing import NDArray

from eenm_engine.application.events import (
    FatigueSnapshot,
    SimulationChunk,
    SimulationCompleted,
    SimulationEvent,
    SimulationStarted,
    SimulationSummary,
)
from eenm_engine.application.ports import OdeSolver, PoolIntegrator
from eenm_engine.domain.axon_stimulation import axon_spike_events, spikes_in
from eenm_engine.domain.model_options import StimulationSite
from eenm_engine.domain.motoneuron import MotoneuronPool
from eenm_engine.domain.simulation import (
    UNIT_TYPES,
    ForceSeries,
    IncrementalForce,
    MotorUnitSetup,
    SimulationConfig,
)
from eenm_engine.domain.stimulus import stimulus_current, stimulus_series


class RunSimulation:
    """Integrates the motoneuron pool in time blocks and emits the force samples that become final.

    The original integrates the whole duration in one ``ode23s`` call per unit and only then computes
    the force. Here one solver runs for the whole duration and is read every ``block_ms``, which makes
    the result visible while it is computed without restarting the solver; the force of each block is
    exact (see ``IncrementalForce``).
    """

    def __init__(self, solver: OdeSolver, block_ms: float = 5.0, pool_integrator: PoolIntegrator | None = None) -> None:
        """``pool_integrator``, when given, integrates the motoneuron pool instead of the generic ``solver``."""
        if block_ms <= 0:
            raise ValueError("block_ms must be positive")
        self._solver = solver
        self._block_ms = block_ms
        self._pool_integrator = pool_integrator

    def execute(self, config: SimulationConfig) -> Iterator[SimulationEvent]:
        clock = time.perf_counter()
        protocol = config.stimulus
        setup = MotorUnitSetup.from_config(config)
        times = protocol.time_grid()
        stimulus = stimulus_series(protocol)
        force = IncrementalForce(setup, config, times.size)

        yield SimulationStarted(
            simulation_id=str(uuid.uuid4()),
            duration_ms=protocol.duration_ms,
            output_step_ms=config.output_stride * protocol.step_ms,
            motor_units={t: setup.groups[t].size for t in UNIT_TYPES},
            muscle=config.muscle,
        )

        if config.model.stimulation_site is StimulationSite.MOTOR_AXONS:
            blocks = self._axon_blocks(setup, config, stimulus, force)
        elif self._pool_integrator is not None:
            blocks = self._pool_blocks(setup.motoneurons, config, stimulus, force)
        else:
            blocks = self._integrate_in_blocks(setup.motoneurons, config, times, force)
        totals: list[NDArray[np.float64]] = []
        for series in blocks:
            totals.append(series.total_force)
            summary = force.capacity_summary()
            fatigue = (
                FatigueSnapshot(time_ms=float(times[series.stop - 1]), muscle=summary[0], by_type=summary[1])
                if summary is not None
                else None
            )
            chunk = self._chunk(series, times, stimulus, config.output_stride, fatigue)
            if chunk.time_ms.size:
                yield chunk

        total = np.concatenate(totals)
        peak = int(np.argmax(total))
        yield SimulationCompleted(
            elapsed_seconds=time.perf_counter() - clock,
            summary=SimulationSummary(
                peak_force=float(total[peak]),
                mean_force=float(total.mean()),
                time_to_peak_ms=float(times[peak]),
            ),
        )

    def _axon_blocks(
        self,
        setup: MotorUnitSetup,
        config: SimulationConfig,
        stimulus: NDArray[np.float64],
        force: IncrementalForce,
    ) -> Iterator[ForceSeries]:
        """Axon stimulation: spikes follow from the stimulus directly, no ODE; still released block by block."""
        protocol = config.stimulus
        index, fires = axon_spike_events(
            stimulus, protocol.step_ms, setup.axon_rheobase, config.model.axon_excitability
        )
        block = max(1, round(self._block_ms / protocol.step_ms))
        for start in range(0, stimulus.size, block):
            # dense spike rows only for this block: memory does not grow with the duration
            released = force.add(spikes_in(index, fires, start, min(start + block, stimulus.size)))
            if released is not None:
                yield released

    def _pool_blocks(
        self,
        motoneurons: MotoneuronPool,
        config: SimulationConfig,
        stimulus: NDArray[np.float64],
        force: IncrementalForce,
    ) -> Iterator[ForceSeries]:
        """Fixed-step pool integration: the interval ending at sample ``n`` uses the current of sample ``n - 1``."""
        assert self._pool_integrator is not None
        protocol = config.stimulus
        integration = self._pool_integrator.start(motoneurons, protocol.step_ms)
        released = force.add(MotoneuronPool.soma_voltage(motoneurons.initial_state()[:, None], motoneurons.n_units))
        if released is not None:
            yield released
        block = max(1, round(self._block_ms / protocol.step_ms))
        for start in range(1, stimulus.size, block):
            stop = min(start + block, stimulus.size)
            released = force.add(integration.advance(stimulus[start - 1 : stop - 1]))
            if released is not None:
                yield released

    def _integrate_in_blocks(
        self,
        motoneurons: MotoneuronPool,
        config: SimulationConfig,
        times: NDArray[np.float64],
        force: IncrementalForce,
    ) -> Iterator[ForceSeries]:
        protocol = config.stimulus
        block = max(1, round(self._block_ms / protocol.step_ms))

        def derivatives(t: float, y: NDArray[np.float64]) -> NDArray[np.float64]:
            return motoneurons.derivatives(t, y, lambda s: stimulus_current(s, protocol))

        state = motoneurons.initial_state()
        integration = self._solver.start(
            derivatives,
            state,
            float(times[0]),
            float(times[-1]),
            motoneurons.jacobian_sparsity(),
            max_step=protocol.solver_max_step_ms(),
        )
        released = force.add(MotoneuronPool.soma_voltage(state[:, None], motoneurons.n_units))
        if released is not None:
            yield released

        for start in range(1, times.size, block):
            states = integration.advance(times[start : start + block])
            released = force.add(MotoneuronPool.soma_voltage(states, motoneurons.n_units))
            if released is not None:
                yield released

    @staticmethod
    def _chunk(
        series: ForceSeries,
        times: NDArray[np.float64],
        stimulus: NDArray[np.float64],
        stride: int,
        fatigue: FatigueSnapshot | None = None,
    ) -> SimulationChunk:
        first = series.start + (-series.start) % stride
        indices = np.arange(first, series.stop, stride)
        local = indices - series.start
        return SimulationChunk(
            progress=series.stop / times.size,
            time_ms=times[indices],
            stimulus=stimulus[indices],
            force_total=series.total_force[local],
            force_by_type={t: series.force_by_type[t][local] for t in UNIT_TYPES},
            emg=series.emg[local],
            fatigue=fatigue,
        )

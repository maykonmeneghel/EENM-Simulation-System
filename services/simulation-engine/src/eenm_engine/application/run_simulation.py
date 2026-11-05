"""Use case: run a simulation and stream its force as it is computed."""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator

import numpy as np
from numpy.typing import NDArray

from eenm_engine.application.events import (
    SimulationChunk,
    SimulationCompleted,
    SimulationEvent,
    SimulationStarted,
    SimulationSummary,
)
from eenm_engine.application.ports import OdeSolver
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
    the force. Integrating in blocks of ``block_ms`` is what makes the result visible while it is being
    computed; the post-processing of each block is exact (see ``IncrementalForce``).
    """

    def __init__(self, solver: OdeSolver, block_ms: float = 5.0) -> None:
        if block_ms <= 0:
            raise ValueError("block_ms must be positive")
        self._solver = solver
        self._block_ms = block_ms

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

        totals: list[NDArray[np.float64]] = []
        for series in self._integrate_in_blocks(setup.motoneurons, config, times, force):
            totals.append(series.total_force)
            chunk = self._chunk(series, times, stimulus, config.output_stride)
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

        sparsity = motoneurons.jacobian_sparsity()
        state = motoneurons.initial_state()
        first = MotoneuronPool.soma_voltage(state[:, None], motoneurons.n_units)
        released = force.add(first)
        if released is not None:
            yield released

        start = 0
        while start < times.size - 1:
            stop = min(start + block, times.size - 1)
            solution = self._solver.integrate(derivatives, state, times[start : stop + 1], sparsity)
            state = solution[:, -1]
            released = force.add(MotoneuronPool.soma_voltage(solution[:, 1:], motoneurons.n_units))
            if released is not None:
                yield released
            start = stop

    @staticmethod
    def _chunk(
        series: ForceSeries, times: NDArray[np.float64], stimulus: NDArray[np.float64], stride: int
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
        )

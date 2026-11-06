"""Use case: run a simulation and stream its force as it is computed."""

from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from dataclasses import replace

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
from eenm_engine.application.ports import DrivenPoolIntegration, DrivenPoolIntegrator, OdeSolver, PoolIntegrator
from eenm_engine.domain.axon_stimulation import axon_spike_events, spikes_in
from eenm_engine.domain.central_drive import DriveGenerator, split_at_electrode
from eenm_engine.domain.cisi_kohn import cisi_kohn_pool, current_factor
from eenm_engine.domain.max_force import maximal_force
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
from eenm_engine.domain.unit_anatomy import unit_anatomy


class RunSimulation:
    """Integrates the motoneuron pool in time blocks and emits the force samples that become final.

    The original integrates the whole duration in one ``ode23s`` call per unit and only then computes
    the force. Here one solver runs for the whole duration and is read every ``block_ms``, which makes
    the result visible while it is computed without restarting the solver; the force of each block is
    exact (see ``IncrementalForce``).
    """

    def __init__(
        self,
        solver: OdeSolver,
        block_ms: float = 5.0,
        pool_integrator: PoolIntegrator | None = None,
        drive_integrator: DrivenPoolIntegrator | None = None,
    ) -> None:
        """``pool_integrator``, when given, integrates the (Booth 1997) motoneuron pool instead of the generic
        ``solver``; ``drive_integrator`` integrates the Cisi & Kohn motoneurons that receive a central drive."""
        if block_ms <= 0:
            raise ValueError("block_ms must be positive")
        self._solver = solver
        self._block_ms = block_ms
        self._pool_integrator = pool_integrator
        self._drive_integrator = drive_integrator

    def execute(self, config: SimulationConfig) -> Iterator[SimulationEvent]:
        clock = time.perf_counter()
        protocol = config.stimulus
        setup = MotorUnitSetup.from_config(config)
        times = protocol.time_grid()
        stimulus = stimulus_series(protocol)
        force = IncrementalForce(_force_setup(setup, config), config, times.size, stride=config.output_stride)

        yield SimulationStarted(
            simulation_id=str(uuid.uuid4()),
            duration_ms=protocol.duration_ms,
            output_step_ms=config.output_stride * protocol.step_ms,
            motor_units={t: setup.groups[t].size for t in UNIT_TYPES},
            muscle=config.muscle,
            max_force=maximal_force(config, config.reference_model),
            units=unit_anatomy(setup, config),
            electrode_fraction=(
                None
                if config.model.stimulation_site is StimulationSite.MOTONEURON_SOMA
                else config.model.electrode_fraction
            ),
        )

        merge: list[DrivenPoolIntegration] = []  # the merged integration, once started (its axon-event totals)
        if config.model.central_drive is not None:
            blocks = self._driven_blocks(setup, config, stimulus, force, merge)
        elif config.model.stimulation_site is StimulationSite.MOTOR_AXONS:
            blocks = self._axon_blocks(setup, config, stimulus, force)
        elif self._pool_integrator is not None:
            blocks = self._pool_blocks(setup.motoneurons, config, stimulus, force)
        else:
            blocks = self._integrate_in_blocks(setup.motoneurons, config, times, force)
        totals: list[NDArray[np.float64]] = []
        sampled: list[NDArray[np.int64]] = []
        for series in blocks:
            totals.append(series.total_force)
            sampled.append(series.indices)
            summary = force.capacity_summary()
            fatigue = (
                FatigueSnapshot(time_ms=float(times[series.stop - 1]), muscle=summary[0], by_type=summary[1])
                if summary is not None
                else None
            )
            chunk = self._chunk(series, times, stimulus, fatigue, merge[0].axon_events() if merge else None)
            if chunk.time_ms.size:
                yield chunk

        # on the output grid: force is only computed there
        total = np.concatenate(totals)
        peak = int(np.argmax(total))
        peak_index = int(np.concatenate(sampled)[peak])
        yield SimulationCompleted(
            elapsed_seconds=time.perf_counter() - clock,
            summary=SimulationSummary(
                peak_force=float(total[peak]),
                mean_force=float(total.mean()),
                time_to_peak_ms=float(times[peak_index]),
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

    def _driven_blocks(
        self,
        setup: MotorUnitSetup,
        config: SimulationConfig,
        stimulus: NDArray[np.float64],
        force: IncrementalForce,
        merge: list[DrivenPoolIntegration],
    ) -> Iterator[ForceSeries]:
        """Central drive into Cisi & Kohn motoneurons (``cisi_kohn``); their spike trains drive the muscle.

        Invasive mode: the stimulus density (µA/cm²) is turned into nA through each unit's soma area and added to the
        drive in the soma. Non-invasive mode: the stimulus fires the axons at the electrode (Weiss), and FES and
        central spikes meet on the axon (``axon_merge``); the spikes leaving the electrode drive the muscle.
        """
        drive = config.model.central_drive
        assert drive is not None
        if self._drive_integrator is None:
            raise ValueError("a central drive needs the compiled Cisi & Kohn integrator")
        protocol = config.stimulus
        pool = cisi_kohn_pool(setup.groups, config.muscle, drive.threshold_rule)
        integration = self._drive_integrator.start(pool, protocol.step_ms)
        generator = DriveGenerator(drive, pool.n_units, protocol.step_ms, config.seed + 2, current_factor(drive))
        invasive = config.model.stimulation_site is StimulationSite.MOTONEURON_SOMA
        index = np.empty(0, dtype=np.int64)
        fires = np.empty((0, pool.n_units), dtype=bool)
        if not invasive:
            delays = np.concatenate([setup.groups[t].muap_delay_samples for t in UNIT_TYPES])
            integration.enable_merge(delays, config.model.electrode_fraction)
            merge.append(integration)
            excitability = config.model.axon_excitability
            index, fires = axon_spike_events(stimulus, protocol.step_ms, setup.axon_rheobase, excitability)
        to_na = pool.column("c_s")  # µA/cm² × soma area (cm²) × 1000 = density × soma capacitance (nF) at 1 µF/cm²
        released = force.add(np.zeros((1, pool.n_units)))
        if released is not None:
            yield released
        block = max(1, round(self._block_ms / protocol.step_ms))
        for start in range(1, stimulus.size, block):
            stop = min(start + block, stimulus.size)
            current = generator.next(stop - start)
            if invasive:
                spikes = integration.advance(current + stimulus[start - 1 : stop - 1, None] * to_na[None, :])
            else:
                spikes = integration.advance_merged(current, spikes_in(index, fires, start, stop) > 0)
            released = force.add(spikes)
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
        fatigue: FatigueSnapshot | None = None,
        axon_events: dict[str, int] | None = None,
    ) -> SimulationChunk:
        indices = series.indices
        return SimulationChunk(
            progress=series.stop / times.size,
            time_ms=times[indices],
            stimulus=stimulus[indices],
            force_total=series.total_force,
            force_by_type=dict(series.force_by_type),
            emg=series.emg,
            fatigue=fatigue,
            axon_events=axon_events,
        )


def _force_setup(setup: MotorUnitSetup, config: SimulationConfig) -> MotorUnitSetup:
    """The setup the force pipeline delays spikes with. In the non-invasive mode with a central drive the spikes are
    taken where they leave the electrode, so only the electrode → muscle part of the conduction delay remains (the
    soma → electrode part is in the axon merge)."""
    if config.model.central_drive is None or config.model.stimulation_site is StimulationSite.MOTONEURON_SOMA:
        return setup
    fraction = config.model.electrode_fraction
    groups = {
        t: replace(g, muap_delay_samples=split_at_electrode(g.muap_delay_samples, fraction)[1])
        for t, g in setup.groups.items()
    }
    return replace(setup, groups=groups)

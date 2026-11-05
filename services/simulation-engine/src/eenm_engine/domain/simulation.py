"""Simulation configuration and the incremental force computation used for streaming."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.force_pipeline import (
    MUAP_TIME,
    TwitchState,
    junction_potential,
    mean_over_units,
    median_filter_3x3,
    muap_train,
    spike_train,
    twitch_force_segment,
)
from eenm_engine.domain.motoneuron import REFERENCE_TEMPERATURE_C, InjectionSite, MotoneuronPool
from eenm_engine.domain.motor_unit_pool import (
    MUSCLE_PRESETS,
    Geometry,
    MotorUnitGroup,
    MotorUnitType,
    Muscle,
    build_group,
)
from eenm_engine.domain.stimulus import StimulusProtocol

UNIT_TYPES = (MotorUnitType.S, MotorUnitType.FR, MotorUnitType.FF)
"""Processing order of ``Main.m`` (also the order of the MUAP-shape random draws)."""


@dataclass(frozen=True)
class SimulationConfig:
    """Everything ``Main.m`` hard-codes, as parameters. Defaults reproduce ``Main.m``."""

    stimulus: StimulusProtocol = field(default_factory=StimulusProtocol)
    muscle: Muscle = Muscle.SOLEUS
    units_per_type: dict[MotorUnitType, int] = field(
        default_factory=lambda: {MotorUnitType.S: 5, MotorUnitType.FR: 2, MotorUnitType.FF: 2}
    )
    axon_length_percent: float = 80.0
    temperature_c: float = REFERENCE_TEMPERATURE_C
    injection_site: InjectionSite = InjectionSite.SOMA
    soma_geometry: Geometry = Geometry.CYLINDRICAL
    dendrite_geometry: Geometry = Geometry.CYLINDRICAL
    seed: int = 0
    output_step_ms: float = 0.1

    def __post_init__(self) -> None:
        if sum(self.units_per_type.get(t, 0) for t in UNIT_TYPES) < 1:
            raise ValueError("at least one motor unit must be simulated")
        pool = MUSCLE_PRESETS[self.muscle].pool_size
        for t in UNIT_TYPES:
            if not 0 <= self.units_per_type.get(t, 0) <= pool[t]:
                raise ValueError(f"unitsPerType.{t.value} must be between 0 and {pool[t]} for {self.muscle.value}")
        if self.output_step_ms < self.stimulus.step_ms:
            raise ValueError("output_step_ms must be >= stimulus step")

    @property
    def output_stride(self) -> int:
        return max(1, round(self.output_step_ms / self.stimulus.step_ms))


@dataclass(frozen=True)
class MotorUnitSetup:
    """The simulated pool: unit groups, MUAP shape choices and the motoneuron model for all units."""

    groups: dict[MotorUnitType, MotorUnitGroup]
    muap_shapes: dict[MotorUnitType, NDArray[np.int64]]
    motoneurons: MotoneuronPool

    @classmethod
    def from_config(cls, config: SimulationConfig) -> MotorUnitSetup:
        protocol = config.stimulus
        samples_per_duration = protocol.duration_ms / protocol.step_ms
        groups = {
            t: build_group(
                t,
                config.muscle,
                config.units_per_type.get(t, 0),
                config.axon_length_percent,
                samples_per_duration,
                config.soma_geometry,
                config.dendrite_geometry,
            )
            for t in UNIT_TYPES
        }
        rng = np.random.default_rng(config.seed)
        shapes = {t: rng.integers(0, 2, size=groups[t].size).astype(np.int64) for t in UNIT_TYPES}
        motoneurons = MotoneuronPool(
            soma_area_fraction=np.concatenate([groups[t].soma_area_fraction for t in UNIT_TYPES]),
            temperature_c=config.temperature_c,
            injection_site=config.injection_site,
        )
        return cls(groups=groups, muap_shapes=shapes, motoneurons=motoneurons)

    def column_slices(self) -> dict[MotorUnitType, slice]:
        """Which columns of the all-units voltage matrix belong to each type."""
        slices, start = {}, 0
        for t in UNIT_TYPES:
            slices[t] = slice(start, start + self.groups[t].size)
            start += self.groups[t].size
        return slices


@dataclass(frozen=True)
class ForceSeries:
    """Force and EMG on a contiguous range of samples ``[start, stop)``."""

    start: int
    stop: int
    force_by_type: dict[MotorUnitType, NDArray[np.float64]]
    emg: NDArray[np.float64]

    @property
    def total_force(self) -> NDArray[np.float64]:
        return sum((self.force_by_type[t] for t in UNIT_TYPES), start=np.zeros(self.stop - self.start))


class IncrementalForce:
    """Computes force as soma voltages arrive, releasing only samples that can no longer change.

    The ``Main.m`` pipeline is global (median filter, peak detection), but each output sample only
    depends on voltages up to a couple of samples later: ``medfilt2`` looks one sample ahead, a peak
    needs its right neighbour, and the twitch is driven by ``s(n-1)``. Samples further than
    ``LOOKAHEAD`` from the end of the data are therefore final.

    Each update only reprocesses a trailing window: a MUAP reaches at most ``delay + 251`` samples
    after its peak, so voltages older than that cannot change the new samples, and the twitch filters
    carry their state across updates. The streamed series is identical to the one computed on the
    complete signal (``tests/unit/test_incremental_force.py``).
    """

    LOOKAHEAD = 3
    _WINDOW_SLACK = 8

    def __init__(self, setup: MotorUnitSetup, config: SimulationConfig, total_samples: int) -> None:
        self._setup = setup
        self._config = config
        self._total = total_samples
        self._voltage = np.empty((total_samples, setup.motoneurons.n_units))
        self._known = 0
        self._released = 0
        self._twitch = {t: TwitchState.initial(setup.groups[t]) for t in UNIT_TYPES}
        longest_delay = max((int(g.muap_delay_samples.max()) for g in setup.groups.values() if g.size), default=0)
        self._history = longest_delay + MUAP_TIME.size + self._WINDOW_SLACK

    def add(self, soma_voltage: NDArray[np.float64]) -> ForceSeries | None:
        """Append ``(rows, units)`` soma voltages; return the newly final samples, if any."""
        rows = soma_voltage.shape[0]
        if self._known + rows > self._total:
            raise ValueError("more samples than the simulation duration")
        self._voltage[self._known : self._known + rows] = soma_voltage
        self._known += rows
        final = self._total if self._known == self._total else max(0, self._known - self.LOOKAHEAD)
        if final <= self._released:
            return None
        series = self._compute(self._released, final)
        self._released = final
        return series

    def _compute(self, start: int, stop: int) -> ForceSeries:
        window_start = max(0, start - self._history)
        window = self._voltage[window_start : self._known]
        local = slice(start - window_start, stop - window_start)
        step = self._config.stimulus.step_ms
        force, emg = {}, np.zeros(stop - start)
        for t, columns in self._setup.column_slices().items():
            group = self._setup.groups[t]
            filtered = median_filter_3x3(window[:, columns])
            if window_start > 0:
                # the zero padding of medfilt2 belongs to the signal start, not to the window start
                filtered[0] = median_filter_3x3(self._voltage[window_start - 1 : window_start + 2, columns])[1]
            junction = junction_potential(filtered, self._config.axon_length_percent)
            muap = muap_train(junction, group, self._setup.muap_shapes[t])
            spikes = spike_train(muap.sum(axis=1))[local]
            unit_force, self._twitch[t] = twitch_force_segment(
                spikes, group, step, self._twitch[t], starts_at_zero=start == 0
            )
            force[t] = mean_over_units(unit_force)
            emg += mean_over_units(muap[local])
        return ForceSeries(start=start, stop=stop, force_by_type=force, emg=emg)

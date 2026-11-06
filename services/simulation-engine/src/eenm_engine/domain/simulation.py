"""Simulation configuration and the incremental force computation used for streaming."""

from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.model_options import ForceAggregation, ModelOptions
from eenm_engine.domain.motoneuron import REFERENCE_TEMPERATURE_C, InjectionSite, MotoneuronPool
from eenm_engine.domain.motor_unit_pool import (
    MUSCLE_PRESETS,
    Geometry,
    MotorUnitGroup,
    MotorUnitType,
    Muscle,
    build_group,
    pool_twitch_range,
)
from eenm_engine.domain.stimulus import StimulusProtocol
from eenm_engine.domain.streaming_force import StreamingTypeForce

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
    model: ModelOptions = field(default_factory=ModelOptions)
    reference_model: ModelOptions | None = None
    """Model of the maximal-force reference (the healthy LITERATURE model); None = no percentage (ORIGINAL)."""

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
    axon_rheobase: NDArray[np.float64]
    """One rheobase per unit, in the column order of ``column_slices`` (used with axon stimulation)."""

    @classmethod
    def from_config(cls, config: SimulationConfig) -> MotorUnitSetup:
        protocol = config.stimulus
        # Q4: the original converts with tmax/step; with fixed_conduction_delay, 1000 ms per s (= the original at 1 s)
        reference_ms = 1000.0 if config.model.fixed_conduction_delay else protocol.duration_ms
        samples_per_duration = reference_ms / protocol.step_ms
        groups = {
            t: build_group(
                t,
                config.muscle,
                config.units_per_type.get(t, 0),
                config.axon_length_percent,
                samples_per_duration,
                config.soma_geometry,
                config.dendrite_geometry,
                config.model.unit_selection,
            )
            for t in UNIT_TYPES
        }
        scale = config.model.twitch_time_scale
        if scale != 1.0:
            groups = {t: replace(g, twitch_time_to_peak_ms=g.twitch_time_to_peak_ms * scale) for t, g in groups.items()}
        rng = np.random.default_rng(config.seed)
        shapes = {t: rng.integers(0, 2, size=groups[t].size).astype(np.int64) for t in UNIT_TYPES}
        motoneurons = MotoneuronPool(
            soma_area_fraction=np.concatenate([groups[t].soma_area_fraction for t in UNIT_TYPES]),
            soma_area_cm2=np.concatenate([np.asarray(groups[t].soma_area_cm2, dtype=np.float64) for t in UNIT_TYPES]),
            temperature_c=config.temperature_c,
            injection_site=config.injection_site,
        )
        units = sum(g.size for g in groups.values())
        # a generator of its own, so the MUAP-shape draws above stay those of the original seed
        rheobase = config.model.axon_excitability.rheobases(units, seed=config.seed + 1)
        return cls(groups=groups, muap_shapes=shapes, motoneurons=motoneurons, axon_rheobase=rheobase)

    def column_slices(self) -> dict[MotorUnitType, slice]:
        """Which columns of the all-units voltage matrix belong to each type."""
        slices, start = {}, 0
        for t in UNIT_TYPES:
            slices[t] = slice(start, start + self.groups[t].size)
            start += self.groups[t].size
        return slices


@dataclass(frozen=True)
class ForceSeries:
    """Force and EMG at the output samples ``indices`` of a contiguous range ``[start, stop)``."""

    start: int
    stop: int
    force_by_type: dict[MotorUnitType, NDArray[np.float64]]
    emg: NDArray[np.float64]
    indices: NDArray[np.int64]

    @property
    def total_force(self) -> NDArray[np.float64]:
        return sum((self.force_by_type[t] for t in UNIT_TYPES), start=np.zeros(self.indices.size))


class IncrementalForce:
    """Computes force as soma voltages arrive, releasing only samples that can no longer change.

    The ``Main.m`` pipeline is global (median filter, peak detection), but each output sample only depends on
    voltages up to a few samples later, except while a rising plateau is still running (``findpeaks`` places a
    peak at the start of a plateau once it ends). ``StreamingTypeForce`` processes each sample once and knows
    which samples are final, so the streamed series equals the one computed on the complete signal
    (``tests/unit/test_incremental_force.py``).

    Force and EMG are returned at every ``stride``-th sample (the output grid): twitches are summed only there.
    """

    def __init__(self, setup: MotorUnitSetup, config: SimulationConfig, total_samples: int, stride: int = 1) -> None:
        if stride < 1:
            raise ValueError("stride must be at least 1")
        self._setup = setup
        self._total = total_samples
        self._stride = stride
        self._known = 0
        self._released = 0
        self._aggregation = config.model.force_aggregation
        self._force_scale = config.model.force_scale
        pool = MUSCLE_PRESETS[config.muscle].pool_size
        self._weights = {
            t: pool[t] / setup.groups[t].size if config.model.represent_pool and setup.groups[t].size else 1.0
            for t in UNIT_TYPES
        }
        self._types = {
            t: StreamingTypeForce(
                setup.groups[t],
                setup.muap_shapes[t],
                config.axon_length_percent,
                config.stimulus.step_ms,
                config.model,
                pool_twitch_range(config.muscle),
            )
            for t in UNIT_TYPES
        }

    @property
    def buffered_samples(self) -> int:
        """Samples held in memory (bounded by the force stages' lookahead, not by the duration)."""
        return max(f.buffered_samples for f in self._types.values())

    def add(self, samples: NDArray[np.float64]) -> ForceSeries | None:
        """Append ``(rows, units)`` samples — soma voltages, or axon spike trains with axon stimulation —
        and return the newly final samples, if any."""
        rows = samples.shape[0]
        if self._known + rows > self._total:
            raise ValueError("more samples than the simulation duration")
        self._known += rows
        final = self._known == self._total
        for t, columns in self._setup.column_slices().items():
            self._types[t].push(samples[:, columns], final)
        ready = self._total if final else min(f.ready for f in self._types.values())
        if ready <= self._released:
            return None
        start, stop = self._released, ready
        indices = np.arange(start + (-start) % self._stride, stop, self._stride, dtype=np.int64)
        force, emg = {}, np.zeros(indices.size)
        for t in UNIT_TYPES:
            summed, muap = self._types[t].take(start, stop, indices)
            size = self._setup.groups[t].size
            if self._aggregation is ForceAggregation.SUM:
                force[t] = summed * (self._weights[t] * self._force_scale)
            else:
                force[t] = (summed / size if size else summed) * self._force_scale
            emg += muap
        self._released = stop
        return ForceSeries(start=start, stop=stop, force_by_type=force, emg=emg, indices=indices)

    def capacity(self) -> dict[MotorUnitType, NDArray[np.float64]] | None:
        """Remaining force capacity of every simulated unit (fatigue), or ``None`` without fatigue."""
        if self._types[UNIT_TYPES[0]].fatigue is None:
            return None
        out = {}
        for t in UNIT_TYPES:
            fatigue = self._types[t].fatigue
            out[t] = fatigue.capacity.copy() if fatigue is not None else np.empty(0)
        return out

    def capacity_summary(self) -> tuple[float, dict[MotorUnitType, float | None]] | None:
        """Whole-muscle and per-type remaining capacity, or ``None`` without fatigue.

        The muscle value weights every unit by its rested twitch force times the pool units it represents, so it
        is the fraction of the rested twitch force the muscle still has.
        """
        capacity = self.capacity()
        if capacity is None:
            return None
        by_type: dict[MotorUnitType, float | None] = {}
        num = den = 0.0
        for t in UNIT_TYPES:
            c = capacity[t]
            by_type[t] = float(c.mean()) if c.size else None
            if c.size:
                force = self._setup.groups[t].twitch_peak * self._weights[t]
                num += float((c * force).sum())
                den += float(force.sum())
        return (num / den if den else 1.0), by_type

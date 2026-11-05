"""Simulation configuration and the incremental force computation used for streaming."""

from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.force_pipeline import TypeForce
from eenm_engine.domain.model_options import ForceAggregation, ModelOptions
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
    model: ModelOptions = field(default_factory=ModelOptions)

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
    ``LOOKAHEAD`` from the end of the data are therefore final, and the streamed series is identical to
    the one computed on the complete signal (``tests/unit/test_incremental_force.py``).
    """

    LOOKAHEAD = 3

    def __init__(self, setup: MotorUnitSetup, config: SimulationConfig, total_samples: int) -> None:
        self._setup = setup
        self._total = total_samples
        self._voltage = np.empty((total_samples, setup.motoneurons.n_units))
        self._known = 0
        self._released = 0
        self._aggregation = config.model.force_aggregation
        pool = MUSCLE_PRESETS[config.muscle].pool_size
        self._weights = {
            t: pool[t] / setup.groups[t].size if config.model.represent_pool and setup.groups[t].size else 1.0
            for t in UNIT_TYPES
        }
        self._types = {
            t: TypeForce(
                setup.groups[t],
                setup.muap_shapes[t],
                config.axon_length_percent,
                config.stimulus.step_ms,
                config.model,
            )
            for t in UNIT_TYPES
        }

    def add(self, samples: NDArray[np.float64]) -> ForceSeries | None:
        """Append ``(rows, units)`` samples — soma voltages, or axon spike trains with axon stimulation —
        and return the newly final samples, if any."""
        rows = samples.shape[0]
        if self._known + rows > self._total:
            raise ValueError("more samples than the simulation duration")
        self._voltage[self._known : self._known + rows] = samples
        self._known += rows
        final = self._total if self._known == self._total else self._final_sample()
        if final <= self._released:
            return None
        series = self._compute(self._released, final)
        self._released = final
        return series

    def _final_sample(self) -> int:
        final = self._known - self.LOOKAHEAD
        for t, columns in self._setup.column_slices().items():
            final = min(final, self._types[t].unresolved_from(self._voltage[: self._known, columns]))
        return max(0, final)

    def _compute(self, start: int, stop: int) -> ForceSeries:
        force, emg = {}, np.zeros(stop - start)
        for t, columns in self._setup.column_slices().items():
            signals = self._types[t].compute(self._voltage[: self._known, columns], start, stop)
            if self._aggregation is ForceAggregation.SUM:
                force[t] = signals.summed_force() * self._weights[t]
            else:
                force[t] = signals.mean_force()
            emg += signals.mean_muap()
        return ForceSeries(start=start, stop=stop, force_by_type=force, emg=emg)

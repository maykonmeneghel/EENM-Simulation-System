"""HTTP request/response models (``docs/contracts.md``) and their mapping to the domain."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from eenm_engine.application.events import (
    SimulationChunk,
    SimulationCompleted,
    SimulationEvent,
    SimulationStarted,
)
from eenm_engine.domain.motoneuron import InjectionSite
from eenm_engine.domain.motor_unit_pool import Geometry, MotorUnitType, Muscle, MusclePreset
from eenm_engine.domain.simulation import SimulationConfig
from eenm_engine.domain.stimulus import ModulationShape, ModulationTarget, StimulusProtocol, Waveform


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class ModulationDto(_CamelModel):
    target: ModulationTarget = ModulationTarget.AMPLITUDE
    shape: ModulationShape = ModulationShape.STEP
    peak_time_ms: float | None = None


class StimulusDto(_CamelModel):
    duration_ms: float = Field(1000.0, gt=0)
    step_ms: float = Field(0.01, gt=0)
    frequency_hz: float = Field(40.0, gt=0)
    duty_cycle_percent: float = Field(20.0, gt=0, lt=100)
    amplitude: float = 100.0
    waveform: Waveform = Waveform.MONOPHASIC
    modulation: ModulationDto = Field(default_factory=ModulationDto)


class UnitsPerTypeDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    S: int = Field(5, ge=0)
    FR: int = Field(2, ge=0)
    FF: int = Field(2, ge=0)


class SimulationRequest(_CamelModel):
    """Every field optional; defaults reproduce ``Main.m``. Range checks are the public API's job."""

    stimulus: StimulusDto = Field(default_factory=StimulusDto)
    muscle: Muscle = Muscle.SOLEUS
    units_per_type: UnitsPerTypeDto = Field(default_factory=UnitsPerTypeDto)
    axon_length_percent: float = Field(80.0, gt=0, le=100)
    temperature_celsius: float = 6.3
    injection_site: InjectionSite = InjectionSite.SOMA
    soma_geometry: Geometry = Geometry.CYLINDRICAL
    dendrite_geometry: Geometry = Geometry.CYLINDRICAL
    seed: int = Field(0, ge=0)
    output_step_ms: float = Field(0.1, gt=0)

    @model_validator(mode="after")
    def _domain_rules(self) -> SimulationRequest:
        self.to_config()  # domain invariants (triangle peak time, pool sizes, ...) raise ValueError
        return self

    def to_config(self) -> SimulationConfig:
        s = self.stimulus
        return SimulationConfig(
            stimulus=StimulusProtocol(
                duration_ms=s.duration_ms,
                step_ms=s.step_ms,
                frequency_hz=s.frequency_hz,
                duty_cycle_percent=s.duty_cycle_percent,
                amplitude=s.amplitude,
                waveform=s.waveform,
                modulation_target=s.modulation.target,
                modulation_shape=s.modulation.shape,
                peak_time_ms=s.modulation.peak_time_ms,
            ),
            muscle=self.muscle,
            units_per_type={
                MotorUnitType.S: self.units_per_type.S,
                MotorUnitType.FR: self.units_per_type.FR,
                MotorUnitType.FF: self.units_per_type.FF,
            },
            axon_length_percent=self.axon_length_percent,
            temperature_c=self.temperature_celsius,
            injection_site=self.injection_site,
            soma_geometry=self.soma_geometry,
            dendrite_geometry=self.dendrite_geometry,
            seed=self.seed,
            output_step_ms=self.output_step_ms,
        )


class MusclePresetDto(_CamelModel):
    id: Muscle
    label: str
    pool_size: dict[Literal["S", "FR", "FF"], int]

    @classmethod
    def of(cls, preset: MusclePreset) -> MusclePresetDto:
        return cls(
            id=preset.muscle,
            label=preset.label,
            pool_size={
                "S": preset.pool_size[MotorUnitType.S],
                "FR": preset.pool_size[MotorUnitType.FR],
                "FF": preset.pool_size[MotorUnitType.FF],
            },
        )


def _by_type(values: dict[MotorUnitType, object]) -> dict[str, object]:
    return {t.value: v for t, v in values.items()}


def event_to_json(event: SimulationEvent) -> dict[str, object]:
    """Serialise an application event to the wire format of ``docs/contracts.md``."""
    if isinstance(event, SimulationStarted):
        return {
            "type": "started",
            "simulationId": event.simulation_id,
            "durationMs": event.duration_ms,
            "outputStepMs": event.output_step_ms,
            "motorUnits": _by_type(dict(event.motor_units)),
            "muscle": event.muscle.value,
        }
    if isinstance(event, SimulationChunk):
        return {
            "type": "chunk",
            "progress": event.progress,
            "timeMs": event.time_ms.tolist(),
            "stimulus": event.stimulus.tolist(),
            "force": {
                "total": event.force_total.tolist(),
                **_by_type({t: v.tolist() for t, v in event.force_by_type.items()}),
            },
            "emg": event.emg.tolist(),
        }
    if isinstance(event, SimulationCompleted):
        return {
            "type": "completed",
            "elapsedSeconds": event.elapsed_seconds,
            "summary": {
                "peakForce": event.summary.peak_force,
                "meanForce": event.summary.mean_force,
                "timeToPeakMs": event.summary.time_to_peak_ms,
            },
        }
    raise TypeError(f"unknown event {type(event).__name__}")

"""HTTP request/response models (``docs/contracts.md``) and their mapping to the domain."""

from __future__ import annotations

from dataclasses import replace
from enum import Enum
from typing import Literal

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from eenm_engine.application.events import (
    SimulationChunk,
    SimulationCompleted,
    SimulationEvent,
    SimulationStarted,
)
from eenm_engine.domain.central_drive import CentralDrive, CurrentScale, ThresholdRule, Tremor
from eenm_engine.domain.conditions import ADJUSTMENTS, Adjustment, Condition, apply_condition, defaults
from eenm_engine.domain.model_options import LITERATURE_UNITS, CalibrationTarget, ModelOptions, StimulationSite
from eenm_engine.domain.motoneuron import InjectionSite
from eenm_engine.domain.motor_unit_pool import Geometry, MotorUnitType, Muscle, MusclePreset, proportional_units
from eenm_engine.domain.muscle_profiles import FieldSource, literature_options, profile
from eenm_engine.domain.simulation import SimulationConfig
from eenm_engine.domain.stimulus import ModulationShape, ModulationTarget, StimulusProtocol, Waveform
from eenm_engine.domain.texts_en import Lang, localized
from eenm_engine.domain.unit_anatomy import UnitAnatomy


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
    train_on_ms: float | None = Field(None, gt=0)
    train_period_ms: float | None = Field(None, gt=0)
    pulse_width_us: float | None = Field(None, gt=0)
    """Stimulator mode: replaces ``duty_cycle_percent``."""
    ramp_up_ms: float = Field(0.0, ge=0)
    ramp_down_ms: float = Field(0.0, ge=0)


class UnitsPerTypeDto(BaseModel):
    model_config = ConfigDict(extra="forbid")

    S: int = Field(5, ge=0)
    FR: int = Field(2, ge=0)
    FF: int = Field(2, ge=0)


class StimulationSiteDto(Enum):
    SKIN_SURFACE = "SKIN_SURFACE"
    """Surface FES: the motor axons are excited (Weiss strength-duration), no motoneuron ODE."""
    MOTONEURON_POOL = "MOTONEURON_POOL"
    """The current enters the two-compartment motoneurons (the master's-thesis model; injectionSite, geometries
    and temperature apply). About 3x slower."""


_SITES = {
    StimulationSiteDto.SKIN_SURFACE: StimulationSite.MOTOR_AXONS,
    StimulationSiteDto.MOTONEURON_POOL: StimulationSite.MOTONEURON_SOMA,
}


class ModelVariant(Enum):
    ORIGINAL = "ORIGINAL"
    LITERATURE = "LITERATURE"


class TremorDto(_CamelModel):
    frequency_hz: float = Field(4.4, gt=0, le=20)
    amplitude_na: float = Field(3.0, ge=0, le=20)


class CentralDriveDto(_CamelModel):
    """Descending drive (LITERATURE only). The tremor is applied only with Parkinson's ``PD_TREMOR`` adjustment."""

    enabled: bool = False
    background_na: float = Field(3.5, ge=0, le=20)
    voluntary_na: float = Field(0.0, ge=0, le=20)
    noise_cv: float = Field(0.2, ge=0, le=2)
    current_scale: CurrentScale = CurrentScale.PUBLISHED
    threshold_rule: ThresholdRule = ThresholdRule.CISI_KOHN_2008
    """Thresholds of the Cisi & Kohn motoneurons that receive the drive."""
    tremor: TremorDto = Field(default_factory=TremorDto)
    electrode_fraction: float = Field(0.9, gt=0, le=1)


class SimulationRequest(_CamelModel):
    """Every field optional; defaults reproduce ``Main.m``. Range checks are the public API's job."""

    stimulus: StimulusDto = Field(default_factory=StimulusDto)
    model_variant: ModelVariant = ModelVariant.ORIGINAL
    calibration_target: CalibrationTarget = CalibrationTarget.WHOLE_MUSCLE
    """Twitch calibration of the LITERATURE variant; no effect on ORIGINAL."""
    stimulation_site: StimulationSiteDto = StimulationSiteDto.SKIN_SURFACE
    """Where the LITERATURE stimulus acts; ORIGINAL always injects into the motoneurons."""
    condition: Condition = Condition.NORMAL
    """Clinical condition (LITERATURE only; ORIGINAL ignores it)."""
    condition_adjustments: list[str] | None = None
    """Ids of the condition's adjustments to apply (``GET /v1/conditions``); ``None`` = the condition's defaults."""
    central_drive: CentralDriveDto = Field(default_factory=CentralDriveDto)
    muscle: Muscle = Muscle.SOLEUS
    units_per_type: UnitsPerTypeDto | None = None
    """``None``: 5/2/2 (ORIGINAL) or 120 units in the pool's proportions (LITERATURE)."""
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
                train_on_ms=s.train_on_ms,
                train_period_ms=s.train_period_ms,
                pulse_width_us=s.pulse_width_us,
                ramp_up_ms=s.ramp_up_ms,
                ramp_down_ms=s.ramp_down_ms,
            ),
            muscle=self.muscle,
            units_per_type=self._units(),
            model=self._model(),
            reference_model=(
                literature_options(self.muscle, self.calibration_target, _SITES[self.stimulation_site])
                if self.model_variant is ModelVariant.LITERATURE
                else None
            ),
            axon_length_percent=self.axon_length_percent,
            temperature_c=self.temperature_celsius,
            injection_site=self.injection_site,
            soma_geometry=self.soma_geometry,
            dendrite_geometry=self.dendrite_geometry,
            seed=self.seed,
            output_step_ms=self.output_step_ms,
        )

    def _model(self) -> ModelOptions:
        if self.model_variant is not ModelVariant.LITERATURE:
            return ModelOptions()
        options = literature_options(self.muscle, self.calibration_target, _SITES[self.stimulation_site])
        chosen = None if self.condition_adjustments is None else tuple(self.condition_adjustments)
        d = self.central_drive
        tremor = self.condition is Condition.PARKINSON and "PD_TREMOR" in (chosen or defaults(self.condition))
        if d.enabled or tremor:
            drive = CentralDrive(
                background_na=d.background_na,
                voluntary_na=d.voluntary_na,
                noise_cv=d.noise_cv,
                scale=d.current_scale,
                threshold_rule=d.threshold_rule,
                tremor=Tremor(d.tremor.frequency_hz, d.tremor.amplitude_na) if tremor else None,
            )
            options = replace(options, central_drive=drive, electrode_fraction=d.electrode_fraction)
        return apply_condition(options, self.condition, chosen)

    def _units(self) -> dict[MotorUnitType, int]:
        if self.units_per_type is not None:
            u = self.units_per_type
            return {MotorUnitType.S: u.S, MotorUnitType.FR: u.FR, MotorUnitType.FF: u.FF}
        if self.model_variant is ModelVariant.LITERATURE:
            return proportional_units(self.muscle, LITERATURE_UNITS)
        u = UnitsPerTypeDto()
        return {MotorUnitType.S: u.S, MotorUnitType.FR: u.FR, MotorUnitType.FF: u.FF}


class ConditionSourceDto(_CamelModel):
    citation: str
    title: str
    doi: str | None
    pmid: str | None


class ConditionAdjustmentDto(_CamelModel):
    id: str
    label: str
    effect: str
    finding: str
    source: ConditionSourceDto
    evidence: Literal["FULL_TEXT", "ABSTRACT"]
    measured_in: str
    default: bool
    available: bool

    @classmethod
    def of(cls, a: Adjustment, lang: Lang = "pt-BR") -> ConditionAdjustmentDto:
        s = a.source
        return cls(
            id=a.id,
            label=localized(a.label, lang),
            effect=localized(a.effect, lang),
            finding=localized(a.finding, lang),
            source=ConditionSourceDto(citation=s.citation, title=s.title, doi=s.doi, pmid=s.pmid),
            evidence=a.evidence.value,
            measured_in=localized(a.measured_in, lang),
            default=a.default,
            available=a.available,
        )


class ConditionDto(_CamelModel):
    id: Condition
    label: str
    adjustments: list[ConditionAdjustmentDto]


_CONDITION_LABELS = {
    Condition.NORMAL: "Normal",
    Condition.PARKINSON: "Doença de Parkinson",
    Condition.SCI_CHRONIC: "Lesão medular crônica",
}


def condition_catalog(lang: Lang = "pt-BR") -> list[ConditionDto]:
    return [
        ConditionDto(
            id=c,
            label=localized(_CONDITION_LABELS[c], lang),
            adjustments=[ConditionAdjustmentDto.of(a, lang) for a in ADJUSTMENTS if a.condition is c],
        )
        for c in Condition
    ]


class FieldSourceDto(_CamelModel):
    field: str
    provenance: Literal["MEASURED", "FITTED", "INHERITED"]
    value: str
    source: ConditionSourceDto | None
    evidence: Literal["FULL_TEXT", "ABSTRACT"] | None
    calibration_target: CalibrationTarget | None
    """Only for this calibration target; ``None`` = always."""

    @classmethod
    def of(cls, f: FieldSource, lang: Lang = "pt-BR") -> FieldSourceDto:
        s = f.source
        return cls(
            field=localized(f.field, lang),
            provenance=f.provenance.value,
            value=localized(f.value, lang),
            source=ConditionSourceDto(citation=s.citation, title=s.title, doi=s.doi, pmid=s.pmid) if s else None,
            evidence=f.evidence.value if f.evidence else None,
            calibration_target=f.target,
        )


class MusclePresetDto(_CamelModel):
    id: Muscle
    label: str
    pool_size: dict[Literal["S", "FR", "FF"], int]
    provenance: list[FieldSourceDto]
    """Where each value of the preset comes from (empty for the original model's leg presets)."""

    @classmethod
    def of(cls, preset: MusclePreset, lang: Lang = "pt-BR") -> MusclePresetDto:
        return cls(
            id=preset.muscle,
            label=localized(preset.label, lang),
            pool_size={
                "S": preset.pool_size[MotorUnitType.S],
                "FR": preset.pool_size[MotorUnitType.FR],
                "FF": preset.pool_size[MotorUnitType.FF],
            },
            provenance=[FieldSourceDto.of(f, lang) for f in profile(preset.muscle)],
        )


def _by_type(values: dict[MotorUnitType, object]) -> dict[str, object]:
    return {t.value: v for t, v in values.items()}


def _optional_list(values: NDArray[np.float64] | None) -> list[float] | None:
    return None if values is None else [round(float(v), 6) for v in values]


def _units_json(units: UnitAnatomy) -> dict[str, object]:
    """Column arrays, one entry per simulated unit (``docs/contracts.md``, ``started.units``)."""
    return {
        "motoneuron": units.motoneuron.value,
        "type": [t.value for t in units.unit_type],
        "poolIndex": units.pool_index.tolist(),
        "somaDiameterUm": _optional_list(units.soma_diameter_um),
        "dendriteDiameterUm": _optional_list(units.dendrite_diameter_um),
        "dendriteLengthMm": _optional_list(units.dendrite_length_mm),
        "conductionMs": _optional_list(units.conduction_ms),
        "toElectrodeMs": _optional_list(units.to_electrode_ms),
        "toMuscleMs": _optional_list(units.to_muscle_ms),
        "weight": _optional_list(units.weight),
        "axonRheobase": _optional_list(units.axon_rheobase),
    }


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
            "maxForce": event.max_force,
            "electrodeFraction": event.electrode_fraction,
            "units": _units_json(event.units) if event.units is not None else None,
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
            "fatigue": (
                {
                    "timeMs": event.fatigue.time_ms,
                    "muscle": event.fatigue.muscle,
                    **_by_type(dict(event.fatigue.by_type)),
                }
                if event.fatigue is not None
                else None
            ),
            "axonEvents": event.axon_events,
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

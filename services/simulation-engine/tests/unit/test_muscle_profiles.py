"""Wrist presets: their calibrations reproduce the data they cite, and every field says where it comes from."""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest

from eenm_engine.domain.model_options import CalibrationTarget, ModelOptions, StimulationSite
from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS, MotorUnitType, Muscle, proportional_units
from eenm_engine.domain.muscle_profiles import PROFILES, Provenance, literature_options, profile
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol
from eenm_engine.interfaces.http.schemas import MusclePresetDto, SimulationRequest
from validation.calibrate import MUSCLE_TARGETS, mean_unit_timing, single_twitch_voltage, whole_twitch
from validation.protocols import twitch_metrics

FCR, ECR = Muscle.FLEXOR_CARPI_RADIALIS, Muscle.EXTENSOR_CARPI_RADIALIS


def _twitch(muscle: Muscle, options: ModelOptions) -> tuple[SimulationConfig, MotorUnitSetup, np.ndarray]:
    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=1000.0, frequency_hz=1.0, duty_cycle_percent=0.03, amplitude=153.0),
        muscle=muscle,
        units_per_type=proportional_units(muscle, 120),
        model=replace(options, twitch_time_scale=1.0),  # the measuring functions apply the scale
    )
    setup, spikes = single_twitch_voltage(config)
    return config, setup, spikes


def test_fcr_whole_muscle_twitch_is_the_measured_wrist_flexor_twitch() -> None:
    options = literature_options(FCR, CalibrationTarget.WHOLE_MUSCLE, StimulationSite.MOTOR_AXONS)
    config, setup, spikes = _twitch(FCR, options)
    assert (spikes > 0).any(axis=0).all()  # supramaximal: every unit twitches
    force = whole_twitch(setup, spikes, config, options.twitch_time_scale, options.twitch_shape)
    m = twitch_metrics(config.stimulus.time_grid(), force)
    assert (m["contractionTimeMs"], m["halfRelaxationMs"]) == pytest.approx(
        MUSCLE_TARGETS[("fcr", "whole-muscle")], abs=0.5
    )


def test_ecr_single_unit_contraction_time_is_the_measured_mean() -> None:
    options = literature_options(ECR, CalibrationTarget.SINGLE_UNIT, StimulationSite.MOTOR_AXONS)
    config, setup, spikes = _twitch(ECR, options)
    ct, hrt = mean_unit_timing(setup, spikes, config, options.twitch_time_scale, options.twitch_shape)
    assert ct == pytest.approx(51.0, abs=0.05)  # Aimonetti et al. 2000
    soleus = ModelOptions.literature(CalibrationTarget.SINGLE_UNIT)
    assert options.twitch_shape == soleus.twitch_shape  # HRT / CT inherited from the soleus single-unit fit
    assert hrt / ct == pytest.approx(78.6 / 74.8, abs=0.02)


def test_without_data_the_wrist_muscles_inherit_the_soleus_calibration() -> None:
    for muscle, target in ((FCR, CalibrationTarget.SINGLE_UNIT), (ECR, CalibrationTarget.WHOLE_MUSCLE)):
        for site in StimulationSite:
            assert literature_options(muscle, target, site) == ModelOptions.literature(target, site)
    assert literature_options(Muscle.SOLEUS) == ModelOptions.literature()


def test_fcr_pool_has_the_fibre_type_proportions_and_the_soleus_total() -> None:
    pool = MUSCLE_PRESETS[FCR].pool_size
    total = sum(pool.values())
    assert total == sum(MUSCLE_PRESETS[Muscle.SOLEUS].pool_size.values())
    shares = [pool[t] / total for t in MotorUnitType]
    assert shares == pytest.approx([0.409, 0.297, 0.294], abs=0.001)  # Mizuno et al. 1994


def test_every_wrist_field_has_a_source_unless_inherited_and_each_target_is_covered() -> None:
    for muscle, fields in PROFILES.items():
        for f in fields:
            assert (f.source is None) == (f.provenance is Provenance.INHERITED), f.field
        for target in CalibrationTarget:
            twitch = [f for f in profile(muscle, target) if "abalo" in f.field or "contração" in f.field]
            assert twitch, f"{muscle.value} has no twitch field for {target.value}"
    assert profile(Muscle.SOLEUS) == ()


def test_api_exposes_provenance_and_uses_the_muscle_calibration() -> None:
    dto = MusclePresetDto.of(MUSCLE_PRESETS[FCR]).model_dump(by_alias=True)
    assert {p["provenance"] for p in dto["provenance"]} == {"MEASURED", "FITTED", "INHERITED"}
    assert any(p["source"] and p["source"]["doi"] == "10.3389/fbioe.2019.00181" for p in dto["provenance"])
    request = SimulationRequest.model_validate({"modelVariant": "LITERATURE", "muscle": "FLEXOR_CARPI_RADIALIS"})
    config = request.to_config()
    assert config.model.twitch_time_scale == literature_options(FCR).twitch_time_scale
    assert config.reference_model is not None
    assert config.reference_model.twitch_time_scale == config.model.twitch_time_scale

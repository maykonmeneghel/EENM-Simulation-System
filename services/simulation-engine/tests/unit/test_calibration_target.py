"""The two calibration targets of the LITERATURE options reproduce the data they were fitted to.

Guards ``TWITCH_CALIBRATION`` against drifting away from ``validation/calibrate.py``: one twitch of the
120-unit soleus pool, stimulated through its axons as in the calibration, measured both ways.
"""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest

from eenm_engine.domain.model_options import CalibrationTarget, ModelOptions
from eenm_engine.domain.motor_unit_pool import Muscle, proportional_units
from eenm_engine.domain.simulation import SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol
from validation.calibrate import TARGETS, mean_unit_timing, single_twitch_voltage, whole_twitch
from validation.protocols import twitch_metrics


def _twitch_config(target: CalibrationTarget) -> tuple[SimulationConfig, ModelOptions]:
    """The calibration's set-up: the twitch scale is applied by the measuring functions, not by the pool."""
    options = ModelOptions.literature(target)
    unscaled = replace(options, twitch_time_scale=1.0)
    return SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=1000.0, frequency_hz=1.0, duty_cycle_percent=0.03, amplitude=153.0),
        units_per_type=proportional_units(Muscle.SOLEUS, 120),
        model=unscaled,
    ), options


def test_whole_muscle_target_gives_the_human_whole_muscle_twitch() -> None:
    config, options = _twitch_config(CalibrationTarget.WHOLE_MUSCLE)
    setup, spikes = single_twitch_voltage(config)
    force = whole_twitch(setup, spikes, config, options.twitch_time_scale, options.twitch_shape)
    m = twitch_metrics(config.stimulus.time_grid(), force)
    assert (m["contractionTimeMs"], m["halfRelaxationMs"]) == pytest.approx(TARGETS["whole-muscle"], abs=0.5)


def test_single_unit_target_gives_the_mean_human_unit_twitch() -> None:
    config, options = _twitch_config(CalibrationTarget.SINGLE_UNIT)
    setup, spikes = single_twitch_voltage(config)
    timing = mean_unit_timing(setup, spikes, config, options.twitch_time_scale, options.twitch_shape)
    assert timing == pytest.approx(TARGETS["single-unit"], abs=0.5)


def test_the_targets_differ_only_in_the_twitch() -> None:
    whole, unit = (ModelOptions.literature(t) for t in CalibrationTarget)
    assert unit.twitch_time_scale < whole.twitch_time_scale
    assert np.isclose(unit.twitch_shape.exponent, 2.0862) and np.isclose(whole.twitch_shape.exponent, 3.9461)
    assert replace(unit, twitch_shape=whole.twitch_shape, twitch_time_scale=whole.twitch_time_scale) == whole
    assert ModelOptions.literature() == whole

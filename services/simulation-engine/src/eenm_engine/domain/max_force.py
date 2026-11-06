"""Maximal force of the simulated muscle: the reference that makes force a percentage.

Fused tetanus of the rested muscle: every simulated motor unit fires at 100 Hz (the rate saturation of Potvin &
Fuglevand 2017 is then at its plateau, NR = CT / ISI ≥ 4.7 for every unit), no fatigue, the same muscle, simulated
units, conduction and twitch calibration as the run — but with the reference model the caller chooses, normally the
healthy LITERATURE model, so a condition shows as a deficit (atrophy × 0.56 → at most ≈ 56 %). The spikes are applied
to the motor axons directly, so the reference does not depend on the stimulus or on where it acts.

The reference uses the run's integration step: each twitch is scaled by the step (``TwitchFilter._kernel``, from the
original recursion), so force in model units is proportional to it (tetanus peak / step = 517.54 for the soleus at
0.05, 0.02 and 0.01 ms) and only the percentage is step-independent.
"""

from __future__ import annotations

from dataclasses import replace
from functools import lru_cache

import numpy as np

from eenm_engine.domain.model_options import ModelOptions, StimulationSite, TwitchDrive
from eenm_engine.domain.motor_unit_pool import MotorUnitType, Muscle
from eenm_engine.domain.simulation import IncrementalForce, MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol

TETANUS_HZ = 100.0
DURATION_MS = 800.0
_BLOCK = 2000


def maximal_force(config: SimulationConfig, reference: ModelOptions | None) -> float | None:
    """Peak of the reference tetanus, or None when force is not a sum of unit twitches (ORIGINAL)."""
    if reference is None or reference.twitch_drive is not TwitchDrive.OWN_SPIKES:
        return None
    units = tuple(config.units_per_type.get(t, 0) for t in MotorUnitType)
    return _tetanus_peak(config.muscle, units, config.axon_length_percent, config.stimulus.step_ms, reference)


@lru_cache(maxsize=64)
def _tetanus_peak(
    muscle: Muscle, units: tuple[int, ...], axon_length_percent: float, step_ms: float, model: ModelOptions
) -> float:
    model = replace(model, fatigue=None, stimulation_site=StimulationSite.MOTOR_AXONS)
    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=DURATION_MS, step_ms=step_ms),
        muscle=muscle,
        units_per_type=dict(zip(MotorUnitType, units, strict=True)),
        axon_length_percent=axon_length_percent,
        model=model,
    )
    setup = MotorUnitSetup.from_config(config)
    total = config.stimulus.sample_count
    period = round(1000.0 / TETANUS_HZ / step_ms)
    force = IncrementalForce(setup, config, total)
    peak = 0.0
    for start in range(0, total, _BLOCK):
        rows = np.arange(start, min(start + _BLOCK, total))
        spikes = np.zeros((rows.size, setup.motoneurons.n_units))
        spikes[(rows % period) == 1] = 1.0  # first spike one sample in (sample 0 never drives a twitch)
        series = force.add(spikes)
        if series is not None and series.total_force.size:
            peak = max(peak, float(series.total_force.max()))
    return peak

"""Fit the twitch time scale and shape to human twitch timing.

Two calibration targets (see docs/validation/literature-comparison.md, "Calibration target"):

whole-muscle (default) — the twitch of the whole muscle, human triceps surae (means of two verified studies):
  contraction time 120.7 ms = mean(112.4 [Sale 1982], 129 [Zoughaib 2026])
  half-relaxation   97.3 ms = mean(99.6 [Sale 1982], 95 [Zoughaib 2026])
single-unit — the mean twitch of single human motor units, toe extensors, 19 units (Macefield et al. 1996,
  PMID 8793760, abstract): contraction time 74.8 ± 3.9 ms, half-relaxation 78.6 ± 6.0 ms. The mean is taken
  over the simulated units, each weighted by the pool units it represents when ``represent_pool`` is set.

Only two numbers are fitted: a global multiplier of every unit's contraction time (keeping the S/FR/FF
proportions of the original table) and the twitch exponent m. Twitch parameters do not change the
motoneuron spikes, so the ODE is integrated once and only the force pipeline is re-evaluated.

Run: uv run --group validation python -m validation.calibrate [pipeline] [whole-muscle|single-unit]
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, replace

import numpy as np
from scipy.optimize import minimize

from eenm_engine.domain.axon_stimulation import axon_spikes
from eenm_engine.domain.force_pipeline import type_signals
from eenm_engine.domain.model_options import ForceAggregation, ModelOptions, StimulationSite, TwitchDrive, UnitSelection
from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS, MotorUnitType, Muscle, proportional_units
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, stimulus_current, stimulus_series
from eenm_engine.domain.twitch import TwitchShape
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from validation.protocols import RESULTS, twitch_metrics

TARGETS = {  # (contraction time, half-relaxation time) in ms
    "whole-muscle": ((112.4 + 129.0) / 2, (99.6 + 95.0) / 2),
    "single-unit": (74.8, 78.6),
}


def single_twitch_voltage(config: SimulationConfig) -> tuple[MotorUnitSetup, np.ndarray]:
    setup = MotorUnitSetup.from_config(config)
    pool, p = setup.motoneurons, config.stimulus
    if config.model.stimulation_site is StimulationSite.MOTOR_AXONS:
        spikes = axon_spikes(stimulus_series(p), p.step_ms, setup.axon_rheobase, config.model.axon_excitability)
        return setup, spikes.astype(np.float64)
    times = p.time_grid()
    integration = ScipyBdfSolver().start(
        lambda t, s: pool.derivatives(t, s, lambda u: stimulus_current(u, p)),
        pool.initial_state(),
        float(times[0]),
        float(times[-1]),
        pool.jacobian_sparsity(),
        max_step=p.solver_max_step_ms(),
    )
    return setup, pool.soma_voltage(integration.advance(times), pool.n_units)


def whole_twitch(
    setup: MotorUnitSetup, voltage: np.ndarray, config: SimulationConfig, scale: float, shape: TwitchShape
) -> np.ndarray:
    options = replace(config.model, twitch_shape=shape, twitch_time_scale=1.0)
    pool = MUSCLE_PRESETS[config.muscle].pool_size
    total = np.zeros(voltage.shape[0])
    for t, cols in setup.column_slices().items():
        weight = pool[t] / setup.groups[t].size if options.represent_pool and setup.groups[t].size else 1.0
        group = replace(setup.groups[t], twitch_time_to_peak_ms=setup.groups[t].twitch_time_to_peak_ms * scale)
        signals = type_signals(
            voltage[:, cols], group, setup.muap_shapes[t], config.axon_length_percent, config.stimulus.step_ms, options
        )
        summed = options.force_aggregation is ForceAggregation.SUM
        total += signals.summed_force() * weight if summed else signals.mean_force()
    return total


def mean_unit_timing(
    setup: MotorUnitSetup, voltage: np.ndarray, config: SimulationConfig, scale: float, shape: TwitchShape
) -> tuple[float, float]:
    """Contraction and half-relaxation time of each unit's own twitch, averaged over the pool."""
    options = replace(config.model, twitch_shape=shape, twitch_time_scale=1.0)
    pool = MUSCLE_PRESETS[config.muscle].pool_size
    time = config.stimulus.time_grid()
    cts, hrts, weights = [], [], []
    for t, cols in setup.column_slices().items():
        if not setup.groups[t].size:
            continue
        weight = pool[t] / setup.groups[t].size if options.represent_pool else 1.0
        group = replace(setup.groups[t], twitch_time_to_peak_ms=setup.groups[t].twitch_time_to_peak_ms * scale)
        signals = type_signals(
            voltage[:, cols], group, setup.muap_shapes[t], config.axon_length_percent, config.stimulus.step_ms, options
        )
        for k in range(signals.force.shape[1]):
            if signals.force[:, k].max() <= 0:
                raise ValueError(f"unit {t.value}{k + 1} did not twitch: raise the amplitude")
            m = twitch_metrics(time, signals.force[:, k])
            cts.append(m["contractionTimeMs"])
            hrts.append(m["halfRelaxationMs"])
            weights.append(weight)
    return float(np.average(cts, weights=weights)), float(np.average(hrts, weights=weights))


@dataclass(frozen=True)
class Pipeline:
    model: ModelOptions
    units: dict[MotorUnitType, int] | None = None
    pulse_ms: float = 5.0
    amplitude: float = 100.0


PIPELINES = {
    # step 1: the original twitch drive and aggregation
    "step1": Pipeline(ModelOptions(unit_selection=UnitSelection.SPREAD_ACROSS_POOL)),
    # step 2: each unit's own spikes, summed forces (the rate gain does not change a single twitch)
    "step2": Pipeline(
        ModelOptions(
            unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
            twitch_drive=TwitchDrive.OWN_SPIKES,
            force_aggregation=ForceAggregation.SUM,
        )
    ),
    # step 2b/3: 120 units in the pool's proportions (Potvin & Fuglevand 2017 simulate 120), each weighted by
    # the pool units it represents; clinical 0.3 ms pulses at 1.5x the all-units threshold (102.1 uA/cm2).
    "pool120": Pipeline(
        ModelOptions(
            unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
            twitch_drive=TwitchDrive.OWN_SPIKES,
            force_aggregation=ForceAggregation.SUM,
            represent_pool=True,
        ),
        units=proportional_units(Muscle.SOLEUS, 120),
        pulse_ms=0.3,
        amplitude=153.0,
    ),
    # step 4: the same pool stimulated through its motor axons (analytic recruitment layer)
    "axons": Pipeline(
        ModelOptions(
            unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
            twitch_drive=TwitchDrive.OWN_SPIKES,
            force_aggregation=ForceAggregation.SUM,
            represent_pool=True,
            stimulation_site=StimulationSite.MOTOR_AXONS,
        ),
        units=proportional_units(Muscle.SOLEUS, 120),
        pulse_ms=0.3,
        amplitude=153.0,
    ),
}


def main(pipeline: str, target: str = "whole-muscle") -> None:
    target_ct, target_hrt = TARGETS[target]
    chosen = PIPELINES[pipeline]
    protocol = StimulusProtocol(  # one pulse at t = 0 in a 1 s record
        duration_ms=1000.0, frequency_hz=1.0, duty_cycle_percent=chosen.pulse_ms / 10.0, amplitude=chosen.amplitude
    )
    extra = {"units_per_type": chosen.units} if chosen.units else {}
    config = SimulationConfig(stimulus=protocol, model=chosen.model, **extra)
    setup, voltage = single_twitch_voltage(config)
    time = protocol.time_grid()

    def timing(x: np.ndarray) -> tuple[float, float]:
        scale, shape = float(np.exp(x[0])), TwitchShape(float(np.exp(x[1])))
        if target == "single-unit":
            return mean_unit_timing(setup, voltage, config, scale, shape)
        m = twitch_metrics(time, whole_twitch(setup, voltage, config, scale, shape))
        return m["contractionTimeMs"], m["halfRelaxationMs"]

    def loss(x: np.ndarray) -> float:
        ct, hrt = timing(x)
        return ((ct - target_ct) / target_ct) ** 2 + ((hrt - target_hrt) / target_hrt) ** 2

    best = minimize(loss, x0=np.log([1.5, 2.0]), method="Nelder-Mead", options={"xatol": 1e-4, "fatol": 1e-10})
    scale, exponent = (float(v) for v in np.exp(best.x))
    ct, hrt = timing(best.x)
    result = {
        "target": target,
        "targets": {"contractionTimeMs": target_ct, "halfRelaxationMs": target_hrt},
        "fitted": {"twitchTimeScale": round(scale, 4), "twitchExponent": round(exponent, 4)},
        "achieved": {"contractionTimeMs": ct, "halfRelaxationMs": hrt},
        "pipeline": pipeline,
    }
    suffix = "" if target == "whole-muscle" else f"-{target}"
    (RESULTS / f"calibration-{pipeline}{suffix}.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "step2", sys.argv[2] if len(sys.argv) > 2 else "whole-muscle")

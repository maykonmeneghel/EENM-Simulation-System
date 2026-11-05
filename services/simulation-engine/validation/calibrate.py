"""Fit the twitch time scale and shape to human whole-soleus twitch timing.

Targets (means of two verified studies, see docs/validation/literature-comparison.md):
  contraction time 120.7 ms = mean(112.4 [Sale 1982], 129 [Zoughaib 2026])
  half-relaxation   97.3 ms = mean(99.6 [Sale 1982], 95 [Zoughaib 2026])
Only two numbers are fitted: a global multiplier of every unit's contraction time (keeping the S/FR/FF
proportions of the original table) and the twitch exponent m. Twitch parameters do not change the
motoneuron spikes, so the ODE is integrated once and only the force pipeline is re-evaluated.

Run: uv run --group validation python -m validation.calibrate
"""

from __future__ import annotations

import json
from dataclasses import replace

import numpy as np
from scipy.optimize import minimize

from eenm_engine.domain.force_pipeline import type_signals
from eenm_engine.domain.model_options import ModelOptions, UnitSelection
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, stimulus_current
from eenm_engine.domain.twitch import TwitchShape
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from validation.protocols import RESULTS, twitch_metrics

TARGET_CT_MS = (112.4 + 129.0) / 2
TARGET_HRT_MS = (99.6 + 95.0) / 2


def single_twitch_voltage(config: SimulationConfig) -> tuple[MotorUnitSetup, np.ndarray]:
    setup = MotorUnitSetup.from_config(config)
    pool, p = setup.motoneurons, config.stimulus
    times = p.time_grid()
    integration = ScipyBdfSolver().start(
        lambda t, s: pool.derivatives(t, s, lambda u: stimulus_current(u, p)),
        pool.initial_state(),
        float(times[0]),
        float(times[-1]),
        pool.jacobian_sparsity(),
    )
    return setup, pool.soma_voltage(integration.advance(times), pool.n_units)


def whole_twitch(
    setup: MotorUnitSetup, voltage: np.ndarray, config: SimulationConfig, scale: float, shape: TwitchShape
) -> np.ndarray:
    total = np.zeros(voltage.shape[0])
    for t, cols in setup.column_slices().items():
        group = replace(setup.groups[t], twitch_time_to_peak_ms=setup.groups[t].twitch_time_to_peak_ms * scale)
        total += type_signals(
            voltage[:, cols], group, setup.muap_shapes[t], config.axon_length_percent, config.stimulus.step_ms, shape
        ).mean_force()
    return total


def main() -> None:
    protocol = StimulusProtocol(duration_ms=1000.0, frequency_hz=1.0, duty_cycle_percent=0.5)  # one 5 ms pulse
    config = SimulationConfig(stimulus=protocol, model=ModelOptions(unit_selection=UnitSelection.SPREAD_ACROSS_POOL))
    setup, voltage = single_twitch_voltage(config)
    time = protocol.time_grid()

    def timing(x: np.ndarray) -> tuple[float, float]:
        m = twitch_metrics(
            time, whole_twitch(setup, voltage, config, float(np.exp(x[0])), TwitchShape(float(np.exp(x[1]))))
        )
        return m["contractionTimeMs"], m["halfRelaxationMs"]

    def loss(x: np.ndarray) -> float:
        ct, hrt = timing(x)
        return ((ct - TARGET_CT_MS) / TARGET_CT_MS) ** 2 + ((hrt - TARGET_HRT_MS) / TARGET_HRT_MS) ** 2

    best = minimize(loss, x0=np.log([1.5, 2.0]), method="Nelder-Mead", options={"xatol": 1e-4, "fatol": 1e-10})
    scale, exponent = (float(v) for v in np.exp(best.x))
    ct, hrt = timing(best.x)
    result = {
        "targets": {"contractionTimeMs": TARGET_CT_MS, "halfRelaxationMs": TARGET_HRT_MS},
        "fitted": {"twitchTimeScale": round(scale, 4), "twitchExponent": round(exponent, 4)},
        "achieved": {"contractionTimeMs": ct, "halfRelaxationMs": hrt},
        "unitSelection": "SPREAD_ACROSS_POOL",
    }
    (RESULTS / "calibration.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

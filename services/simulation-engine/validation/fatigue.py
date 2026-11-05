"""Fatigue protocols on the corrected model (step 5), for comparison with published data.

1. Shields 1995 protocol (doi:10.1152/jn.1995.73.6.2195, abstract): tibial nerve, 20 Hz for 330 ms every
   second, 4 min. Benchmark: fatigue index of the acutely paralysed soleus 89 ± 8 % (chronic 19 ± 6 %),
   Chang & Shields 2011 (doi:10.1177/1545968310390224, abstract — protocol not detailed there).
2. Burke protocol as described by Potvin & Fuglevand 2017: 40 Hz trains, 33 % duty cycle (330 ms / 1 s),
   2 min; fatigue index of single units from ≈ 0.995 (weakest) to ≈ 0.10 (strongest), their estimate from
   Burke et al.'s Fig 5. This is a consistency check of the per-spike integration, since the model's
   fatigabilities were derived from those same numbers.

Run: uv run --group validation python -m validation.fatigue
"""

from __future__ import annotations

import json
from dataclasses import replace

import numpy as np

from eenm_engine.domain.axon_stimulation import axon_spikes
from eenm_engine.domain.fatigue import FatigueModel
from eenm_engine.domain.motor_unit_pool import MotorUnitType
from eenm_engine.domain.simulation import UNIT_TYPES, IncrementalForce, MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, stimulus_series
from validation.protocols import RESULTS, VARIANTS

STEP_MS = 0.05  # 0.3 ms pulses = 6 samples; keeps 4 min of 120 units tractable
BLOCK = 2000  # samples per streaming block


def run(frequency_hz: float, seconds: float) -> tuple[np.ndarray, np.ndarray, dict[MotorUnitType, np.ndarray]]:
    base = VARIANTS["axons"]
    model = replace(base.model, fatigue=FatigueModel(), fixed_conduction_delay=True)
    protocol = StimulusProtocol(
        duration_ms=seconds * 1000.0,
        step_ms=STEP_MS,
        frequency_hz=frequency_hz,
        duty_cycle_percent=base.pulse_ms * frequency_hz / 1000.0 * 100.0,
        amplitude=base.amplitude,
        train_on_ms=330.0,
        train_period_ms=1000.0,
    )
    config = SimulationConfig(stimulus=protocol, units_per_type=base.units, model=model, output_step_ms=1.0)
    setup = MotorUnitSetup.from_config(config)
    spikes = axon_spikes(stimulus_series(protocol), STEP_MS, setup.axon_rheobase, model.axon_excitability).astype(
        np.float64
    )
    force = IncrementalForce(setup, config, spikes.shape[0])
    total = []
    for start in range(0, spikes.shape[0], BLOCK):
        series = force.add(spikes[start : start + BLOCK])
        if series is not None:
            total.append(series.total_force)
    capacity = force.capacity()
    assert capacity is not None
    return protocol.time_grid(), np.concatenate(total), capacity


def train_peaks(time: np.ndarray, force: np.ndarray) -> np.ndarray:
    seconds = int(time[-1] // 1000)
    return np.array([force[(time >= 1000 * s) & (time < 1000 * (s + 1))].max() for s in range(seconds)])


def main() -> None:
    report: dict[str, object] = {}

    time, force, _ = run(20.0, 240.0)
    peaks = train_peaks(time, force)
    report["shields20Hz4min"] = {
        "fatigueIndexAt120s": float(peaks[119] / peaks[0]),
        "fatigueIndexAt240s": float(peaks[-1] / peaks[0]),
        "peakPerTrainEvery30s": [float(p / peaks[0]) for p in peaks[::30]],
    }
    print("Shields 20 Hz:", json.dumps(report["shields20Hz4min"]))

    _, _, capacity = run(40.0, 120.0)
    ranked = np.concatenate([capacity[t] for t in UNIT_TYPES])  # S, FR, FF = increasing pool rank
    report["burke40Hz2min"] = {
        "capacityWeakestUnit": float(ranked[0]),
        "capacityStrongestUnit": float(ranked[-1]),
        "capacityByTypeMean": {t.value: float(capacity[t].mean()) for t in UNIT_TYPES},
    }
    print("Burke 40 Hz:", json.dumps(report["burke40Hz2min"]))
    out = RESULTS / "fatigue"
    out.mkdir(parents=True, exist_ok=True)
    (out / "metrics.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

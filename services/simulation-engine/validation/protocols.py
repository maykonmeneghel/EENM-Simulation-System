"""Physiological protocols run on the ported model, for comparison with published data.

Run: uv run --group validation python -m validation.protocols  (writes validation/results/)
The model is used exactly as ported (no parameter changes): see docs/matlab-port-notes.md.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from eenm_engine.application.events import SimulationChunk
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.force_pipeline import find_peaks_matlab
from eenm_engine.domain.motor_unit_pool import MotorUnitType
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, stimulus_current
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver

RESULTS = Path(__file__).parent / "results"
DURATION_MS = 1000.0
PULSE_MS = 5.0  # the model's default pulse width (20 % duty cycle at 40 Hz)
TYPES = (MotorUnitType.S, MotorUnitType.FR, MotorUnitType.FF)


@dataclass
class Run:
    time: NDArray[np.float64]
    total: NDArray[np.float64]
    by_type: dict[MotorUnitType, NDArray[np.float64]]
    spikes_per_unit: list[int]
    pulses: int


def simulate(frequency_hz: float, pulse_ms: float = PULSE_MS, duration_ms: float = DURATION_MS) -> Run:
    duty = min(99.0, pulse_ms * frequency_hz / 1000.0 * 100.0)
    protocol = StimulusProtocol(duration_ms=duration_ms, frequency_hz=frequency_hz, duty_cycle_percent=duty)
    config = SimulationConfig(stimulus=protocol, output_step_ms=0.1)
    chunks = [e for e in RunSimulation(ScipyBdfSolver()).execute(config) if isinstance(e, SimulationChunk)]
    spikes = _spike_counts(config)
    onsets = np.flatnonzero(np.diff(np.r_[0.0, [stimulus_current(t, protocol) for t in protocol.time_grid()]]) > 0)
    return Run(
        time=np.concatenate([c.time_ms for c in chunks]),
        total=np.concatenate([c.force_total for c in chunks]),
        by_type={t: np.concatenate([c.force_by_type[t] for c in chunks]) for t in TYPES},
        spikes_per_unit=spikes,
        pulses=int(onsets.size),
    )


def _spike_counts(config: SimulationConfig) -> list[int]:
    """Soma action potentials (> 0 mV) per unit, integrating the pool directly."""
    setup = MotorUnitSetup.from_config(config)
    pool, p = setup.motoneurons, config.stimulus
    y = ScipyBdfSolver().integrate(
        lambda t, s: pool.derivatives(t, s, lambda u: stimulus_current(u, p)),
        pool.initial_state(), p.time_grid()[::10], pool.jacobian_sparsity(),
    )
    vs = pool.soma_voltage(y, pool.n_units)
    return [int(find_peaks_matlab(vs[:, k], 0.0)[0].size) for k in range(pool.n_units)]


def twitch_metrics(time: NDArray[np.float64], force: NDArray[np.float64]) -> dict[str, float]:
    """Contraction time (onset → peak) and half-relaxation time (peak → 50 % of peak)."""
    peak = int(np.argmax(force))
    onset = int(np.flatnonzero(force > 1e-6 * force[peak])[0])
    after = np.flatnonzero(force[peak:] <= 0.5 * force[peak])
    half = float(time[peak + after[0]] - time[peak]) if after.size else float("nan")
    return {
        "onsetMs": float(time[onset]),
        "contractionTimeMs": float(time[peak] - time[onset]),
        "halfRelaxationMs": half,
        "peak": float(force[peak]),
    }


def main() -> None:
    RESULTS.mkdir(exist_ok=True)
    report: dict[str, object] = {}

    # 1. Single twitch: one 5 ms pulse at t = 0, then nothing for the rest of the second.
    twitch = simulate(frequency_hz=1.0)
    report["twitch"] = {
        "pulses": twitch.pulses,
        "spikesPerUnit": twitch.spikes_per_unit,
        "total": twitch_metrics(twitch.time, twitch.total),
        **{t.value: twitch_metrics(twitch.time, twitch.by_type[t]) for t in TYPES},
    }

    # 2. Force-frequency, ripple and rise time.
    frequencies = [1, 2, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100]
    rows, runs = [], {}
    for f in frequencies:
        run = simulate(frequency_hz=float(f))
        runs[f] = run
        window = run.time >= 500.0  # second half of the train
        steady = run.total[window]
        rows.append({
            "frequencyHz": f,
            "pulses": run.pulses,
            "spikesPerUnit": run.spikes_per_unit,
            "peakForce": float(run.total.max()),
            "meanForceSecondHalf": float(steady.mean()),
            "rippleSecondHalf": float((steady.max() - steady.min()) / steady.max()) if steady.max() > 0 else None,
        })
        print(f"{f:>4} Hz  pulses={run.pulses:3d}  spikes/unit={run.spikes_per_unit}  peak={run.total.max():.4g}")
    top = max(r["peakForce"] for r in rows)
    for r in rows:
        r["normalisedPeak"] = r["peakForce"] / top
    report["forceFrequency"] = rows
    report["twitchTetanusRatio"] = report["twitch"]["total"]["peak"] / top  # type: ignore[index]

    run40 = runs[40]
    final = run40.total[run40.time >= 900].mean()
    reached = np.flatnonzero(run40.total >= 0.9 * final)
    report["riseTime40HzMs"] = float(run40.time[reached[0]]) if reached.size else None
    report["forceAt40HzStillRisingAt1s"] = bool(run40.total[run40.time >= 900].mean() > 1.02 * run40.total[(run40.time >= 700) & (run40.time < 800)].mean())

    (RESULTS / "metrics.json").write_text(json.dumps(report, indent=2))
    _plot(twitch, runs, rows)
    print(json.dumps({k: v for k, v in report.items() if k != "forceFrequency"}, indent=2))


def _plot(twitch: Run, runs: dict[int, Run], rows: list[dict[str, object]]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(1, 3, figsize=(16, 4.5))
    for t in TYPES:
        ax[0].plot(twitch.time, twitch.by_type[t], label=t.value)
    ax[0].plot(twitch.time, twitch.total, "k", label="total")
    ax[0].set(title="Single twitch (one 5 ms pulse)", xlabel="time (ms)", ylabel="force (model units)")
    ax[0].legend()
    for f in (5, 10, 20, 40, 80):
        ax[1].plot(runs[f].time, runs[f].total, label=f"{f} Hz")
    ax[1].set(title="Force during 1 s trains", xlabel="time (ms)")
    ax[1].legend()
    ax[2].plot([r["frequencyHz"] for r in rows], [r["normalisedPeak"] for r in rows], "o-")
    ax[2].set(title="Force-frequency (peak, normalised)", xlabel="frequency (Hz)", ylabel="F / Fmax")
    fig.tight_layout()
    fig.savefig(RESULTS / "protocols.png", dpi=120)


if __name__ == "__main__":
    main()

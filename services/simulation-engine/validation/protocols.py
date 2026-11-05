"""Physiological protocols run on model variants, for comparison with published data.

Run: uv run --group validation python -m validation.protocols [variant ...]
Writes validation/results/<variant>/metrics.json and protocols.png, and validation/results/summary.md.
Variants are defined in ``VARIANTS``; ``original`` is the unmodified port (docs/matlab-port-notes.md).
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from eenm_engine.application.events import SimulationChunk
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.axon_stimulation import axon_spikes
from eenm_engine.domain.force_pipeline import find_peaks_matlab
from eenm_engine.domain.model_options import ForceAggregation, ModelOptions, StimulationSite, TwitchDrive, UnitSelection
from eenm_engine.domain.motor_unit_pool import MotorUnitType, Muscle, proportional_units
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, stimulus_current, stimulus_series
from eenm_engine.domain.twitch import TwitchShape
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver

RESULTS = Path(__file__).parent / "results"
DURATION_MS = 1000.0
PULSE_MS = 5.0  # the model's default pulse width (20 % duty cycle at 40 Hz)
TYPES = (MotorUnitType.S, MotorUnitType.FR, MotorUnitType.FF)
FREQUENCIES = (1, 2, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100)


@dataclass(frozen=True)
class Variant:
    model: ModelOptions
    pulse_ms: float = PULSE_MS
    amplitude: float = 100.0
    units: dict[MotorUnitType, int] | None = None


_STEP2 = ModelOptions(
    unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
    twitch_shape=TwitchShape(exponent=4.7887),
    twitch_time_scale=1.6553,
    twitch_drive=TwitchDrive.OWN_SPIKES,
    force_aggregation=ForceAggregation.SUM,
    rate_gain=True,
)

VARIANTS: dict[str, Variant] = {
    "original": Variant(ModelOptions.original()),
    "spread-units": Variant(ModelOptions(unit_selection=UnitSelection.SPREAD_ACROSS_POOL)),
    # Step 1: values fitted by validation/calibrate.py to human whole-soleus twitch timing.
    "human-twitch": Variant(
        ModelOptions(
            unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
            twitch_shape=TwitchShape(exponent=5.1232),
            twitch_time_scale=1.5718,
        )
    ),
    # Step 2: each unit's own spikes (Q2), linear sum of unit forces (Q7), without and with rate saturation.
    "own-spikes": Variant(
        ModelOptions(
            unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
            twitch_shape=TwitchShape(exponent=5.1232),
            twitch_time_scale=1.5718,
            twitch_drive=TwitchDrive.OWN_SPIKES,
            force_aggregation=ForceAggregation.SUM,
        )
    ),
    "rate-gain": Variant(_STEP2),  # twitch recalibrated on this pipeline (validation/calibrate.py step2)
    # Step 3: clinical pulse width (300-600 us, Doucet et al. 2012), supramaximal amplitude
    # (1.5x the 99.4 uA/cm2 at which every simulated unit fires with a 0.3 ms pulse).
    "clinical-pulse": Variant(_STEP2, pulse_ms=0.3, amplitude=150.0),
    # Pool size and composition: 120 units (as simulated by Potvin & Fuglevand 2017) in the proportions of the
    # model's soleus pool (800/50/50 -> 106/7/7), each weighted by the pool units it represents; twitch
    # re-fitted on this configuration (validation/calibrate.py pool120); 1.5x the all-units threshold.
    "pool120": Variant(
        ModelOptions(
            unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
            twitch_shape=TwitchShape(exponent=3.9482),
            twitch_time_scale=1.2775,
            twitch_drive=TwitchDrive.OWN_SPIKES,
            force_aggregation=ForceAggregation.SUM,
            rate_gain=True,
            represent_pool=True,
        ),
        pulse_ms=0.3,
        amplitude=153.0,
        units=proportional_units(Muscle.SOLEUS, 120),
    ),
    # Step 4: the pool120 configuration stimulated through its motor axons (analytic recruitment layer:
    # Weiss strength-duration, tau 0.459 ms, non-selective fixed order); twitch re-fitted (calibrate axons).
    "axons": Variant(
        ModelOptions(
            unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
            twitch_shape=TwitchShape(exponent=3.9461),
            twitch_time_scale=1.2772,
            twitch_drive=TwitchDrive.OWN_SPIKES,
            force_aggregation=ForceAggregation.SUM,
            rate_gain=True,
            represent_pool=True,
            stimulation_site=StimulationSite.MOTOR_AXONS,
        ),
        pulse_ms=0.3,
        amplitude=153.0,
        units=proportional_units(Muscle.SOLEUS, 120),
    ),
}


@dataclass
class Run:
    time: NDArray[np.float64]
    total: NDArray[np.float64]
    by_type: dict[MotorUnitType, NDArray[np.float64]]
    spikes_per_unit: list[int]
    pulses: int


def simulate(frequency_hz: float, variant: Variant) -> Run:
    duty = min(99.0, variant.pulse_ms * frequency_hz / 1000.0 * 100.0)
    protocol = StimulusProtocol(
        duration_ms=DURATION_MS, frequency_hz=frequency_hz, duty_cycle_percent=duty, amplitude=variant.amplitude
    )
    extra = {"units_per_type": variant.units} if variant.units else {}
    config = SimulationConfig(stimulus=protocol, output_step_ms=0.1, model=variant.model, **extra)
    chunks = [e for e in RunSimulation(ScipyBdfSolver()).execute(config) if isinstance(e, SimulationChunk)]
    stimulus = np.array([stimulus_current(t, protocol) for t in protocol.time_grid()])
    return Run(
        time=np.concatenate([c.time_ms for c in chunks]),
        total=np.concatenate([c.force_total for c in chunks]),
        by_type={t: np.concatenate([c.force_by_type[t] for c in chunks]) for t in TYPES},
        spikes_per_unit=_spike_counts(config),
        pulses=int(np.count_nonzero(np.diff(np.r_[0.0, stimulus]) > 0)),
    )


def _spike_counts(config: SimulationConfig) -> list[int]:
    """Action potentials per unit: soma spikes (> 0 mV), or axon spikes with axon stimulation."""
    setup = MotorUnitSetup.from_config(config)
    pool, p = setup.motoneurons, config.stimulus
    if config.model.stimulation_site is StimulationSite.MOTOR_AXONS:
        spikes = axon_spikes(stimulus_series(p), p.step_ms, setup.axon_rheobase, config.model.axon_excitability)
        return [int(n) for n in spikes.sum(axis=0)]
    times = p.time_grid()[::10]
    integration = ScipyBdfSolver().start(
        lambda t, s: pool.derivatives(t, s, lambda u: stimulus_current(u, p)),
        pool.initial_state(),
        float(times[0]),
        float(times[-1]),
        pool.jacobian_sparsity(),
        max_step=p.solver_max_step_ms(),
    )
    vs = pool.soma_voltage(integration.advance(times), pool.n_units)
    return [int(find_peaks_matlab(vs[:, k], 0.0)[0].size) for k in range(pool.n_units)]


def twitch_metrics(time: NDArray[np.float64], force: NDArray[np.float64]) -> dict[str, float]:
    """Contraction time (onset → peak) and half-relaxation time (peak → 50 % of peak)."""
    peak = int(np.argmax(force))
    onset = int(np.flatnonzero(force > 1e-6 * force[peak])[0])
    after = np.flatnonzero(force[peak:] <= 0.5 * force[peak])
    half = float(time[peak + after[0]] - time[peak]) if after.size else float("nan")
    return {
        "contractionTimeMs": float(time[peak] - time[onset]),
        "halfRelaxationMs": half,
        "peak": float(force[peak]),
    }


def ripple(run: Run, force: NDArray[np.float64]) -> float:
    steady = force[run.time >= 500.0]
    return float((steady.max() - steady.min()) / steady.max()) if steady.max() > 0 else float("nan")


def evaluate(variant: Variant) -> dict[str, object]:
    twitch = simulate(1.0, variant)
    runs = {f: simulate(float(f), variant) for f in FREQUENCIES}
    peaks = np.array([runs[f].total.max() for f in FREQUENCIES])
    normalised = peaks / peaks.max()
    rising = int(np.argmax(normalised >= 0.5))
    f50 = float(np.interp(0.5, normalised[: rising + 1], FREQUENCIES[: rising + 1]))
    run40 = runs[40]
    plateau = run40.total[run40.time >= 900].mean()

    by_type = {}
    for t in TYPES:
        tetanus = max(runs[f].by_type[t].max() for f in FREQUENCIES)
        by_type[t.value] = {
            **twitch_metrics(twitch.time, twitch.by_type[t]),
            "tetanusTwitchRatio": float(tetanus / twitch.by_type[t].max()),
            "ripple40Hz": ripple(run40, run40.by_type[t]),
        }
    whole = twitch_metrics(twitch.time, twitch.total)
    return {
        "twitch": whole,
        "hrtOverCt": whole["halfRelaxationMs"] / whole["contractionTimeMs"],
        "byType": by_type,
        "twitchTetanusRatio": float(twitch.total.max() / peaks.max()),
        "f50Hz": f50,
        "frequencyOfMaxForceHz": FREQUENCIES[int(np.argmax(peaks))],
        "forceAt100HzOverMax": float(normalised[-1]),
        "riseTo90PercentAt40HzMs": float(run40.time[np.argmax(run40.total >= 0.9 * plateau)]),
        "forceFrequency": [
            {
                "frequencyHz": f,
                "normalisedPeak": float(n),
                "ripple": ripple(runs[f], runs[f].total),
                "spikesPerUnit": runs[f].spikes_per_unit,
                "pulses": runs[f].pulses,
            }
            for f, n in zip(FREQUENCIES, normalised, strict=True)
        ],
        "_runs": {"twitch": twitch, **runs},
    }


def main(names: list[str]) -> None:
    results = {}
    for name in names:
        print(f"== {name}")
        metrics = evaluate(VARIANTS[name])
        runs = metrics.pop("_runs")
        out = RESULTS / name
        out.mkdir(parents=True, exist_ok=True)
        (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
        _plot(runs, metrics, out / "protocols.png", name)  # type: ignore[arg-type]
        results[name] = metrics
    stored = {}
    for name in VARIANTS:  # summary of every variant computed so far, in VARIANTS order
        path = RESULTS / name / "metrics.json"
        if path.exists():
            stored[name] = json.loads(path.read_text())
    _summary(stored)


def _summary(results: dict[str, dict[str, object]]) -> None:
    def row(label: str, fn) -> str:  # type: ignore[no-untyped-def]
        return f"| {label} | " + " | ".join(fn(m) for m in results.values()) + " |"

    lines = [
        "| Metric | " + " | ".join(results) + " |",
        "|---|" + "---|" * len(results),
        row("Twitch CT (ms)", lambda m: f"{m['twitch']['contractionTimeMs']:.0f}"),
        row("Twitch HRT (ms)", lambda m: f"{m['twitch']['halfRelaxationMs']:.0f}"),
        row("HRT / CT", lambda m: f"{m['hrtOverCt']:.2f}"),
        *[
            row(
                f"{t} CT / HRT (ms)",
                lambda m, t=t: f"{m['byType'][t]['contractionTimeMs']:.0f} / {m['byType'][t]['halfRelaxationMs']:.0f}",
            )
            for t in ("S", "FR", "FF")
        ],
        *[
            row(f"{t} tetanus/twitch", lambda m, t=t: f"{m['byType'][t]['tetanusTwitchRatio']:.1f}")
            for t in ("S", "FR", "FF")
        ],
        *[
            row(f"{t} ripple at 40 Hz", lambda m, t=t: f"{100 * m['byType'][t]['ripple40Hz']:.1f} %")
            for t in ("S", "FR", "FF")
        ],
        row("Twitch / tetanus (whole)", lambda m: f"{m['twitchTetanusRatio']:.2f}"),
        row("f50 (Hz)", lambda m: f"{m['f50Hz']:.1f}"),
        row("Frequency of max force (Hz)", lambda m: f"{m['frequencyOfMaxForceHz']}"),
        row("Force at 100 Hz / max", lambda m: f"{m['forceAt100HzOverMax']:.2f}"),
        row("Rise to 90 % at 40 Hz (ms)", lambda m: f"{m['riseTo90PercentAt40HzMs']:.0f}"),
    ]
    (RESULTS / "summary.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


def _plot(runs: dict[str, Run], metrics: dict[str, object], path: Path, title: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    twitch = runs["twitch"]
    fig, ax = plt.subplots(1, 3, figsize=(16, 4.5))
    for t in TYPES:
        ax[0].plot(twitch.time, twitch.by_type[t], label=t.value)
    ax[0].plot(twitch.time, twitch.total, "k", label="total")
    ax[0].set(title=f"{title}: single twitch", xlabel="time (ms)", ylabel="force (model units)")
    ax[0].legend()
    for f in (5, 10, 20, 40, 80):
        ax[1].plot(runs[f].time, runs[f].total, label=f"{f} Hz")  # type: ignore[index]
    ax[1].set(title="Force during 1 s trains", xlabel="time (ms)")
    ax[1].legend()
    rows = metrics["forceFrequency"]
    ax[2].plot([r["frequencyHz"] for r in rows], [r["normalisedPeak"] for r in rows], "o-")  # type: ignore[attr-defined]
    ax[2].set(title="Force-frequency (peak, normalised)", xlabel="frequency (Hz)", ylabel="F / Fmax")
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


if __name__ == "__main__":
    main(sys.argv[1:] or list(VARIANTS))

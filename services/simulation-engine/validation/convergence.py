"""Calculation verification: how the results change with the time step.

Run: uv run --group validation python -m validation.convergence [pool|force]
Writes validation/results/convergence/pool.json and force.json.

Part ``pool`` — the motoneuron-pool integrators (soma injection). Each case is integrated by
  - the compiled fixed-step integrator with a uniform internal step h = sample step / N, N = 1 … 160;
  - the production configurations: compiled adaptive (1 substep at rest, 20 while active) and SciPy BDF at
    rtol 1e-3 (ode23s's default tolerance, used by the validation protocols);
and compared with a reference: SciPy BDF at rtol 1e-9 / atol 1e-12. Errors: soma-voltage RMS over the run, units
whose spike count differs, and the worst spike-time shift among the others. Spike times are refined below the
sample step by a parabola through the peak sample and its neighbours, so shifts smaller than 0.01 ms are measured.
The scheme is first order, so the error should fall in proportion to h until it reaches the reference's own error.

Part ``force`` — the corrected model stimulated through the axons (no ODE: the analytic recruitment layer, then the
force pipeline). The validation protocols are re-run with sample steps of 0.05, 0.02, 0.01 (default) and
0.005 ms; the benchmarks of the correction log (twitch CT and HRT, twitch/tetanus, f50, force at 100 Hz) are
recorded for each step. Force in model units is proportional to the step (the twitch kernel is multiplied by it);
every benchmark here is a ratio or a time, so it should not depend on the step beyond its resolution.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.force_pipeline import find_peaks_matlab
from eenm_engine.domain.model_options import ModelOptions, StimulationSite
from eenm_engine.domain.motoneuron import MotoneuronPool
from eenm_engine.domain.motor_unit_pool import Muscle, proportional_units
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, Waveform, stimulus_current, stimulus_series
from eenm_engine.infrastructure.compiled_motoneuron import CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from validation.protocols import VARIANTS, Variant, evaluate

OUT = Path(__file__).parent / "results" / "convergence"
SUBSTEPS = (1, 2, 5, 10, 20, 40, 80, 160)
FORCE_STEPS_MS = (0.05, 0.02, 0.01, 0.005)

POOL_CASES = {
    "main-m": (
        "Main.m defaults: 9 units, 5 ms monophasic pulses into the soma, 40 Hz, 200 ms",
        SimulationConfig(stimulus=StimulusProtocol(duration_ms=200)),
    ),
    "corrected-soma": (
        "Corrected pool stimulated in the soma: 30 units, 300 us biphasic pulses, 40 Hz, 150 ms",
        SimulationConfig(
            stimulus=StimulusProtocol(
                duration_ms=150, frequency_hz=40, pulse_width_us=300, amplitude=153,
                waveform=Waveform.BIPHASIC_SYMMETRIC,
            ),
            model=ModelOptions.literature(site=StimulationSite.MOTONEURON_SOMA),
            units_per_type=proportional_units(Muscle.SOLEUS, 30),
        ),
    ),
}  # fmt: skip


def _rest(pool: MotoneuronPool) -> NDArray[np.float64]:
    return pool.soma_voltage(pool.initial_state()[:, None], pool.n_units)


def _bdf(pool: MotoneuronPool, p: StimulusProtocol, rtol: float, atol: float) -> NDArray[np.float64]:
    times = p.time_grid()
    integration = ScipyBdfSolver(rtol=rtol, atol=atol).start(
        lambda t, y: pool.derivatives(t, y, lambda u: stimulus_current(u, p)),
        pool.initial_state(),
        0.0,
        float(times[-1]),
        pool.jacobian_sparsity(),
        max_step=p.solver_max_step_ms(),
    )
    return np.vstack([_rest(pool), pool.soma_voltage(integration.advance(times[1:]), pool.n_units)])


def _compiled(pool: MotoneuronPool, p: StimulusProtocol, substeps: int, active: int) -> NDArray[np.float64]:
    integrator = CompiledPoolIntegrator(substeps=substeps, active_substeps=active)
    return np.vstack([_rest(pool), integrator.start(pool, p.step_ms).advance(stimulus_series(p)[:-1])])


def spike_times(v: NDArray[np.float64], step_ms: float) -> NDArray[np.float64]:
    """Spike peaks (> 0 mV), each refined by the vertex of the parabola through it and its two neighbours."""
    peaks, _ = find_peaks_matlab(v, 0.0)
    out = []
    for i in peaks:
        if 0 < i < v.size - 1:
            a, b, c = v[i - 1], v[i], v[i + 1]
            den = a - 2 * b + c
            out.append((i + (0.5 * (a - c) / den if den != 0 else 0.0)) * step_ms)
        else:
            out.append(i * step_ms)
    return np.asarray(out)


def errors(reference: NDArray[np.float64], v: NDArray[np.float64], step_ms: float) -> dict[str, float | int]:
    differ, worst = 0, 0.0
    for k in range(reference.shape[1]):
        a, b = spike_times(reference[:, k], step_ms), spike_times(v[:, k], step_ms)
        if a.size != b.size:
            differ += 1
        elif a.size:
            worst = max(worst, float(np.abs(a - b).max()))
    return {
        "voltageRmsMv": float(np.sqrt(np.mean((v - reference) ** 2))),
        "unitsWithDifferentSpikeCount": differ,
        "maxSpikeShiftMs": worst,
        "units": int(reference.shape[1]),
    }


def run_pool() -> dict[str, object]:
    out: dict[str, object] = {}
    for key, (label, config) in POOL_CASES.items():
        pool, p = MotorUnitSetup.from_config(config).motoneurons, config.stimulus
        clock = time.perf_counter()
        reference = _bdf(pool, p, 1e-9, 1e-12)
        print(f"{key}: reference {time.perf_counter() - clock:.0f}s, spikes per unit "
              f"{[spike_times(reference[:, k], p.step_ms).size for k in range(pool.n_units)]}")  # fmt: skip
        uniform = []
        for n in SUBSTEPS:
            e = errors(reference, _compiled(pool, p, n, n), p.step_ms)
            uniform.append({"substeps": n, "hMs": p.step_ms / n, **e})
            print(f"  compiled h = {p.step_ms / n:.2e} ms: {e}")
        production = {
            "compiledAdaptive_1_20": errors(reference, _compiled(pool, p, 1, 20), p.step_ms),
            "bdf_rtol1e-3": errors(reference, _bdf(pool, p, 1e-3, 1e-6), p.step_ms),
        }
        print(f"  production: {production}")
        out[key] = {"label": label, "sampleStepMs": p.step_ms, "uniform": uniform, "production": production}
    return out


def run_force() -> dict[str, object]:
    base = VARIANTS["axons"]
    out = []
    for step in FORCE_STEPS_MS:
        clock = time.perf_counter()
        m = evaluate(Variant(base.model, base.pulse_ms, base.amplitude, base.units, step_ms=step))
        row = {
            "stepMs": step,
            "contractionTimeMs": m["twitch"]["contractionTimeMs"],  # type: ignore[index]
            "halfRelaxationMs": m["twitch"]["halfRelaxationMs"],  # type: ignore[index]
            "twitchTetanusRatio": m["twitchTetanusRatio"],
            "f50Hz": m["f50Hz"],
            "forceAt100HzOverMax": m["forceAt100HzOverMax"],
            "twitchPeakModelUnits": m["twitch"]["peak"],  # type: ignore[index]
            "seconds": round(time.perf_counter() - clock, 1),
        }
        print(row)
        out.append(row)
    return {"variant": "axons", "outputStepMs": 0.1, "rows": out}


def main(parts: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for part in parts or ["pool", "force"]:
        result = run_pool() if part == "pool" else run_force()
        (OUT / f"{part}.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1:])

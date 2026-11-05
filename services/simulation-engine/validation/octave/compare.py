"""Compare the Python engine with Main.m run in Octave; exit 1 if any tolerance is exceeded.

Tolerances (numerical differences only — ode23s in Octave vs SciPy BDF, see docs/matlab-port-notes.md):
same number of spikes in every unit, spike times within 0.1 ms, mean and peak force within 1 %.

Run: uv run python -m validation.octave.compare <python.mat> <octave.mat>
"""

from __future__ import annotations

import sys

import numpy as np
from scipy.io import loadmat

from eenm_engine.domain.force_pipeline import find_peaks_matlab

STEP_MS = 0.01
MAX_SPIKE_SHIFT_MS = 0.1
MAX_FORCE_REL_DIFF = 0.01
UNITS = ("S1", "S2", "S3", "S4", "S5", "FR1", "FR2", "FF1", "FF2")


def main(python_mat: str, octave_mat: str) -> int:
    py, oc = loadmat(python_mat), loadmat(octave_mat)
    vp, vo = py["Vs"], oc["Vs"]
    failures: list[str] = []
    if vp.shape != vo.shape or not np.allclose(oc["time2"].ravel(), py["time"].ravel()):
        print(f"shape/time grid differ: python {vp.shape}, octave {vo.shape}")
        return 1
    print(f"samples {vp.shape[0]}, units {vp.shape[1]}")
    print(f"{'unit':5} {'spikes py/oct':>13} {'max |dt| ms':>11} {'mean |dt| ms':>12} {'Vs rms diff mV':>14}")
    for k, name in enumerate(UNITS):
        a, _ = find_peaks_matlab(vp[:, k], 0.0)
        b, _ = find_peaks_matlab(vo[:, k], 0.0)
        shift_max = shift_mean = "n/a"
        if a.size != b.size:
            failures.append(f"{name}: {a.size} vs {b.size} spikes")
        elif a.size:
            shift = np.abs(a - b) * STEP_MS
            shift_max, shift_mean = f"{shift.max():.2f}", f"{shift.mean():.3f}"
            if shift.max() > MAX_SPIKE_SHIFT_MS:
                failures.append(f"{name}: spike shift {shift.max():.2f} ms")
        rms = float(np.sqrt(np.mean((vp[:, k] - vo[:, k]) ** 2)))
        print(f"{name:5} {a.size:>6}/{b.size:<6} {shift_max:>11} {shift_mean:>12} {rms:>14.2f}")
    fp, fo = py["force"].ravel(), oc["force"].ravel()
    mean_diff = abs(fp.mean() - fo.mean()) / abs(fo.mean())
    peak_diff = abs(fp.max() - fo.max()) / abs(fo.max())
    t_py, t_oc = fp.argmax() * STEP_MS, fo.argmax() * STEP_MS
    print(f"force peak python {fp.max():.6g} @ {t_py:.2f} ms | octave {fo.max():.6g} @ {t_oc:.2f} ms")
    print(f"force mean python {fp.mean():.6g} | octave {fo.mean():.6g}")
    correlation = np.corrcoef(fp, fo)[0, 1]
    print(f"relative difference: mean {mean_diff:.2%}, peak {peak_diff:.2%}; correlation {correlation:.5f}")
    for label, diff in (("mean", mean_diff), ("peak", peak_diff)):
        if diff > MAX_FORCE_REL_DIFF:
            failures.append(f"{label} force differs by {diff:.2%}")
    print("PASS" if not failures else "FAIL: " + "; ".join(failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))

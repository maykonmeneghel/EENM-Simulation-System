"""Fit the condition adjustments that are calibrated to a measurement (docs/research/disease-literature.md).

Chronic SCI fatigability: the slow-to-fast shift φ of every unit's log-fatigability (``FatigueModel.fast_shift``;
Potvin & Fuglevand 2017, Eq 9, moved a fraction φ toward the most fatigable unit) that gives
the soleus fatigue index of chronic complete SCI, 0.19 ± 0.06 (SD), in the protocol it was measured with: 120 trains
of 20 Hz, 330 ms every 1000 ms; FI = peak of train 120 / peak of train 1 (Chang & Shields 2011, PMID 21304018, full
text). The same protocol gives 0.85 for the unmodified model (0.89 ± 0.08 measured in acute SCI).

Run: uv run --group validation python -m validation.conditions
"""

from __future__ import annotations

import json
from dataclasses import replace

from eenm_engine.domain.fatigue import FatigueModel
from validation.fatigue import run, train_peaks
from validation.protocols import RESULTS, VARIANTS

TARGET_FI = 0.19
TRAINS = 120


def fatigue_index(shift: float) -> float:
    base = VARIANTS["axons"]
    model = replace(base.model, fatigue=FatigueModel(fast_shift=shift))
    VARIANTS["_fit"] = replace(base, model=model)
    try:
        time, force, _ = run(20.0, float(TRAINS), "_fit")
    finally:
        del VARIANTS["_fit"]
    peaks = train_peaks(time, force)
    return float(peaks[TRAINS - 1] / peaks[0])


def main() -> None:
    lo, hi = 0.0, 1.0  # FI falls as the shift grows
    fi_lo, fi_hi = fatigue_index(lo), fatigue_index(hi)
    print(f"shift {lo}: FI {fi_lo:.3f}; shift {hi}: FI {fi_hi:.3f}")
    if not fi_hi < TARGET_FI < fi_lo:
        raise SystemExit("target not bracketed")
    for _ in range(14):
        mid = (lo + hi) / 2
        fi = fatigue_index(mid)
        print(f"shift {mid:.4f}: FI {fi:.4f}")
        if fi > TARGET_FI:
            lo = mid
        else:
            hi = mid
        if hi - lo < 0.002:
            break
    shift = round((lo + hi) / 2, 3)
    result = {
        "adjustment": "SCI_CHRONIC slow-to-fast fatigability shift",
        "target": {"fatigueIndex": TARGET_FI, "protocol": "20 Hz, 330 ms every 1000 ms, 120 trains"},
        "fitted": {"fastShift": shift},
        "achieved": {"fatigueIndex": fatigue_index(shift)},
        "normal": {"fatigueIndex": fi_lo},
    }
    (RESULTS / "condition-sci-fatigability.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

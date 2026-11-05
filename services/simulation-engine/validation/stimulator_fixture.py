"""Write the stimulator reference values the web preview is tested against (apps/web/src/domain).

The Estimulador view draws the stimulus in the browser; this fixture keeps that drawing equal to the engine:
``stimulus_current`` and ``envelope`` at chosen instants for a few stimulator settings.

Run: uv run python -m validation.stimulator_fixture
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from eenm_engine.domain.stimulus import StimulusProtocol, Waveform, envelope, stimulus_current

OUT = Path(__file__).resolve().parents[3] / "apps/web/src/domain/stimulator.fixture.json"

CASES = {
    "mono-40Hz-300us": {"frequency_hz": 40, "pulse_width_us": 300, "amplitude": 120, "duration_ms": 200},
    "biphasic-35Hz-450us-trains-ramps": {
        "frequency_hz": 35,
        "pulse_width_us": 450,
        "amplitude": 150,
        "waveform": "BIPHASIC_SYMMETRIC",
        "duration_ms": 6000,
        "train_on_ms": 2000,
        "train_period_ms": 3000,
        "ramp_up_ms": 500,
        "ramp_down_ms": 700,
    },
    "mono-20Hz-200us-ramp-no-trains": {
        "frequency_hz": 20,
        "pulse_width_us": 200,
        "amplitude": 90,
        "duration_ms": 1000,
        "ramp_up_ms": 400,
        "ramp_down_ms": 200,
    },
}


def main() -> None:
    out: dict[str, object] = {}
    for name, kwargs in CASES.items():
        args = dict(kwargs)
        if "waveform" in args:
            args["waveform"] = Waveform(args["waveform"])
        p = StimulusProtocol(**args)  # type: ignore[arg-type]
        period = 1000.0 / p.frequency_hz
        pw = p.pulse_width_ms
        # inside/edges of pulses (both phases) and random instants across the run
        starts = np.arange(0, p.duration_ms, period)[:: max(1, int(len(np.arange(0, p.duration_ms, period)) / 12))]
        probes = [s + d for s in starts for d in (0.0, pw * 0.5, pw * 1.5, pw * 2.5)]
        probes += list(np.random.default_rng(7).uniform(0, p.duration_ms, 40))
        times = sorted(round(float(t), 6) for t in probes if t <= p.duration_ms)
        out[name] = {
            "settings": kwargs,
            "samples": [[t, stimulus_current(t, p), envelope(t, p)] for t in times],
        }
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT} ({sum(len(v['samples']) for v in out.values())} samples)")  # type: ignore[index]


if __name__ == "__main__":
    main()

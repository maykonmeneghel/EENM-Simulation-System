"""Write the electrode reference values the web's Electrode section is tested against (apps/web/src/domain).

The Stimulator panel computes the electrode factor ``G`` and the calibrated thresholds in the browser for its
recruitment meter; this fixture keeps them equal to the engine (``domain/electrode.py``): the per-muscle defaults,
``G`` for a set of electrodes, and the first / last thresholds of calibrated runs.

Run: uv run python -m validation.electrode_fixture
"""

from __future__ import annotations

import json
from pathlib import Path

from eenm_engine.domain.axon_stimulation import AxonExcitability
from eenm_engine.domain.electrode import (
    DEFAULT_ELECTRODES,
    Calibration,
    Electrode,
    ElectrodeShape,
    SizeEffect,
    apply_electrode,
    electrode_setup,
    peak_depolarisation,
)
from eenm_engine.domain.motor_unit_pool import Muscle

OUT = Path(__file__).resolve().parents[3] / "apps/web/src/domain/electrode.fixture.json"

ELECTRODES = [
    (Muscle.SOLEUS, Electrode(ElectrodeShape.RECTANGLE, width_cm=5.0, length_cm=9.0, fat_thickness_cm=0.75)),
    (Muscle.SOLEUS, Electrode(ElectrodeShape.RECTANGLE, width_cm=2.0, length_cm=2.0, fat_thickness_cm=0.25)),
    (
        Muscle.TIBIALIS_ANTERIOR,
        Electrode(ElectrodeShape.ROUND, diameter_cm=3.2, fat_thickness_cm=2.0, axon_depth_cm=1.1),
    ),
    (Muscle.FLEXOR_CARPI_RADIALIS, Electrode(ElectrodeShape.RECTANGLE, width_cm=5.0, length_cm=5.0)),
    (
        Muscle.FLEXOR_CARPI_RADIALIS,
        Electrode(ElectrodeShape.ROUND, diameter_cm=2.5, fat_thickness_cm=0.0, axon_depth_cm=0.1),
    ),
    (Muscle.EXTENSOR_CARPI_RADIALIS, Electrode(ElectrodeShape.ROUND, diameter_cm=1.0, fat_thickness_cm=0.48)),
    (Muscle.GASTROCNEMIUS_MEDIAL, Electrode(ElectrodeShape.ROUND, diameter_cm=7.0, fat_thickness_cm=0.75)),
    (
        Muscle.GASTROCNEMIUS_LATERAL,
        Electrode(ElectrodeShape.RECTANGLE, width_cm=10.0, length_cm=10.0, fat_thickness_cm=3.0),
    ),
]

CALIBRATIONS = [
    (Muscle.SOLEUS, None, Calibration(motor_threshold_ma=18.0, pulse_width_us=300.0, full_recruitment_ma=42.0), 0.459),
    (Muscle.SOLEUS, None, Calibration(motor_threshold_ma=20.0, pulse_width_us=200.0), 0.13),
    (
        Muscle.FLEXOR_CARPI_RADIALIS,
        Electrode(ElectrodeShape.RECTANGLE, width_cm=4.0, length_cm=4.0, fat_thickness_cm=0.56),
        Calibration(motor_threshold_ma=12.0, pulse_width_us=300.0, full_recruitment_ma=30.0, electrode_area_cm2=4.91),
        0.459,
    ),
]


def _electrode_json(e: Electrode) -> dict[str, object]:
    return {
        "shape": e.shape.value,
        "widthCm": e.width_cm,
        "lengthCm": e.length_cm,
        "diameterCm": e.diameter_cm,
        "fatThicknessCm": e.fat_thickness_cm,
        "axonDepthCm": e.axon_depth_cm,
    }


def main() -> None:
    out: dict[str, object] = {
        "defaults": {m.value: _electrode_json(e) for m, e in DEFAULT_ELECTRODES.items()},
        "peaks": [
            {"radiusCm": a, "depthCm": d, "peak": peak_depolarisation(a, d)[1]}
            for a, d in [(2.8, 0.35), (1.25, 0.35), (2.8, 1.25), (2.8, 2.5), (0.5, 1.0)]
        ],
        "factors": [
            {
                "muscle": m.value,
                "electrode": _electrode_json(e),
                "g": electrode_setup(m, e, SizeEffect.HALF_SPACE_AF).threshold_factor,
            }
            for m, e in ELECTRODES
        ],
        "calibrated": [],
    }
    for m, e, c, tau in CALIBRATIONS:
        setup = electrode_setup(m, e, SizeEffect.HALF_SPACE_AF, c)
        x = apply_electrode(AxonExcitability(chronaxie_ms=tau), setup)
        pw = 0.3
        first = x.lowest_rheobase * (1 + tau / pw) * x.threshold_factor
        out["calibrated"].append(  # type: ignore[attr-defined]
            {
                "muscle": m.value,
                "electrode": _electrode_json(e) if e else None,
                "calibration": {
                    "motorThresholdMa": c.motor_threshold_ma,
                    "fullRecruitmentMa": c.full_recruitment_ma,
                    "pulseWidthUs": c.pulse_width_us,
                    "electrodeAreaCm2": c.electrode_area_cm2,
                },
                "tauSdMs": tau,
                "g": x.threshold_factor,
                "pulseWidthMs": pw,
                "thresholdMin": first,
                "thresholdMax": first * x.rheobase_range,
            }
        )
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

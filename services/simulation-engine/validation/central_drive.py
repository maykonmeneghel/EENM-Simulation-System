"""Phase 2 gate (``docs/design/central-layer.md``): motor-unit firing under the descending drive.

Targets (``docs/research/central-layer-literature.md``):
- motor-unit firing rate in PD, FCR/ECR/EDC/FDS: 10.9 ± 2.9 Hz, range 6.0–18.5 (Agapaki et al. 2018, full text);
- ISI coefficient of variation 10–30 % in tonic firing (Gallego et al. 2015 tuned their noise to it, full text);
- doublet / triplet intra-burst ISI 41.6 ± 5.1 / 42.0 ± 4.3 ms, per-patient range 30–50 ms (Agapaki 2018);
- tremor frequency of the force: the drive's (4.4 Hz, Dideriksen 2017; 5.9 Hz, Agapaki 2018).

Scenarios: posture (voluntary drive, no tremor) for rate and CV; rest with tremor for bursts and the force spectrum.
Both current scales are reported. The pool is the 120-unit FCR, its soma injected with the drive only.

Run: uv run --group validation python -m validation.central_drive
"""

from __future__ import annotations

import json
from dataclasses import replace

import numpy as np

from eenm_engine.application.events import SimulationChunk
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.central_drive import CentralDrive, CurrentScale, DriveGenerator, Tremor
from eenm_engine.domain.model_options import ModelOptions, StimulationSite
from eenm_engine.domain.motor_unit_pool import Muscle, proportional_units
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol
from eenm_engine.infrastructure.compiled_motoneuron import SPIKE_THRESHOLD_MV, CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver
from validation.protocols import RESULTS

MUSCLE = Muscle.FLEXOR_CARPI_RADIALIS
STEP_MS = 0.025
SECONDS = 4.0
SKIP_MS = 1000.0  # initial transient (slow currents of the motoneuron)


def _config(drive: CentralDrive, step_ms: float = STEP_MS, seconds: float = SECONDS) -> SimulationConfig:
    model = replace(ModelOptions.literature(site=StimulationSite.MOTONEURON_SOMA), central_drive=drive)
    return SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=seconds * 1000, step_ms=step_ms, amplitude=0.0, pulse_width_us=300),
        muscle=MUSCLE,
        units_per_type=proportional_units(MUSCLE, 120),
        model=model,
        output_step_ms=1.0,
    )


def spike_times(drive: CentralDrive, seed: int = 0, step_ms: float = STEP_MS) -> list[np.ndarray]:
    """Soma spike times (ms) of every unit under the drive alone."""
    config = _config(drive, step_ms)
    setup = MotorUnitSetup.from_config(config)
    pool = setup.motoneurons
    assert pool.soma_area_cm2 is not None
    generator = DriveGenerator(drive, pool.soma_area_cm2, step_ms, seed=seed)
    integration = CompiledPoolIntegrator().start(pool, step_ms)
    total = round(SECONDS * 1000 / step_ms)
    previous = np.full(pool.n_units, -70.0)
    times: list[list[float]] = [[] for _ in range(pool.n_units)]
    block = 4000
    for start in range(0, total, block):
        rows = min(block, total - start)
        v = integration.advance(np.zeros(rows), generator.next(rows))
        before = np.vstack((previous[None, :], v[:-1]))
        j, k = np.nonzero((before < SPIKE_THRESHOLD_MV) & (v >= SPIKE_THRESHOLD_MV))
        for jj, kk in zip(j, k, strict=True):
            times[kk].append((start + jj + 1) * step_ms)
        previous = v[-1]
    return [np.array(t) for t in times]


def firing_stats(times: list[np.ndarray], burst_ms: float = 60.0) -> dict[str, object]:
    """Rate and ISI CV of the units that fire tonically after the transient; doublets = ISIs < ``burst_ms``."""
    rates, cvs, short = [], [], []
    for t in times:
        t = t[t >= SKIP_MS]
        if t.size < 4:
            continue
        isi = np.diff(t)
        rates.append(1000.0 / isi.mean())
        cvs.append(isi.std() / isi.mean())
        short.extend(isi[isi < burst_ms].tolist())
    active = len(rates)
    return {
        "activeUnits": active,
        "rateHz": {"mean": float(np.mean(rates)), "min": float(np.min(rates)), "max": float(np.max(rates))}
        if active
        else None,
        "isiCv": {"mean": float(np.mean(cvs)), "min": float(np.min(cvs)), "max": float(np.max(cvs))}
        if active
        else None,
        "shortIsiMs": {"n": len(short), "mean": float(np.mean(short)), "sd": float(np.std(short))} if short else None,
    }


def force_peak_hz(drive: CentralDrive) -> dict[str, float]:
    """Dominant frequency of the muscle force between 2 and 15 Hz (after the transient), and its share of power."""
    events = RunSimulation(ScipyBdfSolver(), pool_integrator=CompiledPoolIntegrator()).execute(_config(drive))
    chunks = [e for e in events if isinstance(e, SimulationChunk)]
    t = np.concatenate([c.time_ms for c in chunks])
    f = np.concatenate([c.force_total for c in chunks])
    x = f[t >= SKIP_MS]
    x = x - np.polyval(np.polyfit(np.arange(x.size), x, 1), np.arange(x.size))  # remove the slow trend
    power = np.abs(np.fft.rfft(x * np.hanning(x.size))) ** 2
    hz = np.fft.rfftfreq(x.size, 1e-3)
    band = (hz >= 2) & (hz <= 15)
    peak = float(hz[band][power[band].argmax()])
    return {"peakHz": peak, "bandShareOfPower": float(power[band].sum() / power[hz > 0.5].sum())}


def main() -> None:
    report: dict[str, object] = {}
    for scale in CurrentScale:
        posture = CentralDrive(voluntary_na=5.0, scale=scale)
        rest = CentralDrive(tremor=Tremor(4.4, 3.0), scale=scale)
        rest_alone = CentralDrive(scale=scale)
        report[scale.value] = {
            "posture5nA": firing_stats(spike_times(posture)),
            "restNoTremor": firing_stats(spike_times(rest_alone)),
            "restTremor4p4Hz": {**firing_stats(spike_times(rest)), "force": force_peak_hz(rest)},
        }
        print(scale.value, json.dumps(report[scale.value], indent=1))
    (RESULTS / "central-drive.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

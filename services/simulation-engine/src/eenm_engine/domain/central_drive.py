"""Descending (central) drive to the motoneuron pool: background, voluntary command, Parkinsonian tremor and noise.

Section 3.1 of ``docs/design/central-layer.md``. Each motoneuron *k* receives

    I_k(t) = I_bg + I_vol + A_tr · sin(2π f_tr t) + η_k(t)

with the values of Gallego et al. 2015 (J Neurosci 35:8925, doi:10.1523/JNEUROSCI.0106-15.2015, full text), whose
pool uses the same Cisi & Kohn two-compartment motoneurons as ours: background 3.5 nA (below the 4 nA rheobase of
their smallest motoneuron), postural voluntary drive 4.5–5.5 nA, tremor 3 nA (their model is of essential tremor; no
Parkinson amplitude in nA exists), white noise low-passed below 100 Hz with SD proportional to the mean current.
Tremor frequency in Parkinson's disease: 4.4 ± 1.0 Hz at the wrist (Dideriksen et al. 2017, full text) or 5.9 ± 0.8 Hz
at rest (Agapaki et al. 2018, full text) — both offered. One oscillator for every unit (no phase between pools: the
antagonist phase is to emerge from the Ia loop, phase 4).

Currents in nA become the model's current density (µA/cm²) through each unit's absolute soma area (Decision 1). Our
smallest motoneuron's rheobase is 1.81 nA, not 4 nA, so the published currents mean something else here (3.5 nA
already makes many units fire); ``CurrentScale.RHEOBASE`` multiplies them by 1.81 / 4 so the background stays below
threshold as in the paper. Both are offered; the published values are the default, because rescaled the resting
tremor fires no unit at all.

Phase-2 gate (``validation/central_drive.py``): ISI CV 0.22–0.30 ✓ (10–30 %); force peak 4.33 Hz for a 4.4 Hz drive ✓;
**firing rate 50–95 Hz ✗** (PD motor units 10.9 ± 2.9 Hz, Agapaki 2018) and short ISIs ≈ 17 ms ✗ (doublets 41.6 ms):
the inherited two-compartment motoneuron has no low-rate regime (its smallest unit jumps from silence to ≈ 46 Hz) and is
bistable (it keeps firing after the current stops) — a property of its conductances, not of the drive.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray
from scipy.signal import lfilter

GALLEGO_SMALLEST_RHEOBASE_NA = 4.0
MODEL_SMALLEST_RHEOBASE_NA = 1.81
"""Smallest constant soma current (nA) that fires the smallest unit of the pool within 8 s, from rest
(``tests/unit/test_central_drive.py``); it is still lower for longer currents (slow inward currents), by < 2 %."""

NOISE_CUTOFF_HZ = 100.0


class CurrentScale(Enum):
    PUBLISHED = "PUBLISHED"
    """Currents in nA as published (Gallego 2015)."""
    RHEOBASE = "RHEOBASE"
    """Currents × (our smallest rheobase / Gallego's), so they keep their meaning relative to threshold."""

    @property
    def factor(self) -> float:
        return MODEL_SMALLEST_RHEOBASE_NA / GALLEGO_SMALLEST_RHEOBASE_NA if self is CurrentScale.RHEOBASE else 1.0


@dataclass(frozen=True)
class Tremor:
    frequency_hz: float = 4.4
    amplitude_na: float = 3.0

    def __post_init__(self) -> None:
        if not 0 < self.frequency_hz <= 20 or self.amplitude_na < 0:
            raise ValueError("tremor frequency must be in (0, 20] Hz and amplitude ≥ 0")


@dataclass(frozen=True)
class CentralDrive:
    background_na: float = 3.5
    voluntary_na: float = 0.0
    """0 at rest; 4.5–5.5 nA for a held posture (Gallego 2015)."""
    tremor: Tremor | None = None
    """Set by the Parkinson adjustment ``PD_TREMOR``."""
    noise_cv: float = 0.2
    """SD of the noise current as a fraction of the mean current (background + voluntary)."""
    scale: CurrentScale = CurrentScale.PUBLISHED
    """Default: as published. With ``RHEOBASE`` the resting tremor of 3 nA fires no unit of our pool (phase-2 gate,
    ``validation/results/central-drive.json``), so it would be invisible."""

    def __post_init__(self) -> None:
        if self.background_na < 0 or self.voluntary_na < 0 or not 0 <= self.noise_cv <= 2:
            raise ValueError("drive currents must be ≥ 0 and noise_cv in [0, 2]")


class DriveGenerator:
    """Per-unit drive current density (µA/cm²), sample by sample, reproducible for a seed."""

    def __init__(self, drive: CentralDrive, soma_area_cm2: NDArray[np.float64], step_ms: float, seed: int) -> None:
        self._drive = drive
        self._to_density = drive.scale.factor * 1e-3 / soma_area_cm2  # nA → µA/cm²
        self._step = step_ms
        self._rng = np.random.default_rng(seed)
        self._noise = np.zeros(soma_area_cm2.size)
        tau = 1000.0 / (2 * math.pi * NOISE_CUTOFF_HZ)
        self._alpha = step_ms / (tau + step_ms)  # first-order low-pass below 100 Hz
        mean = drive.background_na + drive.voluntary_na
        # white-noise SD giving the requested stationary SD after the filter: Var(y) = σ² · α / (2 − α)
        self._white_sd = drive.noise_cv * mean * math.sqrt((2 - self._alpha) / self._alpha)
        self._next = 0

    def next(self, rows: int) -> NDArray[np.float64]:
        """Drive of the next ``rows`` samples, ``(rows, units)``."""
        d = self._drive
        t_ms = (self._next + np.arange(rows)) * self._step
        self._next += rows
        common = np.full(rows, d.background_na + d.voluntary_na)
        if d.tremor is not None:
            common = common + d.tremor.amplitude_na * np.sin(2 * math.pi * d.tremor.frequency_hz * t_ms / 1000.0)
        units = self._noise.size
        if self._white_sd > 0 and rows:
            white = self._rng.normal(0.0, self._white_sd, size=(rows, units))
            a = self._alpha  # y[n] = y[n-1] + a·(x[n] − y[n-1])
            noise, _ = lfilter([a], [1.0, a - 1.0], white, axis=0, zi=((1.0 - a) * self._noise)[None, :])
            self._noise = noise[-1].copy()
        else:
            noise = np.zeros((rows, units))
        out: NDArray[np.float64] = (noise + common[:, None]) * self._to_density
        return out

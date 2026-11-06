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

The drive goes into Cisi & Kohn (2008) motoneurons (``cisi_kohn``) — those of Gallego's model — whose currents are in
nA, so the published values apply as they are. Their smallest rheobase is 3.5 nA with the 2008 thresholds (5.6 nA
with Watanabe 2013's); ``CurrentScale.RHEOBASE`` rescales the currents by it / 4 nA. The inherited Booth 1997
motoneuron had no low-rate firing regime (``validation/results/central-drive-booth1997.json``) and is no longer used
for the drive.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray
from scipy.signal import lfilter

GALLEGO_SMALLEST_RHEOBASE_NA = 4.0
NOISE_CUTOFF_HZ = 100.0


class CurrentScale(Enum):
    PUBLISHED = "PUBLISHED"
    """Currents in nA as published (Gallego 2015)."""
    RHEOBASE = "RHEOBASE"
    """Currents × (our smallest rheobase / Gallego's 4 nA), so they keep their meaning relative to threshold."""


class ThresholdRule(Enum):
    """How each unit's firing threshold is set: the two published rules give different rheobases."""

    CISI_KOHN_2008 = "CISI_KOHN_2008"
    """Threshold = rheobase × input resistance, with the rheobases of Cisi & Kohn 2008 Table 2 (S 3.5–6.5, FR 6.5–17.5,
    FF 17.5–25.1 nA): each unit's rheobase is then the published one (the smallest, 3.5 nA, near Gallego's 4 nA)."""
    WATANABE_2013 = "WATANABE_2013"
    """Threshold given directly in mV (Watanabe et al. 2013 Table 1, projectPR): S 12.35–16.45, FR 16.45–19.30, FF
    19.30–20.90 mV re rest; with these, the rheobases come out about 1.6× higher (smallest unit 5.6 nA)."""


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
    threshold_rule: ThresholdRule = ThresholdRule.CISI_KOHN_2008
    """Thresholds of the Cisi & Kohn motoneurons that receive the drive."""

    def __post_init__(self) -> None:
        if self.background_na < 0 or self.voluntary_na < 0 or not 0 <= self.noise_cv <= 2:
            raise ValueError("drive currents must be ≥ 0 and noise_cv in [0, 2]")


class DriveGenerator:
    """Per-unit drive current (nA), sample by sample, reproducible for a seed; ``factor`` multiplies every current
    (``cisi_kohn.current_factor``)."""

    def __init__(self, drive: CentralDrive, units: int, step_ms: float, seed: int, factor: float = 1.0) -> None:
        self._drive = drive
        self._factor = factor
        self._step = step_ms
        self._rng = np.random.default_rng(seed)
        self._noise = np.zeros(units)
        tau = 1000.0 / (2 * math.pi * NOISE_CUTOFF_HZ)
        self._alpha = step_ms / (tau + step_ms)  # first-order low-pass below 100 Hz
        mean = drive.background_na + drive.voluntary_na
        # white-noise SD giving the requested stationary SD after the filter: Var(y) = σ² · α / (2 − α)
        self._white_sd = drive.noise_cv * mean * math.sqrt((2 - self._alpha) / self._alpha)
        self._next = 0

    def next(self, rows: int) -> NDArray[np.float64]:
        """Drive of the next ``rows`` samples, ``(rows, units)``, in nA."""
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
        out: NDArray[np.float64] = (noise + common[:, None]) * self._factor
        return out


def split_at_electrode(
    soma_to_muscle_samples: NDArray[np.int64], electrode_fraction: float
) -> tuple[NDArray[np.int64], NDArray[np.int64]]:
    """Soma → electrode and electrode → muscle conduction times per unit, in samples (design §3.3).

    The two parts add up to the soma → muscle delay, so moving the electrode changes where FES and central spikes
    meet, not when an uncollided central spike reaches the muscle.
    """
    if not 0 < electrode_fraction <= 1:
        raise ValueError("electrode_fraction must be in (0, 1]")
    total = np.asarray(soma_to_muscle_samples, dtype=np.int64)
    to_electrode = np.floor(total * electrode_fraction + 0.5).astype(np.int64)
    return to_electrode, total - to_electrode

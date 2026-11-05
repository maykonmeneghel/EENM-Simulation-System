"""Surface stimulation of motor axons: an analytic recruitment layer (master's-thesis limitation Q1).

The original model injects the stimulus current into the motoneuron soma. Surface FES excites motor
axons instead, and the axon carries the action potential straight to the muscle. This layer follows the
PhD project's choice of an *analytic* electrode model (recruitment curve + strength–duration relation)
rather than a volume-conductor and axon-cable simulation:

* **Strength–duration.** A pulse of width ``PW`` excites an axon if its amplitude reaches
  ``I_rh · (1 + τ_SD / PW)`` — Weiss's formula (threshold charge linear in duration), which fits human
  peripheral-nerve data (Mogyoros, Kiernan & Burke 1996, *Brain* 119:439–447, doi:10.1093/brain/119.2.439).
  ``τ_SD`` defaults to **0.459 ms**, their mean for compound muscle action potentials (459 ± 126 µs, n = 20).
* **Recruitment order.** Electrical stimulation recruits motor units in a non-selective, spatially fixed
  pattern (Gregory & Bickel 2005, *Phys Ther* 85:358–364, doi:10.1093/ptj/85.4.358): rheobases are spread
  over a range and assigned to units in a seeded random order, independently of unit type, and stay fixed.
* **Rheobase range — inherited, not from the literature.** No verified value was found for the ratio of the
  current recruiting the last unit to that recruiting the first. The defaults reproduce the original
  model's own recruitment with 0.3 ms pulses injected into the soma (first unit 56.9, all units 102.1, in the
  stimulus amplitude units), so amplitudes keep their meaning. To be calibrated against measured
  recruitment curves.
* **Firing.** Every suprathreshold pulse fires the axon once, at the end of the pulse. Refractoriness is
  not modelled: within the API's range (≤ 200 Hz) pulses are at least 5 ms apart.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

DEFAULT_CHRONAXIE_MS = 0.459
"""Strength–duration time constant of human motor axons (Mogyoros et al. 1996)."""

_INHERITED_PULSE_MS = 0.3
_INHERITED_FIRST_THRESHOLD = 56.9
_INHERITED_LAST_THRESHOLD = 102.1


@dataclass(frozen=True)
class AxonExcitability:
    """Strength–duration parameters shared by all motor axons; individual rheobases are spread over a range."""

    chronaxie_ms: float = DEFAULT_CHRONAXIE_MS
    lowest_rheobase: float = _INHERITED_FIRST_THRESHOLD / (1 + DEFAULT_CHRONAXIE_MS / _INHERITED_PULSE_MS)
    rheobase_range: float = _INHERITED_LAST_THRESHOLD / _INHERITED_FIRST_THRESHOLD
    """Highest / lowest rheobase."""

    def __post_init__(self) -> None:
        if self.chronaxie_ms <= 0 or self.lowest_rheobase <= 0 or self.rheobase_range < 1:
            raise ValueError("chronaxie and rheobase must be positive and the range at least 1")

    def threshold(self, rheobase: NDArray[np.float64], pulse_width_ms: float) -> NDArray[np.float64]:
        """Weiss: the current that excites an axon of rheobase ``rheobase`` with a pulse of this width."""
        return rheobase * (1.0 + self.chronaxie_ms / pulse_width_ms)

    def rheobases(self, units: int, seed: int) -> NDArray[np.float64]:
        """One rheobase per unit, spread linearly over the range and assigned in a seeded random order."""
        if units == 0:
            return np.empty(0)
        spread = np.linspace(self.lowest_rheobase, self.lowest_rheobase * self.rheobase_range, units)
        return np.random.default_rng(seed).permutation(spread)


@dataclass(frozen=True)
class Pulse:
    onset: int  # first sample of the pulse
    samples: int  # number of samples the current is non-zero
    amplitude: float  # largest |current| during the pulse


def pulses(stimulus: NDArray[np.float64]) -> list[Pulse]:
    """Contiguous runs of non-zero current in a sampled stimulus."""
    active = stimulus != 0
    edges = np.diff(np.concatenate(([False], active, [False])).astype(np.int8))
    onsets, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
    return [
        Pulse(onset=int(a), samples=int(b - a), amplitude=float(np.abs(stimulus[a:b]).max()))
        for a, b in zip(onsets, ends, strict=True)
    ]


def axon_spikes(
    stimulus: NDArray[np.float64],
    step_ms: float,
    rheobase: NDArray[np.float64],
    excitability: AxonExcitability,
) -> NDArray[np.bool_]:
    """``(samples, units)``: True where a unit's axon fires (end of each suprathreshold pulse)."""
    out = np.zeros((stimulus.size, rheobase.size), dtype=bool)
    for pulse in pulses(stimulus):
        width_ms = pulse.samples * step_ms
        fires = pulse.amplitude >= excitability.threshold(rheobase, width_ms)
        out[min(pulse.onset + pulse.samples, stimulus.size - 1), fires] = True
    return out

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
    """The leading phase of every pulse: each run of same-sign current that starts after zero current.

    A monophasic pulse is one phase. For a biphasic pulse only its first phase is returned: the strength-duration
    threshold is that of the phase width, and the opposite phase that follows within a fraction of a millisecond
    falls in the axon's refractory period (simplification: refractoriness is not otherwise modelled).
    """
    sign = np.sign(stimulus).astype(np.int8)
    starts = np.flatnonzero(np.diff(np.concatenate(([0], sign))) != 0)  # first sample of every constant-sign run
    ends = np.concatenate((starts[1:], [stimulus.size]))
    out = []
    for a, b in zip(starts, ends, strict=True):
        if sign[a] != 0 and (a == 0 or sign[a - 1] == 0):
            out.append(Pulse(onset=int(a), samples=int(b - a), amplitude=float(np.abs(stimulus[a:b]).max())))
    return out


def axon_spike_events(
    stimulus: NDArray[np.float64],
    step_ms: float,
    rheobase: NDArray[np.float64],
    excitability: AxonExcitability,
) -> tuple[NDArray[np.int64], NDArray[np.bool_]]:
    """Sparse axon firing: the sample of every pulse's end and which units it fires, ``(pulses,)`` and
    ``(pulses, units)``. Memory grows with the number of pulses, not with the number of samples."""
    found = pulses(stimulus)
    index = np.empty(len(found), dtype=np.int64)
    fires = np.zeros((len(found), rheobase.size), dtype=bool)
    for i, pulse in enumerate(found):
        index[i] = min(pulse.onset + pulse.samples, stimulus.size - 1)
        fires[i] = pulse.amplitude >= excitability.threshold(rheobase, pulse.samples * step_ms)
    return index, fires


def spikes_in(index: NDArray[np.int64], fires: NDArray[np.bool_], start: int, stop: int) -> NDArray[np.float64]:
    """Dense spike rows ``[start, stop)`` (1 = the axon fires) from ``axon_spike_events``."""
    out = np.zeros((stop - start, fires.shape[1]))
    inside = (index >= start) & (index < stop)
    out[index[inside] - start] = fires[inside]  # pulses end on distinct samples
    return out


def axon_spikes(
    stimulus: NDArray[np.float64],
    step_ms: float,
    rheobase: NDArray[np.float64],
    excitability: AxonExcitability,
) -> NDArray[np.bool_]:
    """``(samples, units)``: True where a unit's axon fires (end of each suprathreshold pulse). Dense: for short
    records and validation; long runs use ``axon_spike_events`` block by block."""
    index, fires = axon_spike_events(stimulus, step_ms, rheobase, excitability)
    return spikes_in(index, fires, 0, stimulus.size) > 0

"""Motor-unit twitch: the force impulse response that turns a spike train into force.

The original (``Main.m``) uses the critically damped second-order response of Fuglevand et al. (1993),
``h(t) = P·(t/T)·e^{1-t/T}``, whose half-relaxation time is fixed at about 1.68·T after the peak.
Published twitches relax faster than that (half-relaxation ≈ 0.75–1.05 × contraction time, see
``docs/validation/literature-comparison.md``), and motor-unit models with independent contraction and
relaxation parameters exist (e.g. the 6-parameter function used by Raikova et al., 2013,
doi:10.1155/2013/625427).

``h(t) = P·(t/T)^m·e^{m(1-t/T)}`` keeps the peak force ``P`` at the contraction time ``T`` and lets the
exponent ``m`` set the relaxation: ``m = 1`` *is* the original twitch, larger ``m`` relaxes faster.
This parameterisation is ours (a gamma-shaped generalisation), chosen because it reduces exactly to
the original; it is not taken from a specific paper.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
from numpy.typing import NDArray
from scipy.signal import lfilter

if TYPE_CHECKING:
    from eenm_engine.domain.motor_unit_pool import MotorUnitGroup

_KERNEL_CUTOFF = 1e-9
"""Relative size below which the tail of a twitch is dropped."""


@dataclass(frozen=True)
class TwitchShape:
    exponent: float = 1.0
    """``m``; 1 reproduces ``Main.m`` exactly."""

    def __post_init__(self) -> None:
        if self.exponent <= 0:
            raise ValueError("twitch exponent must be positive")

    @property
    def is_original(self) -> bool:
        return self.exponent == 1.0

    def half_relaxation_ratio(self) -> float:
        """Half-relaxation time after the peak, as a multiple of the contraction time."""
        x = 1.0 + 1e-9
        hi = 1.0 + 100.0 / self.exponent
        lo = x
        for _ in range(200):  # bisection on (x)^m e^{m(1-x)} = 1/2 for x > 1
            mid = (lo + hi) / 2
            if self.exponent * (math.log(mid) + 1 - mid) > math.log(0.5):
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2 - 1.0

    @classmethod
    def from_half_relaxation_ratio(cls, ratio: float) -> TwitchShape:
        """The exponent whose half-relaxation time is ``ratio`` × the contraction time."""
        if ratio <= 0:
            raise ValueError("ratio must be positive")
        return cls(exponent=-math.log(2.0) / (math.log(1.0 + ratio) - ratio))


class TwitchFilter:
    """Twitch force of every unit of a group, computed segment by segment.

    The drive is either one spike train shared by all units (``Main.m``: the peaks of the summed MUAP of
    the type) or one train per unit. Feeding consecutive segments gives the same force as the whole train
    at once; the twitch of a spike at sample ``n`` starts at ``n + 1`` (``f(n) ← s(n-1)`` in ``Main.m``).
    """

    def __init__(self, group: MotorUnitGroup, step_ms: float, shape: TwitchShape | None = None) -> None:
        shape = shape or TwitchShape()
        self._group = group
        self._step = step_ms
        self._shape = shape
        self._next_index = 0
        if shape.is_original:
            self._iir_state = np.zeros((group.size, 2))
        else:
            self._kernels = [self._kernel(k) for k in range(group.size)]
            self._spikes: list[tuple[NDArray[np.int64], NDArray[np.float64]]] = [
                (np.empty(0, dtype=np.int64), np.empty(0)) for _ in range(group.size)
            ]

    def segment(self, drive: NDArray[np.float64]) -> NDArray[np.float64]:
        """Force ``(samples, units)`` for the next samples; ``drive`` is ``(samples,)`` or ``(samples, units)``."""
        per_unit = np.array(drive, dtype=np.float64, copy=True)
        if per_unit.ndim == 1:
            per_unit = np.repeat(per_unit[:, None], self._group.size, axis=1)
        if self._next_index == 0 and per_unit.shape[0]:
            per_unit[0] = 0.0  # f(2) = 0 in the original regardless of s(1)
        start = self._next_index
        self._next_index += per_unit.shape[0]
        if self._shape.is_original:
            return self._iir(per_unit)
        return self._sparse(per_unit, start)

    # -- m = 1: the original recursion, as an IIR filter ------------------------------------
    def _iir(self, drive: NDArray[np.float64]) -> NDArray[np.float64]:
        out = np.zeros_like(drive)
        for k in range(self._group.size):
            period = float(self._group.twitch_time_to_peak_ms[k])
            decay = np.exp(-self._step / period)
            gain = float(self._group.twitch_peak[k]) * self._step**2 / period * np.exp(1 - self._step / period)
            out[:, k], self._iir_state[k] = lfilter(
                [0.0, gain], [1.0, -2.0 * decay, decay**2], drive[:, k], zi=self._iir_state[k]
            )
        return out

    # -- general m: sum of sampled kernels over the (sparse) spikes -----------------------------
    def _kernel(self, k: int) -> NDArray[np.float64]:
        """``h[j]`` for ``j = 0, 1, …``; at ``m = 1`` it equals the impulse response of ``_iir``."""
        m = self._shape.exponent
        period = float(self._group.twitch_time_to_peak_ms[k])
        peak = float(self._group.twitch_peak[k])
        # (x)^m e^{m(1-x)} decreases monotonically after x = 1; find where it is negligible.
        x_end = 1.0
        while m * (math.log(x_end) + 1 - x_end) > math.log(_KERNEL_CUTOFF):
            x_end *= 1.25
        x = np.arange(math.ceil(x_end * period / self._step) + 1) * self._step / period
        with np.errstate(divide="ignore"):
            kernel = peak * self._step * np.where(x > 0, x**m * np.exp(m * (1 - x)), 0.0)
        return kernel.astype(np.float64)

    def _sparse(self, drive: NDArray[np.float64], start: int) -> NDArray[np.float64]:
        stop = start + drive.shape[0]
        out = np.zeros_like(drive)
        for k, kernel in enumerate(self._kernels):
            new = np.flatnonzero(drive[:, k])
            index = np.concatenate([self._spikes[k][0], start + new])
            weight = np.concatenate([self._spikes[k][1], drive[new, k]])
            for spike, w in zip(index, weight, strict=True):
                first, last = max(start, int(spike) + 1), min(stop, int(spike) + kernel.size)
                if first < last:
                    out[first - start : last - start, k] += w * kernel[first - spike : last - spike]
            alive = index + kernel.size > stop
            self._spikes[k] = (index[alive], weight[alive])
        return out


def twitch_force(
    spikes: NDArray[np.float64], group: MotorUnitGroup, step_ms: float, shape: TwitchShape | None = None
) -> NDArray[np.float64]:
    """Force of every unit for a whole spike train (see ``TwitchFilter``)."""
    return TwitchFilter(group, step_ms, shape).segment(spikes)


class RateGain:
    """Per-twitch gain that makes the mean force saturate with firing rate (force–frequency sigmoid).

    Potvin & Fuglevand (2017, PLoS Comput Biol 13:e1005581, doi:10.1371/journal.pcbi.1005581, Eqs 4–6),
    simplifying Fuglevand et al. (1993), give the normalised force of a motor unit as a function of its
    normalised rate ``NR = rate × contraction time``::

        NF = 0.3·NR                for NR ≤ 0.4
        NF = 1 − exp(−2·NR³)       for NR > 0.4

    That paper computes force directly from the rate. Here force is a sum of twitches, whose mean grows
    linearly with the rate; scaling each twitch by ``g(NR) = NF(NR) / (0.3·NR)`` therefore makes the mean
    force follow ``NF``. ``g = 1`` up to ``NR = 0.4``; the composite curve is nearly continuous there
    (``1 − e^{−0.128} = 0.12015`` vs ``0.3·0.4 = 0.12``, a 0.13 % step). This gain is our derivation from
    those equations, applied with the instantaneous rate ``1 / ISI`` of each unit's own spikes.
    """

    BREAKPOINT = 0.4
    LINEAR_SLOPE = 0.3

    def __init__(self, contraction_time_ms: NDArray[np.float64], step_ms: float) -> None:
        self._contraction_time = contraction_time_ms
        self._step = step_ms
        self._last_spike = np.full(contraction_time_ms.size, -1, dtype=np.int64)
        self._next_index = 0

    @classmethod
    def gain(cls, normalised_rate: NDArray[np.float64]) -> NDArray[np.float64]:
        nr = np.asarray(normalised_rate, dtype=np.float64)
        out = np.ones_like(nr)
        high = nr > cls.BREAKPOINT
        out[high] = (1.0 - np.exp(-2.0 * nr[high] ** 3)) / (cls.LINEAR_SLOPE * nr[high])
        return out

    def apply(self, drive: NDArray[np.float64]) -> NDArray[np.float64]:
        """Scale each spike of a ``(samples, units)`` drive by the gain of its interval to the previous one."""
        out = drive.copy()
        start = self._next_index
        self._next_index += drive.shape[0]
        for k in range(drive.shape[1]):
            for local in np.flatnonzero(drive[:, k]):
                index = start + int(local)
                if self._last_spike[k] >= 0:
                    isi_ms = (index - self._last_spike[k]) * self._step
                    out[local, k] *= float(self.gain(np.array(self._contraction_time[k] / isi_ms)))
                self._last_spike[k] = index
        return out

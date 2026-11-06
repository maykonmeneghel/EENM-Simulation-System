"""Peripheral motor-unit fatigue, after Potvin & Fuglevand (2017).

Potvin JR, Fuglevand AJ. A motor unit-based model of muscle fatigue. *PLoS Comput Biol* 13:e1005581,
doi:10.1371/journal.pcbi.1005581 — equations read in the full text:

* Eq 9 — nominal fatigability grows exponentially from the weakest to the strongest unit:
  ``FAT(i) = FAT(1)·exp(ln(RFR)·(i−1)/(n−1))``, with ``FAT(1) = 0.0125 %/s`` and ``RFR = 180``. These values
  come from Burke et al.'s *electrical-stimulation* fatigue data (40 Hz trains, 33 % duty cycle), multiplied
  by 3 to express the rate during activity rather than averaged over the duty cycle.
* Eq 10 — instantaneous fatigability ``FAT(i,t) = FAT(i)·NF(i,t)``, with ``NF`` the normalised force of the
  unit's firing rate (``twitch.RateGain``).
* Eq 11 — contraction time lengthens with force loss: ``%CT = 0.379·%FL`` (from electrically stimulated,
  paralysed human soleus, Shields et al.).
* Eq 14 — force capacity decreases by the time integral of ``FAT(i,t)``.

Two adaptations to a twitch-based model, both ours:

* **Fatigability follows twitch force.** In the paper both twitch force (Eq 1, 100-fold) and fatigability
  (Eq 9, 180-fold) grow exponentially with the unit index, i.e. log-fatigability is linear in log-force —
  their Fig 1D: "direct relationship between modelled peak twitch force and fatigability". Our pool has a
  different force distribution (89 % of soleus units are S with nearly equal twitch amplitude), so mapping by
  *index* would make hundreds of S units highly fatigable. We therefore map by *force*:
  ``FAT = FAT(1)·exp(ln(RFR)·ln(P/Pmin)/ln(Pmax/Pmin))`` over the muscle pool's twitch amplitudes, which is
  exactly Eq 9 for the paper's own pool.
* **Per-spike integration.** A spike after an interval ``ISI`` at normalised rate ``NR = CT/ISI`` adds
  ``FAT·NF(NR)·ISI`` of force loss (Eq 10 integrated over that interval, Eq 14). An interval longer than four
  contraction times (``NR < 0.25``, the twitch has relaxed) is a pause, not firing — e.g. the off period of an
  intermittent train, where the paper's rate is 0 — and accrues nothing.

The paper models no recovery ("first phase of a more comprehensive model"); neither does this module.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray


@dataclass(frozen=True)
class FatigueModel:
    weakest_fatigability: float = 0.0125
    """%/s of rested force capacity, for the weakest unit of the pool (Eq 9)."""
    fatigability_range: float = 180.0
    """Strongest / weakest fatigability (Eq 9)."""
    contraction_time_gain: float = 0.379
    """% increase in contraction time per % force loss (Eq 11)."""
    fast_shift: float = 0.0
    """Slow-to-fast transformation of fatigability (condition adjustment, not in the paper): every unit's
    log-fatigability moves this fraction of the way to the most fatigable unit's (0 = normal, 1 = all units as
    fatigable as the strongest). Twitch force is unchanged (fibre force is preserved after SCI, Malisoux 2007)."""

    def __post_init__(self) -> None:
        if self.weakest_fatigability < 0 or self.fatigability_range < 1 or self.contraction_time_gain < 0:
            raise ValueError("invalid fatigue parameters")
        if not 0.0 <= self.fast_shift <= 1.0:
            raise ValueError("fast_shift must be between 0 and 1")

    PAUSE_RATE = 0.25
    """Normalised rate below which an interval counts as a pause (no fatigue accrued)."""

    def nominal(self, pool_rank: NDArray[np.int64], pool_size: int) -> NDArray[np.float64]:
        """Eq 9 for units ranked ``0 … pool_size−1`` (%/s)."""
        fraction = pool_rank / max(1, pool_size - 1)
        return self._eq9(fraction)

    def _eq9(self, fraction: NDArray[np.float64]) -> NDArray[np.float64]:
        shifted = fraction + self.fast_shift * (1.0 - fraction)
        return self.weakest_fatigability * np.exp(math.log(self.fatigability_range) * shifted)

    def nominal_from_force(
        self, twitch_peak: NDArray[np.float64], weakest: float, strongest: float
    ) -> NDArray[np.float64]:
        """Eq 9 expressed through twitch force: log-fatigability linear in log-force across the pool (%/s)."""
        if strongest <= weakest:
            return self._eq9(np.zeros(twitch_peak.size))
        fraction = np.log(twitch_peak / weakest) / math.log(strongest / weakest)
        return self._eq9(fraction)


class UnitFatigue:
    """Force capacity and contraction-time slowing of each unit of a group, updated spike by spike."""

    def __init__(self, model: FatigueModel, nominal_fatigability: NDArray[np.float64]) -> None:
        self._model = model
        self._fatigability = nominal_fatigability
        self.capacity = np.ones(nominal_fatigability.size)
        """Remaining fraction of the rested force capacity."""

    @property
    def fatigability(self) -> NDArray[np.float64]:
        """Nominal fatigability of each unit (%/s, Eq 9)."""
        return self._fatigability

    def contraction_time_scale(self, k: int) -> float:
        """Eq 11: multiplier of the unit's rested contraction time."""
        return 1.0 + self._model.contraction_time_gain * (1.0 - float(self.capacity[k]))

    def on_spike(self, k: int, normalised_force: float, interval_ms: float, normalised_rate: float = 1.0) -> None:
        """Integrate Eq 10 over the interval that ended with this spike (Eq 14); pauses accrue nothing."""
        if normalised_rate < FatigueModel.PAUSE_RATE:
            return
        loss_percent = float(self._fatigability[k]) * normalised_force * interval_ms / 1000.0
        self.capacity[k] = max(0.0, float(self.capacity[k]) - loss_percent / 100.0)

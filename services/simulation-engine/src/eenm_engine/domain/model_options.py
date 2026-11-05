"""Switchable corrections to the original model.

Every correction is opt-in: ``ModelOptions()`` reproduces the MATLAB model exactly (see
``docs/matlab-port-notes.md``), so the faithful port stays available as a reference and each change can
be validated against the literature on its own (``docs/validation/literature-comparison.md``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from eenm_engine.domain.twitch import TwitchShape


class UnitSelection(Enum):
    """Which units of each type's pool are simulated."""

    FIRST_OF_POOL = "FIRST_OF_POOL"
    """``demangeMNs``: the first units of the interpolated pool, i.e. the smallest and slowest (Q8)."""

    SPREAD_ACROSS_POOL = "SPREAD_ACROSS_POOL"
    """One unit at the centre of each of ``n`` equal slices of the pool, so the simulated units span
    the whole range of sizes and twitch speeds of their type."""


@dataclass(frozen=True)
class ModelOptions:
    unit_selection: UnitSelection = UnitSelection.FIRST_OF_POOL
    twitch_shape: TwitchShape = field(default_factory=TwitchShape)
    twitch_time_scale: float = 1.0
    """Multiplies every unit's twitch contraction time (MTTP), keeping the S/FR/FF proportions."""

    def __post_init__(self) -> None:
        if self.twitch_time_scale <= 0:
            raise ValueError("twitch_time_scale must be positive")

    @classmethod
    def original(cls) -> ModelOptions:
        return cls()

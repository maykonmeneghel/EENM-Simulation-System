"""Per-unit events of a run, for the 3D replay (``docs/design/3d-view.md`` §5): where each spike starts, stops, meets
another or reaches the muscle, with the sample it happens at. They restate what the run computed; nothing here feeds
the simulation.

Which kinds occur depends on the mode:

* skin surface, FES only — ``FES_FIRE`` (the axons the pulse recruits, Weiss) and ``MUSCLE_ARRIVAL``;
* skin surface with a central drive (the axon merge) — every kind but none is derived: the merge logs them where it
  counts them (``infrastructure/axon_merge.py``);
* current into the motoneurons — ``SOMA_SPIKE`` with a central drive (Cisi & Kohn spike trains), and
  ``MUSCLE_ARRIVAL`` (without a drive the soma spikes are read by the force pipeline at the muscle only).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum

import numpy as np
from numpy.typing import NDArray

# A replay of more than this is too large to stream and keep (design §5.2): ≈ 0.1 M events per 10 s at 30 Hz.
MAX_UNIT_EVENTS_DURATION_MS = 30_000.0


class UnitEventKind(IntEnum):
    SOMA_SPIKE = 0
    """The motoneuron fired: a central spike leaves the soma."""
    FES_FIRE = 1
    """An FES pulse fired the axon at the electrode (orthodromic to the muscle; antidromic to the soma in the merge)."""
    FES_BLOCKED = 2
    """The pulse recruited the axon but the electrode was refractory."""
    COLLISION = 3
    """At the FES pulse, the antidromic spike annihilated the in-flight central spike born at ``origin``."""
    ANTIDROMIC_RESET = 4
    """An antidromic spike reached the soma (``origin`` = its arrival sample) and reset the motoneuron."""
    CENTRAL_PASSED = 5
    """The central spike born at ``origin`` passed the electrode toward the muscle."""
    SOMA_COLLISION = 6
    """A new soma spike met the antidromic spike due at the soma at ``origin``: both are lost."""
    MUSCLE_ARRIVAL = 7
    """A spike reached the muscle and drives a twitch (as the force pipeline reads it)."""
    CENTRAL_BLOCKED = 8
    """The central spike born at ``origin`` reached a refractory electrode and stopped there."""


@dataclass(frozen=True)
class UnitEvents:
    """Parallel arrays, one entry per event; ``origin`` is -1 where the kind has none."""

    sample: NDArray[np.int64]
    unit: NDArray[np.int64]
    kind: NDArray[np.int64]
    origin: NDArray[np.int64]

    @property
    def size(self) -> int:
        return int(self.sample.size)

    @staticmethod
    def empty() -> UnitEvents:
        z = np.empty(0, dtype=np.int64)
        return UnitEvents(z, z, z, z)

    @staticmethod
    def of(
        sample: NDArray[np.int64], unit: NDArray[np.int64], kind: int, origin: NDArray[np.int64] | None = None
    ) -> UnitEvents:
        sample = np.asarray(sample, dtype=np.int64)
        return UnitEvents(
            sample,
            np.asarray(unit, dtype=np.int64),
            np.full(sample.size, kind, dtype=np.int64),
            np.full(sample.size, -1, dtype=np.int64) if origin is None else np.asarray(origin, dtype=np.int64),
        )


class UnitEventBuffer:
    """Events gathered block by block and handed to the next streamed chunk, sorted by sample."""

    def __init__(self) -> None:
        self._parts: list[UnitEvents] = []

    def add(self, events: UnitEvents | None) -> None:
        if events is not None and events.size:
            self._parts.append(events)

    def add_spike_rows(self, rows: NDArray[np.float64], first_sample: int, kind: UnitEventKind) -> None:
        """Events at the 1s of a ``(rows, units)`` spike train whose first row is ``first_sample``."""
        j, k = np.nonzero(rows > 0)
        self.add(UnitEvents.of(j + first_sample, k, int(kind)))

    def drain(self) -> UnitEvents:
        if not self._parts:
            return UnitEvents.empty()
        parts, self._parts = self._parts, []
        cat = [np.concatenate([getattr(p, f) for p in parts]) for f in ("sample", "unit", "kind", "origin")]
        order = np.lexsort((cat[2], cat[1], cat[0]))  # by sample, then unit, then kind
        return UnitEvents(*(c[order] for c in cat))

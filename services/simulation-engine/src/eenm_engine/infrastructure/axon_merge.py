"""Axon merge of FES and central spikes (design §3.3, after Formento et al. 2018), shared by the motoneuron models.

Each compiled pool integrator calls ``electrode_events`` before its soma step and ``soma_events`` after it, so the
collision rules are the same whatever motoneuron model fires the central spikes.
"""

from __future__ import annotations

import numpy as np
from numba import njit
from numpy.typing import NDArray

from eenm_engine.domain.central_drive import split_at_electrode

# merge state per unit (``AxonMerge.counters`` columns)
CENTRAL, CENTRAL_TRANSMITTED, FES_TRANSMITTED, COLLISIONS, FES_BLOCKED, RESETS = range(6)

# kinds of the per-unit event log (``domain.unit_events.UnitEventKind``, the same numbers)
EV_SOMA_SPIKE, EV_FES_FIRE, EV_FES_BLOCKED, EV_COLLISION, EV_RESET, EV_CENTRAL_PASSED, EV_SOMA_COLLISION = range(7)
EV_CENTRAL_BLOCKED = 8


@njit(cache=True, inline="always")
def _log(k: int, n: int, kind: int, origin: int, log: NDArray[np.int64], n_log: NDArray[np.int64]) -> None:
    """Append (sample, kind, origin) to unit ``k``'s log; past the capacity only the count grows (checked outside)."""
    i = n_log[k]
    if i < log.shape[1]:
        log[k, i, 0] = n
        log[k, i, 1] = kind
        log[k, i, 2] = origin
    n_log[k] = i + 1


@njit(cache=True, inline="always")
def _pop(queue: NDArray[np.int64], count: NDArray[np.int64], k: int) -> None:
    for q in range(count[k] - 1):
        queue[k, q] = queue[k, q + 1]
    count[k] -= 1


@njit(cache=True, inline="always")
def electrode_events(
    k: int, n: int, j: int, recruited: bool, last_pass: int, to_electrode: NDArray[np.int64], refractory: int,
    inflight: NDArray[np.int64], n_inflight: NDArray[np.int64], antidromic: NDArray[np.int64],
    n_antidromic: NDArray[np.int64], counters: NDArray[np.int64], spikes: NDArray[np.float64],
    log: NDArray[np.int64], n_log: NDArray[np.int64],
) -> int:  # fmt: skip
    """(1) central spikes reaching the electrode pass on; (2) an FES pulse that recruits the axon fires it unless the
    electrode is refractory, and its antidromic spike annihilates the central spike nearest the electrode or travels
    to the soma. Returns the updated last-pass sample."""
    cap = inflight.shape[1]
    while n_inflight[k] > 0 and inflight[k, 0] + to_electrode[k] <= n:
        born = inflight[k, 0]
        _pop(inflight, n_inflight, k)
        if n - last_pass >= refractory:
            spikes[j, k] = 1.0
            last_pass = n
            counters[k, CENTRAL_TRANSMITTED] += 1
            _log(k, n, EV_CENTRAL_PASSED, born, log, n_log)
        else:  # the electrode is refractory: the central spike stops there
            _log(k, n, EV_CENTRAL_BLOCKED, born, log, n_log)
    if recruited:
        if n - last_pass < refractory:
            counters[k, FES_BLOCKED] += 1
            _log(k, n, EV_FES_BLOCKED, -1, log, n_log)
        else:
            spikes[j, k] = 1.0
            last_pass = n
            counters[k, FES_TRANSMITTED] += 1
            _log(k, n, EV_FES_FIRE, -1, log, n_log)
            if n_inflight[k] > 0:  # meets the central spike nearest the electrode (the oldest)
                born = inflight[k, 0]
                _pop(inflight, n_inflight, k)
                counters[k, COLLISIONS] += 1
                _log(k, n, EV_COLLISION, born, log, n_log)
            elif n_antidromic[k] < cap:
                antidromic[k, n_antidromic[k]] = n + to_electrode[k]
                n_antidromic[k] += 1
    return last_pass


@njit(cache=True, inline="always")
def soma_events(
    k: int, n: int, spiked: bool, reset_left: int, ignore_until: int, reset_samples: int, ignore_samples: int,
    inflight: NDArray[np.int64], n_inflight: NDArray[np.int64], antidromic: NDArray[np.int64],
    n_antidromic: NDArray[np.int64], counters: NDArray[np.int64], log: NDArray[np.int64], n_log: NDArray[np.int64],
) -> tuple[int, int]:  # fmt: skip
    """(4) a new soma spike meets a pending antidromic spike (both lost) or starts down the axon — unless an antidromic
    arrival caused it (the axon behind is refractory); antidromic spikes reaching the soma start a reset. Returns the
    updated (reset samples left, ignore-until)."""
    cap = inflight.shape[1]
    if spiked and n >= ignore_until:
        counters[k, CENTRAL] += 1
        _log(k, n, EV_SOMA_SPIKE, -1, log, n_log)
        if n_antidromic[k] > 0:  # meets the antidromic spike nearest the soma (the oldest)
            arrival = antidromic[k, 0]
            _pop(antidromic, n_antidromic, k)
            counters[k, COLLISIONS] += 1
            _log(k, n, EV_SOMA_COLLISION, arrival, log, n_log)
        elif n_inflight[k] < cap:
            inflight[k, n_inflight[k]] = n
            n_inflight[k] += 1
    while n_antidromic[k] > 0 and antidromic[k, 0] <= n:
        arrival = antidromic[k, 0]
        _pop(antidromic, n_antidromic, k)
        reset_left = reset_samples
        ignore_until = n + ignore_samples
        counters[k, RESETS] += 1
        _log(k, n, EV_RESET, arrival, log, n_log)
    return reset_left, ignore_until


class AxonMerge:
    """State of the axon merge between calls, and its parameters (design §3.3).

    ``to_electrode``: soma → electrode conduction time per unit, in samples (``electrode_fraction`` of the soma →
    muscle delay; Decision 4: 0.9). ``refractory``: 1.6 ms (Formento et al. 2018). The antidromic reset is a
    0.3 ms soma current of ``reset_density`` µA/cm², enough to fire every unit, whose spike is not sent.
    """

    REFRACTORY_MS = 1.6
    RESET_DENSITY = 400.0
    RESET_MS = 0.3
    IGNORE_MS = 3.0
    CAPACITY = 64

    def __init__(
        self,
        soma_to_muscle_samples: NDArray[np.int64],
        step_ms: float,
        electrode_fraction: float = 0.9,
        initial_vs: NDArray[np.float64] | None = None,
        reset_density: float = 400.0,
    ) -> None:
        n = soma_to_muscle_samples.size
        self.to_electrode = split_at_electrode(soma_to_muscle_samples, electrode_fraction)[0]
        self.refractory = max(1, round(self.REFRACTORY_MS / step_ms))
        self.reset_density = reset_density
        self.reset_samples = max(1, round(self.RESET_MS / step_ms))
        self.ignore_samples = max(1, round(self.IGNORE_MS / step_ms))
        self.next_sample = 1
        self.inflight = np.zeros((n, self.CAPACITY), dtype=np.int64)
        self.n_inflight = np.zeros(n, dtype=np.int64)
        self.antidromic = np.zeros((n, self.CAPACITY), dtype=np.int64)
        self.n_antidromic = np.zeros(n, dtype=np.int64)
        self.unit_state = np.zeros((n, 3), dtype=np.int64)
        self.unit_state[:, 0] = -(10**9)  # no spike has passed the electrode yet
        self.previous_vs = np.full(n, -1000.0) if initial_vs is None else initial_vs.astype(np.float64).copy()
        self.counters = np.zeros((n, 6), dtype=np.int64)
        self.log = np.zeros((n, 0, 3), dtype=np.int64)
        self.n_log = np.zeros(n, dtype=np.int64)

    def reserve_log(self, rows: int) -> None:
        """Empty the per-unit event log and make room for a block of ``rows`` samples: at most one central and one
        FES event per refractory period at the electrode, plus the soma's, with a margin."""
        cap = 4 * (rows // self.refractory + 2)
        if self.log.shape[1] < cap:
            self.log = np.zeros((self.n_log.size, cap, 3), dtype=np.int64)
        self.n_log[:] = 0

    def drain_log(self) -> tuple[NDArray[np.int64], NDArray[np.int64], NDArray[np.int64], NDArray[np.int64]]:
        """(sample, unit, kind, origin) of the block's events, in sample order."""
        if (self.n_log > self.log.shape[1]).any():
            raise RuntimeError("axon event log overflow")  # the capacity bound above is wrong
        units = np.repeat(np.arange(self.n_log.size, dtype=np.int64), self.n_log)
        rows = (
            np.concatenate([self.log[k, : self.n_log[k]] for k in range(self.n_log.size)])
            if units.size
            else np.empty((0, 3), np.int64)
        )
        order = np.argsort(rows[:, 0], kind="stable")
        return rows[order, 0], units[order], rows[order, 1], rows[order, 2]

    def totals(self) -> dict[str, int]:
        c = self.counters.sum(axis=0)
        return {
            "central": int(c[CENTRAL]),
            "centralTransmitted": int(c[CENTRAL_TRANSMITTED]),
            "fesTransmitted": int(c[FES_TRANSMITTED]),
            "collisions": int(c[COLLISIONS]),
            "fesBlocked": int(c[FES_BLOCKED]),
            "resets": int(c[RESETS]),
        }

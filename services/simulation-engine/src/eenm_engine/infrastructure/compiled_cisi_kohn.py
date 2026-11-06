"""Compiled pool of Cisi & Kohn (2008) motoneurons (``domain.cisi_kohn``), driven by per-unit currents in nA.

Per unit and per sample: the gates follow Destexhe's pulse kinetics exactly for the sub-step (constant rates), then
the two compartment voltages are advanced by backward Euler with the conductances of the new gates (a 2 × 2 linear
solve). A spike is the soma potential above the unit's threshold with 5 ms since the last one; it starts a 0.6 ms
pulse of every gate, as in ReMoto / projectPR (``MotorUnit.addCompartmentSpike``). Sub-steps are finer during a pulse.

The output is the spike train (1 at the sample of each soma spike), which the force stages take as they take axon
spikes. ``advance_merged`` adds the axon merge with FES (``axon_merge``); an antidromic spike reaching the soma is a
soma spike (it starts the pulse, if the soma is not refractory) and is not sent down the axon — projectPR
``MotorUnit.atualizeDelay`` does the same.
"""

from __future__ import annotations

import math

import numpy as np
from numba import njit, prange
from numpy.typing import NDArray

from eenm_engine.domain.cisi_kohn import E_K_MV, E_NA_MV, PULSE_MS, REFRACTORY_MS, CisiKohnPool
from eenm_engine.infrastructure.axon_merge import AxonMerge, electrode_events, soma_events

QUIET_SUBSTEPS = 2
PULSE_SUBSTEPS = 10


@njit(cache=True, fastmath=False, inline="always")
def _step(
    vs: float, vd: float, m: float, h: float, n: float, q: float, pulse: bool, i_s: float,
    p: NDArray[np.float64], dt: float, n_sub: int,
) -> tuple[float, float, float, float, float, float]:  # fmt: skip
    (c_s, c_d, g_ls, g_ld, g_c, g_na, g_kf, g_ks, _thr, a_m, b_m, a_h, b_h, a_n, b_n, a_q, b_q) = p
    k = dt / n_sub
    for _ in range(n_sub):
        if pulse:  # activations rise at α, inactivation falls at β
            m = 1.0 + (m - 1.0) * math.exp(-a_m * k)
            n = 1.0 + (n - 1.0) * math.exp(-a_n * k)
            q = 1.0 + (q - 1.0) * math.exp(-a_q * k)
            h = h * math.exp(-b_h * k)
        else:  # activations decay at β, inactivation recovers at α
            m = m * math.exp(-b_m * k)
            n = n * math.exp(-b_n * k)
            q = q * math.exp(-b_q * k)
            h = 1.0 + (h - 1.0) * math.exp(-a_h * k)
        gna = g_na * m * m * m * h
        gk = g_kf * n * n * n * n + g_ks * q * q
        a11 = c_s / k + g_ls + g_c + gna + gk
        a22 = c_d / k + g_ld + g_c
        b1 = c_s / k * vs + gna * E_NA_MV + gk * E_K_MV + i_s
        b2 = c_d / k * vd
        det = a11 * a22 - g_c * g_c
        vs, vd = (b1 * a22 + g_c * b2) / det, (a11 * b2 + g_c * b1) / det
    return vs, vd, m, h, n, q


@njit(cache=True, fastmath=False, parallel=True)
def _integrate(
    state: NDArray[np.float64],
    pulse_end: NDArray[np.int64],
    last_spike: NDArray[np.int64],
    params: NDArray[np.float64],
    current: NDArray[np.float64],
    base: int,
    dt: float,
    pulse_samples: int,
    refractory: int,
    spikes: NDArray[np.float64],
) -> None:
    for k in prange(params.shape[0]):
        p = params[k]
        threshold = p[8]
        vs, vd, m, h, n, q = state[0, k], state[1, k], state[2, k], state[3, k], state[4, k], state[5, k]
        for j in range(current.shape[0]):
            s = base + j
            pulse = s < pulse_end[k]
            vs, vd, m, h, n, q = _step(
                vs, vd, m, h, n, q, pulse, current[j, k], p, dt, PULSE_SUBSTEPS if pulse else QUIET_SUBSTEPS
            )
            if vs > threshold and s - last_spike[k] >= refractory:
                last_spike[k] = s
                pulse_end[k] = s + 1 + pulse_samples
                spikes[j, k] = 1.0
        state[0, k], state[1, k], state[2, k], state[3, k], state[4, k], state[5, k] = vs, vd, m, h, n, q


@njit(cache=True, fastmath=False, parallel=True)
def _integrate_merged(
    state: NDArray[np.float64],
    pulse_end: NDArray[np.int64],
    last_spike: NDArray[np.int64],
    params: NDArray[np.float64],
    drive: NDArray[np.float64],
    recruit: NDArray[np.bool_],
    base: int,
    dt: float,
    pulse_samples: int,
    refractory: int,
    to_electrode: NDArray[np.int64],
    axon_refractory: int,
    inflight: NDArray[np.int64],
    n_inflight: NDArray[np.int64],
    antidromic: NDArray[np.int64],
    n_antidromic: NDArray[np.int64],
    unit_state: NDArray[np.int64],
    counters: NDArray[np.int64],
    spikes: NDArray[np.float64],
) -> None:
    for k in prange(params.shape[0]):
        p = params[k]
        threshold = p[8]
        vs, vd, m, h, n, q = state[0, k], state[1, k], state[2, k], state[3, k], state[4, k], state[5, k]
        last_pass, reset_left, ignore_until = unit_state[k, 0], unit_state[k, 1], unit_state[k, 2]
        for j in range(drive.shape[0]):
            s = base + j
            last_pass = electrode_events(
                k, s, j, recruit[j, k], last_pass, to_electrode, axon_refractory, inflight, n_inflight, antidromic,
                n_antidromic, counters, spikes,
            )  # fmt: skip
            pulse = s < pulse_end[k]
            vs, vd, m, h, n, q = _step(
                vs, vd, m, h, n, q, pulse, drive[j, k], p, dt, PULSE_SUBSTEPS if pulse else QUIET_SUBSTEPS
            )
            spiked = vs > threshold and s - last_spike[k] >= refractory
            if spiked:
                last_spike[k] = s
                pulse_end[k] = s + 1 + pulse_samples
            reset_left, ignore_until = soma_events(
                k, s, spiked, reset_left, ignore_until, 1, 0, inflight, n_inflight, antidromic, n_antidromic, counters
            )
            if reset_left > 0:  # an antidromic spike reached the soma: a soma spike, not sent down the axon
                reset_left = 0
                if s - last_spike[k] >= refractory:
                    last_spike[k] = s
                    pulse_end[k] = s + 1 + pulse_samples
        state[0, k], state[1, k], state[2, k], state[3, k], state[4, k], state[5, k] = vs, vd, m, h, n, q
        unit_state[k, 0], unit_state[k, 1], unit_state[k, 2] = last_pass, reset_left, ignore_until


class CisiKohnIntegration:
    """One integration of a Cisi & Kohn pool; samples numbered from 1 on the first call (0 is the initial state)."""

    def __init__(self, pool: CisiKohnPool, step_ms: float) -> None:
        n = pool.n_units
        self._params = np.ascontiguousarray(pool.parameters, dtype=np.float64)
        self._state = np.zeros((6, n))  # Vs, Vd (re rest), m, h, n, q — all gates start at 0 (projectPR)
        self._pulse_end = np.full(n, -1, dtype=np.int64)
        self._last_spike = np.full(n, -(10**9), dtype=np.int64)
        self._step = step_ms
        self._pulse = max(1, round(PULSE_MS / step_ms))
        self._refractory = max(1, round(REFRACTORY_MS / step_ms))
        self._next = 1
        self._merge: AxonMerge | None = None
        self.soma_capacitance_nf = pool.column("c_s").copy()
        """Soma capacitance (nF) = soma area (cm²) × 1000 at 1 µF/cm²: turns a current density into nA."""

    @property
    def soma_voltage(self) -> NDArray[np.float64]:
        voltage: NDArray[np.float64] = self._state[0].copy()
        return voltage

    def advance(self, current_na: NDArray[np.float64]) -> NDArray[np.float64]:
        """Soma current (nA) per sample and unit, ``(rows, units)``; returns the spike train, ``(rows, units)``."""
        rows = current_na.shape[0]
        spikes = np.zeros((rows, self._params.shape[0]))
        _integrate(
            self._state, self._pulse_end, self._last_spike, self._params,
            np.ascontiguousarray(current_na, dtype=np.float64), self._next, self._step, self._pulse,
            self._refractory, spikes,
        )  # fmt: skip
        self._next += rows
        return spikes

    def enable_merge(self, soma_to_muscle_samples: NDArray[np.int64], electrode_fraction: float) -> None:
        self._merge = AxonMerge(np.asarray(soma_to_muscle_samples, dtype=np.int64), self._step, electrode_fraction)

    def axon_events(self) -> dict[str, int]:
        return self._merge.totals() if self._merge is not None else {}

    def advance_merged(self, drive_na: NDArray[np.float64], recruit: NDArray[np.bool_]) -> NDArray[np.float64]:
        """Drive (nA) into the somas, FES firing the axons where ``recruit``; the spikes sent to the muscle."""
        merge = self._merge
        if merge is None:
            raise ValueError("call enable_merge first")
        rows = drive_na.shape[0]
        spikes = np.zeros((rows, self._params.shape[0]))
        _integrate_merged(
            self._state, self._pulse_end, self._last_spike, self._params,
            np.ascontiguousarray(drive_na, dtype=np.float64), np.ascontiguousarray(recruit, dtype=np.bool_),
            self._next, self._step, self._pulse, self._refractory, merge.to_electrode, merge.refractory,
            merge.inflight, merge.n_inflight, merge.antidromic, merge.n_antidromic, merge.unit_state,
            merge.counters, spikes,
        )  # fmt: skip
        self._next += rows
        merge.next_sample = self._next
        return spikes


class CompiledCisiKohnIntegrator:
    """Factory of Cisi & Kohn pool integrations (the ``DrivenPoolIntegrator`` port)."""

    def start(self, pool: CisiKohnPool, step_ms: float) -> CisiKohnIntegration:
        return CisiKohnIntegration(pool, step_ms)

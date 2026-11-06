"""Compiled fixed-step integrator of the two-compartment motoneuron pool (Numba).

Same equations as ``domain.motoneuron.MotoneuronPool`` (``rates.m``), integrated unit by unit with the scheme of
neuron simulators (NEURON's staggered update): over each step the gating variables and calcium concentrations are
advanced exactly for frozen voltages (Rush–Larsen: their equations are linear in themselves), then the two
compartment voltages by backward Euler for frozen gates (a 2 × 2 linear solve, the soma–dendrite coupling included).
First order; accuracy against the adaptive BDF solver is checked in ``tests/unit/test_compiled_motoneuron.py``.

Each unit can receive its own current (``(samples, units)``), which the central layer needs (per-unit descending
drive and noise). Over the interval from sample ``n`` to ``n + 1`` the current is that of sample ``n`` — the stimulus
is sampled so that a pulse occupies exactly its samples.
"""

from __future__ import annotations

import math

import numpy as np
from numba import njit, prange
from numpy.typing import NDArray

from eenm_engine.domain.motoneuron import (
    REFERENCE_TEMPERATURE_C,
    STATE_SIZE,
    VS,
    InjectionSite,
    MotoneuronPool,
)

_PARAMS = (
    "vna", "vk", "vl", "vca", "vrest", "gls", "gld", "cd", "cs", "gc", "p", "kd", "f", "kca", "alpha", "sgna", "sgk",
    "sgca", "camtau", "cahtau", "sgkca", "dcastau", "taunap", "naptau", "perkca", "dgkca", "gnap", "dgcas", "alpha2",
    "pernap",
)  # fmt: skip


@njit(cache=True, fastmath=False, inline="always")
def _substeps(
    vs: float,
    snah: float,
    sn: float,
    scam: float,
    scah: float,
    sca: float,
    vd: float,
    dcas: float,
    dca: float,
    mnap: float,
    hnap: float,
    p: NDArray[np.float64],
    a: float,
    h: float,
    n_sub: int,
    i_s: float,
    i_d: float,
    temp: float,
) -> tuple[float, float, float, float, float, float, float, float, float, float, float]:
    """``n_sub`` steps of length ``h`` for one unit: gates and calcium exactly for frozen voltages (Rush–Larsen),
    then both voltages by backward Euler for frozen gates (2 × 2 solve)."""
    (vna, vk, vl, vca, vrest, gls, gld, cd, cs, gc, pp, kd, f, kca, alpha, sgna, sgk, sgca, camtau, cahtau, sgkca,
     dcastau, taunap, naptau, perkca, dgkca, gnap, dgcas, alpha2, pernap) = p  # fmt: skip
    e_na, e_k, e_l, e_ca = vna + vrest, vk + vrest, vl + vrest, vca + vrest
    for _ in range(n_sub):
        # gates: exact exponential update for the voltages at the start of the step (rates × temp)
        tau = 30.0 / (math.exp((vs + 50.0) / 15.0) + math.exp(-(vs + 50.0) / 16.0)) / temp
        snah += (1.0 / (1.0 + math.exp((vs + 55.0) / 7.0)) - snah) * (1.0 - math.exp(-h / tau))
        tau = 7.0 / (math.exp((vs + 40.0) / 40.0) + math.exp(-(vs + 40.0) / 50.0)) / temp
        sn += (1.0 / (1.0 + math.exp(-(vs + 28.0) / 12.0)) - sn) * (1.0 - math.exp(-h / tau))
        scam += (1.0 / (1.0 + math.exp(-(vs + 30.0) / 5.0)) - scam) * (1.0 - math.exp(-h * temp / camtau))
        scah += (1.0 / (1.0 + math.exp((vs + 45.0) / 5.0)) - scah) * (1.0 - math.exp(-h * temp / cahtau))
        dcas += (1.0 / (1.0 + math.exp(-(vd + 39.0) / 7.0)) - dcas) * (1.0 - math.exp(-h * temp / dcastau))
        mnap += (1.0 / (1.0 + math.exp(-(vd + 48.0) / 3.0)) - mnap) * (1.0 - math.exp(-h * temp / taunap))
        hnap += (1.0 / (1.0 + math.exp((vd + 35.0) / 6.0)) - hnap) * (1.0 - math.exp(-h * temp / naptau))
        # calcium: d[Ca]/dt = temp·(−f·α·I_Ca − f·kca·[Ca]), linear in [Ca] for a frozen I_Ca
        i_ca_s = sgca * scam * scam * scah * (vs - e_ca)
        i_ca_d = dgcas * dcas * (vd - e_ca)
        decay = math.exp(-h * temp * f * kca)
        sca = -alpha * i_ca_s / kca + (sca + alpha * i_ca_s / kca) * decay
        dca = -alpha2 * i_ca_d / kca + (dca + alpha2 * i_ca_d / kca) * decay
        # voltages: backward Euler with the conductances frozen (sodium activation at the start voltage)
        m = 1.0 / (1.0 + math.exp(-(vs + 35.0) / 7.8))
        g_na = sgna * m * m * m * snah
        g_ca_s = sgca * scam * scam * scah
        g_k = sgk * sn * sn * sn * sn
        g_kca_s = perkca * sgkca * (sca**pp / (kd**pp + sca**pp))
        g_s = g_na + g_ca_s + g_k + g_kca_s + gls
        e_s = g_na * e_na + g_ca_s * e_ca + (g_k + g_kca_s) * e_k + gls * e_l
        g_nap = pernap * gnap * mnap * hnap
        g_kca_d = perkca * dgkca * (dca**pp / (kd**pp + dca**pp))
        g_d = dgcas * dcas + g_nap + g_kca_d + gld
        e_d = dgcas * dcas * e_ca + g_nap * e_na + g_kca_d * e_k + gld * e_l
        c_s = gc / a
        c_d = gc / (1.0 - a)
        a11 = cs / h + g_s + c_s
        a12 = -c_s
        a21 = -c_d
        a22 = cd / h + g_d + c_d
        b1 = cs / h * vs + i_s + e_s
        b2 = cd / h * vd + i_d + e_d
        det = a11 * a22 - a12 * a21
        vs, vd = (b1 * a22 - a12 * b2) / det, (a11 * b2 - a21 * b1) / det
    return vs, snah, sn, scam, scah, sca, vd, dcas, dca, mnap, hnap


@njit(cache=True, fastmath=False, parallel=True)
def _integrate(
    s: NDArray[np.float64],
    area: NDArray[np.float64],
    current: NDArray[np.float64],
    p: NDArray[np.float64],
    dt: float,
    substeps: int,
    temp: float,
    soma: bool,
    out: NDArray[np.float64],
    active_substeps: int,
    active_dv: float,
) -> None:
    n_units = s.shape[1]
    for k in prange(n_units):  # units are independent: one thread per unit
        a = area[k]
        vs, snah, sn, scam, scah, sca = s[0, k], s[1, k], s[2, k], s[3, k], s[4, k], s[5, k]
        vd, dcas, dca, mnap, hnap = s[6, k], s[7, k], s[8, k], s[9, k], s[10, k]
        previous = vs
        for j in range(current.shape[0]):
            i_in = current[j, k]
            # fine steps while the unit is driven or its soma voltage moves fast (pulse, spike upstroke)
            moving = abs(vs - previous) > active_dv
            previous = vs
            n_sub = active_substeps if (i_in != 0.0 or moving or vs > -50.0) else substeps
            vs, snah, sn, scam, scah, sca, vd, dcas, dca, mnap, hnap = _substeps(
                vs, snah, sn, scam, scah, sca, vd, dcas, dca, mnap, hnap,
                p, a, dt / n_sub, n_sub, i_in if soma else 0.0, 0.0 if soma else i_in, temp,
            )  # fmt: skip
            out[j, k] = vs
        s[0, k], s[1, k], s[2, k], s[3, k], s[4, k], s[5, k] = vs, snah, sn, scam, scah, sca
        s[6, k], s[7, k], s[8, k], s[9, k], s[10, k] = vd, dcas, dca, mnap, hnap


class CompiledPoolIntegration:
    """One integration of the pool, advanced sample by sample; the state is kept between calls."""

    def __init__(
        self, pool: MotoneuronPool, step_ms: float, substeps: int, active_substeps: int, active_dv: float
    ) -> None:
        c = pool.conductances
        self._params = np.array([getattr(c, name) for name in _PARAMS], dtype=np.float64)
        self._state = pool.initial_state().reshape(STATE_SIZE, pool.n_units).copy()
        self._area = np.ascontiguousarray(pool.soma_area_fraction, dtype=np.float64)
        self._step = step_ms
        self._substeps = substeps
        self._active_substeps = active_substeps
        self._active_dv = active_dv
        self._temp = 3 ** ((pool.temperature_c - REFERENCE_TEMPERATURE_C) / 10)
        self._soma = pool.injection_site is InjectionSite.SOMA

    @property
    def soma_voltage(self) -> NDArray[np.float64]:
        voltage: NDArray[np.float64] = self._state[VS].copy()
        return voltage

    def advance(self, current: NDArray[np.float64]) -> NDArray[np.float64]:
        """Integrate one sample interval per row of ``current`` (``(rows,)`` shared, or ``(rows, units)``);
        return the soma voltage at the end of each interval, ``(rows, units)``."""
        n_units = self._area.size
        per_unit = current if current.ndim == 2 else np.repeat(current[:, None], n_units, axis=1)
        out = np.empty((per_unit.shape[0], n_units))
        _integrate(
            self._state,
            self._area,
            np.ascontiguousarray(per_unit, dtype=np.float64),
            self._params,
            self._step,
            self._substeps,
            self._temp,
            self._soma,
            out,
            self._active_substeps,
            self._active_dv,
        )
        return out


class CompiledPoolIntegrator:
    """Factory of compiled pool integrations (the ``PoolIntegrator`` port).

    ``substeps`` per sample while a unit is quiet, ``active_substeps`` while it receives current, its soma is above
    −50 mV or its soma voltage changed by more than ``active_dv`` mV over the previous sample.
    """

    def __init__(self, substeps: int = 1, active_substeps: int = 20, active_dv: float = 0.2) -> None:
        if substeps < 1 or active_substeps < 1:
            raise ValueError("substeps must be at least 1")
        self._substeps = substeps
        self._active_substeps = active_substeps
        self._active_dv = active_dv

    def start(self, pool: MotoneuronPool, step_ms: float) -> CompiledPoolIntegration:
        return CompiledPoolIntegration(pool, step_ms, self._substeps, self._active_substeps, self._active_dv)

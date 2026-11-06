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
from eenm_engine.infrastructure.axon_merge import AxonMerge, electrode_events, soma_events

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
    drive: NDArray[np.float64],
    has_drive: bool,
) -> None:
    """``current``: the stimulus (fine steps while it is non-zero); ``drive``: a slow per-unit current added to it
    (central drive, ``has_drive``), which does not by itself call for fine steps."""
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
            if has_drive:
                i_in += drive[j, k]
            vs, snah, sn, scam, scah, sca, vd, dcas, dca, mnap, hnap = _substeps(
                vs, snah, sn, scam, scah, sca, vd, dcas, dca, mnap, hnap,
                p, a, dt / n_sub, n_sub, i_in if soma else 0.0, 0.0 if soma else i_in, temp,
            )  # fmt: skip
            out[j, k] = vs
        s[0, k], s[1, k], s[2, k], s[3, k], s[4, k], s[5, k] = vs, snah, sn, scam, scah, sca
        s[6, k], s[7, k], s[8, k], s[9, k], s[10, k] = vd, dcas, dca, mnap, hnap


SPIKE_THRESHOLD_MV = -20.0
"""A soma spike is an upward crossing of this voltage."""


@njit(cache=True, fastmath=False, parallel=True)
def _integrate_merged(
    s: NDArray[np.float64],
    area: NDArray[np.float64],
    drive: NDArray[np.float64],
    recruit: NDArray[np.bool_],
    p: NDArray[np.float64],
    dt: float,
    substeps: int,
    temp: float,
    active_substeps: int,
    active_dv: float,
    to_electrode: NDArray[np.int64],
    refractory: int,
    reset_density: float,
    reset_samples: int,
    ignore_samples: int,
    base: int,
    inflight: NDArray[np.int64],
    n_inflight: NDArray[np.int64],
    antidromic: NDArray[np.int64],
    n_antidromic: NDArray[np.int64],
    unit_state: NDArray[np.int64],
    previous_vs: NDArray[np.float64],
    counters: NDArray[np.int64],
    spikes: NDArray[np.float64],
) -> None:
    """Central drive into the soma, FES at the electrode, both on the same motor axon (design §3.3, after Formento
    et al. 2018). ``spikes[j, k] = 1`` when a spike leaves the electrode towards the muscle at sample ``base + j``.

    Per unit, in time order: (1) a central spike reaching the electrode passes on; (2) an FES pulse that recruits the
    axon fires it unless the electrode is refractory; its antidromic spike annihilates the central spike nearest the
    electrode, or else travels to the soma; (3) the soma integrates the drive (plus a brief reset current when an
    antidromic spike arrives); (4) a new soma spike meets a pending antidromic spike (both lost) or starts down the
    axon; a soma spike caused by an antidromic arrival is not sent (the axon behind it is refractory); (5) a fibre
    cannot follow two spikes within ``refractory`` samples. ``unit_state`` columns: last pass, reset samples left,
    ignore-until.
    """
    n_units = s.shape[1]
    for k in prange(n_units):
        a = area[k]
        vs, snah, sn, scam, scah, sca = s[0, k], s[1, k], s[2, k], s[3, k], s[4, k], s[5, k]
        vd, dcas, dca, mnap, hnap = s[6, k], s[7, k], s[8, k], s[9, k], s[10, k]
        previous = previous_vs[k]
        last_pass, reset_left, ignore_until = unit_state[k, 0], unit_state[k, 1], unit_state[k, 2]
        for j in range(drive.shape[0]):
            n = base + j
            last_pass = electrode_events(
                k, n, j, recruit[j, k], last_pass, to_electrode, refractory, inflight, n_inflight, antidromic,
                n_antidromic, counters, spikes,
            )  # fmt: skip
            # (3) soma
            i_in = drive[j, k]
            resetting = reset_left > 0
            if resetting:
                i_in += reset_density
                reset_left -= 1
            moving = abs(vs - previous) > active_dv
            previous = vs
            n_sub = active_substeps if (resetting or moving or vs > -50.0) else substeps
            v_before = vs
            vs, snah, sn, scam, scah, sca, vd, dcas, dca, mnap, hnap = _substeps(
                vs, snah, sn, scam, scah, sca, vd, dcas, dca, mnap, hnap,
                p, a, dt / n_sub, n_sub, i_in, 0.0, temp,
            )  # fmt: skip
            reset_left, ignore_until = soma_events(
                k, n, v_before < SPIKE_THRESHOLD_MV <= vs, reset_left, ignore_until, reset_samples, ignore_samples,
                inflight, n_inflight, antidromic, n_antidromic, counters,
            )  # fmt: skip
        s[0, k], s[1, k], s[2, k], s[3, k], s[4, k], s[5, k] = vs, snah, sn, scam, scah, sca
        s[6, k], s[7, k], s[8, k], s[9, k], s[10, k] = vd, dcas, dca, mnap, hnap
        previous_vs[k] = previous
        unit_state[k, 0], unit_state[k, 1], unit_state[k, 2] = last_pass, reset_left, ignore_until


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
        self._merge: AxonMerge | None = None

    @property
    def soma_voltage(self) -> NDArray[np.float64]:
        voltage: NDArray[np.float64] = self._state[VS].copy()
        return voltage

    def advance(self, current: NDArray[np.float64], drive: NDArray[np.float64] | None = None) -> NDArray[np.float64]:
        """Integrate one sample interval per row of ``current`` (``(rows,)`` shared, or ``(rows, units)``), plus the
        per-unit ``drive`` ``(rows, units)`` if given; return the soma voltage at the end of each interval."""
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
            np.ascontiguousarray(drive, dtype=np.float64) if drive is not None else np.zeros((1, 1)),
            drive is not None,
        )
        return out

    def enable_merge(self, soma_to_muscle_samples: NDArray[np.int64], electrode_fraction: float) -> None:
        self._merge = AxonMerge(
            np.asarray(soma_to_muscle_samples, dtype=np.int64), self._step, electrode_fraction, self._state[VS]
        )

    def axon_events(self) -> dict[str, int]:
        return self._merge.totals() if self._merge is not None else {}

    def advance_merged(self, drive: NDArray[np.float64], recruit: NDArray[np.bool_]) -> NDArray[np.float64]:
        """Drive into the soma and FES at the electrode on the same axons (``_integrate_merged``): the spikes that
        leave the electrode towards the muscle, ``(rows, units)`` (1 = spike). ``recruit[j, k]``: the FES pulse ending
        at that sample fires the axon of unit ``k`` (``axon_stimulation``). Samples are numbered from 1 on the first
        call (sample 0 is the initial state)."""
        merge = self._merge
        if merge is None:
            raise ValueError("call enable_merge first")
        rows = drive.shape[0]
        spikes = np.zeros((rows, self._area.size))
        _integrate_merged(
            self._state, self._area, np.ascontiguousarray(drive, dtype=np.float64),
            np.ascontiguousarray(recruit, dtype=np.bool_), self._params, self._step, self._substeps, self._temp,
            self._active_substeps, self._active_dv, merge.to_electrode, merge.refractory, merge.reset_density,
            merge.reset_samples, merge.ignore_samples, merge.next_sample, merge.inflight, merge.n_inflight,
            merge.antidromic, merge.n_antidromic, merge.unit_state, merge.previous_vs, merge.counters, spikes,
        )  # fmt: skip
        merge.next_sample += rows
        return spikes


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

"""Two-compartment (soma + dendrite) Hodgkin–Huxley-type motoneuron.

Port of ``rates.m``, ``setInit.m``, the gating functions (``snaminf.m`` … ``hinfnap.m``) and the
"Model parameters" block of ``createUMs.m``. Conductance values follow the spinal-cord-injury
parameter set of the original (Venugopal line; Cisi & Kohn 2008 structure).

The right-hand side is vectorised over units: the state is an ``(11, n_units)`` matrix flattened
row-major, so one solver call integrates the whole pool (the original integrates one unit per
``ode23s`` call). Units only differ by their soma-area fraction and do not interact.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray

STATE_SIZE = 11
"""vs, snah, sn, scam, scah, sca, vd, dcas, dca, mnap, hnap — the order of ``setInit.m``."""

VS, SNAH, SN, SCAM, SCAH, SCA, VD, DCAS, DCA, MNAP, HNAP = range(STATE_SIZE)

INITIAL_STATE = np.array([-57.34, 0.5829, 0.1239, 0.004199, 0.9219, 0.0001406, -56.64, 0.08493, 0.01724, 0.1, 0.9])
"""``setInit()``."""

REFERENCE_TEMPERATURE_C = 6.3
"""Temperature at which the rate constants are defined (``temp = 3^((T - 6.3)/10)``)."""


class InjectionSite(Enum):
    """Where the stimulus current enters: ``key = 1`` (soma) or ``key = 0`` (dendrite) in ``rates.m``."""

    SOMA = "SOMA"
    DENDRITE = "DENDRITE"


@dataclass(frozen=True)
class Conductances:
    """``Parameters.data.Motoneurons.Conductances`` from ``createUMs.m`` (mV, mS/cm², µF/cm², ms)."""

    vna: float = 115.0
    vk: float = -20.0
    vl: float = 0.0
    vca: float = 140.0
    vrest: float = -60.0
    gls: float = 0.51
    gld: float = 0.51
    cd: float = 1.0
    cs: float = 1.0
    gc: float = 0.1
    p: float = 1.0
    kd: float = 0.2
    f: float = 0.01
    kca: float = 2.0
    alpha: float = 0.009
    sgna: float = 80.0
    sgk: float = 100.0
    sgca: float = 14.0
    camtau: float = 4.0
    cahtau: float = 40.0
    sgkca: float = 6.0
    dcastau: float = 40.0
    taunap: float = 40.0
    naptau: float = 1000.0
    perkca: float = 1.0
    dgkca: float = 1.0
    gnap: float = 0.1
    dgcas: float = 0.25
    alpha2: float = 0.009
    pernap: float = 1.0


# --- gating functions (one .m file each in the original) -----------------------------------


def sna_m_inf(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1 / (1 + np.exp(-(v - (-35.0)) / 7.8))


def sna_h_inf(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1.0 / (1.0 + np.exp((v - (-55.0)) / 7.0))


def sna_h_tau(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 30.0 / (np.exp((v - (-50.0)) / 15.0) + np.exp(-(v - (-50.0)) / 16.0))


def sn_inf(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1.0 / (1.0 + np.exp(-(v - (-28.0)) / 12.0))


def sn_tau(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 7.0 / (np.exp((v - (-40.0)) / 40.0) + np.exp(-(v - (-40.0)) / 50.0))


def sca_m_inf(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1.0 / (1.0 + np.exp(-(v - (-30.0)) / 5.0))


def sca_h_inf(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1.0 / (1.0 + np.exp((v - (-45.0)) / 5.0))


def dcas_inf(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1.0 / (1.0 + np.exp(-(v - (-39.0)) / 7.0))


def nap_m_inf(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1 / (1 + np.exp(-(v - (-48.0)) / 3.0))


def nap_h_inf(v: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1 / (1 + np.exp((v - (-35.0)) / 6.0))


# --- model ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class MotoneuronPool:
    """``n_units`` motoneurons sharing the same conductances, differing only by soma-area fraction."""

    soma_area_fraction: NDArray[np.float64]
    temperature_c: float = REFERENCE_TEMPERATURE_C
    injection_site: InjectionSite = InjectionSite.SOMA
    conductances: Conductances = Conductances()
    soma_area_cm2: NDArray[np.float64] | None = None
    """Absolute soma area per unit (only needed to convert a drive in nA into current density)."""

    @property
    def n_units(self) -> int:
        return int(self.soma_area_fraction.size)

    def initial_state(self) -> NDArray[np.float64]:
        """``y0`` repeated for every unit, flattened to ``(11 * n_units,)``."""
        return np.repeat(INITIAL_STATE[:, None], self.n_units, axis=1).ravel()

    def derivatives(self, t: float, y: NDArray[np.float64], current: Callable[[float], float]) -> NDArray[np.float64]:
        """Port of ``rates(t, y, Area, Parameters, key)`` for every unit at once.

        ``y`` is ``(11 * n_units,)`` or ``(11 * n_units, k)`` (k evaluations, for finite-difference Jacobians).
        """
        columns = y.shape[1:] if y.ndim > 1 else ()
        s = y.reshape((STATE_SIZE, self.n_units, *columns))
        area = self.soma_area_fraction.reshape((self.n_units, *(1 for _ in columns)))

        stimulus = current(t)
        i_soma = stimulus if self.injection_site is InjectionSite.SOMA else 0.0
        i_dend = stimulus if self.injection_site is InjectionSite.DENDRITE else 0.0
        temp = 3 ** ((self.temperature_c - REFERENCE_TEMPERATURE_C) / 10)

        out = np.empty_like(s)
        # Newton iterations of implicit solvers probe extreme voltages where the exponentials overflow;
        # the resulting 0/inf values are rejected by the solver, as they would be in MATLAB.
        with np.errstate(over="ignore", divide="ignore", invalid="ignore"):
            self._fill(out, s, area, i_soma, i_dend, temp)
        return out.reshape(y.shape)

    def _fill(
        self,
        out: NDArray[np.float64],
        s: NDArray[np.float64],
        area: NDArray[np.float64],
        i_soma: float,
        i_dend: float,
        temp: float,
    ) -> None:
        """The eleven rate equations of ``rates.m``, written into ``out``."""
        c = self.conductances
        vs, snah, sn, scam, scah, sca = s[VS], s[SNAH], s[SN], s[SCAM], s[SCAH], s[SCA]
        vd, dcas, dca, mnap, hnap = s[VD], s[DCAS], s[DCA], s[MNAP], s[HNAP]
        e_na, e_k, e_l, e_ca = c.vna + c.vrest, c.vk + c.vrest, c.vl + c.vrest, c.vca + c.vrest
        soma_ca_current = c.sgca * scam**2 * scah * (vs - e_ca)
        dend_ca_current = c.dgcas * dcas * (vd - e_ca)
        out[VS] = (
            i_soma
            - c.sgna * sna_m_inf(vs) ** 3 * snah * (vs - e_na)
            - soma_ca_current
            - c.sgk * sn**4 * (vs - e_k)
            - c.perkca * c.sgkca * (sca**c.p / (c.kd**c.p + sca**c.p)) * (vs - e_k)
            - c.gls * (vs - e_l)
            + c.gc * (vd - vs) / area
        ) / c.cs
        out[SNAH] = ((sna_h_inf(vs) - snah) / sna_h_tau(vs)) * temp
        out[SN] = ((sn_inf(vs) - sn) / sn_tau(vs)) * temp
        out[SCAM] = ((sca_m_inf(vs) - scam) / c.camtau) * temp
        out[SCAH] = ((sca_h_inf(vs) - scah) / c.cahtau) * temp
        out[SCA] = (-c.f * c.alpha * soma_ca_current - c.f * c.kca * sca) * temp
        out[VD] = (
            i_dend
            - dend_ca_current
            - c.pernap * c.gnap * mnap * hnap * (vd - e_na)
            - c.perkca * c.dgkca * (dca**c.p / (c.kd**c.p + dca**c.p)) * (vd - e_k)
            - c.gld * (vd - e_l)
            + c.gc * (vs - vd) / (1.0 - area)
        ) / c.cd
        out[DCAS] = ((dcas_inf(vd) - dcas) / c.dcastau) * temp
        out[DCA] = (-c.f * c.alpha2 * dend_ca_current - c.f * c.kca * dca) * temp
        out[MNAP] = ((nap_m_inf(vd) - mnap) / c.taunap) * temp
        out[HNAP] = ((nap_h_inf(vd) - hnap) / c.naptau) * temp

    def jacobian_sparsity(self) -> NDArray[np.bool_]:
        """Units are independent: each unit's 11 variables only couple among themselves."""
        n = self.n_units
        unit_of = np.tile(np.arange(n), STATE_SIZE)  # row-major (11, n) flattening
        sparsity: NDArray[np.bool_] = unit_of[:, None] == unit_of[None, :]
        return sparsity

    @staticmethod
    def soma_voltage(state: NDArray[np.float64], n_units: int) -> NDArray[np.float64]:
        """Soma membrane potential ``vs`` from a ``(11 * n_units, k)`` solution, as ``(k, n_units)``."""
        voltage: NDArray[np.float64] = state.reshape(STATE_SIZE, n_units, -1)[VS].T
        return voltage

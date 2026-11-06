"""Motoneuron of Cisi & Kohn (2008), used for the central drive (design §3.1–3.2, Decision 3c of the author).

Cisi RRL, Kohn AF. Simulation system of spinal cord motor nuclei and associated nerves and muscles, in a Web-based
architecture. J Comput Neurosci 25:520–542 (2008), doi:10.1007/s10827-008-0092-8 — equations read in the full text
(Eqs 1–8, p. 525–526). It is the motoneuron of Gallego et al. 2015, whose drive values (nA) we use, and of the ReMoto
simulator. The inherited Booth, Rinzel & Kiehn (1997) motoneuron stays for the invasive mode without a drive: it was
built for plateau potentials and has no low-rate firing regime (``validation/results/central-drive.json``).

Two compartments; the dendrite is passive (the optional dendritic L-type Ca channel of ReMoto is off by default).
Potentials are relative to rest (rest = 0 mV); E_Na = 120, E_K = −10, E_leak = 0 mV; C_m = 1 µF/cm², R_i = 70 Ω·cm.
The soma has Na (m³h), fast K (n⁴) and slow K (q², the AHP) conductances with Destexhe's (1997) pulse kinetics: when
the soma potential crosses the threshold (and 5 ms have passed since the last spike), every rate constant switches
for 0.6 ms — activations m, n, q rise towards 1 at rate α, inactivation h falls at rate β — and otherwise
activations decay at β and h recovers towards 1 at α.

Parameter values (``TYPE_PARAMETERS``) are those of the open Kohn-lab implementation projectPR (Watanabe, commit
318286f, ``confTest.rmto``, soleus), which agree with Cisi & Kohn 2008 Table 2 for geometry and resistances and with
Watanabe et al. 2013 (J Neurophysiol 110:2592, doi:10.1152/jn.00073.2013, Table 1) for gNa, the rate constants and the
thresholds. The thresholds follow either published rule (``ThresholdRule``). Two published values differ from the code
and the code is used (both are noted in
``docs/research/cisi-kohn-motoneuron.md``): gKs per type (code 17 / 37.5 / 8 mS/cm²; Watanabe 2013 interpolates
16–25 / 25–19 / 19–4) and gKf, βq of FR/FF (constant per type in the code). Geometry, resistances and threshold are
spread linearly over each type's units in the muscle pool (Cisi & Kohn 2008 p. 526).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.central_drive import GALLEGO_SMALLEST_RHEOBASE_NA, CentralDrive, CurrentScale, ThresholdRule
from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS, MotorUnitGroup, MotorUnitType, Muscle

E_NA_MV = 120.0
E_K_MV = -10.0
E_LEAK_MV = 0.0
MEMBRANE_CAPACITANCE_UF_CM2 = 1.0
CYTOPLASM_RESISTIVITY_OHM_CM = 70.0
PULSE_MS = 0.6
REFRACTORY_MS = 5.0


@dataclass(frozen=True)
class Span:
    """Value of the type's first and last unit (linear in between)."""

    first: float
    last: float


@dataclass(frozen=True)
class TypeParameters:
    soma_diameter_um: Span  # soma length = diameter (Cisi & Kohn 2008 Table 2)
    dendrite_diameter_um: Span
    dendrite_length_um: Span
    soma_resistivity_ohm_cm2: Span
    dendrite_resistivity_ohm_cm2: Span
    threshold_mv: Span
    rheobase_na: Span
    g_na_ms_cm2: float
    g_kf_ms_cm2: float
    g_ks_ms_cm2: float
    alpha_m: float
    beta_m: float
    alpha_h: float
    beta_h: float
    alpha_n: float
    beta_n: float
    alpha_q: float
    beta_q: float


TYPE_PARAMETERS: dict[MotorUnitType, TypeParameters] = {
    MotorUnitType.S: TypeParameters(
        soma_diameter_um=Span(77.5, 82.5),
        dendrite_diameter_um=Span(41.5, 62.5),
        dendrite_length_um=Span(5519.0, 6789.0),
        soma_resistivity_ohm_cm2=Span(1150.0, 1050.0),
        dendrite_resistivity_ohm_cm2=Span(14350.0, 10650.0),
        threshold_mv=Span(12.35, 16.45),
        rheobase_na=Span(3.5, 6.5),
        g_na_ms_cm2=30.0,
        g_kf_ms_cm2=4.0,
        g_ks_ms_cm2=17.0,
        alpha_m=22.0,
        beta_m=13.0,
        alpha_h=0.5,
        beta_h=4.0,
        alpha_n=1.5,
        beta_n=0.1,
        alpha_q=1.5,
        beta_q=0.025,
    ),
    MotorUnitType.FR: TypeParameters(
        soma_diameter_um=Span(82.5, 87.5),
        dendrite_diameter_um=Span(62.5, 83.5),
        dendrite_length_um=Span(6789.0, 8058.0),
        soma_resistivity_ohm_cm2=Span(1050.0, 950.0),
        dendrite_resistivity_ohm_cm2=Span(10650.0, 6950.0),
        threshold_mv=Span(16.45, 19.3),
        rheobase_na=Span(6.5, 17.5),
        g_na_ms_cm2=30.0,
        g_kf_ms_cm2=4.0,
        g_ks_ms_cm2=37.5,
        alpha_m=22.0,
        beta_m=13.0,
        alpha_h=0.5,
        beta_h=4.0,
        alpha_n=1.5,
        beta_n=0.1,
        alpha_q=1.5,
        beta_q=0.05,
    ),
    MotorUnitType.FF: TypeParameters(
        soma_diameter_um=Span(87.5, 112.5),
        dendrite_diameter_um=Span(83.5, 92.5),
        dendrite_length_um=Span(8058.0, 10578.0),
        soma_resistivity_ohm_cm2=Span(950.0, 650.0),
        dendrite_resistivity_ohm_cm2=Span(6950.0, 6050.0),
        threshold_mv=Span(19.3, 20.9),
        rheobase_na=Span(17.5, 25.1),
        g_na_ms_cm2=30.0,
        g_kf_ms_cm2=0.5,
        g_ks_ms_cm2=8.0,
        alpha_m=22.0,
        beta_m=13.0,
        alpha_h=0.5,
        beta_h=4.0,
        alpha_n=1.5,
        beta_n=0.1,
        alpha_q=1.5,
        beta_q=0.05,
    ),
}

PARAMETER_COLUMNS = (
    "c_s", "c_d", "g_ls", "g_ld", "g_c", "g_na", "g_kf", "g_ks", "threshold",
    "alpha_m", "beta_m", "alpha_h", "beta_h", "alpha_n", "beta_n", "alpha_q", "beta_q",
)  # fmt: skip
"""Columns of ``CisiKohnPool.parameters``: capacitances (nF), conductances (µS), threshold (mV), rates (1/ms)."""


@dataclass(frozen=True)
class CisiKohnPool:
    """Per-unit parameters of the simulated units, in the column order of ``MotorUnitSetup`` (S, FR, FF)."""

    parameters: NDArray[np.float64]  # (units, len(PARAMETER_COLUMNS))

    @property
    def n_units(self) -> int:
        return int(self.parameters.shape[0])

    def column(self, name: str) -> NDArray[np.float64]:
        return self.parameters[:, PARAMETER_COLUMNS.index(name)]


def _spread(span: Span, pool_size: int, index: NDArray[np.int64]) -> NDArray[np.float64]:
    if pool_size <= 1:
        return np.full(index.size, span.first)
    return span.first + (span.last - span.first) * index / (pool_size - 1)


def input_resistance_mohm(
    g_ls: NDArray[np.float64], g_ld: NDArray[np.float64], g_c: NDArray[np.float64]
) -> NDArray[np.float64]:
    """Steady soma input resistance of the passive two-compartment cell (µS → MΩ)."""
    r: NDArray[np.float64] = 1.0 / (g_ls + g_c * g_ld / (g_c + g_ld))
    return r


def unit_parameters(
    unit_type: MotorUnitType,
    pool_size: int,
    index: NDArray[np.int64],
    rule: ThresholdRule = ThresholdRule.CISI_KOHN_2008,
) -> NDArray[np.float64]:
    """Parameters of the units at ``index`` (0 … pool_size − 1) of one type (units as in projectPR ``Compartment.py``
    and ``MotorUnit.calcGCoupling``)."""
    p = TYPE_PARAMETERS[unit_type]
    d_s = _spread(p.soma_diameter_um, pool_size, index)
    d_d = _spread(p.dendrite_diameter_um, pool_size, index)
    l_d = _spread(p.dendrite_length_um, pool_size, index)
    area_s = np.pi * d_s * d_s * 1e-8  # cm² (cylinder, length = diameter)
    area_d = np.pi * d_d * l_d * 1e-8
    c_s = MEMBRANE_CAPACITANCE_UF_CM2 * area_s * 1e3  # nF
    c_d = MEMBRANE_CAPACITANCE_UF_CM2 * area_d * 1e3
    g_ls = 1e6 * area_s / _spread(p.soma_resistivity_ohm_cm2, pool_size, index)  # µS
    g_ld = 1e6 * area_d / _spread(p.dendrite_resistivity_ohm_cm2, pool_size, index)
    r_axial_s = CYTOPLASM_RESISTIVITY_OHM_CM * d_s / (np.pi * (d_s / 2) ** 2)
    r_axial_d = CYTOPLASM_RESISTIVITY_OHM_CM * l_d / (np.pi * (d_d / 2) ** 2)
    g_c = 200.0 / (r_axial_s + r_axial_d)  # µS (Cisi & Kohn 2008 Eq 4)
    n = index.size
    columns = {
        "c_s": c_s,
        "c_d": c_d,
        "g_ls": g_ls,
        "g_ld": g_ld,
        "g_c": g_c,
        "g_na": np.full(n, p.g_na_ms_cm2 * 1e3) * area_s,  # mS/cm² → µS
        "g_kf": np.full(n, p.g_kf_ms_cm2 * 1e3) * area_s,
        "g_ks": np.full(n, p.g_ks_ms_cm2 * 1e3) * area_s,
        "threshold": (
            _spread(p.rheobase_na, pool_size, index) * input_resistance_mohm(g_ls, g_ld, g_c)
            if rule is ThresholdRule.CISI_KOHN_2008
            else _spread(p.threshold_mv, pool_size, index)
        ),
        **{name: np.full(n, getattr(p, name)) for name in PARAMETER_COLUMNS[9:]},
    }
    return np.column_stack([columns[c] for c in PARAMETER_COLUMNS])


def smallest_rheobase_na(rule: ThresholdRule) -> float:
    """Rheobase of the pool's smallest unit (S, index 0) under ``rule`` (the same for every muscle preset)."""
    p = unit_parameters(MotorUnitType.S, 2, np.array([0]), rule)[0]
    col = PARAMETER_COLUMNS.index
    return float(p[col("threshold")] / input_resistance_mohm(p[col("g_ls")], p[col("g_ld")], p[col("g_c")]))


def cisi_kohn_pool(
    groups: dict[MotorUnitType, MotorUnitGroup], muscle: Muscle, rule: ThresholdRule = ThresholdRule.CISI_KOHN_2008
) -> CisiKohnPool:
    """The simulated units of ``groups`` (their positions in the muscle pool) as Cisi & Kohn motoneurons."""
    pool = MUSCLE_PRESETS[muscle].pool_size
    blocks, offset = [], 0
    for t in (MotorUnitType.S, MotorUnitType.FR, MotorUnitType.FF):
        group = groups[t]
        if group.size:
            rank = group.pool_rank if group.pool_rank is not None else np.arange(group.size, dtype=np.int64) + offset
            blocks.append(unit_parameters(t, pool[t], np.asarray(rank - offset, dtype=np.int64), rule))
        offset += pool[t]
    return CisiKohnPool(np.vstack(blocks) if blocks else np.empty((0, len(PARAMETER_COLUMNS))))


def current_factor(drive: CentralDrive) -> float:
    """Multiplier of the drive currents: 1 as published, or our smallest rheobase / Gallego's (4 nA)."""
    if drive.scale is CurrentScale.PUBLISHED:
        return 1.0
    return smallest_rheobase_na(drive.threshold_rule) / GALLEGO_SMALLEST_RHEOBASE_NA

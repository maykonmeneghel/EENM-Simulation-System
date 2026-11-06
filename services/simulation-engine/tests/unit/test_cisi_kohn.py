"""Cisi & Kohn (2008) motoneurons against the paper's own model properties (Table 5, p. 531; Table 2, p. 526)."""

from __future__ import annotations

import numpy as np
import pytest

from eenm_engine.domain.central_drive import ThresholdRule
from eenm_engine.domain.cisi_kohn import (
    PARAMETER_COLUMNS,
    CisiKohnPool,
    input_resistance_mohm,
    smallest_rheobase_na,
    unit_parameters,
)
from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS, MotorUnitType, Muscle
from eenm_engine.infrastructure.compiled_cisi_kohn import CisiKohnIntegration

STEP = 0.05
POOL = MUSCLE_PRESETS[Muscle.SOLEUS].pool_size
TYPES = (MotorUnitType.S, MotorUnitType.FR, MotorUnitType.FF)


def _middle_units(rule: ThresholdRule = ThresholdRule.CISI_KOHN_2008) -> CisiKohnPool:
    """The middle unit of each type (the paper's per-type values)."""
    return CisiKohnPool(np.vstack([unit_parameters(t, POOL[t], np.array([POOL[t] // 2]), rule) for t in TYPES]))


def _soma_voltage(pool: CisiKohnPool, current: np.ndarray) -> np.ndarray:
    integration = CisiKohnIntegration(pool, STEP)
    out = np.empty((current.shape[0], pool.n_units))
    for j in range(current.shape[0]):
        integration.advance(current[j : j + 1])
        out[j] = integration.soma_voltage
    return out


def _spikes(pool: CisiKohnPool, current_na: np.ndarray, ms: float) -> np.ndarray:
    rows = round(ms / STEP)
    return CisiKohnIntegration(pool, STEP).advance(np.broadcast_to(current_na, (rows, pool.n_units)).copy())


def test_input_resistance_and_membrane_time_constant_are_the_published_ones() -> None:
    pool = _middle_units()
    col = pool.column
    rin = input_resistance_mohm(col("g_ls"), col("g_ld"), col("g_c"))
    np.testing.assert_allclose(rin, [1.6, 0.9, 0.6], atol=0.05)  # Table 5: S 1.6, FR 0.9, FF 0.6 MΩ
    rows = round(200 / STEP)
    current = np.zeros((rows, 3))
    current[round(20 / STEP) :] = -0.5
    v = _soma_voltage(pool, current)
    t = np.arange(rows) * STEP
    tail = (t > 40) & (t < 80)
    tau = [-1 / np.polyfit(t[tail], np.log(np.abs(v[tail, k] - v[-1, k])), 1)[0] for k in range(3)]
    np.testing.assert_allclose(tau, [10.4, 8.0, 5.9], rtol=0.06)  # Table 5 (slowest exponential)
    np.testing.assert_allclose(v[-1] / -0.5, rin, rtol=1e-3)  # the steady response is the analytic resistance


def test_threshold_rules_give_their_rheobases() -> None:
    assert smallest_rheobase_na(ThresholdRule.CISI_KOHN_2008) == pytest.approx(3.5)  # Table 2: S 3.5–6.5 nA
    assert smallest_rheobase_na(ThresholdRule.WATANABE_2013) == pytest.approx(12.35 / 2.19, rel=0.01)
    pool = CisiKohnPool(np.vstack([unit_parameters(t, POOL[t], np.array([0, POOL[t] - 1])) for t in TYPES]))
    published = np.array([3.5, 6.5, 6.5, 17.5, 17.5, 25.1])
    assert not _spikes(pool, published * 0.98, 500).any()
    assert _spikes(pool, published * 1.02, 500).any(axis=0).all()


def test_units_fire_slowly_near_rheobase_with_the_published_f_i_slopes() -> None:
    """The property the inherited Booth 1997 motoneuron lacks: steady firing at physiological rates."""
    pool = _middle_units()
    rheobase = np.array([5.0, 12.0, 21.3])  # middle of each Table 2 range
    rate = {}
    for extra in (1.0, 5.0):
        s = _spikes(pool, rheobase + extra, 2000)
        rate[extra] = np.array([(np.flatnonzero(s[:, k]) * STEP > 1000).sum() for k in range(3)], dtype=float)
    assert (rate[1.0] >= 8).all() and (rate[1.0] <= 30).all()  # PD motor units fire at 10.9 ± 2.9 Hz (Agapaki 2018)
    slope = (rate[5.0] - rate[1.0]) / 4.0
    np.testing.assert_allclose(slope[:2], [2.7, 2.5], atol=0.8)  # Table 5, first f–I segment (pps/nA), S and FR


def test_ahp_of_s_units_has_the_published_magnitude() -> None:
    pool = _middle_units()
    rows = round(300 / STEP)
    current = np.zeros((rows, 3))
    current[round(10 / STEP) : round(10.5 / STEP)] = 200.0  # one spike
    v = _soma_voltage(pool, current)
    ahp = -v[round(15 / STEP) :].min(axis=0)
    assert ahp[0] == pytest.approx(4.9, abs=0.8)  # Table 5: S 4.9 mV (FR 4.3, FF 3.0 — see the research notes)
    assert ahp[0] > ahp[2]  # the AHP shrinks with unit size


def test_parameter_columns_are_complete() -> None:
    assert len(PARAMETER_COLUMNS) == unit_parameters(MotorUnitType.S, 10, np.arange(3)).shape[1]


def test_gates_follow_the_pulse_kinetics() -> None:
    """During the 0.6 ms pulse m, n, q rise at α and h falls at βH; afterwards h recovers at αH (Destexhe 1997)."""
    pool = _middle_units()
    integration = CisiKohnIntegration(pool, STEP)
    current = np.zeros((round(20 / STEP), 3))
    current[round(10 / STEP) : round(10.3 / STEP)] = 200.0
    h = []
    for j in range(current.shape[0]):
        integration.advance(current[j : j + 1])
        h.append(integration._state[3, 0])  # gate h of the S unit (internal state, read for this check)
    h_arr = np.array(h)
    spike = round(10 / STEP)  # h starts at 0 (projectPR) and has recovered to ~1 by the spike
    low = spike + int(np.argmin(h_arr[spike:]))
    assert h_arr[low] == pytest.approx(h_arr[low - 12] * np.exp(-4.0 * 0.6), rel=0.05)  # βH = 4 /ms over 0.6 ms
    two_ms = h_arr[low + round(2 / STEP)]
    assert two_ms == pytest.approx(1 - (1 - h_arr[low]) * np.exp(-0.5 * 2), rel=0.02)  # αH = 0.5 /ms

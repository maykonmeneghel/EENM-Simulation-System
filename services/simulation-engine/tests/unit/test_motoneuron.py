import numpy as np
import pytest

from eenm_engine.domain.motoneuron import (
    INITIAL_STATE,
    STATE_SIZE,
    VD,
    VS,
    InjectionSite,
    MotoneuronPool,
    sna_m_inf,
)


def pool(n: int = 3, **kwargs) -> MotoneuronPool:  # type: ignore[no-untyped-def]
    return MotoneuronPool(soma_area_fraction=np.linspace(0.1, 0.3, n), **kwargs)


def test_initial_state_repeats_setinit_for_every_unit() -> None:
    state = pool(3).initial_state().reshape(STATE_SIZE, 3)
    for k in range(3):
        np.testing.assert_array_equal(state[:, k], INITIAL_STATE)


def test_gating_function_matches_its_matlab_formula() -> None:
    assert sna_m_inf(np.array(-35.0)) == pytest.approx(0.5)


def test_soma_injection_only_enters_the_soma_equation() -> None:
    p = pool(1)
    y = p.initial_state()
    quiet = p.derivatives(0.0, y, lambda t: 0.0)
    driven = p.derivatives(0.0, y, lambda t: 10.0)
    delta = (driven - quiet).reshape(STATE_SIZE, 1)
    assert delta[VS, 0] == pytest.approx(10.0)  # / Cs = 1
    assert np.count_nonzero(delta) == 1


def test_dendrite_injection_only_enters_the_dendrite_equation() -> None:
    p = pool(1, injection_site=InjectionSite.DENDRITE)
    y = p.initial_state()
    delta = (p.derivatives(0.0, y, lambda t: 10.0) - p.derivatives(0.0, y, lambda t: 0.0)).reshape(STATE_SIZE, 1)
    assert delta[VD, 0] == pytest.approx(10.0)
    assert np.count_nonzero(delta) == 1


def test_vectorised_evaluation_equals_one_column_at_a_time() -> None:
    p = pool(4)
    rng = np.random.default_rng(1)
    ys = p.initial_state()[:, None] + rng.normal(0, 0.5, size=(STATE_SIZE * 4, 3))
    together = p.derivatives(1.0, ys, lambda t: 5.0)
    for j in range(3):
        np.testing.assert_allclose(together[:, j], p.derivatives(1.0, ys[:, j], lambda t: 5.0))


def test_units_are_independent() -> None:
    p = pool(2)
    y = p.initial_state()
    base = p.derivatives(0.0, y, lambda t: 0.0).reshape(STATE_SIZE, 2)
    y2 = y.reshape(STATE_SIZE, 2).copy()
    y2[VS, 1] += 20.0
    moved = p.derivatives(0.0, y2.ravel(), lambda t: 0.0).reshape(STATE_SIZE, 2)
    np.testing.assert_array_equal(moved[:, 0], base[:, 0])


def test_temperature_scales_gating_rates_by_q10_of_3() -> None:
    y = pool(1).initial_state()
    cold = pool(1).derivatives(0.0, y, lambda t: 0.0)
    warm = pool(1, temperature_c=16.3).derivatives(0.0, y, lambda t: 0.0)
    np.testing.assert_allclose(warm[1:6], 3 * cold[1:6])  # snah..sca
    assert warm[VS] == pytest.approx(cold[VS])  # voltages are not scaled


def test_jacobian_sparsity_is_block_diagonal_per_unit() -> None:
    sparsity = pool(2).jacobian_sparsity()
    assert sparsity.shape == (22, 22)
    assert sparsity.sum() == 2 * STATE_SIZE**2
    assert sparsity[0, 2] and not sparsity[0, 1]  # rows 0 and 2 are unit 0 (vs, snah); row 1 is unit 1

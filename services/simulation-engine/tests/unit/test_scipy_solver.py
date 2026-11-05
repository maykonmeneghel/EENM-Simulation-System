import numpy as np
import pytest

from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver


def decay(t: float, y: np.ndarray) -> np.ndarray:
    return -y


def test_advancing_in_pieces_matches_the_analytic_solution() -> None:
    integration = ScipyBdfSolver(rtol=1e-8, atol=1e-10).start(decay, np.array([1.0, 2.0]), 0.0, 5.0)
    first = integration.advance(np.array([0.0, 0.5, 1.0]))
    second = integration.advance(np.array([1.5, 3.0, 5.0]))
    times = np.array([0.0, 0.5, 1.0, 1.5, 3.0, 5.0])
    expected = np.array([1.0, 2.0])[:, None] * np.exp(-times)
    np.testing.assert_allclose(np.hstack([first, second]), expected, rtol=1e-5)


def test_pieces_equal_one_advance() -> None:
    times = np.linspace(0, 4, 41)
    whole = ScipyBdfSolver().start(decay, np.array([1.0]), 0.0, 4.0).advance(times)
    integration = ScipyBdfSolver().start(decay, np.array([1.0]), 0.0, 4.0)
    pieces = np.hstack([integration.advance(times[i : i + 7]) for i in range(0, 41, 7)])
    np.testing.assert_allclose(pieces, whole, rtol=1e-12)


def test_failure_is_reported() -> None:
    def blow_up(t: float, y: np.ndarray) -> np.ndarray:
        return np.full_like(y, np.nan)

    integration = ScipyBdfSolver().start(blow_up, np.array([1.0]), 0.0, 1.0)
    with pytest.raises(RuntimeError):
        integration.advance(np.array([1.0]))

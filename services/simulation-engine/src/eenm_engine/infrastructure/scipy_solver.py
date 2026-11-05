"""``OdeSolver`` adapter backed by SciPy's implicit BDF integrator."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.integrate import solve_ivp

from eenm_engine.application.ports import Derivatives


class ScipyBdfSolver:
    """Stiff solver standing in for MATLAB's ``ode23s``.

    Tolerances default to ``ode23s``'s (``RelTol = 1e-3``, ``AbsTol = 1e-6``). ``max_step_ms`` bounds the
    internal step so that no stimulus pulse can be stepped over.
    """

    def __init__(self, rtol: float = 1e-3, atol: float = 1e-6, max_step_ms: float = np.inf) -> None:
        self._rtol = rtol
        self._atol = atol
        self._max_step = max_step_ms

    def integrate(
        self,
        derivatives: Derivatives,
        initial_state: NDArray[np.float64],
        times: NDArray[np.float64],
        jacobian_sparsity: NDArray[np.bool_] | None = None,
    ) -> NDArray[np.float64]:
        result = solve_ivp(
            derivatives,
            (float(times[0]), float(times[-1])),
            initial_state,
            method="BDF",
            t_eval=times,
            vectorized=True,
            jac_sparsity=jacobian_sparsity,
            rtol=self._rtol,
            atol=self._atol,
            max_step=self._max_step,
        )
        if not result.success:
            raise RuntimeError(f"ODE integration failed: {result.message}")
        return np.asarray(result.y)

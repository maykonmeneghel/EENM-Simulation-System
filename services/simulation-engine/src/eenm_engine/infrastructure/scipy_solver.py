"""``OdeSolver`` adapter backed by SciPy's implicit BDF integrator."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy.integrate import BDF

from eenm_engine.application.ports import Derivatives


class ScipyBdfSolver:
    """Stiff solver standing in for MATLAB's ``ode23s``.

    Tolerances default to ``ode23s``'s (``RelTol = 1e-3``, ``AbsTol = 1e-6``). The internal step is bounded
    by the smaller of ``max_step_ms`` and the ``max_step`` of each integration.
    """

    def __init__(self, rtol: float = 1e-3, atol: float = 1e-6, max_step_ms: float = np.inf) -> None:
        self._rtol = rtol
        self._atol = atol
        self._max_step = max_step_ms

    def start(
        self,
        derivatives: Derivatives,
        initial_state: NDArray[np.float64],
        start_time: float,
        end_time: float,
        jacobian_sparsity: NDArray[np.bool_] | None = None,
        max_step: float = np.inf,
    ) -> ScipyBdfIntegration:
        stepper = BDF(
            derivatives,
            start_time,
            initial_state,
            end_time,
            rtol=self._rtol,
            atol=self._atol,
            max_step=min(self._max_step, max_step),
            vectorized=True,
            jac_sparsity=jacobian_sparsity,
        )
        return ScipyBdfIntegration(stepper, initial_state, start_time)


class ScipyBdfIntegration:
    """Steps one BDF solver forward and reads states at requested times from its dense output."""

    def __init__(self, stepper: BDF, initial_state: NDArray[np.float64], start_time: float) -> None:
        self._stepper = stepper
        self._start_time = start_time
        self._initial = initial_state.copy()
        self._step_ends: list[float] = []
        self._interpolants: list[object] = []

    def advance(self, times: NDArray[np.float64]) -> NDArray[np.float64]:
        while self._stepper.t < times[-1]:
            try:
                message = self._stepper.step()
            except (ValueError, np.linalg.LinAlgError) as error:  # e.g. NaN in the Jacobian
                raise RuntimeError(f"ODE integration failed: {error}") from error
            if self._stepper.status == "failed":
                raise RuntimeError(f"ODE integration failed: {message}")
            self._step_ends.append(float(self._stepper.t))
            self._interpolants.append(self._stepper.dense_output())

        out = np.empty((self._initial.size, times.size))
        at_start = times == self._start_time
        out[:, at_start] = self._initial[:, None]
        # Each requested time is read from the dense output of the step that contains it.
        step_of = np.minimum(np.searchsorted(self._step_ends, times), len(self._interpolants) - 1)
        for step in np.unique(step_of[~at_start]):
            columns = (step_of == step) & ~at_start
            out[:, columns] = self._interpolants[step](times[columns])

        self._forget_steps_before(float(times[-1]))
        return out

    def _forget_steps_before(self, t: float) -> None:
        """Keep only the step containing ``t`` and later ones (later requests never go back in time)."""
        keep = int(np.searchsorted(self._step_ends, t))
        del self._step_ends[:keep]
        del self._interpolants[:keep]

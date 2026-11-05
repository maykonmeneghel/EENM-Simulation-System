"""Ports the application layer depends on; adapters live in ``eenm_engine.infrastructure``."""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

Derivatives = Callable[[float, NDArray[np.float64]], NDArray[np.float64]]


class OdeIntegration(Protocol):
    """One ongoing integration that is advanced piece by piece without restarting the solver."""

    def advance(self, times: NDArray[np.float64]) -> NDArray[np.float64]:
        """Integrate up to ``times[-1]`` and return the state at every entry of ``times``.

        ``times`` must be increasing and not earlier than the previous call's last time. Returns
        ``(n_states, len(times))``.
        """
        ...


class OdeSolver(Protocol):
    """Factory of integrations of a stiff ODE system."""

    def start(
        self,
        derivatives: Derivatives,
        initial_state: NDArray[np.float64],
        start_time: float,
        end_time: float,
        jacobian_sparsity: NDArray[np.bool_] | None = None,
    ) -> OdeIntegration: ...

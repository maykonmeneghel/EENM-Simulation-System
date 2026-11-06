"""Ports the application layer depends on; adapters live in ``eenm_engine.infrastructure``."""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.motoneuron import MotoneuronPool

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
        max_step: float = np.inf,
    ) -> OdeIntegration:
        """``max_step`` bounds the internal step, so that no stimulus pulse can be stepped over."""
        ...


class PoolIntegration(Protocol):
    """One ongoing integration of a motoneuron pool, one sample interval per call row."""

    def advance(self, current: NDArray[np.float64]) -> NDArray[np.float64]:
        """Integrate one sample interval per row of ``current`` (``(rows,)`` shared by every unit, or
        ``(rows, units)``) and return the soma voltage at the end of each interval, ``(rows, units)``."""
        ...


class PoolIntegrator(Protocol):
    """Factory of fixed-step integrations of the motoneuron pool (faster than a generic ODE solver)."""

    def start(self, pool: MotoneuronPool, step_ms: float) -> PoolIntegration: ...

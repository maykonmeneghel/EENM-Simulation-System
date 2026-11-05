"""Ports the application layer depends on; adapters live in ``eenm_engine.infrastructure``."""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

Derivatives = Callable[[float, NDArray[np.float64]], NDArray[np.float64]]


class OdeSolver(Protocol):
    """Integrates a stiff ODE system and returns the state at the requested times."""

    def integrate(
        self,
        derivatives: Derivatives,
        initial_state: NDArray[np.float64],
        times: NDArray[np.float64],
        jacobian_sparsity: NDArray[np.bool_] | None = None,
    ) -> NDArray[np.float64]:
        """Return the state at every entry of ``times`` as ``(n_states, len(times))``.

        ``times[0]`` is the time of ``initial_state``.
        """
        ...

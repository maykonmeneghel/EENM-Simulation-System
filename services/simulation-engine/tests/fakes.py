"""Test doubles."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from eenm_engine.application.ports import Derivatives
from eenm_engine.domain.motoneuron import STATE_SIZE, VS


class SpikingSolver:
    """Pretends to integrate: soma voltage spikes to +40 mV for 0.5 ms every 25 ms, otherwise rests."""

    def __init__(self) -> None:
        self.calls: list[tuple[float, float]] = []

    def integrate(
        self,
        derivatives: Derivatives,
        initial_state: NDArray[np.float64],
        times: NDArray[np.float64],
        jacobian_sparsity: NDArray[np.bool_] | None = None,
    ) -> NDArray[np.float64]:
        self.calls.append((float(times[0]), float(times[-1])))
        units = initial_state.size // STATE_SIZE
        state = np.repeat(initial_state[:, None], times.size, axis=1).reshape(STATE_SIZE, units, times.size)
        spiking = (times % 25.0) < 0.5
        state[VS] = np.where(spiking, 40.0 * np.sin(np.pi * (times % 25.0) / 0.5), -57.0)
        return state.reshape(STATE_SIZE * units, times.size)


class FailingSolver:
    def integrate(self, *args: object, **kwargs: object) -> NDArray[np.float64]:
        raise RuntimeError("solver exploded")

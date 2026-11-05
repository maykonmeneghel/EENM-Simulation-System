"""Test doubles."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from eenm_engine.application.ports import Derivatives
from eenm_engine.domain.motoneuron import STATE_SIZE, VS


class SpikingSolver:
    """Pretends to integrate: soma voltage spikes to +40 mV for 0.5 ms every 25 ms, otherwise rests."""

    def __init__(self) -> None:
        self.advances: list[tuple[float, float]] = []

    def start(
        self,
        derivatives: Derivatives,
        initial_state: NDArray[np.float64],
        start_time: float,
        end_time: float,
        jacobian_sparsity: NDArray[np.bool_] | None = None,
    ) -> SpikingIntegration:
        return SpikingIntegration(initial_state, self.advances)


class SpikingIntegration:
    def __init__(self, initial_state: NDArray[np.float64], log: list[tuple[float, float]]) -> None:
        self._initial = initial_state
        self._log = log

    def advance(self, times: NDArray[np.float64]) -> NDArray[np.float64]:
        self._log.append((float(times[0]), float(times[-1])))
        units = self._initial.size // STATE_SIZE
        state = np.repeat(self._initial[:, None], times.size, axis=1).reshape(STATE_SIZE, units, times.size)
        phase = times % 25.0
        state[VS] = np.where(phase < 0.5, 40.0 * np.sin(np.pi * phase / 0.5), -57.0)
        return state.reshape(STATE_SIZE * units, times.size)


class FailingSolver:
    def start(self, *args: object, **kwargs: object) -> FailingSolver:
        return self

    def advance(self, times: NDArray[np.float64]) -> NDArray[np.float64]:
        raise RuntimeError("solver exploded")

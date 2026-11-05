"""Events produced while a simulation runs (see ``docs/contracts.md``, section 2)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.motor_unit_pool import MotorUnitType, Muscle


@dataclass(frozen=True)
class SimulationStarted:
    simulation_id: str
    duration_ms: float
    output_step_ms: float
    motor_units: dict[MotorUnitType, int]
    muscle: Muscle


@dataclass(frozen=True)
class SimulationChunk:
    progress: float
    time_ms: NDArray[np.float64]
    stimulus: NDArray[np.float64]
    force_total: NDArray[np.float64]
    force_by_type: dict[MotorUnitType, NDArray[np.float64]]
    emg: NDArray[np.float64]


@dataclass(frozen=True)
class SimulationSummary:
    peak_force: float
    mean_force: float
    time_to_peak_ms: float


@dataclass(frozen=True)
class SimulationCompleted:
    elapsed_seconds: float
    summary: SimulationSummary


SimulationEvent = SimulationStarted | SimulationChunk | SimulationCompleted

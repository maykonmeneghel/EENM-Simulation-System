"""Events produced while a simulation runs (see ``docs/contracts.md``, section 2)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.motor_unit_pool import MotorUnitType, Muscle
from eenm_engine.domain.unit_anatomy import UnitAnatomy
from eenm_engine.domain.unit_events import UnitEvents
from eenm_engine.domain.wrist_joint import WristSetup


@dataclass(frozen=True)
class SimulationStarted:
    simulation_id: str
    duration_ms: float
    output_step_ms: float
    motor_units: dict[MotorUnitType, int]
    muscle: Muscle
    step_ms: float | None = None
    """Integration step: the unit of ``unitEvents`` samples (sample × step = time in ms)."""
    max_force: float | None = None
    """Maximal force of the healthy muscle (``domain.max_force``): force ÷ this = fraction of maximum."""
    units: UnitAnatomy | None = None
    """Per-unit geometry and conduction times, for the 3D view (``domain.unit_anatomy``)."""
    electrode_fraction: float | None = None
    """Electrode position along the axon from the soma; ``None`` when the stimulus goes into the soma."""
    joint: WristSetup | None = None
    """The wrist the stimulated muscle moves (FCR / ECR with a force reference), else ``None``."""


@dataclass(frozen=True)
class FatigueSnapshot:
    """Remaining force capacity (1 = rested, 0 = exhausted) at the end of a chunk (Potvin & Fuglevand 2017)."""

    time_ms: float
    muscle: float
    """Capacity of the whole muscle: units weighted by their rested twitch force and the pool units they stand for."""
    by_type: dict[MotorUnitType, float | None]
    """Mean capacity of the simulated units of each type; ``None`` for a type with no units."""


@dataclass(frozen=True)
class SimulationChunk:
    progress: float
    time_ms: NDArray[np.float64]
    stimulus: NDArray[np.float64]
    force_total: NDArray[np.float64]
    force_by_type: dict[MotorUnitType, NDArray[np.float64]]
    emg: NDArray[np.float64]
    fatigue: FatigueSnapshot | None = None
    """``None`` when the model has no fatigue (ORIGINAL)."""
    axon_events: dict[str, int] | None = None
    """Cumulative axon-merge counts (non-invasive mode with a central drive), else ``None``."""
    unit_events: UnitEvents | None = None
    """Per-unit events since the previous chunk (``domain.unit_events``), when the request asked for them."""
    joint_angle_deg: NDArray[np.float64] | None = None
    """Wrist angle at ``time_ms`` (° , + flexion), when the run has a joint."""
    joint_torque_nm: NDArray[np.float64] | None = None


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

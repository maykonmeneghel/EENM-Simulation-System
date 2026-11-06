"""Wrist flexion–extension, one degree of freedom (central-layer design §3.5), driven by the stimulated muscle's force.

    I θ'' + B θ' + K θ = r F,   θ > 0 flexion

I, B, K: Davidson & Charles 2017 (full text; de Leva segments, 50th-percentile male; K from Drake & Charles 2014).
r: moment arms of Corie & Charles 2019 (full text; OpenSim upper-limb model, Holzbaur 2005): FCR +14.9 mm, ECR
−11.5 mm (ECRL/ECRB mean). F = the run's force as a fraction of the healthy maximum × the muscle's peak isometric
force (Saul et al. 2015, full text: FCR 407.9 N, ECRL + ECRB 589.8 N). Values in docs/research/*.

What this is not: the force is the isometric twitch-sum force (no force–length or force–velocity), only the
stimulated muscle acts (no antagonist, no tone), and the linear stiffness holds near neutral only (Pando et al. 2014,
abstract: linear error 20–30 % over ≈ 70 % of the range). The angle therefore stops at the limits below, a hard stop
that keeps the drawing physical, not a joint model.

Limits: 54° flexion and 60° extension, the largest wrist angles daily tasks need (Ryu et al. 1991, J Hand Surg Am
16:409, PMID 1861019, abstract). The anatomical maximum is larger and was not verified, so the limits are
configurable and labelled in the app.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.motor_unit_pool import Muscle


@dataclass(frozen=True)
class WristMuscle:
    moment_arm_m: float
    """Positive flexes."""
    peak_force_n: float


WRIST_MUSCLES: dict[Muscle, WristMuscle] = {
    Muscle.FLEXOR_CARPI_RADIALIS: WristMuscle(moment_arm_m=0.0149, peak_force_n=407.9),
    Muscle.EXTENSOR_CARPI_RADIALIS: WristMuscle(moment_arm_m=-0.0115, peak_force_n=589.8),
}


@dataclass(frozen=True)
class WristJoint:
    inertia_kg_m2: float = 0.003
    damping_nms_rad: float = 0.028
    stiffness_nm_rad: float = 0.992
    flexion_limit_deg: float = 54.0
    extension_limit_deg: float = 60.0
    max_substep_ms: float = 0.5
    """Integration substep (the natural period is ≈ 340 ms; 0.5 ms keeps the stop and the damping accurate)."""

    def __post_init__(self) -> None:
        if self.inertia_kg_m2 <= 0 or self.damping_nms_rad < 0 or self.stiffness_nm_rad < 0:
            raise ValueError("inertia must be positive, damping and stiffness non-negative")
        if self.flexion_limit_deg <= 0 or self.extension_limit_deg <= 0:
            raise ValueError("joint limits must be positive")


class WristIntegrator:
    """θ and ω carried across chunks; fed with the torque on the output grid (linear between samples)."""

    def __init__(self, joint: WristJoint, step_ms: float) -> None:
        self._joint = joint
        self._step_s = step_ms / 1000.0
        self._substeps = max(1, math.ceil(step_ms / joint.max_substep_ms))
        self._theta = 0.0
        self._omega = 0.0
        self._last_torque: float | None = None
        self._max = math.radians(joint.flexion_limit_deg)
        self._min = -math.radians(joint.extension_limit_deg)

    def advance(self, torque_nm: NDArray[np.float64]) -> NDArray[np.float64]:
        """Angle (rad) at each sample of ``torque_nm``; the first sample of the run is the rest position."""
        out = np.empty(torque_nm.size)
        j = self._joint
        h = self._step_s / self._substeps
        for i, tau in enumerate(torque_nm):
            previous = float(tau) if self._last_torque is None else self._last_torque
            if self._last_torque is not None:
                for k in range(1, self._substeps + 1):
                    t = previous + (float(tau) - previous) * k / self._substeps
                    # semi-implicit Euler: velocity first, then position with the new velocity
                    alpha = (t - j.damping_nms_rad * self._omega - j.stiffness_nm_rad * self._theta) / j.inertia_kg_m2
                    self._omega += h * alpha
                    self._theta += h * self._omega
                    if self._theta > self._max:
                        self._theta, self._omega = self._max, min(0.0, self._omega)
                    elif self._theta < self._min:
                        self._theta, self._omega = self._min, max(0.0, self._omega)
            self._last_torque = float(tau)
            out[i] = self._theta
        return out


def muscle_torque(muscle: Muscle, force_fraction: NDArray[np.float64]) -> NDArray[np.float64] | None:
    """Torque (N·m) of the stimulated muscle on the wrist, or None when it does not act on it."""
    m = WRIST_MUSCLES.get(muscle)
    if m is None:
        return None
    torque: NDArray[np.float64] = m.moment_arm_m * m.peak_force_n * np.asarray(force_fraction, dtype=np.float64)
    return torque

"""Wrist flexion–extension, one degree of freedom (central-layer design §3.5), driven by the stimulated muscle's force.

    I θ'' + B θ' + M_passive(θ) = r F_iso f_v(v),   θ > 0 flexion,   v = r θ' (fibre shortening, rigid tendon)

I, B: Davidson & Charles 2017 (full text; de Leva segments, 50th-percentile male). B = 0.028 N·m·s/rad also matches
the 0.02–0.03 of a fully relaxed hand cited by the myohaptic instrument study (Sensors 2010;10:3180).
r: moment arms of Corie & Charles 2019 (full text; OpenSim upper-limb model, Holzbaur 2005): FCR +14.9 mm, ECR
−11.5 mm (ECRL/ECRB mean). F_iso = the run's isometric twitch-sum force as a fraction of the healthy maximum × the
muscle's peak isometric force, chosen by ``PeakForce`` (the two sources disagree about threefold).

Force–velocity f_v: Thelen 2003 (J Biomech Eng 125:70) eqs. 6–7 as implemented in OpenSim's ``Thelen2003Muscle``
(opensim-core, read in full), at full activation and optimal length: Vmax = 10 optimal fibre lengths/s, Af = 0.25,
Flen = 1.4 (OpenSim's defaults; the paper's young-adult table, seen only as scraped text, lists Vmax 10 and Flen 1.4).
Optimal fibre lengths: Saul et al. 2015 (full text) FCR 6.3 cm; ECR 7.2 cm = the force-weighted mean of ECRL 8.1 and
ECRB 5.9 cm (derived here). Ignored: tendon compliance, pennation, force–length, and Thelen's slower Vmax at low
activation.

Passive moment M_passive, chosen by ``PassiveModel`` (the two sources disagree):
- LINEAR: K θ, K = 0.992 N·m/rad (Drake & Charles 2014 via Davidson & Charles 2017, full text): measured with small
  perturbations near neutral; over large motions it overstates the passive moment (Pando et al. 2014, abstract).
- END_RANGE: Delp, Grierson & Buchanan 1996 (J Biomech 29:1371, PMID 8884484, abstract): "near zero in the central
  150 degrees", 0.5 N·m at 90° flexion and 1.2 N·m at 90° extension (10 healthy males). Drawn here as zero up to 75°
  and a quadratic rise through those two points: the shape between them is this model's choice, not measured.

Limits: 90° flexion and 90° extension, the angles at which Delp et al. measured the passive moments (abstract); the
anatomical maximum was not verified. At a limit θ is clamped and the velocity into it zeroed (an inelastic stop).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum

import numpy as np
from numpy.typing import NDArray

from eenm_engine.domain.motor_unit_pool import Muscle

SPECIFIC_TENSION_MODEL_N_CM2 = 50.8
"""Specific tension fitted by the upper-limb model's peak forces (Saul et al. 2015, full text)."""
SPECIFIC_TENSION_DIRECT_N_CM2 = 17.1
"""Directly measured in living human gracilis: 171 kPa (Binder-Markey et al. 2023, J Physiol 601:1817, abstract)."""


class PeakForce(StrEnum):
    SAUL_2015 = "SAUL_2015"
    """The upper-limb model's peak isometric forces (FCR 407.9 N, ECRL + ECRB 589.8 N)."""
    DIRECT_SPECIFIC_TENSION = "DIRECT_SPECIFIC_TENSION"
    """The same forces rescaled from 50.8 to the directly measured 17.1 N/cm² (FCR ≈ 137 N, ECR ≈ 199 N)."""


class PassiveModel(StrEnum):
    LINEAR = "LINEAR"
    END_RANGE = "END_RANGE"


@dataclass(frozen=True)
class WristMuscle:
    moment_arm_m: float
    """Positive flexes."""
    peak_force_n: float
    """Saul et al. 2015."""
    optimal_fiber_length_m: float

    def peak_force(self, source: PeakForce) -> float:
        if source is PeakForce.DIRECT_SPECIFIC_TENSION:
            return self.peak_force_n * SPECIFIC_TENSION_DIRECT_N_CM2 / SPECIFIC_TENSION_MODEL_N_CM2
        return self.peak_force_n


WRIST_MUSCLES: dict[Muscle, WristMuscle] = {
    Muscle.FLEXOR_CARPI_RADIALIS: WristMuscle(moment_arm_m=0.0149, peak_force_n=407.9, optimal_fiber_length_m=0.063),
    Muscle.EXTENSOR_CARPI_RADIALIS: WristMuscle(
        moment_arm_m=-0.0115,
        peak_force_n=589.8,
        optimal_fiber_length_m=(337.3 * 0.081 + 252.5 * 0.059) / 589.8,
    ),
}


@dataclass(frozen=True)
class WristOptions:
    """The run's choices where the sources disagree (request ``joint``)."""

    peak_force: PeakForce = PeakForce.SAUL_2015
    passive: PassiveModel = PassiveModel.LINEAR


@dataclass(frozen=True)
class WristJoint:
    inertia_kg_m2: float = 0.003
    damping_nms_rad: float = 0.028
    stiffness_nm_rad: float = 0.992
    """LINEAR passive model."""
    passive: PassiveModel = PassiveModel.LINEAR
    end_range_start_deg: float = 75.0
    """END_RANGE: the passive moment is zero inside ± this angle."""
    flexion_moment_at_90_nm: float = 0.5
    extension_moment_at_90_nm: float = 1.2
    flexion_limit_deg: float = 90.0
    extension_limit_deg: float = 90.0
    max_contraction_velocity: float = 10.0
    """Optimal fibre lengths per second."""
    fv_shape_af: float = 0.25
    fv_max_lengthening: float = 1.4
    max_substep_ms: float = 0.5
    """Integration substep (the natural period is ≈ 340 ms; 0.5 ms keeps the stop, the damping and f_v accurate)."""

    def __post_init__(self) -> None:
        if self.inertia_kg_m2 <= 0 or self.damping_nms_rad < 0 or self.stiffness_nm_rad < 0:
            raise ValueError("inertia must be positive, damping and stiffness non-negative")
        if self.flexion_limit_deg <= 0 or self.extension_limit_deg <= 0:
            raise ValueError("joint limits must be positive")
        if not 0 < self.end_range_start_deg < 90:
            raise ValueError("the end range must start between 0 and 90°")
        if self.max_contraction_velocity <= 0 or self.fv_shape_af <= 0 or self.fv_max_lengthening <= 1:
            raise ValueError("Vmax and Af must be positive and Flen greater than 1")

    def passive_moment(self, theta: float) -> float:
        """Passive moment (N·m) at θ (rad); it opposes the displacement (negative in flexion)."""
        if self.passive is PassiveModel.LINEAR:
            return -self.stiffness_nm_rad * theta
        start = math.radians(self.end_range_start_deg)
        past = abs(theta) - start
        if past <= 0:
            return 0.0
        at_90 = self.flexion_moment_at_90_nm if theta > 0 else self.extension_moment_at_90_nm
        moment = at_90 * (past / (math.pi / 2 - start)) ** 2
        return -moment if theta > 0 else moment

    def force_velocity(self, shortening: float) -> float:
        """f_v at a fibre shortening velocity in Vmax units (negative = lengthening); 1 when isometric."""
        af, flen = self.fv_shape_af, self.fv_max_lengthening
        if shortening >= 0:
            return max(0.0, (1 - shortening) / (1 + shortening / af))
        lengthening = -shortening
        c = (2 + 2 / af) / (flen - 1)
        return (1 + c * flen * lengthening) / (1 + c * lengthening)


@dataclass(frozen=True)
class WristSetup:
    """The wrist a run moves: the joint, the stimulated muscle, its chosen peak force and the options behind them."""

    joint: WristJoint
    muscle: WristMuscle
    peak_force_n: float
    options: WristOptions


def wrist_setup(muscle: Muscle, options: WristOptions) -> WristSetup | None:
    """The run's wrist, or None when the stimulated muscle does not act on it."""
    m = WRIST_MUSCLES.get(muscle)
    if m is None:
        return None
    return WristSetup(WristJoint(passive=options.passive), m, m.peak_force(options.peak_force), options)


class WristIntegrator:
    """θ and ω carried across chunks, from rest at the run's start; fed with the isometric force fraction on the
    output grid (linear between samples)."""

    def __init__(self, setup: WristSetup, step_ms: float) -> None:
        joint, muscle = setup.joint, setup.muscle
        self._joint = joint
        self._muscle = muscle
        self._iso_torque_per_fraction = muscle.moment_arm_m * setup.peak_force_n
        self._vmax_m_s = joint.max_contraction_velocity * muscle.optimal_fiber_length_m
        self._step_s = step_ms / 1000.0
        self._substeps = max(1, math.ceil(step_ms / joint.max_substep_ms))
        self._theta = 0.0
        self._omega = 0.0
        self._last_fraction: float | None = None
        self._max = math.radians(joint.flexion_limit_deg)
        self._min = -math.radians(joint.extension_limit_deg)

    def _muscle_torque(self, fraction: float) -> float:
        shortening = self._muscle.moment_arm_m * self._omega / self._vmax_m_s
        return self._iso_torque_per_fraction * fraction * self._joint.force_velocity(shortening)

    def advance(self, force_fraction: NDArray[np.float64]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """Angle (rad) and muscle torque (N·m) at each sample; the first sample of the run is the rest position."""
        fractions = np.asarray(force_fraction, dtype=np.float64)
        angle = np.empty(fractions.size)
        torque = np.empty(fractions.size)
        j = self._joint
        h = self._step_s / self._substeps
        for i, f in enumerate(fractions):
            f = float(f)
            if self._last_fraction is not None:
                previous = self._last_fraction
                for k in range(1, self._substeps + 1):
                    fk = previous + (f - previous) * k / self._substeps
                    # semi-implicit Euler: velocity first, then position with the new velocity
                    total = self._muscle_torque(fk) + j.passive_moment(self._theta) - j.damping_nms_rad * self._omega
                    self._omega += h * total / j.inertia_kg_m2
                    self._theta += h * self._omega
                    if self._theta > self._max:
                        self._theta, self._omega = self._max, min(0.0, self._omega)
                    elif self._theta < self._min:
                        self._theta, self._omega = self._min, max(0.0, self._omega)
            self._last_fraction = f
            angle[i] = self._theta
            torque[i] = self._muscle_torque(f)
        return angle, torque

package com.meneghel.eenm.simulationapi.domain.simulation;

/** Passive moment of the wrist (engine {@code domain/wrist_joint.py}; the two sources disagree). */
public enum WristPassiveModel {
    /** Linear stiffness 0.992 N·m/rad, measured with small perturbations (Drake &amp; Charles 2014). */
    LINEAR,
    /** Near zero inside ±75°, rising to 0.5 / 1.2 N·m at 90° flexion / extension (Delp et al. 1996). */
    END_RANGE
}

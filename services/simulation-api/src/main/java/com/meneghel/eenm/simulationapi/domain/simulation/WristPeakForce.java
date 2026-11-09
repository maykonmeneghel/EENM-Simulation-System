package com.meneghel.eenm.simulationapi.domain.simulation;

/** Peak isometric force of the wrist muscle (engine {@code domain/wrist_joint.py}; the two sources disagree ≈ 3×). */
public enum WristPeakForce {
    /** The upper-limb model's forces (Saul et al. 2015): FCR 407.9 N, ECRL + ECRB 589.8 N. */
    SAUL_2015,
    /** The same forces rescaled from 50.8 to the directly measured 17.1 N/cm² (Binder-Markey et al. 2023). */
    DIRECT_SPECIFIC_TENSION
}

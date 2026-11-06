package com.meneghel.eenm.simulationapi.domain.event;

/** Constants of the 1-DOF wrist the stimulated muscle moves (engine {@code domain/wrist_joint.py}, sources there). */
public record WristJoint(double momentArmMm, double peakForceN, double inertiaKgM2, double dampingNmsRad,
        double stiffnessNmRad, double flexionLimitDeg, double extensionLimitDeg) {
}

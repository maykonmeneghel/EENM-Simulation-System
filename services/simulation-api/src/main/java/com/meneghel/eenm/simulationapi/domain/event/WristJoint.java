package com.meneghel.eenm.simulationapi.domain.event;

/**
 * Constants of the 1-DOF wrist the stimulated muscle moves (engine {@code domain/wrist_joint.py}, sources there).
 * {@code peakForceN} is the chosen source's ({@code peakForceSource}); {@code passive} names the passive model
 * ({@code LINEAR}: {@code stiffnessNmRad}; {@code END_RANGE}: zero inside {@code endRangeStartDeg}, then rising to the
 * moments at 90°). Force–velocity: Vmax in optimal fibre lengths per second, Af, Flen (Thelen 2003).
 */
public record WristJoint(double momentArmMm, double peakForceN, String peakForceSource, double optimalFiberLengthMm,
        double maxContractionVelocity, double fvShapeAf, double fvMaxLengthening, double inertiaKgM2,
        double dampingNmsRad, String passive, double stiffnessNmRad, double endRangeStartDeg,
        double flexionMomentAt90Nm, double extensionMomentAt90Nm, double flexionLimitDeg, double extensionLimitDeg) {
}

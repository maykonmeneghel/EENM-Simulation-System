package com.meneghel.eenm.simulationapi.domain.event;

import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import java.util.Objects;

public record SimulationStarted(
        String simulationId,
        double durationMs,
        double outputStepMs,
        MotorUnitCounts motorUnits,
        String muscle,
        Double maxForce,
        Double electrodeFraction,
        UnitAnatomy units,
        Double stepMs,
        WristJoint joint) implements SimulationEvent {
    // maxForce: the healthy muscle's maximal force (force / maxForce = fraction of maximum); null for ORIGINAL.
    // electrodeFraction: electrode position along the axon from the soma, null when the stimulus goes into the soma.
    // units: per-unit geometry for the 3D view; null from an engine older than the field.

    public static final String TYPE = "started";

    public SimulationStarted(String simulationId, double durationMs, double outputStepMs, MotorUnitCounts motorUnits,
            String muscle, Double maxForce, Double electrodeFraction, UnitAnatomy units) {
        this(simulationId, durationMs, outputStepMs, motorUnits, muscle, maxForce, electrodeFraction, units, null, null);
    }

    public SimulationStarted {
        Objects.requireNonNull(simulationId, "simulationId");
        Objects.requireNonNull(motorUnits, "motorUnits");
        Objects.requireNonNull(muscle, "muscle");
    }

    @Override
    public String type() {
        return TYPE;
    }
}

package com.meneghel.eenm.simulationapi.domain.event;

import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import java.util.Objects;

public record SimulationStarted(
        String simulationId,
        double durationMs,
        double outputStepMs,
        MotorUnitCounts motorUnits,
        String muscle) implements SimulationEvent {

    public static final String TYPE = "started";

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

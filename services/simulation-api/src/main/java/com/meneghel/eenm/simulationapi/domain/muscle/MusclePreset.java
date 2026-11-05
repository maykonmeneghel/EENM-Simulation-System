package com.meneghel.eenm.simulationapi.domain.muscle;

import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import java.util.Objects;

/**
 * A muscle the engine can simulate, with the size of its motor-unit pool per fibre type.
 */
public record MusclePreset(String id, String label, MotorUnitCounts poolSize) {

    public MusclePreset {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(label, "label");
        Objects.requireNonNull(poolSize, "poolSize");
    }
}

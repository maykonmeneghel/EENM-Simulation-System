package com.meneghel.eenm.simulationapi.domain.muscle;

import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import java.util.List;
import java.util.Objects;

/**
 * A muscle the engine can simulate, with the size of its motor-unit pool per fibre type and where each value of the
 * preset comes from (empty for the original model's leg presets).
 */
public record MusclePreset(String id, String label, MotorUnitCounts poolSize, List<PresetFieldSource> provenance) {

    public MusclePreset {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(label, "label");
        Objects.requireNonNull(poolSize, "poolSize");
        provenance = provenance == null ? List.of() : List.copyOf(provenance);
    }

    public MusclePreset(String id, String label, MotorUnitCounts poolSize) {
        this(id, label, poolSize, List.of());
    }
}

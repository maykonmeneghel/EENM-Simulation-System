package com.meneghel.eenm.simulationapi.web.muscle;

import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.web.simulation.MotorUnitCountsPayload;

public record MusclePresetDto(String id, String label, MotorUnitCountsPayload poolSize) {

    public static MusclePresetDto from(MusclePreset preset) {
        return new MusclePresetDto(preset.id(), preset.label(), MotorUnitCountsPayload.from(preset.poolSize()));
    }
}

package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.application.simulation.ModulationDraft;
import com.meneghel.eenm.simulationapi.application.simulation.MotorUnitCountsDraft;
import com.meneghel.eenm.simulationapi.application.simulation.SimulationDraft;
import com.meneghel.eenm.simulationapi.application.simulation.StimulusDraft;

final class SimulationRequestDtoMapper {

    SimulationDraft toDraft(SimulationRequestDto dto) {
        if (dto == null) {
            return SimulationDraft.empty();
        }
        return new SimulationDraft(
                toDraft(dto.stimulus()),
                dto.modelVariant(),
                dto.calibrationTarget(),
                dto.stimulationSite(),
                dto.condition(),
                dto.conditionAdjustments(),
                dto.muscle(),
                toDraft(dto.unitsPerType()),
                dto.axonLengthPercent(),
                dto.temperatureCelsius(),
                dto.injectionSite(),
                dto.somaGeometry(),
                dto.dendriteGeometry(),
                dto.seed(),
                dto.outputStepMs(),
                dto.centralDrive() == null ? null : dto.centralDrive().toDomain());
    }

    private StimulusDraft toDraft(StimulusDto dto) {
        if (dto == null) {
            return null;
        }
        return new StimulusDraft(dto.durationMs(), dto.stepMs(), dto.frequencyHz(), dto.dutyCyclePercent(),
                dto.amplitude(), dto.waveform(), toDraft(dto.modulation()), dto.trainOnMs(), dto.trainPeriodMs(),
                dto.pulseWidthUs(), dto.rampUpMs(), dto.rampDownMs());
    }

    private ModulationDraft toDraft(ModulationDto dto) {
        return dto == null ? null : new ModulationDraft(dto.target(), dto.shape(), dto.peakTimeMs());
    }

    private MotorUnitCountsDraft toDraft(UnitsPerTypeDto dto) {
        return dto == null ? null : new MotorUnitCountsDraft(dto.S(), dto.FR(), dto.FF());
    }
}

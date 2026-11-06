package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.meneghel.eenm.simulationapi.domain.simulation.CentralDrive;
import com.meneghel.eenm.simulationapi.domain.simulation.Modulation;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.Stimulus;

final class EngineRequestMapper {

    EngineSimulationRequestBody toBody(SimulationRequest request) {
        return new EngineSimulationRequestBody(
                toBody(request.stimulus()),
                request.modelVariant().name(),
                request.calibrationTarget().name(),
                request.stimulationSite().name(),
                request.condition().name(),
                request.conditionAdjustments(),
                request.muscle().name(),
                request.requestedUnits().map(this::toBody).orElse(null),
                request.axonLengthPercent(),
                request.temperatureCelsius(),
                request.injectionSite().name(),
                request.somaGeometry().name(),
                request.dendriteGeometry().name(),
                request.seed(),
                request.outputStepMs(),
                toBody(request.centralDrive()));
    }

    private EngineSimulationRequestBody.CentralDrive toBody(CentralDrive drive) {
        if (drive == null) {
            return null;
        }
        CentralDrive.Tremor t = drive.tremor();
        return new EngineSimulationRequestBody.CentralDrive(drive.enabled(), drive.backgroundNa(), drive.voluntaryNa(),
                drive.noiseCv(), drive.currentScale() == null ? null : drive.currentScale().name(),
                drive.thresholdRule() == null ? null : drive.thresholdRule().name(),
                t == null ? null : new EngineSimulationRequestBody.Tremor(t.frequencyHz(), t.amplitudeNa()),
                drive.electrodeFraction());
    }

    private EngineSimulationRequestBody.Stimulus toBody(Stimulus stimulus) {
        return new EngineSimulationRequestBody.Stimulus(
                stimulus.durationMs(),
                stimulus.stepMs(),
                stimulus.frequencyHz(),
                stimulus.dutyCyclePercent(),
                stimulus.amplitude(),
                stimulus.waveform().name(),
                toBody(stimulus.modulation()),
                stimulus.trainOnMs(),
                stimulus.trainPeriodMs(),
                stimulus.pulseWidthUs(),
                stimulus.rampUpMs(),
                stimulus.rampDownMs());
    }

    private EngineSimulationRequestBody.Modulation toBody(Modulation modulation) {
        return new EngineSimulationRequestBody.Modulation(
                modulation.target().name(), modulation.shape().name(), modulation.peakTimeMs());
    }

    private EngineSimulationRequestBody.UnitCounts toBody(MotorUnitCounts units) {
        return new EngineSimulationRequestBody.UnitCounts(units.slow(), units.fastResistant(), units.fastFatigable());
    }
}

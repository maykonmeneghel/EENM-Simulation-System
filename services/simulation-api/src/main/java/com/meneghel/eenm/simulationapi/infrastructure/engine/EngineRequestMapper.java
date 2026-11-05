package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.meneghel.eenm.simulationapi.domain.simulation.Modulation;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.Stimulus;

final class EngineRequestMapper {

    EngineSimulationRequestBody toBody(SimulationRequest request) {
        return new EngineSimulationRequestBody(
                toBody(request.stimulus()),
                request.muscle().name(),
                toBody(request.unitsPerType()),
                request.axonLengthPercent(),
                request.temperatureCelsius(),
                request.injectionSite().name(),
                request.somaGeometry().name(),
                request.dendriteGeometry().name(),
                request.seed(),
                request.outputStepMs());
    }

    private EngineSimulationRequestBody.Stimulus toBody(Stimulus stimulus) {
        return new EngineSimulationRequestBody.Stimulus(
                stimulus.durationMs(),
                stimulus.stepMs(),
                stimulus.frequencyHz(),
                stimulus.dutyCyclePercent(),
                stimulus.amplitude(),
                stimulus.waveform().name(),
                toBody(stimulus.modulation()));
    }

    private EngineSimulationRequestBody.Modulation toBody(Modulation modulation) {
        return new EngineSimulationRequestBody.Modulation(
                modulation.target().name(), modulation.shape().name(), modulation.peakTimeMs());
    }

    private EngineSimulationRequestBody.UnitCounts toBody(MotorUnitCounts units) {
        return new EngineSimulationRequestBody.UnitCounts(units.slow(), units.fastResistant(), units.fastFatigable());
    }
}

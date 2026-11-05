package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * JSON body of {@code POST /v1/simulations/stream}, mirroring the shared {@code SimulationRequest}.
 * {@code unitsPerType} is left out when unset so the engine applies its variant default.
 */
record EngineSimulationRequestBody(
        Stimulus stimulus,
        String modelVariant,
        String calibrationTarget,
        String muscle,
        @JsonInclude(JsonInclude.Include.NON_NULL) UnitCounts unitsPerType,
        double axonLengthPercent,
        double temperatureCelsius,
        String injectionSite,
        String somaGeometry,
        String dendriteGeometry,
        long seed,
        double outputStepMs) {

    record Stimulus(
            double durationMs,
            double stepMs,
            double frequencyHz,
            double dutyCyclePercent,
            double amplitude,
            String waveform,
            Modulation modulation,
            Double trainOnMs,
            Double trainPeriodMs) {
    }

    record Modulation(String target, String shape, Double peakTimeMs) {
    }

    record UnitCounts(
            @JsonProperty("S") int slow,
            @JsonProperty("FR") int fastResistant,
            @JsonProperty("FF") int fastFatigable) {
    }
}

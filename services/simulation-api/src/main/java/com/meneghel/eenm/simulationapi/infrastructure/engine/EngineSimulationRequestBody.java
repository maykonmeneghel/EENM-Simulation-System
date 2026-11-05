package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.fasterxml.jackson.annotation.JsonProperty;

/** JSON body of {@code POST /v1/simulations/stream}, mirroring the shared {@code SimulationRequest}. */
record EngineSimulationRequestBody(
        Stimulus stimulus,
        String muscle,
        UnitCounts unitsPerType,
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
            Modulation modulation) {
    }

    record Modulation(String target, String shape, Double peakTimeMs) {
    }

    record UnitCounts(
            @JsonProperty("S") int slow,
            @JsonProperty("FR") int fastResistant,
            @JsonProperty("FF") int fastFatigable) {
    }
}

package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * JSON body of {@code POST /v1/simulations/stream}, mirroring the shared {@code SimulationRequest}.
 * {@code unitsPerType} is left out when unset so the engine applies its variant default.
 */
record EngineSimulationRequestBody(
        Stimulus stimulus,
        String modelVariant,
        String calibrationTarget,
        String stimulationSite,
        String condition,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<String> conditionAdjustments,
        String muscle,
        @JsonInclude(JsonInclude.Include.NON_NULL) UnitCounts unitsPerType,
        double axonLengthPercent,
        double temperatureCelsius,
        String injectionSite,
        String somaGeometry,
        String dendriteGeometry,
        long seed,
        double outputStepMs,
        @JsonInclude(JsonInclude.Include.NON_NULL) CentralDrive centralDrive,
        @JsonInclude(JsonInclude.Include.NON_NULL) Output output,
        Joint joint,
        @JsonInclude(JsonInclude.Include.NON_NULL) Electrode electrode) {

    EngineSimulationRequestBody(Stimulus stimulus, String modelVariant, String calibrationTarget,
            String stimulationSite, String condition, List<String> conditionAdjustments, String muscle,
            UnitCounts unitsPerType, double axonLengthPercent, double temperatureCelsius, String injectionSite,
            String somaGeometry, String dendriteGeometry, long seed, double outputStepMs, CentralDrive centralDrive,
            Output output, Joint joint) {
        this(stimulus, modelVariant, calibrationTarget, stimulationSite, condition, conditionAdjustments, muscle,
                unitsPerType, axonLengthPercent, temperatureCelsius, injectionSite, somaGeometry, dendriteGeometry, seed,
                outputStepMs, centralDrive, output, joint, null);
    }

    /** Unset fields are left out, so the engine applies the muscle's default electrode and effect. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Electrode(String shape, Double widthCm, Double lengthCm, Double diameterCm, Double fatThicknessCm,
            Double axonDepthCm, String effectModel, Calibration calibration) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Calibration(Double motorThresholdMa, Double fullRecruitmentMa, Double pulseWidthUs,
            Double electrodeAreaCm2) {
    }

    record Output(boolean unitEvents) {
    }

    record Joint(String peakForce, String passive) {
    }

    record Stimulus(
            double durationMs,
            double stepMs,
            double frequencyHz,
            double dutyCyclePercent,
            double amplitude,
            String waveform,
            Modulation modulation,
            Double trainOnMs,
            Double trainPeriodMs,
            @JsonInclude(JsonInclude.Include.NON_NULL) Double pulseWidthUs,
            double rampUpMs,
            double rampDownMs) {
    }

    record Modulation(String target, String shape, Double peakTimeMs) {
    }

    /** Unset fields are left out, so the engine applies its defaults. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record CentralDrive(Boolean enabled, Double backgroundNa, Double voluntaryNa, Double noiseCv, String currentScale,
            String thresholdRule, Tremor tremor, Double electrodeFraction) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Tremor(Double frequencyHz, Double amplitudeNa) {
    }

    record UnitCounts(
            @JsonProperty("S") int slow,
            @JsonProperty("FR") int fastResistant,
            @JsonProperty("FF") int fastFatigable) {
    }
}

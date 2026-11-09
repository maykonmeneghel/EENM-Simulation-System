package com.meneghel.eenm.simulationapi.domain.simulation;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * A resolved simulation request: defaults already applied. The only value that may stay unset is
 * {@code unitsPerType} ({@code null}), meaning the engine chooses the units (the {@code LITERATURE}
 * default of 120 units in the pool's proportions).
 */
public record SimulationRequest(
        Stimulus stimulus,
        ModelVariant modelVariant,
        CalibrationTarget calibrationTarget,
        StimulationSite stimulationSite,
        Condition condition,
        List<String> conditionAdjustments,
        Muscle muscle,
        MotorUnitCounts unitsPerType,
        double axonLengthPercent,
        double temperatureCelsius,
        InjectionSite injectionSite,
        CompartmentGeometry somaGeometry,
        CompartmentGeometry dendriteGeometry,
        long seed,
        double outputStepMs,
        CentralDrive centralDrive,
        boolean unitEvents,
        WristOptions wrist) {
    // centralDrive: null = none (the engine's default). unitEvents: stream the 3D replay's per-unit events.
    // wrist: the wrist model's choices (forearm runs; ignored by the engine for the leg muscles).

    /** Maximum simulated time with {@code unitEvents} (the engine's limit; docs/design/3d-view.md §5.2). */
    public static final double MAX_UNIT_EVENTS_DURATION_MS = 30_000;

    public SimulationRequest(Stimulus stimulus, ModelVariant modelVariant, CalibrationTarget calibrationTarget,
            StimulationSite stimulationSite, Condition condition, List<String> conditionAdjustments, Muscle muscle,
            MotorUnitCounts unitsPerType, double axonLengthPercent, double temperatureCelsius,
            InjectionSite injectionSite, CompartmentGeometry somaGeometry, CompartmentGeometry dendriteGeometry,
            long seed, double outputStepMs, CentralDrive centralDrive) {
        this(stimulus, modelVariant, calibrationTarget, stimulationSite, condition, conditionAdjustments, muscle,
                unitsPerType, axonLengthPercent, temperatureCelsius, injectionSite, somaGeometry, dendriteGeometry,
                seed, outputStepMs, centralDrive, false);
    }

    public SimulationRequest(Stimulus stimulus, ModelVariant modelVariant, CalibrationTarget calibrationTarget,
            StimulationSite stimulationSite, Condition condition, List<String> conditionAdjustments, Muscle muscle,
            MotorUnitCounts unitsPerType, double axonLengthPercent, double temperatureCelsius,
            InjectionSite injectionSite, CompartmentGeometry somaGeometry, CompartmentGeometry dendriteGeometry,
            long seed, double outputStepMs, CentralDrive centralDrive, boolean unitEvents) {
        this(stimulus, modelVariant, calibrationTarget, stimulationSite, condition, conditionAdjustments, muscle,
                unitsPerType, axonLengthPercent, temperatureCelsius, injectionSite, somaGeometry, dendriteGeometry,
                seed, outputStepMs, centralDrive, unitEvents, WristOptions.DEFAULT);
    }

    public SimulationRequest {
        Objects.requireNonNull(stimulus, "stimulus");
        Objects.requireNonNull(modelVariant, "modelVariant");
        Objects.requireNonNull(calibrationTarget, "calibrationTarget");
        Objects.requireNonNull(stimulationSite, "stimulationSite");
        Objects.requireNonNull(condition, "condition");
        conditionAdjustments = conditionAdjustments == null ? null : List.copyOf(conditionAdjustments);
        Objects.requireNonNull(muscle, "muscle");
        Objects.requireNonNull(injectionSite, "injectionSite");
        Objects.requireNonNull(somaGeometry, "somaGeometry");
        Objects.requireNonNull(dendriteGeometry, "dendriteGeometry");
        Objects.requireNonNull(wrist, "wrist");
    }

    /** The requested units, or empty when the engine chooses them. */
    public Optional<MotorUnitCounts> requestedUnits() {
        return Optional.ofNullable(unitsPerType);
    }
}

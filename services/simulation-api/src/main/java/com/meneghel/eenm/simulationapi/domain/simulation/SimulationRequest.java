package com.meneghel.eenm.simulationapi.domain.simulation;

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
        Muscle muscle,
        MotorUnitCounts unitsPerType,
        double axonLengthPercent,
        double temperatureCelsius,
        InjectionSite injectionSite,
        CompartmentGeometry somaGeometry,
        CompartmentGeometry dendriteGeometry,
        long seed,
        double outputStepMs) {

    public SimulationRequest {
        Objects.requireNonNull(stimulus, "stimulus");
        Objects.requireNonNull(modelVariant, "modelVariant");
        Objects.requireNonNull(muscle, "muscle");
        Objects.requireNonNull(injectionSite, "injectionSite");
        Objects.requireNonNull(somaGeometry, "somaGeometry");
        Objects.requireNonNull(dendriteGeometry, "dendriteGeometry");
    }

    /** The requested units, or empty when the engine chooses them. */
    public Optional<MotorUnitCounts> requestedUnits() {
        return Optional.ofNullable(unitsPerType);
    }
}

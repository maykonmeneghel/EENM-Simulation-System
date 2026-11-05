package com.meneghel.eenm.simulationapi.domain.simulation;

import java.util.Objects;

/**
 * A fully resolved simulation request: every value is present (defaults already applied).
 */
public record SimulationRequest(
        Stimulus stimulus,
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
        Objects.requireNonNull(muscle, "muscle");
        Objects.requireNonNull(unitsPerType, "unitsPerType");
        Objects.requireNonNull(injectionSite, "injectionSite");
        Objects.requireNonNull(somaGeometry, "somaGeometry");
        Objects.requireNonNull(dendriteGeometry, "dendriteGeometry");
    }
}

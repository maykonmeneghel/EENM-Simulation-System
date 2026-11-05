package com.meneghel.eenm.simulationapi.domain.simulation;

import java.util.Objects;

/**
 * How the stimulus is modulated over time. {@code peakTimeMs} is only meaningful for
 * {@link ModulationShape#TRIANGLE} and may be {@code null} otherwise.
 */
public record Modulation(ModulationTarget target, ModulationShape shape, Double peakTimeMs) {

    public Modulation {
        Objects.requireNonNull(target, "target");
        Objects.requireNonNull(shape, "shape");
    }
}

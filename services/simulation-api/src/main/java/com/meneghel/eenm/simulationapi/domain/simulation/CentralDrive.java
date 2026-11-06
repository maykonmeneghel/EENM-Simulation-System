package com.meneghel.eenm.simulationapi.domain.simulation;

/**
 * Descending drive into the motoneurons (LITERATURE only); every field optional, the engine applies its defaults.
 * The tremor is applied only with Parkinson's {@code PD_TREMOR} adjustment.
 */
public record CentralDrive(
        Boolean enabled,
        Double backgroundNa,
        Double voluntaryNa,
        Double noiseCv,
        CurrentScale currentScale,
        Tremor tremor,
        Double electrodeFraction) {

    /** Sinusoidal tremor oscillator common to every motoneuron. */
    public record Tremor(Double frequencyHz, Double amplitudeNa) {
    }

    /** Currents as published (Gallego 2015), or rescaled by the ratio of the smallest rheobases. */
    public enum CurrentScale {
        PUBLISHED,
        RHEOBASE
    }
}

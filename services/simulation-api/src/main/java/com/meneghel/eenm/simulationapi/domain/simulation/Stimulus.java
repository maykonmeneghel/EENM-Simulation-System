package com.meneghel.eenm.simulationapi.domain.simulation;

import java.util.Objects;

/**
 * The stimulation protocol. {@code trainOnMs} and {@code trainPeriodMs} describe intermittent trains
 * (pulses only during the first {@code trainOnMs} of every {@code trainPeriodMs}); both are {@code null}
 * for continuous stimulation.
 */
public record Stimulus(
        double durationMs,
        double stepMs,
        double frequencyHz,
        double dutyCyclePercent,
        double amplitude,
        Waveform waveform,
        Modulation modulation,
        Double trainOnMs,
        Double trainPeriodMs) {

    public Stimulus {
        Objects.requireNonNull(waveform, "waveform");
        Objects.requireNonNull(modulation, "modulation");
    }
}

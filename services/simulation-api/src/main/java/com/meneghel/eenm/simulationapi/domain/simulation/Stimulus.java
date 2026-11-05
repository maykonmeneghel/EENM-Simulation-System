package com.meneghel.eenm.simulationapi.domain.simulation;

import java.util.Objects;

/**
 * The stimulation protocol. {@code trainOnMs} and {@code trainPeriodMs} describe intermittent trains
 * (pulses only during the first {@code trainOnMs} of every {@code trainPeriodMs}); both are {@code null}
 * for continuous stimulation. {@code pulseWidthUs} (stimulator mode, {@code null} = use the duty cycle) sets the
 * pulse width independently of the frequency; {@code rampUpMs} / {@code rampDownMs} ramp the amplitude at the start
 * and end of every train (of the whole run without trains).
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
        Double trainPeriodMs,
        Double pulseWidthUs,
        double rampUpMs,
        double rampDownMs) {

    public Stimulus {
        Objects.requireNonNull(waveform, "waveform");
        Objects.requireNonNull(modulation, "modulation");
    }

    /** Length of one train, or of the whole run without trains. */
    public double onTimeMs() {
        return trainOnMs != null ? trainOnMs : durationMs;
    }
}

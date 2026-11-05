package com.meneghel.eenm.simulationapi.domain.simulation;

import java.util.Objects;

public record Stimulus(
        double durationMs,
        double stepMs,
        double frequencyHz,
        double dutyCyclePercent,
        double amplitude,
        Waveform waveform,
        Modulation modulation) {

    public Stimulus {
        Objects.requireNonNull(waveform, "waveform");
        Objects.requireNonNull(modulation, "modulation");
    }
}

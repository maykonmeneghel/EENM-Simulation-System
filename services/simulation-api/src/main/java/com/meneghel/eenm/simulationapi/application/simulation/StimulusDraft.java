package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.Waveform;

/** Stimulus as received; any field may be {@code null}. */
public record StimulusDraft(
        Double durationMs,
        Double stepMs,
        Double frequencyHz,
        Double dutyCyclePercent,
        Double amplitude,
        Waveform waveform,
        ModulationDraft modulation,
        Double trainOnMs,
        Double trainPeriodMs,
        Double pulseWidthUs,
        Double rampUpMs,
        Double rampDownMs) {

    public static StimulusDraft empty() {
        return new StimulusDraft(null, null, null, null, null, null, null, null, null, null, null, null);
    }
}

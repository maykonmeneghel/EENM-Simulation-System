package com.meneghel.eenm.simulationapi.support;

import com.meneghel.eenm.simulationapi.application.simulation.ModulationDraft;
import com.meneghel.eenm.simulationapi.application.simulation.MotorUnitCountsDraft;
import com.meneghel.eenm.simulationapi.application.simulation.SimulationDraft;
import com.meneghel.eenm.simulationapi.application.simulation.StimulusDraft;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.Waveform;

/** Short constructors for the drafts used in tests; unnamed fields stay {@code null}. */
public final class Drafts {

    private Drafts() {
    }

    public static SimulationDraft draft(StimulusDraft stimulus, ModelVariant variant, MotorUnitCountsDraft units,
            Double outputStepMs) {
        return new SimulationDraft(stimulus, variant, null, null, null, null, null, units, null, null, null, null, null, null,
                outputStepMs, null);
    }

    public static SimulationDraft stimulusOnly(StimulusDraft stimulus) {
        return draft(stimulus, null, null, null);
    }

    public static SimulationDraft variant(ModelVariant variant, MotorUnitCountsDraft units) {
        return draft(null, variant, units, null);
    }

    public static StimulusDraft stimulus(Double durationMs, Double stepMs, ModulationDraft modulation) {
        return new StimulusDraft(durationMs, stepMs, null, null, null, null, modulation, null, null, null, null, null);
    }

    /** Stimulator mode: frequency, pulse width (µs), waveform, trains and ramps; other fields default. */
    public static StimulusDraft stimulator(Double frequencyHz, Double pulseWidthUs, Waveform waveform, Double trainOnMs,
            Double trainPeriodMs, Double rampUpMs, Double rampDownMs) {
        return new StimulusDraft(10000.0, null, frequencyHz, null, null, waveform, null, trainOnMs, trainPeriodMs,
                pulseWidthUs, rampUpMs, rampDownMs);
    }

    public static StimulusDraft trains(Double durationMs, Double trainOnMs, Double trainPeriodMs) {
        return new StimulusDraft(durationMs, null, null, null, null, null, null, trainOnMs, trainPeriodMs, null, null,
                null);
    }
}

package com.meneghel.eenm.simulationapi.support;

import com.meneghel.eenm.simulationapi.application.simulation.ModulationDraft;
import com.meneghel.eenm.simulationapi.application.simulation.MotorUnitCountsDraft;
import com.meneghel.eenm.simulationapi.application.simulation.SimulationDraft;
import com.meneghel.eenm.simulationapi.application.simulation.StimulusDraft;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;

/** Short constructors for the drafts used in tests; unnamed fields stay {@code null}. */
public final class Drafts {

    private Drafts() {
    }

    public static SimulationDraft draft(StimulusDraft stimulus, ModelVariant variant, MotorUnitCountsDraft units,
            Double outputStepMs) {
        return new SimulationDraft(stimulus, variant, null, null, units, null, null, null, null, null, null, outputStepMs);
    }

    public static SimulationDraft stimulusOnly(StimulusDraft stimulus) {
        return draft(stimulus, null, null, null);
    }

    public static SimulationDraft variant(ModelVariant variant, MotorUnitCountsDraft units) {
        return draft(null, variant, units, null);
    }

    public static StimulusDraft stimulus(Double durationMs, Double stepMs, ModulationDraft modulation) {
        return new StimulusDraft(durationMs, stepMs, null, null, null, null, modulation, null, null);
    }

    public static StimulusDraft trains(Double durationMs, Double trainOnMs, Double trainPeriodMs) {
        return new StimulusDraft(durationMs, null, null, null, null, null, null, trainOnMs, trainPeriodMs);
    }
}

package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationTarget;

/** Modulation as received; any field may be {@code null}. */
public record ModulationDraft(ModulationTarget target, ModulationShape shape, Double peakTimeMs) {
}

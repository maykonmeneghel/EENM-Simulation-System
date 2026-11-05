package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationTarget;

public record ModulationDto(ModulationTarget target, ModulationShape shape, Double peakTimeMs) {
}

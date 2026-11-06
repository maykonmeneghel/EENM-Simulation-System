package com.meneghel.eenm.simulationapi.application.condition;

import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import reactor.core.publisher.Mono;

/**
 * Relays the engine's catalog of conditions and adjustments verbatim (JSON): the engine owns the adjustments, their
 * effects and their sources, so the API does not duplicate them.
 */
public final class ListConditionsUseCase {

    private final SimulationEngine engine;

    public ListConditionsUseCase(SimulationEngine engine) {
        this.engine = engine;
    }

    public Mono<String> catalogJson() {
        return engine.conditionCatalogJson();
    }
}

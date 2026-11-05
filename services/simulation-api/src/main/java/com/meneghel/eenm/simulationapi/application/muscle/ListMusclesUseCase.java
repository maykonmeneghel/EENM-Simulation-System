package com.meneghel.eenm.simulationapi.application.muscle;

import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import java.util.List;
import reactor.core.publisher.Mono;

/** Relays the engine's muscle presets. */
public final class ListMusclesUseCase {

    private final SimulationEngine engine;

    public ListMusclesUseCase(SimulationEngine engine) {
        this.engine = engine;
    }

    public Mono<List<MusclePreset>> list() {
        return engine.listMuscles();
    }
}

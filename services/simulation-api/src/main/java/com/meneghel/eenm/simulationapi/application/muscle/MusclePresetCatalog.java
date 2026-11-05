package com.meneghel.eenm.simulationapi.application.muscle;

import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import reactor.core.publisher.Mono;

/**
 * Muscle presets used to validate pool sizes. Successful answers are cached for {@code timeToLive};
 * failures are not cached, so the next request asks the engine again.
 */
public final class MusclePresetCatalog {

    private final Mono<List<MusclePreset>> presets;

    public MusclePresetCatalog(SimulationEngine engine, Duration timeToLive) {
        this.presets = Mono.defer(engine::listMuscles)
                .cache(list -> timeToLive, error -> Duration.ZERO, () -> Duration.ZERO);
    }

    public Mono<Optional<MusclePreset>> find(Muscle muscle) {
        return presets.map(list -> list.stream()
                .filter(preset -> preset.id().equals(muscle.name()))
                .findFirst());
    }
}

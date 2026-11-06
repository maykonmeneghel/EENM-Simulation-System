package com.meneghel.eenm.simulationapi.application.port;

import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.language.Language;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import java.util.List;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Output port to the simulation engine that computes the model.
 *
 * <p>Implementations signal {@link EngineUnavailableException} when the engine cannot be reached or
 * fails, {@link EngineProtocolException} when it answers something that breaks the stream contract and
 * {@link EngineRejectedRequestException} when it refuses the request body.
 */
public interface SimulationEngine {

    /** Streams the events of one simulation, in order, as the engine produces them. */
    Flux<SimulationEvent> stream(SimulationRequest request);

    /** Lists the muscles the engine can simulate, with their texts in {@code language}. */
    Mono<List<MusclePreset>> listMuscles(Language language);

    /** The engine's catalog of conditions and their adjustments in {@code language}, as the JSON it sends. */
    Mono<String> conditionCatalogJson(Language language);
}

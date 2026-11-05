package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.event.SimulationFailed;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Enforces the stream contract on the events coming from the engine.
 *
 * <ul>
 *   <li>Before the first event, failures propagate as errors so the caller can still answer with an
 *       HTTP error status.</li>
 *   <li>After the first event, failures become a terminal {@link SimulationFailed} event.</li>
 *   <li>The stream ends right after the first terminal event; if the engine closes it without one, a
 *       {@link SimulationFailed} event is appended.</li>
 * </ul>
 */
final class EventStreamGuard {

    private EventStreamGuard() {
    }

    static Flux<SimulationEvent> guard(Flux<SimulationEvent> upstream) {
        return Flux.defer(() -> {
            StreamProgress progress = new StreamProgress();
            return upstream
                    .takeUntil(SimulationEvent::isTerminal)
                    .onErrorResume(error -> progress.hasStarted() ? Mono.just(toFailure(error)) : Mono.error(error))
                    .doOnNext(progress::record)
                    .concatWith(Mono.defer(progress::closingEvent));
        });
    }

    static SimulationFailed toFailure(Throwable error) {
        if (error instanceof EngineUnavailableException) {
            return new SimulationFailed("The simulation engine became unavailable", SimulationFailed.ENGINE_UNAVAILABLE);
        }
        return new SimulationFailed("The simulation engine failed: " + error.getMessage(), SimulationFailed.ENGINE_FAILURE);
    }
}

package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.event.SimulationFailed;
import reactor.core.publisher.Mono;

/** Tracks what one simulation stream has emitted so far. */
final class StreamProgress {

    private boolean started;
    private boolean terminated;

    void record(SimulationEvent event) {
        started = true;
        terminated = terminated || event.isTerminal();
    }

    boolean hasStarted() {
        return started;
    }

    Mono<SimulationEvent> closingEvent() {
        if (!started) {
            return Mono.error(new EngineProtocolException("The engine closed the stream without sending any event"));
        }
        if (terminated) {
            return Mono.empty();
        }
        return Mono.just(new SimulationFailed(
                "The simulation engine closed the stream before the simulation finished",
                SimulationFailed.ENGINE_FAILURE));
    }
}

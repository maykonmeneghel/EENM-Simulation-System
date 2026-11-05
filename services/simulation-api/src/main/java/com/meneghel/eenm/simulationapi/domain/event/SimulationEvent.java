package com.meneghel.eenm.simulationapi.domain.event;

/**
 * One event of a simulation stream. The stream is one {@link SimulationStarted}, any number of
 * {@link SimulationChunk}s and then exactly one terminal event: {@link SimulationCompleted} or
 * {@link SimulationFailed}.
 */
public sealed interface SimulationEvent
        permits SimulationStarted, SimulationChunk, SimulationCompleted, SimulationFailed {

    /** The wire name of the event, used as the SSE event name. */
    String type();

    default boolean isTerminal() {
        return false;
    }
}

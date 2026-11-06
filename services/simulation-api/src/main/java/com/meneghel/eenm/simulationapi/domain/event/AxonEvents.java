package com.meneghel.eenm.simulationapi.domain.event;

/**
 * Cumulative counts of the axon merge (non-invasive mode with a central drive): central spikes, those that reached
 * the muscle, FES spikes sent, collisions, FES pulses blocked by refractoriness and antidromic resets of the soma.
 */
public record AxonEvents(
        long central, long centralTransmitted, long fesTransmitted, long collisions, long fesBlocked, long resets) {
}

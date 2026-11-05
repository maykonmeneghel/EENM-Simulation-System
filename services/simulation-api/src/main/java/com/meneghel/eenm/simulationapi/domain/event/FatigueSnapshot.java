package com.meneghel.eenm.simulationapi.domain.event;

/**
 * Remaining force capacity (1 = rested, 0 = exhausted) at the end of a chunk. {@code muscle} weights the units by
 * their rested twitch force; a per-type value is {@code null} when the type has no simulated units.
 */
public record FatigueSnapshot(double timeMs, double muscle, Double slow, Double fastResistant, Double fastFatigable) {
}

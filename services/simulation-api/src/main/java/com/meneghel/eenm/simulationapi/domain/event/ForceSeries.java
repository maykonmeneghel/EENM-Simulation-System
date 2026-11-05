package com.meneghel.eenm.simulationapi.domain.event;

import java.util.List;

/**
 * Muscle force over a chunk: the total and the mean per fibre type (S, FR, FF).
 */
public record ForceSeries(
        List<Double> total,
        List<Double> slow,
        List<Double> fastResistant,
        List<Double> fastFatigable) {

    public ForceSeries {
        total = List.copyOf(total);
        slow = List.copyOf(slow);
        fastResistant = List.copyOf(fastResistant);
        fastFatigable = List.copyOf(fastFatigable);
    }
}

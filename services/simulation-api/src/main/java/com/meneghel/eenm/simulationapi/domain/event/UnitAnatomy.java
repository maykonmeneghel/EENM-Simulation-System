package com.meneghel.eenm.simulationapi.domain.event;

import java.util.List;
import java.util.Objects;

/**
 * Per-unit geometry and conduction times of a run, for the 3D view (engine {@code domain/unit_anatomy.py}). One entry
 * per simulated unit in every list; {@code toElectrodeMs} and {@code toMuscleMs} are {@code null} when the stimulus
 * goes into the soma.
 */
public record UnitAnatomy(
        String motoneuron,
        List<String> type,
        List<Integer> poolIndex,
        List<Double> somaDiameterUm,
        List<Double> dendriteDiameterUm,
        List<Double> dendriteLengthMm,
        List<Double> conductionMs,
        List<Double> toElectrodeMs,
        List<Double> toMuscleMs,
        List<Double> weight,
        List<Double> axonRheobase) {

    public UnitAnatomy {
        Objects.requireNonNull(motoneuron, "motoneuron");
        int n = Objects.requireNonNull(type, "type").size();
        for (List<?> column : List.of(poolIndex, somaDiameterUm, dendriteDiameterUm, dendriteLengthMm, conductionMs,
                weight, axonRheobase)) {
            if (column.size() != n) {
                throw new IllegalArgumentException("every unit column must have one entry per unit");
            }
        }
        if ((toElectrodeMs == null) != (toMuscleMs == null)
                || (toElectrodeMs != null && (toElectrodeMs.size() != n || toMuscleMs.size() != n))) {
            throw new IllegalArgumentException("toElectrodeMs and toMuscleMs are both absent or one entry per unit");
        }
        type = List.copyOf(type);
        poolIndex = List.copyOf(poolIndex);
        somaDiameterUm = List.copyOf(somaDiameterUm);
        dendriteDiameterUm = List.copyOf(dendriteDiameterUm);
        dendriteLengthMm = List.copyOf(dendriteLengthMm);
        conductionMs = List.copyOf(conductionMs);
        toElectrodeMs = toElectrodeMs == null ? null : List.copyOf(toElectrodeMs);
        toMuscleMs = toMuscleMs == null ? null : List.copyOf(toMuscleMs);
        weight = List.copyOf(weight);
        axonRheobase = List.copyOf(axonRheobase);
    }
}

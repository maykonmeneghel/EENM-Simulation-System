package com.meneghel.eenm.simulationapi.domain.event;

import java.util.List;
import java.util.Objects;

/**
 * Per-unit events of one chunk, for the 3D replay (engine {@code domain/unit_events.py}): parallel lists, one entry
 * per event; {@code sample} × {@code started.stepMs} is the time in ms, {@code kind} the engine's event kind,
 * {@code origin} a related sample or -1.
 */
public record UnitEvents(List<Long> sample, List<Integer> unit, List<Integer> kind, List<Long> origin) {

    public UnitEvents {
        int n = Objects.requireNonNull(sample, "sample").size();
        if (unit.size() != n || kind.size() != n || origin.size() != n) {
            throw new IllegalArgumentException("unit events must have one entry per event in every list");
        }
        sample = List.copyOf(sample);
        unit = List.copyOf(unit);
        kind = List.copyOf(kind);
        origin = List.copyOf(origin);
    }
}

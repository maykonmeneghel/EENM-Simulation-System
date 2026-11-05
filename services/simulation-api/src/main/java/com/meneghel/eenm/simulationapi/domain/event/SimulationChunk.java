package com.meneghel.eenm.simulationapi.domain.event;

import java.util.List;
import java.util.Objects;

public record SimulationChunk(
        double progress,
        List<Double> timeMs,
        List<Double> stimulus,
        ForceSeries force,
        List<Double> emg) implements SimulationEvent {

    public static final String TYPE = "chunk";

    public SimulationChunk {
        timeMs = List.copyOf(timeMs);
        stimulus = List.copyOf(stimulus);
        Objects.requireNonNull(force, "force");
        emg = List.copyOf(emg);
    }

    @Override
    public String type() {
        return TYPE;
    }
}

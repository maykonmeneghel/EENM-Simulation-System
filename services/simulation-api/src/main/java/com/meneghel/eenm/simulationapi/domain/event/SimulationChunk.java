package com.meneghel.eenm.simulationapi.domain.event;

import java.util.List;
import java.util.Objects;

public record SimulationChunk(
        double progress,
        List<Double> timeMs,
        List<Double> stimulus,
        ForceSeries force,
        List<Double> emg,
        FatigueSnapshot fatigue,
        AxonEvents axonEvents,
        UnitEvents unitEvents,
        JointSeries joint) implements SimulationEvent {
    // fatigue: null when the model has no fatigue (ORIGINAL); axonEvents: null outside the axon merge;
    // unitEvents: null unless the request asked for them

    public static final String TYPE = "chunk";

    public SimulationChunk {
        timeMs = List.copyOf(timeMs);
        stimulus = List.copyOf(stimulus);
        Objects.requireNonNull(force, "force");
        emg = List.copyOf(emg);
    }

    public SimulationChunk(double progress, List<Double> timeMs, List<Double> stimulus, ForceSeries force,
            List<Double> emg, FatigueSnapshot fatigue) {
        this(progress, timeMs, stimulus, force, emg, fatigue, null, null, null);
    }

    public SimulationChunk(double progress, List<Double> timeMs, List<Double> stimulus, ForceSeries force,
            List<Double> emg, FatigueSnapshot fatigue, AxonEvents axonEvents) {
        this(progress, timeMs, stimulus, force, emg, fatigue, axonEvents, null, null);
    }

    public SimulationChunk(double progress, List<Double> timeMs, List<Double> stimulus, ForceSeries force,
            List<Double> emg, FatigueSnapshot fatigue, AxonEvents axonEvents, UnitEvents unitEvents) {
        this(progress, timeMs, stimulus, force, emg, fatigue, axonEvents, unitEvents, null);
    }

    @Override
    public String type() {
        return TYPE;
    }
}

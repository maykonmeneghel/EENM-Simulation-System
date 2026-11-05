package com.meneghel.eenm.simulationapi.domain.event;

import java.util.Objects;

public record SimulationCompleted(double elapsedSeconds, SimulationSummary summary) implements SimulationEvent {

    public static final String TYPE = "completed";

    public SimulationCompleted {
        Objects.requireNonNull(summary, "summary");
    }

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean isTerminal() {
        return true;
    }
}

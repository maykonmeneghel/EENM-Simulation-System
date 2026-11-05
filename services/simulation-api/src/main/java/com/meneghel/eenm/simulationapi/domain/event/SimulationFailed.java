package com.meneghel.eenm.simulationapi.domain.event;

import java.util.Objects;

/**
 * Terminal event reporting that the simulation did not complete. Serialized with type {@code error}.
 */
public record SimulationFailed(String message, String code) implements SimulationEvent {

    public static final String TYPE = "error";
    public static final String ENGINE_FAILURE = "ENGINE_FAILURE";
    public static final String ENGINE_UNAVAILABLE = "ENGINE_UNAVAILABLE";

    public SimulationFailed {
        Objects.requireNonNull(message, "message");
        Objects.requireNonNull(code, "code");
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

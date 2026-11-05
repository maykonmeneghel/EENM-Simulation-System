package com.meneghel.eenm.simulationapi.application.port;

public class EngineUnavailableException extends RuntimeException {

    public EngineUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }

    public EngineUnavailableException(String message) {
        super(message);
    }
}

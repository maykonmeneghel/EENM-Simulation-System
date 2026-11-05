package com.meneghel.eenm.simulationapi.application.port;

/**
 * The engine answered, but with content that does not follow the stream contract.
 */
public class EngineProtocolException extends RuntimeException {

    public EngineProtocolException(String message, Throwable cause) {
        super(message, cause);
    }

    public EngineProtocolException(String message) {
        super(message);
    }
}

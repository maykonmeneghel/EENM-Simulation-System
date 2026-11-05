package com.meneghel.eenm.simulationapi.application.port;

import com.meneghel.eenm.simulationapi.application.simulation.FieldViolation;
import java.util.List;

/**
 * The engine refused the request body (HTTP 422) although it passed the API validation.
 */
public class EngineRejectedRequestException extends RuntimeException {

    private final transient List<FieldViolation> violations;

    public EngineRejectedRequestException(List<FieldViolation> violations) {
        super("The simulation engine rejected the request");
        this.violations = List.copyOf(violations);
    }

    public List<FieldViolation> violations() {
        return violations;
    }
}

package com.meneghel.eenm.simulationapi.application.simulation;

import java.util.List;

public class InvalidSimulationRequestException extends RuntimeException {

    private final transient List<FieldViolation> violations;

    public InvalidSimulationRequestException(List<FieldViolation> violations) {
        super("The simulation request is invalid");
        this.violations = List.copyOf(violations);
    }

    public List<FieldViolation> violations() {
        return violations;
    }
}

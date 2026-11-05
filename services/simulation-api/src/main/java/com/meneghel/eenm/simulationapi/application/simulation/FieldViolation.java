package com.meneghel.eenm.simulationapi.application.simulation;

import java.util.Objects;

/**
 * A rule broken by one field of the public request; {@code field} is the JSON path, e.g.
 * {@code stimulus.frequencyHz}.
 */
public record FieldViolation(String field, String message) {

    public FieldViolation {
        Objects.requireNonNull(field, "field");
        Objects.requireNonNull(message, "message");
    }
}

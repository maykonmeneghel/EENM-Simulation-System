package com.meneghel.eenm.simulationapi.web.error;

import com.meneghel.eenm.simulationapi.application.simulation.FieldViolation;

/** One element of the {@code errors} array of a validation problem. */
public record InvalidField(String field, String message) {

    static InvalidField from(FieldViolation violation) {
        return new InvalidField(violation.field(), violation.message());
    }
}

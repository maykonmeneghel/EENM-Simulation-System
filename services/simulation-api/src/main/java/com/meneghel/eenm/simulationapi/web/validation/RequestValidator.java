package com.meneghel.eenm.simulationapi.web.validation;

import com.meneghel.eenm.simulationapi.application.simulation.FieldViolation;
import com.meneghel.eenm.simulationapi.application.simulation.InvalidSimulationRequestException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Runs Bean Validation on a request DTO and reports the violations with their JSON paths
 * (e.g. {@code stimulus.frequencyHz}, {@code unitsPerType.FR}).
 */
@Component
public class RequestValidator {

    private final Validator validator;

    public RequestValidator(Validator validator) {
        this.validator = validator;
    }

    public void validate(Object request) {
        Set<ConstraintViolation<Object>> violations = validator.validate(request);
        if (!violations.isEmpty()) {
            throw new InvalidSimulationRequestException(toFieldViolations(violations));
        }
    }

    private static List<FieldViolation> toFieldViolations(Set<ConstraintViolation<Object>> violations) {
        return violations.stream()
                .map(violation -> new FieldViolation(violation.getPropertyPath().toString(), violation.getMessage()))
                .sorted(Comparator.comparing(FieldViolation::field))
                .toList();
    }
}

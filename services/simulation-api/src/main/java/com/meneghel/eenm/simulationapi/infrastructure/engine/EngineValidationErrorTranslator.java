package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.meneghel.eenm.simulationapi.application.simulation.FieldViolation;
import java.util.ArrayList;
import java.util.List;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Converts the engine's 422 body (FastAPI format: {@code {"detail":[{"loc":["body","stimulus","stepMs"],
 * "msg":"..."}]}}) into field violations named like the public request.
 */
final class EngineValidationErrorTranslator {

    private static final String BODY_ROOT = "body";
    private static final String UNKNOWN_FIELD = "request";

    private final ObjectMapper objectMapper;

    EngineValidationErrorTranslator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    List<FieldViolation> translate(String body) {
        JsonNode details = readDetails(body);
        if (!details.isArray()) {
            return List.of(new FieldViolation(UNKNOWN_FIELD, "was rejected by the simulation engine"));
        }
        List<FieldViolation> violations = new ArrayList<>();
        for (JsonNode detail : details.values()) {
            violations.add(new FieldViolation(fieldOf(detail.path("loc")), detail.path("msg").asString("is invalid")));
        }
        return violations;
    }

    private JsonNode readDetails(String body) {
        try {
            return objectMapper.readTree(body).path("detail");
        } catch (JacksonException unreadable) {
            return objectMapper.missingNode();
        }
    }

    private static String fieldOf(JsonNode location) {
        List<String> parts = new ArrayList<>();
        for (JsonNode part : location.values()) {
            String name = part.asString();
            if (!(parts.isEmpty() && BODY_ROOT.equals(name))) {
                parts.add(name);
            }
        }
        return parts.isEmpty() ? UNKNOWN_FIELD : String.join(".", parts);
    }
}

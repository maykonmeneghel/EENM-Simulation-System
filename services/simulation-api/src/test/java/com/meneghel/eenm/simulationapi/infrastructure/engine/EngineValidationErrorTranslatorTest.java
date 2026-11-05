package com.meneghel.eenm.simulationapi.infrastructure.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.application.simulation.FieldViolation;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class EngineValidationErrorTranslatorTest {

    private final EngineValidationErrorTranslator translator =
            new EngineValidationErrorTranslator(JsonMapper.builder().build());

    @Test
    void translatesFastApiDetailsToPublicFieldPaths() {
        String body = "{\"detail\":[{\"loc\":[\"body\",\"stimulus\",\"stepMs\"],\"msg\":\"too small\"},"
                + "{\"loc\":[\"body\",\"unitsPerType\",\"S\"],\"msg\":\"too many\"}]}";

        assertThat(translator.translate(body)).containsExactly(
                new FieldViolation("stimulus.stepMs", "too small"),
                new FieldViolation("unitsPerType.S", "too many"));
    }

    @Test
    void unreadableBodyYieldsAGenericViolation() {
        assertThat(translator.translate("oops"))
                .containsExactly(new FieldViolation("request", "was rejected by the simulation engine"));
    }
}

package com.meneghel.eenm.simulationapi.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

class LimitsControllerTest {

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
    @AutoConfigureWebTestClient
    class WithoutConfiguration {

        @Autowired
        private WebTestClient client;

        @MockitoBean
        private SimulationEngine engine;

        @Test
        void theSessionIsAnonymousWithoutSignIn() {
            client.get().uri("/api/v1/session").exchange().expectStatus().isOk()
                    .expectBody().json("{\"uid\":null}", true);
        }

        @Test
        void reportsTheContractRangesAndNoPointCap() {
            client.get().uri("/api/v1/limits").exchange()
                    .expectStatus().isOk()
                    .expectHeader().doesNotExist("X-Frame-Options") // no security headers without sign-in
                    .expectBody().json("""
                            {"minDurationMs":10,"maxDurationMs":300000,"minStepMs":0.005,"maxStepMs":0.1,
                             "maxFrequencyHz":200,"maxUnitsPerType":200,"maxTotalUnits":600,"maxOutputPoints":null,
                             "maxUnitEventsDurationMs":30000}""", true);
        }
    }

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "eenm.limits.max-duration-ms=5000", "eenm.limits.min-step-ms=0.01", "eenm.limits.max-frequency-hz=100",
        "eenm.limits.max-units-per-type=120", "eenm.limits.max-total-units=120",
        "eenm.limits.max-output-points=100000", "eenm.limits.max-unit-events-duration-ms=5000",
        "engine.preset-cache-ttl=0s"})
    @AutoConfigureWebTestClient
    class Hosted {

        @Autowired
        private WebTestClient client;

        @MockitoBean
        private SimulationEngine engine;

        @Test
        void reportsTheConfiguredLimits() {
            client.get().uri("/api/v1/limits").exchange()
                    .expectStatus().isOk()
                    .expectBody().json("""
                            {"minDurationMs":10,"maxDurationMs":5000,"minStepMs":0.01,"maxStepMs":0.1,
                             "maxFrequencyHz":100,"maxUnitsPerType":120,"maxTotalUnits":120,"maxOutputPoints":100000,
                             "maxUnitEventsDurationMs":5000}""", true);
        }

        @Test
        void aLongerRunIsA400ProblemNamingTheFieldAndNeverReachesTheEngine() {
            when(engine.listMuscles(any())).thenReturn(Mono.just(List.of(SampleEvents.soleus())));
            client.post().uri("/api/v1/simulations").contentType(MediaType.APPLICATION_JSON)
                    .bodyValue("{\"stimulus\":{\"durationMs\":6000}}")
                    .exchange()
                    .expectStatus().isBadRequest()
                    .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                    .expectBody()
                    .jsonPath("$.errors[0].field").isEqualTo("stimulus.durationMs")
                    .jsonPath("$.errors[0].message").isEqualTo("must be less than or equal to 5000 (limit of this server)");
            verify(engine, never()).stream(any());
        }
    }

    /** The environment variable names of docs/deployment.md (resolved through application.properties). */
    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = {"EENM_MAX_DURATION_MS=4000", "EENM_MAX_OUTPUT_POINTS=50000", "EENM_MAX_TOTAL_UNITS=150"})
    @AutoConfigureWebTestClient
    class FromEnvironmentVariables {

        @Autowired
        private WebTestClient client;

        @MockitoBean
        private SimulationEngine engine;

        @Test
        void mapToTheLimits() {
            client.get().uri("/api/v1/limits").exchange()
                    .expectStatus().isOk()
                    .expectBody()
                    .jsonPath("$.maxDurationMs").isEqualTo(4000.0)
                    .jsonPath("$.maxOutputPoints").isEqualTo(50000)
                    .jsonPath("$.maxTotalUnits").isEqualTo(150);
        }
    }
}

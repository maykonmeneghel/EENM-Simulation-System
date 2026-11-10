package com.meneghel.eenm.simulationapi.web.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.TimeUnit;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import mockwebserver3.junit5.StartStop;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/**
 * EENM_ORIGIN_SECRET: requests without CloudFront's X-Origin-Verify are 403 (but the health check);
 * EENM_ENGINE_SECRET: every engine call carries X-Engine-Key.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"eenm.origin-secret=cdn-secret", "engine.secret=engine-secret", "engine.preset-cache-ttl=0s"})
@AutoConfigureWebTestClient
class OriginAndEngineLockTest {

    @StartStop
    static final MockWebServer ENGINE = new MockWebServer();

    @Autowired
    private WebTestClient client;

    @DynamicPropertySource
    static void engineUrl(DynamicPropertyRegistry registry) {
        registry.add("engine.base-url", () -> ENGINE.url("/").toString());
    }

    @Test
    void requestsAroundTheCdnAreForbiddenAsProblemJson() {
        int engineCalls = ENGINE.getRequestCount();
        client.get().uri("/api/v1/limits").exchange()
                .expectStatus().isForbidden()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody().jsonPath("$.status").isEqualTo(403);
        client.post().uri("/api/v1/simulations").header("X-Origin-Verify", "cdn-secreT")
                .contentType(MediaType.APPLICATION_JSON).bodyValue("{}").exchange()
                .expectStatus().isForbidden();
        assertThat(ENGINE.getRequestCount()).isEqualTo(engineCalls);
    }

    @Test
    void theHealthCheckStaysOpenAndTheRightHeaderPasses() {
        client.get().uri("/actuator/health").exchange().expectStatus().isOk();
        client.get().uri("/actuator/health/liveness").exchange().expectStatus().isOk();
        client.get().uri("/api/v1/limits").header("X-Origin-Verify", "cdn-secret").exchange().expectStatus().isOk();
    }

    @Test
    void theEngineIsCalledWithItsKey() throws InterruptedException {
        ENGINE.enqueue(new MockResponse.Builder().addHeader("Content-Type", "application/json")
                .body("[{\"id\":\"SOLEUS\",\"label\":\"Soleus\",\"poolSize\":{\"S\":800,\"FR\":50,\"FF\":50}}]")
                .build());
        client.get().uri("/api/v1/muscles").header("X-Origin-Verify", "cdn-secret").exchange()
                .expectStatus().isOk();
        RecordedRequest call = ENGINE.takeRequest(5, TimeUnit.SECONDS);
        assertThat(call).isNotNull();
        assertThat(call.getHeaders().get("X-Engine-Key")).isEqualTo("engine-secret");
        assertThat(call.getHeaders().get("X-Origin-Verify")).isNull();
    }
}

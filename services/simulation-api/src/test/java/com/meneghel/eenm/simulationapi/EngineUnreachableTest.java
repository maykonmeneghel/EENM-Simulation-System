package com.meneghel.eenm.simulationapi;

import java.io.IOException;
import java.net.ServerSocket;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/** With no engine listening, the API answers 502 problem+json before any event is streamed. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class EngineUnreachableTest {

    @Autowired
    private WebTestClient client;

    @DynamicPropertySource
    static void engineUrl(DynamicPropertyRegistry registry) throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        registry.add("engine.base-url", () -> "http://127.0.0.1:" + closedPort);
    }

    @Test
    void simulationIsBadGateway() {
        client.post().uri("/api/v1/simulations")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue("{}")
                .exchange()
                .expectStatus().isEqualTo(502)
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.title").isEqualTo("Simulation engine unavailable");
    }

    @Test
    void invalidRequestIsStillRejectedWithoutTheEngine() {
        client.post().uri("/api/v1/simulations")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"outputStepMs\":0.001}")
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("outputStepMs");
    }

    @Test
    void healthIsUpWithoutTheEngine() {
        client.get().uri("/actuator/health").exchange()
                .expectStatus().isOk()
                .expectBody().jsonPath("$.status").isEqualTo("UP");
    }
}

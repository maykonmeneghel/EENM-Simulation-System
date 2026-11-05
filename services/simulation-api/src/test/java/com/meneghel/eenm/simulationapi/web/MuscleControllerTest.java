package com.meneghel.eenm.simulationapi.web;

import static org.mockito.Mockito.when;

import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class MuscleControllerTest {

    @Autowired
    private WebTestClient client;

    @MockitoBean
    private SimulationEngine engine;

    @Test
    void relaysTheEnginePresets() {
        when(engine.listMuscles()).thenReturn(Mono.just(List.of(SampleEvents.soleus())));

        client.get().uri("/api/v1/muscles").exchange()
                .expectStatus().isOk()
                .expectBody().json("[{\"id\":\"SOLEUS\",\"label\":\"Soleus\",\"poolSize\":{\"S\":800,\"FR\":50,\"FF\":50}}]");
    }

    @Test
    void unreachableEngineIsBadGateway() {
        when(engine.listMuscles()).thenReturn(Mono.error(new EngineUnavailableException("connection refused")));

        client.get().uri("/api/v1/muscles").exchange()
                .expectStatus().isEqualTo(502)
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON);
    }

    @Test
    void allowsTheWebAppOrigin() {
        when(engine.listMuscles()).thenReturn(Mono.just(List.of()));

        client.options().uri("/api/v1/simulations")
                .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173");
    }

    @Test
    void rejectsOtherOrigins() {
        client.options().uri("/api/v1/simulations")
                .header(HttpHeaders.ORIGIN, "http://evil.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .exchange()
                .expectStatus().isForbidden();
    }
}

package com.meneghel.eenm.simulationapi.web;

import static org.mockito.Mockito.when;

import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.domain.language.Language;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class ConditionControllerTest {

    private static final String CATALOG = "[{\"id\":\"SCI_CHRONIC\",\"label\":\"Lesão medular crônica\",\"adjustments\":"
            + "[{\"id\":\"SCI_FATIGABILITY\",\"default\":true,\"source\":{\"doi\":\"10.1177/1545968310390224\"}}]}]";

    @Autowired
    private WebTestClient client;

    @MockitoBean
    private SimulationEngine engine;

    @Test
    void relaysTheEngineCatalogVerbatim() {
        when(engine.conditionCatalogJson(Language.PT_BR)).thenReturn(Mono.just(CATALOG));

        client.get().uri("/api/v1/conditions").exchange()
                .expectStatus().isOk()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_JSON)
                .expectBody().json(CATALOG, true);
    }

    @Test
    void unreachableEngineIsBadGateway() {
        when(engine.conditionCatalogJson(Language.PT_BR)).thenReturn(Mono.error(new EngineUnavailableException("connection refused")));

        client.get().uri("/api/v1/conditions").exchange()
                .expectStatus().isEqualTo(502)
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON);
    }

    @Test
    void forwardsTheRequestedLanguage() {
        when(engine.conditionCatalogJson(Language.EN)).thenReturn(Mono.just("[]"));

        client.get().uri("/api/v1/conditions?lang=en").exchange().expectStatus().isOk().expectBody().json("[]", true);
    }

    @Test
    void unsupportedLanguageIsABadRequestProblem() {
        client.get().uri("/api/v1/conditions?lang=fr").exchange()
                .expectStatus().isBadRequest()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("lang")
                .jsonPath("$.errors[0].message").isEqualTo("must be pt-BR or en");
    }
}

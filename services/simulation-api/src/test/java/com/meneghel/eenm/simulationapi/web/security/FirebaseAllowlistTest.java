package com.meneghel.eenm.simulationapi.web.security;

import static com.meneghel.eenm.simulationapi.web.security.FirebaseTokens.token;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.util.List;
import java.util.function.UnaryOperator;
import mockwebserver3.MockWebServer;
import mockwebserver3.junit5.StartStop;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** EENM_AUTH_ALLOWED_EMAILS: only verified e-mails of the list run simulations; others get 403 problem+json. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "eenm.auth.firebase-project-id=" + FirebaseTokens.PROJECT,
    // the environment variable's name and format (comma separated, spaces and case as an operator might type them)
    "EENM_AUTH_ALLOWED_EMAILS= Alice@Example.com ,bob@example.com,, "})
@AutoConfigureWebTestClient
class FirebaseAllowlistTest {

    @StartStop
    static final MockWebServer JWKS = FirebaseTokens.jwksServer();

    @Autowired
    private WebTestClient client;

    @MockitoBean
    private SimulationEngine engine;

    @DynamicPropertySource
    static void jwks(DynamicPropertyRegistry registry) {
        registry.add("eenm.auth.jwk-set-uri", () -> JWKS.url("/jwks").toString());
    }

    @BeforeEach
    void stubs() {
        when(engine.listMuscles(any())).thenReturn(Mono.just(List.of(SampleEvents.soleus())));
        when(engine.stream(any())).thenReturn(Flux.just(SampleEvents.started(), SampleEvents.completed()));
    }

    @Test
    void anAllowedVerifiedEmailRunsWhateverItsCaseAndSpaces() {
        simulate(token(c -> c.claim("email", "alice@example.com"))).expectStatus().isOk();
        simulate(token(c -> c.claim("email", "  BOB@EXAMPLE.COM"))).expectStatus().isOk();
    }

    @Test
    void anotherAccountIs403WithoutRevealingTheList() {
        simulate(token(UnaryOperator.identity())) // someone@example.com
                .expectStatus().isForbidden()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody(String.class).value(body -> assertThat(body)
                        .contains("\"status\":403")
                        .contains("does not have access to this simulator")
                        .doesNotContainIgnoringCase("alice").doesNotContainIgnoringCase("bob"));
    }

    @Test
    void anAllowedButUnverifiedOrMissingEmailIs403() {
        simulate(token(c -> c.claim("email", "alice@example.com").claim("email_verified", false)))
                .expectStatus().isForbidden();
        simulate(token(c -> c.claim("email", "alice@example.com").claim("email_verified", null)))
                .expectStatus().isForbidden();
        simulate(token(c -> c.claim("email", null))).expectStatus().isForbidden();
    }

    @Test
    void noTokenIsStill401() {
        client.post().uri("/api/v1/simulations").contentType(MediaType.APPLICATION_JSON).bodyValue("{}").exchange()
                .expectStatus().isUnauthorized();
    }

    private WebTestClient.ResponseSpec simulate(String token) {
        return client.post().uri("/api/v1/simulations").contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).bodyValue("{}").exchange();
    }
}

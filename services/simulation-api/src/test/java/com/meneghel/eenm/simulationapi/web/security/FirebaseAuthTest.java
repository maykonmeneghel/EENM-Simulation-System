package com.meneghel.eenm.simulationapi.web.security;

import static com.meneghel.eenm.simulationapi.web.security.FirebaseTokens.token;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.function.UnaryOperator;
import mockwebserver3.MockWebServer;
import mockwebserver3.junit5.StartStop;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** With EENM_AUTH_FIREBASE_PROJECT_ID set: Firebase ID tokens (RS256, JWKS) are required to run simulations. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"eenm.auth.firebase-project-id=" + FirebaseAuthTest.PROJECT, "engine.preset-cache-ttl=0s"})
@AutoConfigureWebTestClient
@ExtendWith(OutputCaptureExtension.class)
class FirebaseAuthTest {

    static final String PROJECT = FirebaseTokens.PROJECT;

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
    void aSimulationWithoutATokenIs401ProblemJsonAndNeverReachesTheEngine() {
        simulate(null)
                .expectStatus().isUnauthorized()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader().valueEquals(HttpHeaders.WWW_AUTHENTICATE, "Bearer")
                .expectBody().jsonPath("$.status").isEqualTo(401).jsonPath("$.title").isEqualTo("Unauthorized");
        verify(engine, never()).stream(any());
    }

    @Test
    void aValidTokenRunsTheSimulationAndLogsTheUidNotTheEmail(CapturedOutput output) {
        simulate(token(UnaryOperator.identity())).expectStatus().isOk()
                .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                .expectBody(String.class).value(body -> assertThat(body).contains("event:completed"));
        assertThat(output).contains("simulation requested by uid=uid-123").doesNotContain("someone@example.com");
    }

    @Test
    void tokensOfAnotherProjectIssuerOrKeyOrExpiredAreRejected() {
        assertRejected(token(c -> c.audience("other-project")));
        assertRejected(token(c -> c.issuer("https://securetoken.google.com/other-project")));
        assertRejected(token(c -> c.expirationTime(Date.from(Instant.now().minusSeconds(120)))));
        assertRejected(token(c -> c.issueTime(Date.from(Instant.now().plusSeconds(600)))));
        assertRejected(token(c -> c.subject("")));
        assertRejected(token(c -> c.claim("auth_time", null)));
        assertRejected(token(UnaryOperator.identity(), FirebaseTokens.OTHER_KEY));
        assertRejected("not-a-jwt");
        simulate(token(c -> c.claim("email_verified", false))).expectStatus().isForbidden();
        verify(engine, never()).stream(any());
    }

    @Test
    void cataloguesLimitsHealthAndPreflightsStayPublic() {
        client.get().uri("/api/v1/muscles").exchange().expectStatus().isOk();
        client.get().uri("/api/v1/limits").exchange().expectStatus().isOk();
        client.get().uri("/actuator/health").exchange().expectStatus().isOk();
        client.options().uri("/api/v1/simulations")
                .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173");
    }

    @Test
    void anyOtherEndpointNeedsSignIn() {
        client.get().uri("/api/v1/unknown").exchange().expectStatus().isUnauthorized();
    }

    private void assertRejected(String token) {
        simulate(token).expectStatus().isUnauthorized()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON);
    }

    private WebTestClient.ResponseSpec simulate(String token) {
        WebTestClient.RequestBodySpec request = client.post().uri("/api/v1/simulations")
                .contentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            request = request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        return request.bodyValue("{}").exchange();
    }
}

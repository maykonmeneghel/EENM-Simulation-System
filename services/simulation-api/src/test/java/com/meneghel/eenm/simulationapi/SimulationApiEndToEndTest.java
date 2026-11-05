package com.meneghel.eenm.simulationapi;

import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.time.Duration;
import mockwebserver3.Dispatcher;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import mockwebserver3.junit5.StartStop;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.test.StepVerifier;

/** Browser -> API -> engine (MockWebServer speaking NDJSON), with the real WebClient adapter. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class SimulationApiEndToEndTest {

    private static final String NDJSON = "application/x-ndjson";

    @StartStop
    static final MockWebServer ENGINE = new MockWebServer();

    static {
        ENGINE.setDispatcher(new EngineDispatcher());
    }

    @Autowired
    private WebTestClient client;

    @DynamicPropertySource
    static void engineUrl(DynamicPropertyRegistry registry) {
        registry.add("engine.base-url", () -> ENGINE.url("/").toString());
    }

    @Test
    void relaysTheEngineStreamToTheBrowser() {
        var events = client.post().uri("/api/v1/simulations")
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue("{\"stimulus\":{\"amplitude\":120}}")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                .returnResult(new ParameterizedTypeReference<ServerSentEvent<String>>() {
                })
                .getResponseBody()
                .map(ServerSentEvent::event);

        StepVerifier.create(events)
                .expectNext("started", "chunk", "chunk", "completed")
                .expectComplete()
                .verify(Duration.ofSeconds(10));
    }

    @Test
    void relaysALiteratureRequestWithoutUnitsToTheEngine() {
        var events = client.post().uri("/api/v1/simulations")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"modelVariant\":\"LITERATURE\",\"stimulus\":{\"trainOnMs\":330,\"trainPeriodMs\":1000}}")
                .exchange()
                .expectStatus().isOk()
                .returnResult(new ParameterizedTypeReference<ServerSentEvent<String>>() {
                })
                .getResponseBody()
                .map(ServerSentEvent::event);

        StepVerifier.create(events)
                .expectNext("started", "chunk", "chunk", "completed")
                .expectComplete()
                .verify(Duration.ofSeconds(10));
    }

    @Test
    void relaysTheEngineMuscles() {
        client.get().uri("/api/v1/muscles").exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$[0].id").isEqualTo("SOLEUS")
                .jsonPath("$[0].poolSize.FR").isEqualTo(50);
    }

    private static final class EngineDispatcher extends Dispatcher {

        @Override
        public MockResponse dispatch(RecordedRequest request) {
            String target = request.getTarget();
            if ("/v1/muscles".equals(target)) {
                return new MockResponse.Builder()
                        .addHeader("Content-Type", "application/json")
                        .body("[{\"id\":\"SOLEUS\",\"label\":\"Soleus\",\"poolSize\":{\"S\":800,\"FR\":50,\"FF\":50}}]")
                        .build();
            }
            String body = request.getBody() == null ? "" : request.getBody().utf8();
            boolean originalWithAmplitude = body.contains("\"amplitude\":120.0");
            boolean literatureWithEngineUnits = body.contains("\"modelVariant\":\"LITERATURE\"")
                    && body.contains("\"trainOnMs\":330.0") && !body.contains("unitsPerType");
            if ("/v1/simulations/stream".equals(target) && (originalWithAmplitude || literatureWithEngineUnits)) {
                String events = String.join("\n", SampleEvents.startedLine(), SampleEvents.chunkLine(0.5),
                        SampleEvents.chunkLine(1.0), SampleEvents.completedLine()) + "\n";
                return new MockResponse.Builder().addHeader("Content-Type", NDJSON).chunkedBody(events, 64).build();
            }
            assertThat(target).as("unexpected engine call").isNull();
            return new MockResponse.Builder().code(404).build();
        }
    }
}

package com.meneghel.eenm.simulationapi.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.CalibrationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "engine.preset-cache-ttl=0s")
@AutoConfigureWebTestClient
class SimulationControllerTest {

    private static final String SIMULATIONS = "/api/v1/simulations";
    private static final ParameterizedTypeReference<ServerSentEvent<String>> SSE = new ParameterizedTypeReference<>() {
    };

    @Autowired
    private WebTestClient client;

    @MockitoBean
    private SimulationEngine engine;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @BeforeEach
    void stubPresets() {
        when(engine.listMuscles()).thenReturn(Mono.just(List.of(SampleEvents.soleus())));
    }

    @Test
    void streamsEveryEngineEventAsServerSentEvents() {
        when(engine.stream(any())).thenReturn(Flux.just(SampleEvents.started(), SampleEvents.chunk(1.0),
                SampleEvents.completed()));

        Flux<ServerSentEvent<String>> events = post("{\"muscle\":\"SOLEUS\",\"stimulus\":{\"frequencyHz\":50}}")
                .expectStatus().isOk()
                .expectHeader().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                .returnResult(SSE)
                .getResponseBody();

        StepVerifier.create(events)
                .assertNext(event -> assertEvent(event, "started", SampleEvents.startedLine()))
                .assertNext(event -> assertEvent(event, "chunk", SampleEvents.chunkLine(1.0)))
                .assertNext(event -> assertEvent(event, "completed", SampleEvents.completedLine()))
                .expectComplete()
                .verify(Duration.ofSeconds(10));
        ArgumentCaptor<SimulationRequest> request = ArgumentCaptor.forClass(SimulationRequest.class);
        verify(engine).stream(request.capture());
        assertThat(request.getValue().stimulus().frequencyHz()).isEqualTo(50);
        assertThat(request.getValue().stimulus().durationMs()).isEqualTo(1000);
    }

    @Test
    void missingBodyRunsTheDefaultSimulation() {
        when(engine.stream(any())).thenReturn(Flux.just(SampleEvents.started(), SampleEvents.completed()));

        client.post().uri(SIMULATIONS).accept(MediaType.TEXT_EVENT_STREAM).exchange()
                .expectStatus().isOk();

        ArgumentCaptor<SimulationRequest> request = ArgumentCaptor.forClass(SimulationRequest.class);
        verify(engine).stream(request.capture());
        assertThat(request.getValue().muscle()).isEqualTo(Muscle.SOLEUS);
    }

    @Test
    void literatureRequestWithoutUnitsLeavesThemToTheEngine() {
        when(engine.stream(any())).thenReturn(Flux.just(SampleEvents.started(), SampleEvents.completed()));

        post("{\"modelVariant\":\"LITERATURE\",\"stimulus\":{\"durationMs\":300000,\"trainOnMs\":330,"
                + "\"trainPeriodMs\":1000}}").expectStatus().isOk().returnResult(SSE).getResponseBody().blockLast();

        ArgumentCaptor<SimulationRequest> request = ArgumentCaptor.forClass(SimulationRequest.class);
        verify(engine).stream(request.capture());
        assertThat(request.getValue().modelVariant()).isEqualTo(ModelVariant.LITERATURE);
        assertThat(request.getValue().requestedUnits()).isEmpty();
        assertThat(request.getValue().stimulus().trainOnMs()).isEqualTo(330);
        assertThat(request.getValue().stimulus().trainPeriodMs()).isEqualTo(1000);
        verify(engine, never()).listMuscles();
    }

    @Test
    void trainWithoutPeriodIsAProblem() {
        post("{\"stimulus\":{\"trainOnMs\":330}}")
                .expectStatus().isBadRequest()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("stimulus.trainPeriodMs")
                .jsonPath("$.errors[0].message").isEqualTo("is required when stimulus.trainOnMs is set");
        verify(engine, never()).stream(any());
    }

    @Test
    void calibrationTargetIsPassedToTheEngine() {
        when(engine.stream(any())).thenReturn(Flux.just(SampleEvents.started(), SampleEvents.completed()));

        post("{\"modelVariant\":\"LITERATURE\",\"calibrationTarget\":\"SINGLE_UNIT\"}")
                .expectStatus().isOk().returnResult(SSE).getResponseBody().blockLast();

        ArgumentCaptor<SimulationRequest> request = ArgumentCaptor.forClass(SimulationRequest.class);
        verify(engine).stream(request.capture());
        assertThat(request.getValue().calibrationTarget()).isEqualTo(CalibrationTarget.SINGLE_UNIT);
    }

    @Test
    void unknownCalibrationTargetIsAProblem() {
        post("{\"calibrationTarget\":\"FASTEST\"}")
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("calibrationTarget")
                .jsonPath("$.errors[0].message").isEqualTo("must be one of [WHOLE_MUSCLE, SINGLE_UNIT]");
        verify(engine, never()).stream(any());
    }

    @Test
    void unknownModelVariantIsAProblem() {
        post("{\"modelVariant\":\"MODERN\"}")
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("modelVariant")
                .jsonPath("$.errors[0].message").isEqualTo("must be one of [ORIGINAL, LITERATURE]");
    }

    @Test
    void engineLostAfterStreamingStartedEndsWithAnErrorEvent() {
        when(engine.stream(any())).thenReturn(Flux.concat(Flux.just(SampleEvents.started()),
                Flux.error(new EngineUnavailableException("connection reset"))));

        Flux<ServerSentEvent<String>> events = post("{}").expectStatus().isOk().returnResult(SSE).getResponseBody();

        StepVerifier.create(events)
                .assertNext(event -> assertThat(event.event()).isEqualTo("started"))
                .assertNext(event -> {
                    assertThat(event.event()).isEqualTo("error");
                    assertThat(jsonMapper.readTree(event.data()).path("code").stringValue()).isEqualTo("ENGINE_UNAVAILABLE");
                    assertThat(jsonMapper.readTree(event.data()).path("type").stringValue()).isEqualTo("error");
                })
                .expectComplete()
                .verify(Duration.ofSeconds(10));
    }

    @Test
    void outOfRangeFieldsAreAProblemWithFieldErrors() {
        post("{\"stimulus\":{\"frequencyHz\":500},\"unitsPerType\":{\"FR\":201}}")
                .expectStatus().isBadRequest()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.status").isEqualTo(400)
                .jsonPath("$.title").isEqualTo("Invalid simulation request")
                .jsonPath("$.errors.length()").isEqualTo(2)
                .jsonPath("$.errors[0].field").isEqualTo("stimulus.frequencyHz")
                .jsonPath("$.errors[0].message").isEqualTo("must be between 1 and 200")
                .jsonPath("$.errors[1].field").isEqualTo("unitsPerType.FR")
                .jsonPath("$.errors[1].message").isEqualTo("must be between 0 and 200");
        verify(engine, never()).stream(any());
    }

    @Test
    void crossFieldRuleViolationIsAProblem() {
        post("{\"stimulus\":{\"modulation\":{\"shape\":\"TRIANGLE\",\"peakTimeMs\":1500}}}")
                .expectStatus().isBadRequest()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("stimulus.modulation.peakTimeMs")
                .jsonPath("$.errors[0].message")
                .isEqualTo("must be greater than 0 and less than stimulus.durationMs (1000)");
    }

    @Test
    void unitsAboveThePoolSizeAreAProblem() {
        when(engine.listMuscles()).thenReturn(Mono.just(List.of(new MusclePreset(
                "SOLEUS", "Soleus", new MotorUnitCounts(3, 50, 50)))));

        post("{}").expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("unitsPerType.S")
                .jsonPath("$.errors[0].message").isEqualTo("must not exceed the SOLEUS pool size (3)");
    }

    @Test
    void unknownEnumValueIsAProblemNamingTheField() {
        post("{\"stimulus\":{\"waveform\":\"SQUARE\"}}")
                .expectStatus().isBadRequest()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.errors[0].field").isEqualTo("stimulus.waveform")
                .jsonPath("$.errors[0].message").isEqualTo("must be one of [MONOPHASIC, BIPHASIC, BIPHASIC_SYMMETRIC]");
    }

    @Test
    void malformedJsonIsAProblem() {
        post("{\"stimulus\":")
                .expectStatus().isBadRequest()
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.detail").isEqualTo("The request body is not valid JSON.")
                .jsonPath("$.errors.length()").isEqualTo(0);
    }

    @Test
    void unreachableEngineBeforeStreamingIsBadGateway() {
        when(engine.stream(any())).thenReturn(Flux.error(new EngineUnavailableException("connection refused")));

        post("{}").expectStatus().isEqualTo(502)
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.status").isEqualTo(502)
                .jsonPath("$.title").isEqualTo("Simulation engine unavailable");
    }

    @Test
    void unreachablePresetsAreBadGateway() {
        when(engine.listMuscles()).thenReturn(Mono.error(new EngineUnavailableException("connection refused")));

        post("{}").expectStatus().isEqualTo(502)
                .expectHeader().contentType(MediaType.APPLICATION_PROBLEM_JSON);
    }

    @Test
    void browserDisconnectCancelsTheEngineStream() throws InterruptedException {
        CountDownLatch engineCancelled = new CountDownLatch(1);
        Flux<SimulationEvent> endless = Flux.interval(Duration.ofMillis(20))
                .<SimulationEvent>map(tick -> SampleEvents.chunk(0.001))
                .startWith(SampleEvents.started())
                .doOnCancel(engineCancelled::countDown);
        when(engine.stream(any())).thenReturn(endless);

        Flux<ServerSentEvent<String>> events = post("{}").expectStatus().isOk().returnResult(SSE).getResponseBody();

        StepVerifier.create(events).expectNextCount(3).thenCancel().verify(Duration.ofSeconds(10));
        assertThat(engineCancelled.await(5, TimeUnit.SECONDS)).as("engine stream cancelled").isTrue();
    }

    private WebTestClient.ResponseSpec post(String body) {
        return client.post().uri(SIMULATIONS)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(body)
                .exchange();
    }

    private void assertEvent(ServerSentEvent<String> event, String name, String engineLine) {
        assertThat(event.event()).isEqualTo(name);
        try {
            JSONAssert.assertEquals(engineLine, event.data(), JSONCompareMode.STRICT);
        } catch (JSONException invalidJson) {
            throw new AssertionError("event data is not JSON: " + event.data(), invalidJson);
        }
    }
}

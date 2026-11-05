package com.meneghel.eenm.simulationapi.infrastructure.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.application.port.EngineRejectedRequestException;
import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.application.simulation.FieldViolation;
import com.meneghel.eenm.simulationapi.application.simulation.SimulationDefaults;
import com.meneghel.eenm.simulationapi.domain.event.SimulationStarted;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.Waveform;
import com.meneghel.eenm.simulationapi.support.Drafts;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import mockwebserver3.MockResponse;
import mockwebserver3.MockResponseBody;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import mockwebserver3.junit5.StartStop;
import okio.BufferedSink;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.test.StepVerifier;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class WebClientSimulationEngineTest {

    private static final String NDJSON = "application/x-ndjson";
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    @StartStop
    private final MockWebServer server = new MockWebServer();

    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private final SimulationRequest request = new SimulationDefaults().resolve(null);
    private WebClientSimulationEngine engine;

    @BeforeEach
    void createEngine() {
        engine = engineAt(server.url("/").toString());
    }

    @Test
    void postsTheRequestAsJsonAndParsesTheWholeStream() throws InterruptedException {
        server.enqueue(ndjson(lines(SampleEvents.startedLine(), "", SampleEvents.chunkLine(0.5),
                SampleEvents.chunkLine(1.0), SampleEvents.completedLine())));

        StepVerifier.create(engine.stream(request))
                .expectNext(SampleEvents.started(), SampleEvents.chunk(0.5), SampleEvents.chunk(1.0),
                        SampleEvents.completed())
                .expectComplete()
                .verify(TIMEOUT);

        RecordedRequest recorded = server.takeRequest(1, TimeUnit.SECONDS);
        assertThat(recorded.getMethod()).isEqualTo("POST");
        assertThat(recorded.getTarget()).isEqualTo("/v1/simulations/stream");
        assertThat(recorded.getHeaders().get("Content-Type")).startsWith("application/json");
        assertThat(recorded.getHeaders().get("Accept")).isEqualTo(NDJSON);
        JsonNode body = jsonMapper.readTree(recorded.getBody().utf8());
        assertThat(body.path("stimulus").path("stepMs").doubleValue()).isEqualTo(0.01);
        assertThat(body.path("stimulus").path("modulation").path("shape").stringValue()).isEqualTo("STEP");
        assertThat(body.path("stimulus").path("modulation").path("peakTimeMs").isNull()).isTrue();
        assertThat(body.path("modelVariant").stringValue()).isEqualTo("ORIGINAL");
        assertThat(body.path("calibrationTarget").stringValue()).isEqualTo("WHOLE_MUSCLE");
        assertThat(body.path("stimulationSite").stringValue()).isEqualTo("SKIN_SURFACE");
        assertThat(body.path("stimulus").path("trainOnMs").isNull()).isTrue();
        assertThat(body.path("stimulus").path("trainPeriodMs").isNull()).isTrue();
        assertThat(body.path("stimulus").has("pulseWidthUs")).as("duty cycle mode leaves it out").isFalse();
        assertThat(body.path("stimulus").path("rampUpMs").doubleValue()).isZero();
        assertThat(body.path("muscle").stringValue()).isEqualTo("SOLEUS");
        assertThat(body.path("unitsPerType").path("S").intValue()).isEqualTo(5);
        assertThat(body.path("unitsPerType").path("FR").intValue()).isEqualTo(2);
        assertThat(body.path("somaGeometry").stringValue()).isEqualTo("CYLINDRICAL");
        assertThat(body.path("outputStepMs").doubleValue()).isEqualTo(0.1);
    }

    @Test
    void relaysTheVariantAndTrainsAndOmitsUnitsTheEngineChooses() throws InterruptedException {
        server.enqueue(ndjson(lines(SampleEvents.startedLine(), SampleEvents.completedLine())));
        SimulationRequest literature = new SimulationDefaults().resolve(Drafts.draft(
                Drafts.trains(60000.0, 330.0, 1000.0), ModelVariant.LITERATURE, null, null));

        StepVerifier.create(engine.stream(literature)).expectNextCount(2).expectComplete().verify(TIMEOUT);

        JsonNode body = jsonMapper.readTree(server.takeRequest(1, TimeUnit.SECONDS).getBody().utf8());
        assertThat(body.path("modelVariant").stringValue()).isEqualTo("LITERATURE");
        assertThat(body.has("unitsPerType")).as("unitsPerType left to the engine").isFalse();
        assertThat(body.path("stimulus").path("durationMs").doubleValue()).isEqualTo(60000);
        assertThat(body.path("stimulus").path("trainOnMs").doubleValue()).isEqualTo(330);
        assertThat(body.path("stimulus").path("trainPeriodMs").doubleValue()).isEqualTo(1000);
    }

    @Test
    void relaysTheStimulatorFields() throws InterruptedException {
        server.enqueue(ndjson(lines(SampleEvents.startedLine(), SampleEvents.completedLine())));
        SimulationRequest device = new SimulationDefaults().resolve(Drafts.stimulusOnly(Drafts.stimulator(
                35.0, 300.0, Waveform.BIPHASIC_SYMMETRIC, 5000.0, 10000.0, 1000.0, 500.0)));

        StepVerifier.create(engine.stream(device)).expectNextCount(2).expectComplete().verify(TIMEOUT);

        JsonNode stimulus = jsonMapper.readTree(server.takeRequest(1, TimeUnit.SECONDS).getBody().utf8()).path("stimulus");
        assertThat(stimulus.path("pulseWidthUs").doubleValue()).isEqualTo(300);
        assertThat(stimulus.path("waveform").stringValue()).isEqualTo("BIPHASIC_SYMMETRIC");
        assertThat(stimulus.path("rampUpMs").doubleValue()).isEqualTo(1000);
        assertThat(stimulus.path("rampDownMs").doubleValue()).isEqualTo(500);
    }

    @Test
    void relaysEachEventBeforeTheEngineWritesTheNextOne() {
        CountDownLatch firstEventRelayed = new CountDownLatch(1);
        AtomicBoolean engineSawTheRelay = new AtomicBoolean();
        server.enqueue(ndjson(new StreamingBody(sink -> {
            writeLine(sink, SampleEvents.startedLine());
            engineSawTheRelay.set(await(firstEventRelayed));
            writeLine(sink, SampleEvents.chunkLine(1.0));
            writeLine(sink, SampleEvents.completedLine());
        })));

        StepVerifier.create(engine.stream(request).doOnNext(event -> {
                    if (event instanceof SimulationStarted) {
                        firstEventRelayed.countDown();
                    }
                }))
                .expectNext(SampleEvents.started(), SampleEvents.chunk(1.0), SampleEvents.completed())
                .expectComplete()
                .verify(TIMEOUT);
        assertThat(engineSawTheRelay).as("the started event reached the subscriber while the engine was still writing")
                .isTrue();
    }

    @Test
    void reassemblesLinesSplitAcrossSlowSmallChunks() {
        String body = lines(SampleEvents.startedLine(), SampleEvents.chunkLine(0.5), SampleEvents.completedLine());
        server.enqueue(new MockResponse.Builder()
                .addHeader("Content-Type", NDJSON)
                .chunkedBody(body, 7)
                .throttleBody(32, 5, TimeUnit.MILLISECONDS)
                .build());

        StepVerifier.create(engine.stream(request))
                .expectNext(SampleEvents.started(), SampleEvents.chunk(0.5), SampleEvents.completed())
                .expectComplete()
                .verify(TIMEOUT);
    }

    @Test
    void skipsUnknownEventTypes() {
        server.enqueue(ndjson(lines(SampleEvents.startedLine(), "{\"type\":\"heartbeat\"}", SampleEvents.completedLine())));

        StepVerifier.create(engine.stream(request))
                .expectNext(SampleEvents.started(), SampleEvents.completed())
                .expectComplete()
                .verify(TIMEOUT);
    }

    @Test
    void malformedLineFailsTheStreamAfterTheEventsBeforeIt() {
        server.enqueue(ndjson(lines(SampleEvents.startedLine(), "{\"type\":\"chunk\",\"progress\":", SampleEvents.completedLine())));

        StepVerifier.create(engine.stream(request))
                .expectNext(SampleEvents.started())
                .expectError(EngineProtocolException.class)
                .verify(TIMEOUT);
    }

    @Test
    void connectionLostMidStreamIsReportedAsUnavailable() {
        server.enqueue(ndjson(new StreamingBody(sink -> {
            writeLine(sink, SampleEvents.startedLine());
            sink.close();
            throw new IOException("engine crashed before the final chunk");
        })));

        StepVerifier.create(engine.stream(request))
                .expectNext(SampleEvents.started())
                .expectError(EngineUnavailableException.class)
                .verify(TIMEOUT);
    }

    @Test
    void cancellingTheStreamClosesTheEngineConnection() {
        CountDownLatch connectionClosed = new CountDownLatch(1);
        server.enqueue(ndjson(new StreamingBody(sink -> {
            writeLine(sink, SampleEvents.startedLine());
            try {
                for (int i = 0; i < 400; i++) {
                    writeLine(sink, SampleEvents.chunkLine(0.001));
                    sleep(25);
                }
            } catch (IOException clientGone) {
                connectionClosed.countDown();
            }
        })));

        StepVerifier.create(engine.stream(request).take(1))
                .expectNext(SampleEvents.started())
                .expectComplete()
                .verify(TIMEOUT);
        assertThat(await(connectionClosed)).as("engine connection closed after cancel").isTrue();
    }

    @Test
    void unprocessableRequestIsRejectedWithTheEngineViolations() {
        server.enqueue(new MockResponse.Builder()
                .code(422)
                .addHeader("Content-Type", "application/json")
                .body("{\"detail\":[{\"loc\":[\"body\",\"stimulus\",\"stepMs\"],\"msg\":\"too small\"}]}")
                .build());

        StepVerifier.create(engine.stream(request))
                .expectErrorSatisfies(error -> assertThat(error)
                        .isInstanceOfSatisfying(EngineRejectedRequestException.class, rejected -> assertThat(
                                rejected.violations()).containsExactly(new FieldViolation("stimulus.stepMs", "too small"))))
                .verify(TIMEOUT);
    }

    @Test
    void serverErrorIsReportedAsUnavailable() {
        server.enqueue(new MockResponse.Builder().code(500).body("boom").build());

        StepVerifier.create(engine.stream(request)).expectError(EngineUnavailableException.class).verify(TIMEOUT);
    }

    @Test
    void unreachableEngineIsReportedAsUnavailable() {
        WebClientSimulationEngine offline = engineAt("http://127.0.0.1:" + closedPort());

        StepVerifier.create(offline.stream(request)).expectError(EngineUnavailableException.class).verify(TIMEOUT);
        StepVerifier.create(offline.listMuscles()).expectError(EngineUnavailableException.class).verify(TIMEOUT);
    }

    @Test
    void listsMusclePresets() throws InterruptedException {
        server.enqueue(new MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body("[{\"id\":\"SOLEUS\",\"label\":\"Soleus\",\"poolSize\":{\"S\":800,\"FR\":50,\"FF\":50}}]")
                .build());

        StepVerifier.create(engine.listMuscles())
                .expectNext(List.of(SampleEvents.soleus()))
                .expectComplete()
                .verify(TIMEOUT);
        assertThat(server.takeRequest(1, TimeUnit.SECONDS).getTarget()).isEqualTo("/v1/muscles");
    }

    @Test
    void incompleteMusclePresetIsAProtocolError() {
        server.enqueue(new MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body("[{\"id\":\"SOLEUS\",\"label\":\"Soleus\"}]")
                .build());

        StepVerifier.create(engine.listMuscles()).expectError(EngineProtocolException.class).verify(TIMEOUT);
    }

    private WebClientSimulationEngine engineAt(String baseUrl) {
        return new WebClientSimulationEngine(WebClient.builder().baseUrl(baseUrl).build(), jsonMapper);
    }

    private static MockResponse ndjson(String body) {
        return new MockResponse.Builder().addHeader("Content-Type", NDJSON).body(body).build();
    }

    private static MockResponse ndjson(StreamingBody body) {
        return new MockResponse.Builder()
                .body(body)
                .removeHeader("Content-Length")
                .addHeader("Content-Type", NDJSON)
                .addHeader("Transfer-Encoding", "chunked")
                .build();
    }

    private static String lines(String... lines) {
        return String.join("\n", lines) + "\n";
    }

    /** Writes one NDJSON line as its own HTTP chunk and flushes it to the client. */
    private static void writeLine(BufferedSink sink, String line) throws IOException {
        byte[] bytes = (line + "\n").getBytes(StandardCharsets.UTF_8);
        sink.writeUtf8(Integer.toHexString(bytes.length)).writeUtf8("\r\n").write(bytes).writeUtf8("\r\n");
        sink.flush();
    }

    private static boolean await(CountDownLatch latch) {
        try {
            return latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static int closedPort() {
        try (MockWebServer closed = new MockWebServer()) {
            closed.start(0);
            return closed.getPort();
        } catch (IOException failure) {
            throw new IllegalStateException(failure);
        }
    }

    /**
     * Chunked response body written by the test while the client reads it, like a streaming engine.
     * Throwing from the writer drops the connection without the final chunk.
     */
    private record StreamingBody(BodyWriter writer) implements MockResponseBody {

        @Override
        public long getContentLength() {
            return -1;
        }

        @Override
        public void writeTo(BufferedSink sink) throws IOException {
            writer.write(sink);
            sink.writeUtf8("0\r\n\r\n");
            sink.flush();
        }
    }

    @FunctionalInterface
    private interface BodyWriter {
        void write(BufferedSink sink) throws IOException;
    }
}

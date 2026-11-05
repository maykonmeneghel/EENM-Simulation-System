package com.meneghel.eenm.simulationapi.application.simulation;

import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.application.muscle.MusclePresetCatalog;
import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.event.SimulationFailed;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.support.FakeSimulationEngine;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

class RunSimulationUseCaseTest {

    private final FakeSimulationEngine engine = new FakeSimulationEngine();
    private final RunSimulationUseCase useCase =
            new RunSimulationUseCase(engine, new MusclePresetCatalog(engine, Duration.ZERO));

    @Test
    void sendsTheResolvedRequestAndRelaysEveryEvent() {
        engine.streaming(Flux.just(SampleEvents.started(), SampleEvents.chunk(0.5), SampleEvents.chunk(1),
                SampleEvents.completed()));

        StepVerifier.create(useCase.run(null))
                .expectNext(SampleEvents.started(), SampleEvents.chunk(0.5), SampleEvents.chunk(1),
                        SampleEvents.completed())
                .verifyComplete();
        assertThat(engine.requests()).containsExactly(new SimulationDefaults().resolve(null));
    }

    @Test
    void crossFieldViolationsFailBeforeTheEngineIsCalled() {
        SimulationDraft draft = new SimulationDraft(
                new StimulusDraft(null, null, null, null, null, null, new ModulationDraft(null, ModulationShape.TRIANGLE, null)),
                null, null, null, null, null, null, null, null, null);
        engine.withPresets(Mono.error(new EngineUnavailableException("down")));

        StepVerifier.create(useCase.run(draft))
                .expectErrorSatisfies(error -> assertThat(error)
                        .isInstanceOfSatisfying(InvalidSimulationRequestException.class, invalid -> assertThat(
                                invalid.violations()).extracting(FieldViolation::field)
                                .containsExactly("stimulus.modulation.peakTimeMs")))
                .verify();
        assertThat(engine.requests()).isEmpty();
    }

    @Test
    void unitsAboveThePoolSizeAreRejected() {
        SimulationDraft draft = new SimulationDraft(null, null, new MotorUnitCountsDraft(null, 51, null),
                null, null, null, null, null, null, null);

        StepVerifier.create(useCase.run(draft))
                .expectError(InvalidSimulationRequestException.class)
                .verify();
        assertThat(engine.requests()).isEmpty();
    }

    @Test
    void unreachablePresetsFailBeforeStreaming() {
        engine.withPresets(Mono.error(new EngineUnavailableException("down")));

        StepVerifier.create(useCase.run(null)).expectError(EngineUnavailableException.class).verify();
    }

    @Test
    void failureBeforeTheFirstEventPropagatesAsAnError() {
        engine.streaming(Flux.error(new EngineUnavailableException("connection refused")));

        StepVerifier.create(useCase.run(null)).expectError(EngineUnavailableException.class).verify();
    }

    @Test
    void lostEngineAfterTheFirstEventBecomesAnEngineUnavailableEvent() {
        engine.streaming(Flux.concat(Flux.just(SampleEvents.started()),
                Flux.error(new EngineUnavailableException("connection reset"))));

        StepVerifier.create(useCase.run(null))
                .expectNext(SampleEvents.started())
                .assertNext(event -> assertThat(event).isInstanceOfSatisfying(SimulationFailed.class,
                        failed -> assertThat(failed.code()).isEqualTo(SimulationFailed.ENGINE_UNAVAILABLE)))
                .verifyComplete();
    }

    @Test
    void malformedEventAfterTheFirstEventBecomesAnEngineFailureEvent() {
        engine.streaming(Flux.concat(Flux.just(SampleEvents.started()),
                Flux.error(new EngineProtocolException("not JSON"))));

        StepVerifier.create(useCase.run(null))
                .expectNext(SampleEvents.started())
                .assertNext(event -> assertThat(((SimulationFailed) event).code()).isEqualTo(SimulationFailed.ENGINE_FAILURE))
                .verifyComplete();
    }

    @Test
    void streamClosedWithoutTerminalEventEndsWithAnEngineFailureEvent() {
        engine.streaming(Flux.just(SampleEvents.started(), SampleEvents.chunk(0.5)));

        StepVerifier.create(useCase.run(null))
                .expectNext(SampleEvents.started(), SampleEvents.chunk(0.5))
                .assertNext(event -> assertThat(((SimulationFailed) event).code()).isEqualTo(SimulationFailed.ENGINE_FAILURE))
                .verifyComplete();
    }

    @Test
    void emptyStreamIsAProtocolError() {
        engine.streaming(Flux.empty());

        StepVerifier.create(useCase.run(null)).expectError(EngineProtocolException.class).verify();
    }

    @Test
    void streamStopsAfterTheTerminalEventAndCancelsTheEngine() {
        AtomicBoolean cancelled = new AtomicBoolean();
        Flux<SimulationEvent> endless = Flux.<SimulationEvent>just(SampleEvents.started(), SampleEvents.completed())
                .concatWith(Flux.never())
                .doOnCancel(() -> cancelled.set(true));
        engine.streaming(endless);

        StepVerifier.create(useCase.run(null))
                .expectNext(SampleEvents.started(), SampleEvents.completed())
                .verifyComplete();
        assertThat(cancelled).isTrue();
    }

    @Test
    void cancellingTheSimulationCancelsTheEngineStream() {
        AtomicBoolean cancelled = new AtomicBoolean();
        engine.streaming(Flux.<SimulationEvent>just(SampleEvents.started()).concatWith(Flux.never())
                .doOnCancel(() -> cancelled.set(true)));

        StepVerifier.create(useCase.run(null))
                .expectNext(SampleEvents.started())
                .thenCancel()
                .verify();
        assertThat(cancelled).isTrue();
    }
}

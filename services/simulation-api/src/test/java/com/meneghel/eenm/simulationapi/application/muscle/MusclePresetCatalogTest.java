package com.meneghel.eenm.simulationapi.application.muscle;

import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;
import com.meneghel.eenm.simulationapi.support.FakeSimulationEngine;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

class MusclePresetCatalogTest {

    @Test
    void findsThePresetOfTheRequestedMuscle() {
        MusclePresetCatalog catalog = new MusclePresetCatalog(new FakeSimulationEngine(), Duration.ofMinutes(1));

        StepVerifier.create(catalog.find(Muscle.SOLEUS)).expectNext(Optional.of(SampleEvents.soleus())).verifyComplete();
        StepVerifier.create(catalog.find(Muscle.TIBIALIS_ANTERIOR)).expectNext(Optional.empty()).verifyComplete();
    }

    @Test
    void cachesSuccessButRetriesAfterFailure() {
        AtomicInteger calls = new AtomicInteger();
        Mono<List<MusclePreset>> presets = Mono.defer(() -> calls.incrementAndGet() == 1
                ? Mono.error(new EngineUnavailableException("down"))
                : Mono.just(List.of(SampleEvents.soleus())));
        MusclePresetCatalog catalog =
                new MusclePresetCatalog(new FakeSimulationEngine().withPresets(presets), Duration.ofMinutes(1));

        StepVerifier.create(catalog.find(Muscle.SOLEUS)).expectError(EngineUnavailableException.class).verify();
        StepVerifier.create(catalog.find(Muscle.SOLEUS)).expectNextCount(1).verifyComplete();
        StepVerifier.create(catalog.find(Muscle.SOLEUS)).expectNextCount(1).verifyComplete();
        assertThat(calls).hasValue(2);
    }
}

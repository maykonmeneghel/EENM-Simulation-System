package com.meneghel.eenm.simulationapi.support;

import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import java.util.ArrayList;
import java.util.List;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Engine double: answers with the configured publishers and records the requests it received. */
public final class FakeSimulationEngine implements SimulationEngine {

    private final List<SimulationRequest> requests = new ArrayList<>();
    private Flux<SimulationEvent> events = Flux.empty();
    private Mono<List<MusclePreset>> presets = Mono.just(List.of(SampleEvents.soleus()));

    public FakeSimulationEngine streaming(Flux<SimulationEvent> events) {
        this.events = events;
        return this;
    }

    public FakeSimulationEngine withPresets(Mono<List<MusclePreset>> presets) {
        this.presets = presets;
        return this;
    }

    public List<SimulationRequest> requests() {
        return requests;
    }

    @Override
    public Flux<SimulationEvent> stream(SimulationRequest request) {
        return Flux.defer(() -> {
            requests.add(request);
            return events;
        });
    }

    @Override
    public Mono<List<MusclePreset>> listMuscles() {
        return presets;
    }
}

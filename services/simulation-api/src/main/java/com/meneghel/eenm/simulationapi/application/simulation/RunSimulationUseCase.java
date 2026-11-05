package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.application.muscle.MusclePresetCatalog;
import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import java.util.List;
import java.util.Optional;
import reactor.core.publisher.Flux;

/**
 * Resolves defaults, validates the cross-field rules and streams the simulation from the engine.
 * Validation failures are signalled as {@link InvalidSimulationRequestException} before any event.
 */
public final class RunSimulationUseCase {

    private final SimulationEngine engine;
    private final MusclePresetCatalog catalog;
    private final SimulationDefaults defaults;
    private final SimulationRequestRules rules;

    public RunSimulationUseCase(SimulationEngine engine, MusclePresetCatalog catalog) {
        this.engine = engine;
        this.catalog = catalog;
        this.defaults = new SimulationDefaults();
        this.rules = new SimulationRequestRules();
    }

    public Flux<SimulationEvent> run(SimulationDraft draft) {
        return Flux.defer(() -> {
            SimulationRequest request = defaults.resolve(draft);
            List<FieldViolation> violations = rules.check(request);
            if (!violations.isEmpty()) {
                return Flux.error(new InvalidSimulationRequestException(violations));
            }
            return catalog.find(request.muscle())
                    .flatMapMany(preset -> checkPoolSize(request, preset))
                    .thenMany(EventStreamGuard.guard(engine.stream(request)));
        });
    }

    private Flux<Void> checkPoolSize(SimulationRequest request, Optional<MusclePreset> preset) {
        List<FieldViolation> violations = preset
                .map(found -> rules.checkPoolSize(request.unitsPerType(), found))
                .orElse(List.of());
        return violations.isEmpty() ? Flux.empty() : Flux.error(new InvalidSimulationRequestException(violations));
    }
}

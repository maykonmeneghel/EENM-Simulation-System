package com.meneghel.eenm.simulationapi.config;

import com.meneghel.eenm.simulationapi.application.condition.ListConditionsUseCase;
import com.meneghel.eenm.simulationapi.application.muscle.ListMusclesUseCase;
import com.meneghel.eenm.simulationapi.application.muscle.MusclePresetCatalog;
import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.application.simulation.RunSimulationUseCase;
import com.meneghel.eenm.simulationapi.infrastructure.engine.EngineProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Composition root: wires the framework-free use cases to the engine adapter. */
@Configuration(proxyBeanMethods = false)
public class UseCaseConfiguration {

    @Bean
    MusclePresetCatalog musclePresetCatalog(SimulationEngine engine, EngineProperties properties) {
        return new MusclePresetCatalog(engine, properties.presetCacheTtl());
    }

    @Bean
    RunSimulationUseCase runSimulationUseCase(SimulationEngine engine, MusclePresetCatalog catalog) {
        return new RunSimulationUseCase(engine, catalog);
    }

    @Bean
    ListConditionsUseCase listConditionsUseCase(SimulationEngine engine) {
        return new ListConditionsUseCase(engine);
    }

    @Bean
    ListMusclesUseCase listMusclesUseCase(SimulationEngine engine) {
        return new ListMusclesUseCase(engine);
    }
}

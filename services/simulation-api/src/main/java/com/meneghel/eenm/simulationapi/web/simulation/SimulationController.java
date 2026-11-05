package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.application.simulation.RunSimulationUseCase;
import com.meneghel.eenm.simulationapi.web.validation.RequestValidator;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

/**
 * Runs a simulation and relays its events as Server-Sent Events while the engine produces them.
 * Errors raised before the first event become problem+json responses; when the browser disconnects,
 * the subscription is cancelled and the engine call is closed.
 */
@RestController
@RequestMapping("/api/v1/simulations")
public class SimulationController {

    private final RunSimulationUseCase runSimulation;
    private final RequestValidator validator;
    private final SimulationRequestDtoMapper requestMapper = new SimulationRequestDtoMapper();
    private final SimulationEventSseMapper eventMapper = new SimulationEventSseMapper();

    public SimulationController(RunSimulationUseCase runSimulation, RequestValidator validator) {
        this.runSimulation = runSimulation;
        this.validator = validator;
    }

    @PostMapping
    public Flux<ServerSentEvent<Object>> simulate(@RequestBody(required = false) SimulationRequestDto request) {
        return Flux.defer(() -> {
            if (request != null) {
                validator.validate(request);
            }
            return runSimulation.run(requestMapper.toDraft(request)).map(eventMapper::toSse);
        });
    }
}

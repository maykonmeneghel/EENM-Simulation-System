package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.application.simulation.RunSimulationUseCase;
import com.meneghel.eenm.simulationapi.web.validation.RequestValidator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

/**
 * Runs a simulation and relays its events as Server-Sent Events while the engine produces them.
 * Errors raised before the first event become problem+json responses; when the browser disconnects,
 * the subscription is cancelled and the engine call is closed. With sign-in on, the user's uid (the token's
 * {@code sub}, never the e-mail) is logged for every simulation.
 */
@RestController
@RequestMapping("/api/v1/simulations")
public class SimulationController {

    private static final Logger LOGGER = LoggerFactory.getLogger(SimulationController.class);

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
        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .filter(JwtAuthenticationToken.class::isInstance)
                .doOnNext(user -> LOGGER.info("simulation requested by uid={}", user.getName()))
                .thenMany(Flux.defer(() -> {
                    if (request != null) {
                        validator.validate(request);
                    }
                    return runSimulation.run(requestMapper.toDraft(request)).map(eventMapper::toSse);
                }));
    }
}

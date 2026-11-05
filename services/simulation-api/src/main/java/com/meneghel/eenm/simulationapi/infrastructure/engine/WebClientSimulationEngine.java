package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.application.port.EngineRejectedRequestException;
import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.application.port.SimulationEngine;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import java.util.List;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.codec.CodecException;
import org.springframework.core.io.buffer.DataBufferLimitException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;

/**
 * {@link SimulationEngine} over HTTP. The NDJSON body is decoded line by line as it arrives, so each
 * event is passed on as soon as the engine writes it. Cancelling the returned {@link Flux} closes the
 * connection to the engine.
 */
public class WebClientSimulationEngine implements SimulationEngine {

    private static final String STREAM_PATH = "/v1/simulations/stream";
    private static final String MUSCLES_PATH = "/v1/muscles";
    private static final ParameterizedTypeReference<List<EngineMusclePresetBody>> PRESET_LIST =
            new ParameterizedTypeReference<>() {
            };

    private final WebClient webClient;
    private final EngineRequestMapper requestMapper = new EngineRequestMapper();
    private final EngineMusclePresetMapper presetMapper = new EngineMusclePresetMapper();
    private final EngineEventParser eventParser;
    private final EngineValidationErrorTranslator errorTranslator;

    public WebClientSimulationEngine(WebClient webClient, ObjectMapper objectMapper) {
        this.webClient = webClient;
        this.eventParser = new EngineEventParser(objectMapper);
        this.errorTranslator = new EngineValidationErrorTranslator(objectMapper);
    }

    @Override
    public Flux<SimulationEvent> stream(SimulationRequest request) {
        return webClient.post()
                .uri(STREAM_PATH)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_NDJSON)
                .bodyValue(requestMapper.toBody(request))
                .exchangeToFlux(this::readEvents)
                .onErrorMap(WebClientSimulationEngine::isTransportFailure, WebClientSimulationEngine::toEngineFailure);
    }

    @Override
    public Mono<List<MusclePreset>> listMuscles() {
        return webClient.get()
                .uri(MUSCLES_PATH)
                .accept(MediaType.APPLICATION_JSON)
                .exchangeToMono(this::readPresets)
                .onErrorMap(WebClientSimulationEngine::isTransportFailure, WebClientSimulationEngine::toEngineFailure);
    }

    private Flux<SimulationEvent> readEvents(ClientResponse response) {
        if (response.statusCode().isSameCodeAs(HttpStatus.UNPROCESSABLE_CONTENT)) {
            return response.bodyToMono(String.class)
                    .defaultIfEmpty("")
                    .flatMapMany(body -> Flux.error(new EngineRejectedRequestException(errorTranslator.translate(body))));
        }
        if (!response.statusCode().is2xxSuccessful()) {
            return response.releaseBody().thenMany(Flux.error(unexpectedStatus(response)));
        }
        return response.bodyToFlux(String.class)
                .filter(line -> !line.isBlank())
                .handle((line, sink) -> eventParser.parse(line).ifPresent(sink::next));
    }

    private Mono<List<MusclePreset>> readPresets(ClientResponse response) {
        if (!response.statusCode().is2xxSuccessful()) {
            return response.releaseBody().then(Mono.error(unexpectedStatus(response)));
        }
        return response.bodyToMono(PRESET_LIST)
                .defaultIfEmpty(List.of())
                .map(presetMapper::toDomain);
    }

    private static EngineUnavailableException unexpectedStatus(ClientResponse response) {
        return new EngineUnavailableException("The simulation engine answered HTTP " + response.statusCode().value());
    }

    private static boolean isTransportFailure(Throwable error) {
        return !(error instanceof EngineProtocolException
                || error instanceof EngineRejectedRequestException
                || error instanceof EngineUnavailableException);
    }

    private static RuntimeException toEngineFailure(Throwable error) {
        if (error instanceof DataBufferLimitException) {
            return new EngineProtocolException("The simulation engine sent an event larger than the configured limit", error);
        }
        if (error instanceof CodecException) {
            return new EngineProtocolException("The simulation engine sent a body that cannot be decoded", error);
        }
        return new EngineUnavailableException("The simulation engine is unreachable", error);
    }
}

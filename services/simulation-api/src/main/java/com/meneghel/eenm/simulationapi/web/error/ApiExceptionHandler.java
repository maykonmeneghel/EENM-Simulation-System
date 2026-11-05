package com.meneghel.eenm.simulationapi.web.error;

import com.meneghel.eenm.simulationapi.application.port.EngineProtocolException;
import com.meneghel.eenm.simulationapi.application.port.EngineRejectedRequestException;
import com.meneghel.eenm.simulationapi.application.port.EngineUnavailableException;
import com.meneghel.eenm.simulationapi.application.simulation.FieldViolation;
import com.meneghel.eenm.simulationapi.application.simulation.InvalidSimulationRequestException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.reactive.result.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.ServerWebInputException;
import reactor.core.publisher.Mono;

/**
 * Renders every error as RFC 9457 {@code application/problem+json}. Validation problems carry an
 * {@code errors} array of {@code {field, message}}.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);
    private static final String ERRORS_PROPERTY = "errors";
    private static final String INVALID_REQUEST_TITLE = "Invalid simulation request";

    private final RequestBodyErrorTranslator bodyErrorTranslator = new RequestBodyErrorTranslator();

    @ExceptionHandler(InvalidSimulationRequestException.class)
    ResponseEntity<ProblemDetail> handleInvalidRequest(InvalidSimulationRequestException error) {
        return validationProblem("One or more fields are invalid.", toInvalidFields(error.violations()));
    }

    @ExceptionHandler(EngineRejectedRequestException.class)
    ResponseEntity<ProblemDetail> handleEngineRejection(EngineRejectedRequestException error) {
        return validationProblem("The simulation engine rejected the request.", toInvalidFields(error.violations()));
    }

    @ExceptionHandler(EngineUnavailableException.class)
    ResponseEntity<ProblemDetail> handleEngineUnavailable(EngineUnavailableException error) {
        LOGGER.warn("Simulation engine unavailable: {}", error.getMessage());
        return badGateway("Simulation engine unavailable", "The simulation engine could not be reached.");
    }

    @ExceptionHandler(EngineProtocolException.class)
    ResponseEntity<ProblemDetail> handleEngineProtocol(EngineProtocolException error) {
        LOGGER.warn("Invalid answer from the simulation engine: {}", error.getMessage());
        return badGateway("Invalid simulation engine response", "The simulation engine sent an invalid response.");
    }

    @Override
    protected Mono<ResponseEntity<Object>> handleServerWebInputException(ServerWebInputException error,
            HttpHeaders headers, HttpStatusCode status, ServerWebExchange exchange) {
        List<InvalidField> fields = bodyErrorTranslator.translate(error).map(List::of).orElse(List.of());
        String detail = fields.isEmpty() ? "The request body is not valid JSON." : "One or more fields are invalid.";
        ResponseEntity<ProblemDetail> response = validationProblem(detail, fields);
        return Mono.just(ResponseEntity.status(response.getStatusCode())
                .headers(response.getHeaders())
                .body(response.getBody()));
    }

    private static ResponseEntity<ProblemDetail> validationProblem(String detail, List<InvalidField> fields) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
        problem.setTitle(INVALID_REQUEST_TITLE);
        problem.setProperty(ERRORS_PROPERTY, fields);
        return asProblemJson(HttpStatus.BAD_REQUEST, problem);
    }

    private static ResponseEntity<ProblemDetail> badGateway(String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, detail);
        problem.setTitle(title);
        return asProblemJson(HttpStatus.BAD_GATEWAY, problem);
    }

    private static ResponseEntity<ProblemDetail> asProblemJson(HttpStatus status, ProblemDetail problem) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
    }

    private static List<InvalidField> toInvalidFields(List<FieldViolation> violations) {
        return violations.stream().map(InvalidField::from).toList();
    }
}

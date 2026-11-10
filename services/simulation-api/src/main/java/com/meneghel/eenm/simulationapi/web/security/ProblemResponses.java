package com.meneghel.eenm.simulationapi.web.security;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;

/** RFC 9457 problem+json written by the web filters, which run before the controllers' exception handler. */
final class ProblemResponses {

    private final ObjectMapper objectMapper;

    ProblemResponses(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    Mono<Void> write(ServerWebExchange exchange, HttpStatus status, String title, String detail) {
        ServerHttpResponse response = exchange.getResponse();
        if (response.isCommitted()) {
            return Mono.empty();
        }
        Map<String, Object> problem = new LinkedHashMap<>();
        problem.put("type", "about:blank");
        problem.put("title", title);
        problem.put("status", status.value());
        problem.put("detail", detail);
        problem.put("instance", exchange.getRequest().getPath().value());
        byte[] body = objectMapper.writeValueAsString(problem).getBytes(StandardCharsets.UTF_8);
        response.setStatusCode(status);
        response.getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        response.getHeaders().setContentLength(body.length);
        DataBuffer buffer = response.bufferFactory().wrap(body);
        return response.writeWith(Mono.just(buffer));
    }
}

package com.meneghel.eenm.simulationapi.web.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * Origin lock: with {@code EENM_ORIGIN_SECRET} set, only requests carrying {@code X-Origin-Verify: <secret>} (added by
 * CloudFront) are served, so the Lambda function URL cannot be called around the CDN. The health check stays open
 * for the Lambda Web Adapter's readiness probe. Registered only when the secret is set (SecurityConfiguration).
 */
final class OriginVerifyFilter implements WebFilter, Ordered {

    static final String HEADER = "X-Origin-Verify";
    private static final String HEALTH = "/actuator/health";

    private final byte[] secret;
    private final ProblemResponses problems;

    OriginVerifyFilter(String secret, ProblemResponses problems) {
        if (secret == null || secret.isEmpty()) {
            throw new IllegalArgumentException("the origin secret must not be empty");
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.problems = problems;
    }

    /** Before Spring Security's filter chain (order -100): a request around the CDN is refused before anything else. */
    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().pathWithinApplication().value();
        if (path.equals(HEALTH) || path.startsWith(HEALTH + "/") || verified(exchange)) {
            return chain.filter(exchange);
        }
        return problems.write(exchange, HttpStatus.FORBIDDEN, "Forbidden",
                "Requests must come through the site's CDN.");
    }

    private boolean verified(ServerWebExchange exchange) {
        String supplied = exchange.getRequest().getHeaders().getFirst(HEADER);
        // MessageDigest.isEqual: constant time, it does not stop at the first differing byte
        return supplied != null && MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8), secret);
    }
}

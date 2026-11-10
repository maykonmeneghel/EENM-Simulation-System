package com.meneghel.eenm.simulationapi.web.security;

import java.util.Collections;
import java.util.Map;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * {@code GET /api/v1/session}: lets the web app check, right after sign-in, that the account may use the simulator.
 * With sign-in on it is protected like the simulations (401 without a valid token, 403 for an account not allowed)
 * and answers {@code {"uid": "<uid>"}}; with sign-in off it answers {@code {"uid": null}}.
 */
@RestController
public class SessionController {

    @GetMapping("/api/v1/session")
    public Mono<Map<String, String>> session() {
        return ReactiveSecurityContextHolder.getContext()
                .map(SecurityContext::getAuthentication)
                .filter(JwtAuthenticationToken.class::isInstance)
                .map(user -> Collections.singletonMap("uid", user.getName()))
                .defaultIfEmpty(Collections.singletonMap("uid", null));
    }
}

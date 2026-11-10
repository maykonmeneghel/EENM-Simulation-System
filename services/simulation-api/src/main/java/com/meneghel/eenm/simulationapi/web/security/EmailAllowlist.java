package com.meneghel.eenm.simulationapi.web.security;

import java.util.Locale;
import java.util.Set;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.authorization.ReactiveAuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.server.authorization.AuthorizationContext;
import reactor.core.publisher.Mono;

/**
 * Who may run simulations once signed in: a verified e-mail ({@code email_verified} true), and, when the allowlist
 * ({@code EENM_AUTH_ALLOWED_EMAILS}) is not empty, one of its addresses (trimmed, case-insensitive). A refusal is 403
 * and never says which addresses are allowed.
 */
final class EmailAllowlist implements ReactiveAuthorizationManager<AuthorizationContext> {

    private final Set<String> allowed;

    EmailAllowlist(Set<String> allowed) {
        this.allowed = Set.copyOf(allowed);
    }

    @Override
    public Mono<AuthorizationResult> authorize(Mono<Authentication> authentication, AuthorizationContext context) {
        return authentication
                .filter(Authentication::isAuthenticated)
                .filter(JwtAuthenticationToken.class::isInstance)
                .<AuthorizationResult>map(token -> new AuthorizationDecision(
                        permits(((JwtAuthenticationToken) token).getToken())))
                .defaultIfEmpty(new AuthorizationDecision(false));
    }

    boolean permits(Jwt token) {
        if (!Boolean.TRUE.equals(token.getClaimAsBoolean("email_verified"))) {
            return false;
        }
        if (allowed.isEmpty()) {
            return true;
        }
        String email = token.getClaimAsString("email");
        return email != null && allowed.contains(email.trim().toLowerCase(Locale.ROOT));
    }
}

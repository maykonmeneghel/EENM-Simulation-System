package com.meneghel.eenm.simulationapi.web.security;

import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.context.NoOpServerSecurityContextRepository;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import tools.jackson.databind.ObjectMapper;

/**
 * Security of the hosted deployment (docs/deployment.md). Without {@code EENM_AUTH_FIREBASE_PROJECT_ID} every request
 * is let through and no header is added, as before Spring Security was on the classpath. With it, every endpoint
 * except the catalogues ({@code muscles}, {@code conditions}, {@code limits}), the health check and CORS preflights
 * needs a valid Firebase ID token ({@code Authorization: Bearer}) of a verified e-mail in {@code
 * EENM_AUTH_ALLOWED_EMAILS} (any verified e-mail when the list is empty): no or a bad token is 401 problem+json, an
 * account not allowed 403 problem+json. Stateless: no
 * session, no CSRF token (no cookie is used), no login page.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(HostedSecurityProperties.class)
public class SecurityConfiguration {

    private static final Logger LOGGER = LoggerFactory.getLogger(SecurityConfiguration.class);

    private static final String[] PUBLIC_GETS = {
        "/api/v1/muscles", "/api/v1/conditions", "/api/v1/limits", "/actuator/health", "/actuator/health/**"
    };

    @Bean
    ProblemResponses problemResponses(ObjectMapper objectMapper) {
        return new ProblemResponses(objectMapper);
    }

    @Bean
    SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http, HostedSecurityProperties properties,
            ProblemResponses problems) {
        http.csrf(ServerHttpSecurity.CsrfSpec::disable)
                .httpBasic(ServerHttpSecurity.HttpBasicSpec::disable)
                .formLogin(ServerHttpSecurity.FormLoginSpec::disable)
                .logout(ServerHttpSecurity.LogoutSpec::disable)
                .requestCache(cache -> cache.disable())
                .securityContextRepository(NoOpServerSecurityContextRepository.getInstance());
        if (!properties.auth().enabled()) {
            return http.headers(ServerHttpSecurity.HeaderSpec::disable)
                    .authorizeExchange(exchanges -> exchanges.anyExchange().permitAll())
                    .build();
        }
        return http
                .authorizeExchange(exchanges -> exchanges
                        .pathMatchers(HttpMethod.OPTIONS).permitAll()
                        .pathMatchers(HttpMethod.GET, PUBLIC_GETS).permitAll()
                        .anyExchange().access(emailAllowlist(properties.auth())))
                .oauth2ResourceServer(server -> server
                        .jwt(jwt -> jwt.jwtDecoder(firebaseJwtDecoder(properties.auth())))
                        .authenticationEntryPoint((exchange, error) -> unauthorized(exchange, problems))
                        .accessDeniedHandler((exchange, denied) -> forbidden(exchange, problems)))
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint((exchange, error) -> unauthorized(exchange, problems))
                        .accessDeniedHandler((exchange, denied) -> forbidden(exchange, problems)))
                .build();
    }

    /** RS256 signatures checked against Google's JWKS (fetched on the first token, then cached), then the claims. */
    static ReactiveJwtDecoder firebaseJwtDecoder(HostedSecurityProperties.Auth auth) {
        NimbusReactiveJwtDecoder decoder = NimbusReactiveJwtDecoder.withJwkSetUri(auth.jwkSetUri().toString())
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(FirebaseTokenValidators.forProject(auth.firebaseProjectId(), Clock.systemUTC()));
        return decoder;
    }

    /** Registered only with {@code EENM_ORIGIN_SECRET}; a no-op filter otherwise. */
    @Bean
    WebFilter originVerifyFilter(HostedSecurityProperties properties, ProblemResponses problems) {
        if (properties.locksOrigin()) {
            return new OriginVerifyFilter(properties.originSecret(), problems);
        }
        return SecurityConfiguration::passThrough;
    }

    private static Mono<Void> passThrough(ServerWebExchange exchange, WebFilterChain chain) {
        return chain.filter(exchange);
    }

    private static EmailAllowlist emailAllowlist(HostedSecurityProperties.Auth auth) {
        if (auth.allowlist().isEmpty()) {
            LOGGER.warn("Sign-in is on and EENM_AUTH_ALLOWED_EMAILS is empty: any verified Google account may run "
                    + "simulations");
        } else {
            LOGGER.info("Sign-in is on: {} allowed e-mail address(es)", auth.allowlist().size());
        }
        return new EmailAllowlist(auth.allowlist());
    }

    /** The same answer for every refused account: the allowlist is not revealed. */
    private static Mono<Void> forbidden(ServerWebExchange exchange, ProblemResponses problems) {
        return problems.write(exchange, HttpStatus.FORBIDDEN, "Forbidden",
                "This account does not have access to this simulator.");
    }

    private static Mono<Void> unauthorized(ServerWebExchange exchange, ProblemResponses problems) {
        exchange.getResponse().getHeaders().set("WWW-Authenticate", "Bearer");
        return problems.write(exchange, HttpStatus.UNAUTHORIZED, "Unauthorized",
                "Sign in to run simulations (Authorization: Bearer <Firebase ID token>).");
    }
}

package com.meneghel.eenm.simulationapi.web.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtAudienceValidator;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;

/**
 * Checks of a Firebase ID token after its RS256 signature (firebase.google.com/docs/auth/admin/verify-id-tokens):
 * {@code exp} in the future and {@code iat} in the past (60 s of clock skew), {@code aud} = the project id,
 * {@code iss} = {@code https://securetoken.google.com/<projectId>}, a non-empty {@code sub} (the user's uid) and an
 * {@code auth_time} in the past.
 */
final class FirebaseTokenValidators {

    static final Duration CLOCK_SKEW = Duration.ofSeconds(60);

    private FirebaseTokenValidators() {
    }

    static OAuth2TokenValidator<Jwt> forProject(String projectId, Clock clock) {
        JwtTimestampValidator timestamps = new JwtTimestampValidator(CLOCK_SKEW);
        timestamps.setClock(clock);
        return new DelegatingOAuth2TokenValidator<>(List.of(
                timestamps,
                new JwtIssuerValidator("https://securetoken.google.com/" + projectId),
                new JwtAudienceValidator(projectId),
                FirebaseTokenValidators::hasSubject,
                jwt -> inThePast(jwt, clock)));
    }

    private static OAuth2TokenValidatorResult hasSubject(Jwt jwt) {
        String subject = jwt.getSubject();
        return subject != null && !subject.isBlank() ? OAuth2TokenValidatorResult.success()
                : failure("The token has no subject (uid)");
    }

    private static OAuth2TokenValidatorResult inThePast(Jwt jwt, Clock clock) {
        Instant now = clock.instant().plus(CLOCK_SKEW);
        Instant issuedAt = jwt.getIssuedAt();
        if (issuedAt == null || issuedAt.isAfter(now)) {
            return failure("The token was issued in the future");
        }
        Object authTime = jwt.getClaims().get("auth_time");
        Instant authenticatedAt = authTime instanceof Number seconds ? Instant.ofEpochSecond(seconds.longValue())
                : authTime instanceof Instant instant ? instant : null;
        if (authenticatedAt == null || authenticatedAt.isAfter(now)) {
            return failure("The token has no auth_time in the past");
        }
        return OAuth2TokenValidatorResult.success();
    }

    private static OAuth2TokenValidatorResult failure(String description) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error(OAuth2ErrorCodes.INVALID_TOKEN, description, null));
    }
}

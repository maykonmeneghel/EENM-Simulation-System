package com.meneghel.eenm.simulationapi.web.security;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Guards of the hosted deployment (docs/deployment.md); all off when empty.
 *
 * @param originSecret value CloudFront sends as {@code X-Origin-Verify} (env {@code EENM_ORIGIN_SECRET})
 * @param auth         Firebase sign-in
 */
@ConfigurationProperties("eenm")
public record HostedSecurityProperties(@DefaultValue("") String originSecret, @DefaultValue Auth auth) {

    /**
     * @param firebaseProjectId the Firebase project whose ID tokens run simulations (env
     *                          {@code EENM_AUTH_FIREBASE_PROJECT_ID}); empty = no login
     * @param allowedEmails     e-mails that may run simulations (env {@code EENM_AUTH_ALLOWED_EMAILS}, comma
     *                          separated; compared trimmed and case-insensitively); empty = any verified account
     * @param jwkSetUri         public keys of the Firebase ID tokens (Google's securetoken JWKS)
     */
    public record Auth(
            @DefaultValue("") String firebaseProjectId,
            @DefaultValue("") List<String> allowedEmails,
            @DefaultValue("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
            URI jwkSetUri) {

        /** The allowlist, normalised (trimmed, lower case, blanks dropped). */
        public Set<String> allowlist() {
            return allowedEmails == null ? Set.of() : allowedEmails.stream()
                    .map(email -> email.trim().toLowerCase(Locale.ROOT))
                    .filter(email -> !email.isEmpty())
                    .collect(Collectors.toUnmodifiableSet());
        }

        public boolean enabled() {
            return firebaseProjectId != null && !firebaseProjectId.isBlank();
        }

        /** Issuer of the project's ID tokens. */
        public String issuer() {
            return "https://securetoken.google.com/" + firebaseProjectId;
        }
    }

    public boolean locksOrigin() {
        return originSecret != null && !originSecret.isEmpty();
    }
}

package com.meneghel.eenm.simulationapi.web.security;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.time.Instant;
import java.util.Date;
import java.util.function.UnaryOperator;
import mockwebserver3.Dispatcher;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;

/** Firebase-like ID tokens signed with a test RSA key, and a MockWebServer serving its JWKS (Google's role). */
final class FirebaseTokens {

    static final String PROJECT = "nmes-demo";
    static final String ISSUER = "https://securetoken.google.com/" + PROJECT;
    static final RSAKey KEY = generate("google-key");
    static final RSAKey OTHER_KEY = generate("google-key");

    private FirebaseTokens() {
    }

    static MockWebServer jwksServer() {
        MockWebServer server = new MockWebServer();
        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                return new MockResponse.Builder().addHeader("Content-Type", "application/json")
                        .body(new JWKSet(KEY.toPublicJWK()).toString()).build();
            }
        });
        return server;
    }

    /** A valid token of {@code someone@example.com} (verified), changed by {@code change}. */
    static String token(UnaryOperator<JWTClaimsSet.Builder> change) {
        return token(change, KEY);
    }

    static String token(UnaryOperator<JWTClaimsSet.Builder> change, RSAKey key) {
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .audience(PROJECT)
                .subject("uid-123")
                .claim("user_id", "uid-123")
                .claim("email", "someone@example.com")
                .claim("email_verified", true)
                .claim("auth_time", now.minusSeconds(30).getEpochSecond())
                .issueTime(Date.from(now.minusSeconds(30)))
                .expirationTime(Date.from(now.plusSeconds(3600)));
        try {
            SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID())
                    .type(JOSEObjectType.JWT).build(), change.apply(claims).build());
            jwt.sign(new RSASSASigner(key));
            return jwt.serialize();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static RSAKey generate(String keyId) {
        try {
            return new RSAKeyGenerator(2048).keyID(keyId).generate();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

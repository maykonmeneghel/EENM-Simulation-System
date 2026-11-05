package com.meneghel.eenm.simulationapi.web.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Browser origins allowed to call the API (env {@code API_CORS_ALLOWED_ORIGINS}, comma separated). */
@ConfigurationProperties("api.cors")
public record CorsProperties(@DefaultValue("http://localhost:5173") List<String> allowedOrigins) {
}

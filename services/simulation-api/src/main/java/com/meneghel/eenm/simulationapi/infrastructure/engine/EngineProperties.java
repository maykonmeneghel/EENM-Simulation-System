package com.meneghel.eenm.simulationapi.infrastructure.engine;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

/**
 * Connection settings for the simulation engine.
 *
 * @param baseUrl        engine root URL (env {@code ENGINE_BASE_URL})
 * @param connectTimeout how long to wait for a TCP connection before the engine counts as unavailable
 * @param maxLineSize    largest NDJSON line (one event) accepted from the engine
 * @param presetCacheTtl how long muscle presets used for validation are cached
 */
@ConfigurationProperties("engine")
public record EngineProperties(
        @DefaultValue("http://localhost:8001") URI baseUrl,
        @DefaultValue("2s") Duration connectTimeout,
        @DefaultValue("16MB") DataSize maxLineSize,
        @DefaultValue("10m") Duration presetCacheTtl) {
}

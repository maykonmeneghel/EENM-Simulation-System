package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.fasterxml.jackson.annotation.JsonProperty;

/** One element of the engine's {@code GET /v1/muscles} answer. */
record EngineMusclePresetBody(String id, String label, PoolSize poolSize) {

    record PoolSize(
            @JsonProperty("S") Integer slow,
            @JsonProperty("FR") Integer fastResistant,
            @JsonProperty("FF") Integer fastFatigable) {
    }
}

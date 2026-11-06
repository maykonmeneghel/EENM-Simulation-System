package com.meneghel.eenm.simulationapi.infrastructure.engine;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** One element of the engine's {@code GET /v1/muscles} answer. */
record EngineMusclePresetBody(String id, String label, PoolSize poolSize, List<FieldSource> provenance) {

    record PoolSize(
            @JsonProperty("S") Integer slow,
            @JsonProperty("FR") Integer fastResistant,
            @JsonProperty("FF") Integer fastFatigable) {
    }

    record FieldSource(
            String field, String provenance, String value, Source source, String evidence, String calibrationTarget) {
    }

    record Source(String citation, String title, String doi, String pmid) {
    }
}

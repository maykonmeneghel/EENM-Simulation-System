package com.meneghel.eenm.simulationapi.domain.muscle;

import java.util.Objects;

/**
 * Where one value of a muscle preset comes from: measured in this muscle, fitted to its data, or inherited from the
 * soleus preset. {@code source}, {@code evidence} and {@code calibrationTarget} may be null.
 */
public record PresetFieldSource(
        String field, String provenance, String value, Reference source, String evidence, String calibrationTarget) {

    public PresetFieldSource {
        Objects.requireNonNull(field, "field");
        Objects.requireNonNull(provenance, "provenance");
        Objects.requireNonNull(value, "value");
    }

    /** A paper: citation, title and a DOI or PubMed id (either may be null). */
    public record Reference(String citation, String title, String doi, String pmid) {
    }
}

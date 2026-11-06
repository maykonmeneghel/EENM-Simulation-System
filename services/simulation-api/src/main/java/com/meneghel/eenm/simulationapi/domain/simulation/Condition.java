package com.meneghel.eenm.simulationapi.domain.simulation;

/**
 * Clinical condition of the {@link ModelVariant#LITERATURE} model; its per-article adjustments and their sources are
 * defined by the engine ({@code GET /api/v1/conditions}). Ignored by {@link ModelVariant#ORIGINAL}.
 */
public enum Condition {
    NORMAL,
    PARKINSON,
    SCI_CHRONIC
}

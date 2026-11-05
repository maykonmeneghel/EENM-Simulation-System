package com.meneghel.eenm.simulationapi.domain.simulation;

/**
 * Which model the engine runs: the MATLAB model as ported, or the version with the corrections
 * validated against the literature.
 */
public enum ModelVariant {
    ORIGINAL,
    LITERATURE
}

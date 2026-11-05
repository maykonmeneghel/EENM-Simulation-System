package com.meneghel.eenm.simulationapi.domain.simulation;

/**
 * Where the {@link ModelVariant#LITERATURE} stimulus acts. {@link ModelVariant#ORIGINAL} always injects the current
 * into the motoneurons.
 */
public enum StimulationSite {
    /** Surface FES: the motor axons are excited (Weiss strength-duration). */
    SKIN_SURFACE,
    /** The current enters the two-compartment motoneurons (the master's-thesis model); about 3x slower. */
    MOTONEURON_POOL
}

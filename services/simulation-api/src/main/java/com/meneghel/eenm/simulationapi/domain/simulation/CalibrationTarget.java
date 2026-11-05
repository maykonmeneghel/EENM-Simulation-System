package com.meneghel.eenm.simulationapi.domain.simulation;

/**
 * Which human data the twitch of the {@link ModelVariant#LITERATURE} variant is calibrated to. The two
 * verified datasets cannot both be met; see {@code docs/validation/literature-comparison.md}. No effect on
 * {@link ModelVariant#ORIGINAL}.
 */
public enum CalibrationTarget {
    /** Twitch of the whole human triceps surae: whole-muscle twitch matches, f50 is low (about 5 Hz). */
    WHOLE_MUSCLE,
    /** Mean twitch of single human motor units: f50 matches (about 9 Hz), whole-muscle twitch is fast. */
    SINGLE_UNIT
}

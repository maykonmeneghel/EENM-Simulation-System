package com.meneghel.eenm.simulationapi.domain.simulation;

public enum Waveform {
    MONOPHASIC,
    /** {@code FES.m}'s raw square wave (+1 for the duty cycle, -1 for the rest of the period). */
    BIPHASIC,
    /** A stimulator's charge-balanced pulse: +A then -A, each for {@code pulseWidthUs}. Needs {@code pulseWidthUs}. */
    BIPHASIC_SYMMETRIC
}

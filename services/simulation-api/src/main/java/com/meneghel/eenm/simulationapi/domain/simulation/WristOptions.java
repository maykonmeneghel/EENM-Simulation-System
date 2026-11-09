package com.meneghel.eenm.simulationapi.domain.simulation;

import java.util.Objects;

/** The wrist model's choices where the sources disagree (forearm runs only). */
public record WristOptions(WristPeakForce peakForce, WristPassiveModel passive) {

    public static final WristOptions DEFAULT = new WristOptions(WristPeakForce.SAUL_2015, WristPassiveModel.LINEAR);

    public WristOptions {
        Objects.requireNonNull(peakForce, "peakForce");
        Objects.requireNonNull(passive, "passive");
    }
}

package com.meneghel.eenm.simulationapi.domain.event;

import java.util.List;
import java.util.Objects;

/** Wrist angle (degrees, positive = flexion) and the muscle's torque (N·m) at the chunk's samples. */
public record JointSeries(List<Double> angleDeg, List<Double> torqueNm) {

    public JointSeries {
        if (Objects.requireNonNull(angleDeg, "angleDeg").size() != Objects.requireNonNull(torqueNm, "torqueNm").size()) {
            throw new IllegalArgumentException("angleDeg and torqueNm must have the same length");
        }
        angleDeg = List.copyOf(angleDeg);
        torqueNm = List.copyOf(torqueNm);
    }
}

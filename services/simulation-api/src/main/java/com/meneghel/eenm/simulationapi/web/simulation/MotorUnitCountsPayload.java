package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;

/** Motor units per type on the wire; component names are the JSON keys. */
public record MotorUnitCountsPayload(int S, int FR, int FF) {

    public static MotorUnitCountsPayload from(MotorUnitCounts counts) {
        return new MotorUnitCountsPayload(counts.slow(), counts.fastResistant(), counts.fastFatigable());
    }
}

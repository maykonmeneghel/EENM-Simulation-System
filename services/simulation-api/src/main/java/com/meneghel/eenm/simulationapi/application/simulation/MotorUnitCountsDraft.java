package com.meneghel.eenm.simulationapi.application.simulation;

/** Motor units per type as received; any field may be {@code null}. */
public record MotorUnitCountsDraft(Integer slow, Integer fastResistant, Integer fastFatigable) {
}

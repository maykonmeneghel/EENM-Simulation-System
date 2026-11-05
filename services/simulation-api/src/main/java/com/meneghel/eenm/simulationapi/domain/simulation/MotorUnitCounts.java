package com.meneghel.eenm.simulationapi.domain.simulation;

/**
 * Number of motor units per fibre type: slow (S), fast fatigue-resistant (FR) and fast fatigable (FF).
 */
public record MotorUnitCounts(int slow, int fastResistant, int fastFatigable) {

    public int total() {
        return slow + fastResistant + fastFatigable;
    }
}

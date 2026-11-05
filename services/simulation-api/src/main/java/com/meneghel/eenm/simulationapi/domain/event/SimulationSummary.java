package com.meneghel.eenm.simulationapi.domain.event;

public record SimulationSummary(double peakForce, double meanForce, double timeToPeakMs) {
}

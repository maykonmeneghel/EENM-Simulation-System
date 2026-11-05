package com.meneghel.eenm.simulationapi.web.simulation;

import java.util.List;

/** JSON shapes of the stream events, identical to the engine's NDJSON objects. */
final class SimulationEventPayloads {

    private SimulationEventPayloads() {
    }

    record Started(String type, String simulationId, double durationMs, double outputStepMs,
            MotorUnitCountsPayload motorUnits, String muscle) {
    }

    record Chunk(String type, double progress, List<Double> timeMs, List<Double> stimulus, Force force,
            List<Double> emg) {
    }

    record Force(List<Double> total, List<Double> S, List<Double> FR, List<Double> FF) {
    }

    record Completed(String type, double elapsedSeconds, Summary summary) {
    }

    record Summary(double peakForce, double meanForce, double timeToPeakMs) {
    }

    record Error(String type, String message, String code) {
    }
}

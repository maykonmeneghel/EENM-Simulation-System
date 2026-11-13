package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.event.RunElectrode;
import com.meneghel.eenm.simulationapi.domain.event.UnitAnatomy;
import com.meneghel.eenm.simulationapi.domain.event.UnitEvents;
import com.meneghel.eenm.simulationapi.domain.event.JointSeries;
import com.meneghel.eenm.simulationapi.domain.event.WristJoint;
import java.util.List;

/** JSON shapes of the stream events, identical to the engine's NDJSON objects. */
final class SimulationEventPayloads {

    private SimulationEventPayloads() {
    }

    record Started(String type, String simulationId, double durationMs, double outputStepMs,
            MotorUnitCountsPayload motorUnits, String muscle, Double maxForce, Double electrodeFraction,
            UnitAnatomy units, Double stepMs, WristJoint joint, RunElectrode electrode, String amplitudeUnit) {
    }

    record Chunk(String type, double progress, List<Double> timeMs, List<Double> stimulus, Force force,
            List<Double> emg, Fatigue fatigue, AxonEvents axonEvents, UnitEvents unitEvents, JointSeries joint) {
    }

    record AxonEvents(long central, long centralTransmitted, long fesTransmitted, long collisions, long fesBlocked,
            long resets) {
    }

    record Fatigue(double timeMs, double muscle, Double S, Double FR, Double FF) {
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

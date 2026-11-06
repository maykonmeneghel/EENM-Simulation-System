package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.event.ForceSeries;
import com.meneghel.eenm.simulationapi.domain.event.AxonEvents;
import com.meneghel.eenm.simulationapi.domain.event.FatigueSnapshot;
import com.meneghel.eenm.simulationapi.domain.event.SimulationChunk;
import com.meneghel.eenm.simulationapi.domain.event.SimulationCompleted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationEvent;
import com.meneghel.eenm.simulationapi.domain.event.SimulationFailed;
import com.meneghel.eenm.simulationapi.domain.event.SimulationStarted;
import org.springframework.http.codec.ServerSentEvent;

/** Maps a domain event to an SSE whose {@code event:} is the type and whose {@code data:} is the object. */
final class SimulationEventSseMapper {

    ServerSentEvent<Object> toSse(SimulationEvent event) {
        return ServerSentEvent.builder(toPayload(event)).event(event.type()).build();
    }

    Object toPayload(SimulationEvent event) {
        return switch (event) {
            case SimulationStarted started -> new SimulationEventPayloads.Started(started.type(),
                    started.simulationId(), started.durationMs(), started.outputStepMs(),
                    MotorUnitCountsPayload.from(started.motorUnits()), started.muscle(), started.maxForce(),
                    started.electrodeFraction(), started.units(), started.stepMs(), started.joint());
            case SimulationChunk chunk -> new SimulationEventPayloads.Chunk(chunk.type(), chunk.progress(),
                    chunk.timeMs(), chunk.stimulus(), toPayload(chunk.force()), chunk.emg(), toPayload(chunk.fatigue()),
                    toPayload(chunk.axonEvents()), chunk.unitEvents(), chunk.joint());
            case SimulationCompleted completed -> new SimulationEventPayloads.Completed(completed.type(),
                    completed.elapsedSeconds(), new SimulationEventPayloads.Summary(completed.summary().peakForce(),
                            completed.summary().meanForce(), completed.summary().timeToPeakMs()));
            case SimulationFailed failed -> new SimulationEventPayloads.Error(failed.type(), failed.message(),
                    failed.code());
        };
    }

    private SimulationEventPayloads.Force toPayload(ForceSeries force) {
        return new SimulationEventPayloads.Force(force.total(), force.slow(), force.fastResistant(),
                force.fastFatigable());
    }

    private static SimulationEventPayloads.AxonEvents toPayload(AxonEvents e) {
        return e == null ? null : new SimulationEventPayloads.AxonEvents(e.central(), e.centralTransmitted(),
                e.fesTransmitted(), e.collisions(), e.fesBlocked(), e.resets());
    }

    private static SimulationEventPayloads.Fatigue toPayload(FatigueSnapshot fatigue) {
        return fatigue == null ? null : new SimulationEventPayloads.Fatigue(fatigue.timeMs(), fatigue.muscle(),
                fatigue.slow(), fatigue.fastResistant(), fatigue.fastFatigable());
    }
}

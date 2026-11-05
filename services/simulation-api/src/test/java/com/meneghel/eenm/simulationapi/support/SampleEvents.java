package com.meneghel.eenm.simulationapi.support;

import com.meneghel.eenm.simulationapi.domain.event.FatigueSnapshot;
import com.meneghel.eenm.simulationapi.domain.event.ForceSeries;
import com.meneghel.eenm.simulationapi.domain.event.SimulationChunk;
import com.meneghel.eenm.simulationapi.domain.event.SimulationCompleted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationStarted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationSummary;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import java.util.List;

/** Domain events and NDJSON lines shaped like the contract examples. */
public final class SampleEvents {

    private SampleEvents() {
    }

    public static SimulationStarted started() {
        return new SimulationStarted("sim-1", 1000, 0.1, new MotorUnitCounts(5, 2, 2), "SOLEUS");
    }

    public static SimulationChunk chunk(double progress) {
        return new SimulationChunk(progress, List.of(0.0, 0.1), List.of(100.0, 100.0),
                new ForceSeries(List.of(0.6, 0.9), List.of(0.1, 0.2), List.of(0.2, 0.3), List.of(0.3, 0.4)),
                List.of(0.01, -0.02), null);
    }

    public static SimulationCompleted completed() {
        return new SimulationCompleted(12.3, new SimulationSummary(1.23, 0.45, 310.0));
    }

    public static MusclePreset soleus() {
        return new MusclePreset("SOLEUS", "Soleus", new MotorUnitCounts(800, 50, 50));
    }

    public static String startedLine() {
        return "{\"type\":\"started\",\"simulationId\":\"sim-1\",\"durationMs\":1000,\"outputStepMs\":0.1,"
                + "\"motorUnits\":{\"S\":5,\"FR\":2,\"FF\":2},\"muscle\":\"SOLEUS\"}";
    }

    public static String chunkLine(double progress) {
        return "{\"type\":\"chunk\",\"progress\":" + progress + ",\"timeMs\":[0.0,0.1],\"stimulus\":[100.0,100.0],"
                + "\"force\":{\"total\":[0.6,0.9],\"S\":[0.1,0.2],\"FR\":[0.2,0.3],\"FF\":[0.3,0.4]},"
                + "\"emg\":[0.01,-0.02],\"fatigue\":null}";
    }

    /** A LITERATURE chunk: fatigue snapshot, FR with no simulated units. */
    public static SimulationChunk chunkWithFatigue() {
        SimulationChunk plain = chunk(0.5);
        return new SimulationChunk(plain.progress(), plain.timeMs(), plain.stimulus(), plain.force(), plain.emg(),
                new FatigueSnapshot(0.1, 0.93, 0.99, null, 0.71));
    }

    public static String chunkWithFatigueLine() {
        return chunkLine(0.5).replace("\"fatigue\":null",
                "\"fatigue\":{\"timeMs\":0.1,\"muscle\":0.93,\"S\":0.99,\"FR\":null,\"FF\":0.71}");
    }

    public static String completedLine() {
        return "{\"type\":\"completed\",\"elapsedSeconds\":12.3,"
                + "\"summary\":{\"peakForce\":1.23,\"meanForce\":0.45,\"timeToPeakMs\":310.0}}";
    }

    public static String errorLine() {
        return "{\"type\":\"error\",\"message\":\"solver diverged\",\"code\":\"ENGINE_FAILURE\"}";
    }
}

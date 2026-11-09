package com.meneghel.eenm.simulationapi.support;

import com.meneghel.eenm.simulationapi.domain.event.FatigueSnapshot;
import com.meneghel.eenm.simulationapi.domain.event.ForceSeries;
import com.meneghel.eenm.simulationapi.domain.event.SimulationChunk;
import com.meneghel.eenm.simulationapi.domain.event.SimulationCompleted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationStarted;
import com.meneghel.eenm.simulationapi.domain.event.SimulationSummary;
import com.meneghel.eenm.simulationapi.domain.event.UnitAnatomy;
import com.meneghel.eenm.simulationapi.domain.event.UnitEvents;
import com.meneghel.eenm.simulationapi.domain.event.JointSeries;
import com.meneghel.eenm.simulationapi.domain.event.WristJoint;
import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import java.util.List;

/** Domain events and NDJSON lines shaped like the contract examples. */
public final class SampleEvents {

    private SampleEvents() {
    }

    public static SimulationStarted started() {
        return new SimulationStarted("sim-1", 1000, 0.1, new MotorUnitCounts(5, 2, 2), "SOLEUS", 5.1754, null, null);
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
                + "\"motorUnits\":{\"S\":5,\"FR\":2,\"FF\":2},\"muscle\":\"SOLEUS\",\"maxForce\":5.1754,"
                + "\"electrodeFraction\":null,\"units\":null,\"stepMs\":null,\"joint\":null}";
    }

    /** {@code started} with the 3D view's unit table (two units, electrode at 90 %). */
    public static String startedWithUnitsLine() {
        return startedLine().replace("\"electrodeFraction\":null,\"units\":null", "\"electrodeFraction\":0.9,"
                + "\"units\":{\"motoneuron\":\"BOOTH_1997\",\"type\":[\"S\",\"FF\"],\"poolIndex\":[0,49],"
                + "\"somaDiameterUm\":[77.5,113.0],\"dendriteDiameterUm\":[41.5,92.5],"
                + "\"dendriteLengthMm\":[5.5,10.6],\"conductionMs\":[18.18,15.09],"
                + "\"toElectrodeMs\":[16.36,13.58],\"toMuscleMs\":[1.82,1.51],\"weight\":[160.0,25.0],"
                + "\"axonRheobase\":[30.1,55.2]}");
    }

    public static SimulationStarted startedWithUnits() {
        return new SimulationStarted("sim-1", 1000, 0.1, new MotorUnitCounts(5, 2, 2), "SOLEUS", 5.1754, 0.9,
                new UnitAnatomy("BOOTH_1997", List.of("S", "FF"), List.of(0, 49), List.of(77.5, 113.0),
                        List.of(41.5, 92.5), List.of(5.5, 10.6), List.of(18.18, 15.09), List.of(16.36, 13.58),
                        List.of(1.82, 1.51), List.of(160.0, 25.0), List.of(30.1, 55.2)));
    }

    public static String chunkLine(double progress) {
        return "{\"type\":\"chunk\",\"progress\":" + progress + ",\"timeMs\":[0.0,0.1],\"stimulus\":[100.0,100.0],"
                + "\"force\":{\"total\":[0.6,0.9],\"S\":[0.1,0.2],\"FR\":[0.2,0.3],\"FF\":[0.3,0.4]},"
                + "\"emg\":[0.01,-0.02],\"fatigue\":null,\"axonEvents\":null,\"unitEvents\":null,\"joint\":null}";
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

    /** A chunk carrying the 3D replay's per-unit events (an FES fire and its arrival at the muscle). */
    public static String chunkWithUnitEventsLine() {
        return chunkLine(0.5).replace("\"unitEvents\":null",
                "\"unitEvents\":{\"sample\":[40,768],\"unit\":[3,3],\"kind\":[1,7],\"origin\":[-1,-1]}");
    }

    public static SimulationChunk chunkWithUnitEvents() {
        SimulationChunk c = chunk(0.5);
        return new SimulationChunk(c.progress(), c.timeMs(), c.stimulus(), c.force(), c.emg(), null, null,
                new UnitEvents(List.of(40L, 768L), List.of(3, 3), List.of(1, 7), List.of(-1L, -1L)));
    }

    /** A forearm chunk: the wrist angle and torque at its samples. */
    public static String chunkWithJointLine() {
        return chunkLine(0.5).replace("\"joint\":null", "\"joint\":{\"angleDeg\":[0.0,0.01],\"torqueNm\":[0.0,0.5]}");
    }

    public static SimulationChunk chunkWithJoint() {
        SimulationChunk c = chunk(0.5);
        return new SimulationChunk(c.progress(), c.timeMs(), c.stimulus(), c.force(), c.emg(), null, null, null,
                new JointSeries(List.of(0.0, 0.01), List.of(0.0, 0.5)));
    }

    /** A forearm run's started event, with the wrist's constants. */
    public static String startedWithJointLine() {
        return startedLine().replace("\"joint\":null", "\"joint\":{\"momentArmMm\":14.9,\"peakForceN\":407.9,"
                + "\"inertiaKgM2\":0.003,\"dampingNmsRad\":0.028,\"stiffnessNmRad\":0.992,\"flexionLimitDeg\":54.0,"
                + "\"extensionLimitDeg\":60.0}");
    }

    public static SimulationStarted startedWithJoint() {
        return new SimulationStarted("sim-1", 1000, 0.1, new MotorUnitCounts(5, 2, 2), "SOLEUS", 5.1754, null, null,
                null, new WristJoint(14.9, 407.9, 0.003, 0.028, 0.992, 54.0, 60.0));
    }

    public static String completedLine() {
        return "{\"type\":\"completed\",\"elapsedSeconds\":12.3,"
                + "\"summary\":{\"peakForce\":1.23,\"meanForce\":0.45,\"timeToPeakMs\":310.0}}";
    }

    public static String errorLine() {
        return "{\"type\":\"error\",\"message\":\"solver diverged\",\"code\":\"ENGINE_FAILURE\"}";
    }
}

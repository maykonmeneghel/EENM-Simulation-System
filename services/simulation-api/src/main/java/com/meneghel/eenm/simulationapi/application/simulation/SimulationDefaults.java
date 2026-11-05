package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.CompartmentGeometry;
import com.meneghel.eenm.simulationapi.domain.simulation.InjectionSite;
import com.meneghel.eenm.simulationapi.domain.simulation.Modulation;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.Stimulus;
import com.meneghel.eenm.simulationapi.domain.simulation.Waveform;

/**
 * The single place where the contract defaults (which reproduce {@code Main.m}) are applied.
 */
public final class SimulationDefaults {

    public static final double DURATION_MS = 1000;
    public static final double STEP_MS = 0.01;
    public static final double FREQUENCY_HZ = 40;
    public static final double DUTY_CYCLE_PERCENT = 20;
    public static final double AMPLITUDE = 100;
    public static final Waveform WAVEFORM = Waveform.MONOPHASIC;
    public static final ModulationTarget MODULATION_TARGET = ModulationTarget.AMPLITUDE;
    public static final ModulationShape MODULATION_SHAPE = ModulationShape.STEP;
    public static final Muscle MUSCLE = Muscle.SOLEUS;
    public static final int SLOW_UNITS = 5;
    public static final int FAST_RESISTANT_UNITS = 2;
    public static final int FAST_FATIGABLE_UNITS = 2;
    public static final double AXON_LENGTH_PERCENT = 80;
    public static final double TEMPERATURE_CELSIUS = 6.3;
    public static final InjectionSite INJECTION_SITE = InjectionSite.SOMA;
    public static final CompartmentGeometry SOMA_GEOMETRY = CompartmentGeometry.CYLINDRICAL;
    public static final CompartmentGeometry DENDRITE_GEOMETRY = CompartmentGeometry.CYLINDRICAL;
    public static final long SEED = 0;
    public static final double OUTPUT_STEP_MS = 0.1;

    public SimulationRequest resolve(SimulationDraft draft) {
        SimulationDraft source = draft == null ? SimulationDraft.empty() : draft;
        return new SimulationRequest(
                resolve(source.stimulus()),
                orDefault(source.muscle(), MUSCLE),
                resolve(source.unitsPerType()),
                orDefault(source.axonLengthPercent(), AXON_LENGTH_PERCENT),
                orDefault(source.temperatureCelsius(), TEMPERATURE_CELSIUS),
                orDefault(source.injectionSite(), INJECTION_SITE),
                orDefault(source.somaGeometry(), SOMA_GEOMETRY),
                orDefault(source.dendriteGeometry(), DENDRITE_GEOMETRY),
                orDefault(source.seed(), SEED),
                orDefault(source.outputStepMs(), OUTPUT_STEP_MS));
    }

    private Stimulus resolve(StimulusDraft draft) {
        StimulusDraft source = draft == null ? new StimulusDraft(null, null, null, null, null, null, null) : draft;
        return new Stimulus(
                orDefault(source.durationMs(), DURATION_MS),
                orDefault(source.stepMs(), STEP_MS),
                orDefault(source.frequencyHz(), FREQUENCY_HZ),
                orDefault(source.dutyCyclePercent(), DUTY_CYCLE_PERCENT),
                orDefault(source.amplitude(), AMPLITUDE),
                orDefault(source.waveform(), WAVEFORM),
                resolve(source.modulation()));
    }

    private Modulation resolve(ModulationDraft draft) {
        ModulationDraft source = draft == null ? new ModulationDraft(null, null, null) : draft;
        return new Modulation(
                orDefault(source.target(), MODULATION_TARGET),
                orDefault(source.shape(), MODULATION_SHAPE),
                source.peakTimeMs());
    }

    private MotorUnitCounts resolve(MotorUnitCountsDraft draft) {
        MotorUnitCountsDraft source = draft == null ? new MotorUnitCountsDraft(null, null, null) : draft;
        return new MotorUnitCounts(
                orDefault(source.slow(), SLOW_UNITS),
                orDefault(source.fastResistant(), FAST_RESISTANT_UNITS),
                orDefault(source.fastFatigable(), FAST_FATIGABLE_UNITS));
    }

    private static <T> T orDefault(T value, T fallback) {
        return value == null ? fallback : value;
    }
}

package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.CalibrationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.CompartmentGeometry;
import com.meneghel.eenm.simulationapi.domain.simulation.InjectionSite;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
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
 *
 * <p>Motor units: an absent {@code unitsPerType} becomes 5 / 2 / 2 for {@link ModelVariant#ORIGINAL} and
 * stays unset for {@link ModelVariant#LITERATURE}, so the engine applies its own default (120 units in
 * the pool's proportions). When {@code unitsPerType} is present, a missing type takes its 5 / 2 / 2
 * default in both variants, as the engine does.
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
    public static final ModelVariant MODEL_VARIANT = ModelVariant.ORIGINAL;
    public static final CalibrationTarget CALIBRATION_TARGET = CalibrationTarget.WHOLE_MUSCLE;
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
        ModelVariant variant = orDefault(source.modelVariant(), MODEL_VARIANT);
        return new SimulationRequest(
                resolve(source.stimulus()),
                variant,
                orDefault(source.calibrationTarget(), CALIBRATION_TARGET),
                orDefault(source.muscle(), MUSCLE),
                resolveUnits(source.unitsPerType(), variant),
                orDefault(source.axonLengthPercent(), AXON_LENGTH_PERCENT),
                orDefault(source.temperatureCelsius(), TEMPERATURE_CELSIUS),
                orDefault(source.injectionSite(), INJECTION_SITE),
                orDefault(source.somaGeometry(), SOMA_GEOMETRY),
                orDefault(source.dendriteGeometry(), DENDRITE_GEOMETRY),
                orDefault(source.seed(), SEED),
                orDefault(source.outputStepMs(), OUTPUT_STEP_MS));
    }

    private Stimulus resolve(StimulusDraft draft) {
        StimulusDraft source = draft == null ? StimulusDraft.empty() : draft;
        return new Stimulus(
                orDefault(source.durationMs(), DURATION_MS),
                orDefault(source.stepMs(), STEP_MS),
                orDefault(source.frequencyHz(), FREQUENCY_HZ),
                orDefault(source.dutyCyclePercent(), DUTY_CYCLE_PERCENT),
                orDefault(source.amplitude(), AMPLITUDE),
                orDefault(source.waveform(), WAVEFORM),
                resolve(source.modulation()),
                source.trainOnMs(),
                source.trainPeriodMs(),
                source.pulseWidthUs(),
                orDefault(source.rampUpMs(), 0.0),
                orDefault(source.rampDownMs(), 0.0));
    }

    private Modulation resolve(ModulationDraft draft) {
        ModulationDraft source = draft == null ? new ModulationDraft(null, null, null) : draft;
        return new Modulation(
                orDefault(source.target(), MODULATION_TARGET),
                orDefault(source.shape(), MODULATION_SHAPE),
                source.peakTimeMs());
    }

    private MotorUnitCounts resolveUnits(MotorUnitCountsDraft draft, ModelVariant variant) {
        if (draft == null && variant == ModelVariant.LITERATURE) {
            return null;
        }
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

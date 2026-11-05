package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.Modulation;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.Stimulus;
import com.meneghel.eenm.simulationapi.domain.simulation.Waveform;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Rules that involve more than one field, checked on the resolved request (after defaults), so that a
 * missing field is compared through its default value. Single-field ranges are checked at the edge.
 */
public final class SimulationRequestRules {

    private static final double MULTIPLE_TOLERANCE = 1e-6;
    private static final String TRAIN_ON = "stimulus.trainOnMs";
    private static final String TRAIN_PERIOD = "stimulus.trainPeriodMs";
    private static final String PULSE_WIDTH = "stimulus.pulseWidthUs";

    public List<FieldViolation> check(SimulationRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        checkPeakTime(request.stimulus(), violations);
        checkTrains(request.stimulus(), violations);
        checkStimulator(request.stimulus(), violations);
        checkOutputStep(request, violations);
        request.requestedUnits().ifPresent(units -> checkAtLeastOneUnit(units, violations));
        return List.copyOf(violations);
    }

    public List<FieldViolation> checkPoolSize(MotorUnitCounts units, MusclePreset preset) {
        List<FieldViolation> violations = new ArrayList<>();
        MotorUnitCounts pool = preset.poolSize();
        checkWithinPool("S", units.slow(), pool.slow(), preset, violations);
        checkWithinPool("FR", units.fastResistant(), pool.fastResistant(), preset, violations);
        checkWithinPool("FF", units.fastFatigable(), pool.fastFatigable(), preset, violations);
        return List.copyOf(violations);
    }

    private void checkPeakTime(Stimulus stimulus, List<FieldViolation> violations) {
        if (stimulus.modulation().shape() != ModulationShape.TRIANGLE) {
            return;
        }
        Double peakTimeMs = stimulus.modulation().peakTimeMs();
        String field = "stimulus.modulation.peakTimeMs";
        if (peakTimeMs == null) {
            violations.add(new FieldViolation(field, "is required when shape is TRIANGLE"));
        } else if (peakTimeMs <= 0 || peakTimeMs >= stimulus.durationMs()) {
            violations.add(new FieldViolation(field,
                    "must be greater than 0 and less than stimulus.durationMs (" + format(stimulus.durationMs()) + ")"));
        }
    }

    private void checkTrains(Stimulus stimulus, List<FieldViolation> violations) {
        Double onMs = stimulus.trainOnMs();
        Double periodMs = stimulus.trainPeriodMs();
        if (onMs == null && periodMs == null) {
            return;
        }
        if (periodMs == null) {
            violations.add(new FieldViolation(TRAIN_PERIOD, "is required when stimulus.trainOnMs is set"));
        } else if (onMs == null) {
            violations.add(new FieldViolation(TRAIN_ON, "is required when stimulus.trainPeriodMs is set"));
        } else if (onMs <= 0) {
            violations.add(new FieldViolation(TRAIN_ON, "must be greater than 0"));
        } else if (onMs > periodMs) {
            violations.add(new FieldViolation(TRAIN_ON,
                    "must be less than or equal to stimulus.trainPeriodMs (" + format(periodMs) + ")"));
        } else if (periodMs > stimulus.durationMs()) {
            violations.add(new FieldViolation(TRAIN_PERIOD,
                    "must be less than or equal to stimulus.durationMs (" + format(stimulus.durationMs()) + ")"));
        }
    }

    private void checkStimulator(Stimulus stimulus, List<FieldViolation> violations) {
        Double widthUs = stimulus.pulseWidthUs();
        if (widthUs == null) {
            if (stimulus.waveform() == Waveform.BIPHASIC_SYMMETRIC) {
                violations.add(new FieldViolation(PULSE_WIDTH, "is required when stimulus.waveform is BIPHASIC_SYMMETRIC"));
            }
        } else {
            int phases = stimulus.waveform() == Waveform.BIPHASIC_SYMMETRIC ? 2 : 1;
            double periodUs = 1e6 / stimulus.frequencyHz();
            if (stimulus.waveform() == Waveform.BIPHASIC) {
                violations.add(new FieldViolation("stimulus.waveform",
                        "must be MONOPHASIC or BIPHASIC_SYMMETRIC when stimulus.pulseWidthUs is set"));
            } else if (phases * widthUs >= periodUs) {
                violations.add(new FieldViolation(PULSE_WIDTH, (phases == 2 ? "times 2 (both phases) " : "")
                        + "must be less than the period (" + format(periodUs) + " µs)"));
            }
            Modulation modulation = stimulus.modulation();
            if (modulation.target() != ModulationTarget.AMPLITUDE || modulation.shape() != ModulationShape.STEP) {
                violations.add(new FieldViolation("stimulus.modulation",
                        "must be AMPLITUDE / STEP when stimulus.pulseWidthUs is set (use rampUpMs / rampDownMs)"));
            }
        }
        double rampsMs = stimulus.rampUpMs() + stimulus.rampDownMs();
        if (rampsMs > 0 && rampsMs > stimulus.onTimeMs()) {
            violations.add(new FieldViolation("stimulus.rampUpMs",
                    "plus stimulus.rampDownMs must be less than or equal to the on time (" + format(stimulus.onTimeMs())
                            + " ms)"));
        }
    }

    private void checkOutputStep(SimulationRequest request, List<FieldViolation> violations) {
        double stepMs = request.stimulus().stepMs();
        double outputStepMs = request.outputStepMs();
        String field = "outputStepMs";
        if (outputStepMs < stepMs) {
            violations.add(new FieldViolation(field,
                    "must be greater than or equal to stimulus.stepMs (" + format(stepMs) + ")"));
        } else if (!isMultiple(outputStepMs, stepMs)) {
            violations.add(new FieldViolation(field, "must be a multiple of stimulus.stepMs (" + format(stepMs) + ")"));
        }
    }

    private void checkAtLeastOneUnit(MotorUnitCounts units, List<FieldViolation> violations) {
        if (units.total() < 1) {
            violations.add(new FieldViolation("unitsPerType", "must contain at least one motor unit"));
        }
    }

    private void checkWithinPool(String type, int requested, int poolSize, MusclePreset preset,
            List<FieldViolation> violations) {
        if (requested > poolSize) {
            violations.add(new FieldViolation("unitsPerType." + type,
                    "must not exceed the " + preset.id() + " pool size (" + poolSize + ")"));
        }
    }

    private static boolean isMultiple(double value, double step) {
        double ratio = value / step;
        return Math.abs(ratio - Math.rint(ratio)) < MULTIPLE_TOLERANCE;
    }

    private static String format(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }
}

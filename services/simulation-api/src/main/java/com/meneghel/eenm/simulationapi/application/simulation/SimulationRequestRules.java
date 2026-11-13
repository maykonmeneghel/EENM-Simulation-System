package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.Electrode;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.Modulation;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.StimulationSite;
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
    private static final double LIMIT_TOLERANCE = 1e-9;
    private static final String SERVER_LIMIT = " (limit of this server)";
    private static final String TRAIN_ON = "stimulus.trainOnMs";
    private static final String TRAIN_PERIOD = "stimulus.trainPeriodMs";
    private static final String PULSE_WIDTH = "stimulus.pulseWidthUs";
    /** Electrode area range (Kuhn 2010: 0.64 cm²; Alon 1985: 81 cm²). */
    static final double ELECTRODE_MIN_AREA_CM2 = 0.5;
    static final double ELECTRODE_MAX_AREA_CM2 = 100;

    private final SimulationLimits limits;

    /** The contract ranges only (no server limit configured). */
    public SimulationRequestRules() {
        this(SimulationLimits.CONTRACT);
    }

    public SimulationRequestRules(SimulationLimits limits) {
        this.limits = limits.withinContract();
    }

    public List<FieldViolation> check(SimulationRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        checkLimits(request, violations);
        checkPeakTime(request.stimulus(), violations);
        checkTrains(request.stimulus(), violations);
        checkStimulator(request.stimulus(), violations);
        checkOutputStep(request, violations);
        checkUnitEvents(request, violations);
        checkElectrode(request, violations);
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

    private void checkUnitEvents(SimulationRequest request, List<FieldViolation> violations) {
        double max = limits.maxUnitEventsDurationMs();
        if (request.unitEvents() && request.stimulus().durationMs() > max + LIMIT_TOLERANCE) {
            violations.add(new FieldViolation("output.unitEvents", "needs stimulus.durationMs at most " + format(max)
                    + " (the 3D replay is limited to " + format(max / 1000) + " s)"));
        }
    }

    /** Electrode rules of {@code docs/design/electrode.md} §5–6 that involve more than one field. */
    private void checkElectrode(SimulationRequest request, List<FieldViolation> violations) {
        Electrode electrode = request.electrode();
        if (electrode == null) {
            return;
        }
        if (request.modelVariant() != ModelVariant.LITERATURE
                || request.stimulationSite() != StimulationSite.SKIN_SURFACE) {
            violations.add(new FieldViolation("electrode", "applies only to modelVariant LITERATURE with "
                    + "stimulationSite SKIN_SURFACE"));
            return;
        }
        if (electrode.shape() == Electrode.Shape.ROUND
                && (electrode.widthCm() != null || electrode.lengthCm() != null)) {
            violations.add(new FieldViolation("electrode.shape", "ROUND takes diameterCm, not widthCm / lengthCm"));
        } else if (electrode.shape() == Electrode.Shape.RECTANGLE && electrode.diameterCm() != null) {
            violations.add(new FieldViolation("electrode.shape", "RECTANGLE takes widthCm and lengthCm, not diameterCm"));
        } else if (electrode.shape() == null && (electrode.widthCm() != null || electrode.lengthCm() != null
                || electrode.diameterCm() != null)) {
            violations.add(new FieldViolation("electrode.shape", "is required with a size"));
        }
        Double area = electrode.areaCm2();
        if (area != null && (area < ELECTRODE_MIN_AREA_CM2 - LIMIT_TOLERANCE
                || area > ELECTRODE_MAX_AREA_CM2 + LIMIT_TOLERANCE)) {
            String field = electrode.shape() == Electrode.Shape.ROUND ? "electrode.diameterCm" : "electrode.widthCm";
            violations.add(new FieldViolation(field, "gives an area of " + format(Math.round(area * 100) / 100.0)
                    + " cm²; it must be between " + format(ELECTRODE_MIN_AREA_CM2) + " and "
                    + format(ELECTRODE_MAX_AREA_CM2) + " cm²"));
        }
        Electrode.Calibration c = electrode.calibration();
        if (c == null) {
            return;
        }
        if (c.motorThresholdMa() == null) {
            violations.add(new FieldViolation("electrode.calibration.motorThresholdMa", "is required"));
        }
        if (c.pulseWidthUs() == null) {
            violations.add(new FieldViolation("electrode.calibration.pulseWidthUs", "is required"));
        }
        if (c.motorThresholdMa() != null && c.fullRecruitmentMa() != null
                && c.fullRecruitmentMa() <= c.motorThresholdMa()) {
            violations.add(new FieldViolation("electrode.calibration.fullRecruitmentMa",
                    "must be greater than electrode.calibration.motorThresholdMa (" + format(c.motorThresholdMa())
                            + ")"));
        }
    }

    /**
     * The configured caps that are tighter than the contract ranges (the ranges themselves are checked at the edge,
     * so a request outside both gets the range message only).
     */
    private void checkLimits(SimulationRequest request, List<FieldViolation> violations) {
        SimulationLimits contract = SimulationLimits.CONTRACT;
        Stimulus stimulus = request.stimulus();
        if (stimulus.durationMs() > limits.maxDurationMs() + LIMIT_TOLERANCE
                && stimulus.durationMs() <= contract.maxDurationMs()) {
            violations.add(new FieldViolation("stimulus.durationMs",
                    "must be less than or equal to " + format(limits.maxDurationMs()) + SERVER_LIMIT));
        }
        if (stimulus.stepMs() < limits.minStepMs() - LIMIT_TOLERANCE && stimulus.stepMs() >= contract.minStepMs()) {
            violations.add(new FieldViolation("stimulus.stepMs",
                    "must be greater than or equal to " + format(limits.minStepMs()) + SERVER_LIMIT));
        }
        if (stimulus.frequencyHz() > limits.maxFrequencyHz() + LIMIT_TOLERANCE
                && stimulus.frequencyHz() <= contract.maxFrequencyHz()) {
            violations.add(new FieldViolation("stimulus.frequencyHz",
                    "must be less than or equal to " + format(limits.maxFrequencyHz()) + SERVER_LIMIT));
        }
        request.requestedUnits().ifPresentOrElse(units -> checkUnitLimits(units, violations), () -> {
            if (request.modelVariant() == ModelVariant.LITERATURE
                    && SimulationDefaults.LITERATURE_AUTO_UNITS > limits.maxTotalUnits()) {
                violations.add(new FieldViolation("unitsPerType", "must be given: the automatic "
                        + SimulationDefaults.LITERATURE_AUTO_UNITS + " units exceed the " + limits.maxTotalUnits()
                        + " motor units in total" + SERVER_LIMIT));
            }
        });
        double outputStepMs = request.outputStepMs();
        if (limits.capsOutputPoints() && outputStepMs > 0
                && stimulus.durationMs() / outputStepMs > limits.maxOutputPoints() + LIMIT_TOLERANCE) {
            violations.add(new FieldViolation("outputStepMs", "must be at least "
                    + format(stimulus.durationMs() / limits.maxOutputPoints()) + " for this duration (at most "
                    + limits.maxOutputPoints() + " points per series, limit of this server)"));
        }
    }

    private void checkUnitLimits(MotorUnitCounts units, List<FieldViolation> violations) {
        int perType = limits.maxUnitsPerType();
        if (perType < SimulationLimits.CONTRACT.maxUnitsPerType()) {
            checkPerType("S", units.slow(), perType, violations);
            checkPerType("FR", units.fastResistant(), perType, violations);
            checkPerType("FF", units.fastFatigable(), perType, violations);
        }
        if (units.total() > limits.maxTotalUnits()) {
            violations.add(new FieldViolation("unitsPerType",
                    "must contain at most " + limits.maxTotalUnits() + " motor units in total" + SERVER_LIMIT));
        }
    }

    private static void checkPerType(String type, int requested, int max, List<FieldViolation> violations) {
        if (requested > max && requested <= SimulationLimits.CONTRACT.maxUnitsPerType()) {
            violations.add(new FieldViolation("unitsPerType." + type,
                    "must be less than or equal to " + max + SERVER_LIMIT));
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

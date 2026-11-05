package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.muscle.MusclePreset;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.Stimulus;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Rules that involve more than one field, checked on the resolved request (after defaults), so that a
 * missing field is compared through its default value. Single-field ranges are checked at the edge.
 */
public final class SimulationRequestRules {

    private static final double MULTIPLE_TOLERANCE = 1e-6;

    public List<FieldViolation> check(SimulationRequest request) {
        List<FieldViolation> violations = new ArrayList<>();
        checkPeakTime(request.stimulus(), violations);
        checkOutputStep(request, violations);
        checkAtLeastOneUnit(request.unitsPerType(), violations);
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

package com.meneghel.eenm.simulationapi.application.simulation;

import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SimulationRequestRulesTest {

    private final SimulationDefaults defaults = new SimulationDefaults();
    private final SimulationRequestRules rules = new SimulationRequestRules();

    @Test
    void defaultRequestIsValid() {
        assertThat(rules.check(defaults.resolve(null))).isEmpty();
    }

    @Test
    void triangleRequiresPeakTime() {
        assertThat(rules.check(triangle(null)))
                .containsExactly(new FieldViolation("stimulus.modulation.peakTimeMs", "is required when shape is TRIANGLE"));
    }

    @ParameterizedTest
    @ValueSource(doubles = {0, -5, 1000, 1200})
    void trianglePeakTimeMustLieInsideTheDuration(double peakTimeMs) {
        assertThat(rules.check(triangle(peakTimeMs))).containsExactly(new FieldViolation(
                "stimulus.modulation.peakTimeMs", "must be greater than 0 and less than stimulus.durationMs (1000)"));
    }

    @Test
    void trianglePeakTimeInsideTheDurationIsValid() {
        assertThat(rules.check(triangle(500.0))).isEmpty();
    }

    @Test
    void peakTimeIsIgnoredForOtherShapes() {
        SimulationRequest request = defaults.resolve(new SimulationDraft(
                new StimulusDraft(null, null, null, null, null, null, new ModulationDraft(null, ModulationShape.RAMP, 5000.0)),
                null, null, null, null, null, null, null, null, null));

        assertThat(rules.check(request)).isEmpty();
    }

    @Test
    void outputStepBelowTheIntegrationStepIsRejected() {
        assertThat(rules.check(withSteps(0.05, 0.01))).containsExactly(
                new FieldViolation("outputStepMs", "must be greater than or equal to stimulus.stepMs (0.05)"));
    }

    @Test
    void outputStepMustBeAMultipleOfTheIntegrationStep() {
        assertThat(rules.check(withSteps(0.02, 0.05))).containsExactly(
                new FieldViolation("outputStepMs", "must be a multiple of stimulus.stepMs (0.02)"));
    }

    @ParameterizedTest
    @ValueSource(doubles = {0.01, 0.1, 0.3, 10})
    void outputStepsThatAreMultiplesAreValidDespiteFloatingPointNoise(double outputStepMs) {
        assertThat(rules.check(withSteps(0.01, outputStepMs))).isEmpty();
    }

    @Test
    void atLeastOneMotorUnitIsRequired() {
        SimulationRequest request = defaults.resolve(new SimulationDraft(null, null,
                new MotorUnitCountsDraft(0, 0, 0), null, null, null, null, null, null, null));

        assertThat(rules.check(request))
                .containsExactly(new FieldViolation("unitsPerType", "must contain at least one motor unit"));
    }

    @Test
    void unitsMayNotExceedTheMusclePool() {
        assertThat(rules.checkPoolSize(new MotorUnitCounts(5, 50, 51), SampleEvents.soleus()))
                .containsExactly(new FieldViolation("unitsPerType.FF", "must not exceed the SOLEUS pool size (50)"));
    }

    private SimulationRequest triangle(Double peakTimeMs) {
        return defaults.resolve(new SimulationDraft(
                new StimulusDraft(1000.0, null, null, null, null, null,
                        new ModulationDraft(null, ModulationShape.TRIANGLE, peakTimeMs)),
                null, null, null, null, null, null, null, null, null));
    }

    private SimulationRequest withSteps(double stepMs, double outputStepMs) {
        return defaults.resolve(new SimulationDraft(
                new StimulusDraft(null, stepMs, null, null, null, null, null),
                null, null, null, null, null, null, null, null, outputStepMs));
    }
}

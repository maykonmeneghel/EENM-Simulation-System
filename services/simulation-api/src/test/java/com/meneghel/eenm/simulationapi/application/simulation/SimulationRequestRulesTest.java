package com.meneghel.eenm.simulationapi.application.simulation;

import static com.meneghel.eenm.simulationapi.support.Drafts.draft;
import static com.meneghel.eenm.simulationapi.support.Drafts.stimulus;
import static com.meneghel.eenm.simulationapi.support.Drafts.stimulusOnly;
import static com.meneghel.eenm.simulationapi.support.Drafts.trains;
import static com.meneghel.eenm.simulationapi.support.Drafts.variant;
import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.support.SampleEvents;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
        SimulationRequest request = defaults.resolve(stimulusOnly(
                stimulus(null, null, new ModulationDraft(null, ModulationShape.RAMP, 5000.0))));

        assertThat(rules.check(request)).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({"330, 1000, 1000", "1000, 1000, 1000", "0.5, 1, 300000"})
    void validTrainsPass(double onMs, double periodMs, double durationMs) {
        assertThat(rules.check(withTrains(durationMs, onMs, periodMs))).isEmpty();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "      | 1000 | stimulus.trainOnMs     | is required when stimulus.trainPeriodMs is set",
        "330   |      | stimulus.trainPeriodMs | is required when stimulus.trainOnMs is set",
        "0     | 1000 | stimulus.trainOnMs     | must be greater than 0",
        "-10   | 1000 | stimulus.trainOnMs     | must be greater than 0",
        "1200  | 1000 | stimulus.trainOnMs     | must be less than or equal to stimulus.trainPeriodMs (1000)",
        "330   | 1500 | stimulus.trainPeriodMs | must be less than or equal to stimulus.durationMs (1000)"
    })
    void invalidTrainsAreRejected(Double onMs, Double periodMs, String field, String message) {
        assertThat(rules.check(withTrains(1000.0, onMs, periodMs))).containsExactly(new FieldViolation(field, message));
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
        SimulationRequest request = defaults.resolve(variant(null, new MotorUnitCountsDraft(0, 0, 0)));

        assertThat(rules.check(request))
                .containsExactly(new FieldViolation("unitsPerType", "must contain at least one motor unit"));
    }

    @Test
    void unitChecksAreSkippedWhenTheEngineChoosesTheUnits() {
        assertThat(rules.check(defaults.resolve(variant(ModelVariant.LITERATURE, null)))).isEmpty();
    }

    @Test
    void unitsMayNotExceedTheMusclePool() {
        assertThat(rules.checkPoolSize(new MotorUnitCounts(5, 50, 51), SampleEvents.soleus()))
                .containsExactly(new FieldViolation("unitsPerType.FF", "must not exceed the SOLEUS pool size (50)"));
    }

    private SimulationRequest triangle(Double peakTimeMs) {
        return defaults.resolve(stimulusOnly(
                stimulus(1000.0, null, new ModulationDraft(null, ModulationShape.TRIANGLE, peakTimeMs))));
    }

    private SimulationRequest withTrains(Double durationMs, Double onMs, Double periodMs) {
        return defaults.resolve(stimulusOnly(trains(durationMs, onMs, periodMs)));
    }

    private SimulationRequest withSteps(double stepMs, double outputStepMs) {
        return defaults.resolve(draft(stimulus(null, stepMs, null), null, null, outputStepMs));
    }
}

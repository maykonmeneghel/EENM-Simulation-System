package com.meneghel.eenm.simulationapi.application.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.meneghel.eenm.simulationapi.domain.simulation.CalibrationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.CompartmentGeometry;
import com.meneghel.eenm.simulationapi.domain.simulation.Condition;
import com.meneghel.eenm.simulationapi.domain.simulation.InjectionSite;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.Modulation;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationShape;
import com.meneghel.eenm.simulationapi.domain.simulation.ModulationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.MotorUnitCounts;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.StimulationSite;
import com.meneghel.eenm.simulationapi.domain.simulation.Stimulus;
import com.meneghel.eenm.simulationapi.domain.simulation.Waveform;
import com.meneghel.eenm.simulationapi.domain.simulation.WristOptions;
import org.junit.jupiter.api.Test;

/** Server limits (docs/deployment.md): checked on the resolved request, off (= contract ranges) by default. */
class SimulationLimitsTest {

    private static final SimulationLimits HOSTED = new SimulationLimits(5000, 0.01, 100, 120, 120, 100_000, 5000);

    @Test
    void withoutConfigurationTheContractRangesAreTheLimits() {
        SimulationRequestRules rules = new SimulationRequestRules();
        assertThat(rules.check(request(300_000, 0.005, 200, new MotorUnitCounts(200, 200, 200), 0.005, false)))
                .isEmpty();
    }

    @Test
    void everyCapNamesItsField() {
        SimulationRequestRules rules = new SimulationRequestRules(HOSTED);
        assertThat(rules.check(request(6000, 0.005, 150, new MotorUnitCounts(121, 20, 20), 0.05, true)))
                .containsExactlyInAnyOrder(
                        new FieldViolation("stimulus.durationMs",
                                "must be less than or equal to 5000 (limit of this server)"),
                        new FieldViolation("stimulus.stepMs",
                                "must be greater than or equal to 0.01 (limit of this server)"),
                        new FieldViolation("stimulus.frequencyHz",
                                "must be less than or equal to 100 (limit of this server)"),
                        new FieldViolation("unitsPerType.S", "must be less than or equal to 120 (limit of this server)"),
                        new FieldViolation("unitsPerType",
                                "must contain at most 120 motor units in total (limit of this server)"),
                        new FieldViolation("outputStepMs", "must be at least 0.06 for this duration (at most 100000 "
                                + "points per series, limit of this server)"),
                        new FieldViolation("output.unitEvents",
                                "needs stimulus.durationMs at most 5000 (the 3D replay is limited to 5 s)"));
    }

    @Test
    void theHostedWorstCaseIsAccepted() {
        SimulationRequestRules rules = new SimulationRequestRules(HOSTED);
        assertThat(rules.check(request(5000, 0.01, 100, new MotorUnitCounts(40, 40, 40), 0.05, true))).isEmpty();
    }

    @Test
    void outputPointsAreCappedOnlyWhenConfigured() {
        SimulationRequestRules rules = new SimulationRequestRules(HOSTED);
        assertThat(rules.check(request(5000, 0.01, 40, new MotorUnitCounts(5, 2, 2), 0.01, false)))
                .containsExactly(new FieldViolation("outputStepMs",
                        "must be at least 0.05 for this duration (at most 100000 points per series, limit of this "
                                + "server)"));
        assertThat(new SimulationRequestRules().check(request(5000, 0.01, 40, new MotorUnitCounts(5, 2, 2), 0.01,
                false))).isEmpty();
    }

    @Test
    void theLiteratureAutomaticUnitsCountAgainstTheTotal() {
        SimulationLimits fewUnits = new SimulationLimits(5000, 0.01, 100, 60, 60, 0, 5000);
        SimulationRequest automatic = request(1000, 0.01, 40, null, 0.1, false);
        assertThat(new SimulationRequestRules(fewUnits).check(automatic)).containsExactly(new FieldViolation(
                "unitsPerType", "must be given: the automatic 120 units exceed the 60 motor units in total (limit of "
                        + "this server)"));
        assertThat(new SimulationRequestRules(HOSTED).check(automatic)).isEmpty();
    }

    @Test
    void aValueOutsideTheContractRangeGetsOnlyTheRangeMessage() {
        // 400 000 ms is rejected at the edge (10 – 300000); the rules do not add the server-limit message
        SimulationRequestRules rules = new SimulationRequestRules(HOSTED);
        assertThat(rules.check(request(400_000, 0.01, 40, new MotorUnitCounts(5, 2, 2), 10, false)))
                .noneMatch(v -> v.field().equals("stimulus.durationMs"));
    }

    @Test
    void configuredCapsCannotLoosenTheContract() {
        SimulationLimits loose = new SimulationLimits(1e9, 0.0001, 1000, 1000, 5000, 0, 1e9).withinContract();
        assertThat(loose).isEqualTo(SimulationLimits.CONTRACT);
    }

    @Test
    void capsMustBePositive() {
        assertThatThrownBy(() -> new SimulationLimits(0, 0.01, 100, 120, 120, 0, 5000))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SimulationLimits(5000, 0.01, 100, 120, 120, -1, 5000))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static SimulationRequest request(double durationMs, double stepMs, double frequencyHz,
            MotorUnitCounts units, double outputStepMs, boolean unitEvents) {
        Stimulus stimulus = new Stimulus(durationMs, stepMs, frequencyHz, 20, 100, Waveform.MONOPHASIC,
                new Modulation(ModulationTarget.AMPLITUDE, ModulationShape.STEP, null), null, null, null, 0, 0);
        return new SimulationRequest(stimulus, units == null ? ModelVariant.LITERATURE : ModelVariant.ORIGINAL,
                CalibrationTarget.WHOLE_MUSCLE, StimulationSite.SKIN_SURFACE, Condition.NORMAL, null,
                Muscle.FLEXOR_CARPI_RADIALIS, units, 80, 6.3, InjectionSite.SOMA, CompartmentGeometry.CYLINDRICAL,
                CompartmentGeometry.CYLINDRICAL, 0, outputStepMs, null, unitEvents, WristOptions.DEFAULT);
    }
}

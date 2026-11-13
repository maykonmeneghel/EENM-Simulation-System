package com.meneghel.eenm.simulationapi.application.simulation;

import static com.meneghel.eenm.simulationapi.support.Drafts.stimulus;
import static com.meneghel.eenm.simulationapi.support.Drafts.draft;
import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.domain.simulation.Electrode;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;
import com.meneghel.eenm.simulationapi.domain.simulation.StimulationSite;
import org.junit.jupiter.api.Test;

/** Cross-field rules of the {@code electrode} object ({@code docs/design/electrode.md} §5–6). */
class ElectrodeRulesTest {

    private final SimulationDefaults defaults = new SimulationDefaults();
    private final SimulationRequestRules rules = new SimulationRequestRules();

    private SimulationRequest with(ModelVariant variant, StimulationSite site, Electrode electrode) {
        SimulationRequest b = defaults.resolve(draft(stimulus(1000.0, null, null), null, null, null));
        return new SimulationRequest(b.stimulus(), variant, b.calibrationTarget(), site, b.condition(),
                b.conditionAdjustments(), b.muscle(), b.unitsPerType(), b.axonLengthPercent(), b.temperatureCelsius(),
                b.injectionSite(), b.somaGeometry(), b.dendriteGeometry(), b.seed(), b.outputStepMs(),
                b.centralDrive(), false, b.wrist(), electrode);
    }

    private SimulationRequest skin(Electrode electrode) {
        return with(ModelVariant.LITERATURE, StimulationSite.SKIN_SURFACE, electrode);
    }

    private static Electrode rectangle(double w, double l) {
        return new Electrode(Electrode.Shape.RECTANGLE, w, l, null, 0.75, 0.5, Electrode.EffectModel.HALF_SPACE_AF,
                null);
    }

    @Test
    void aValidElectrodeAndNoElectrodeAreAccepted() {
        assertThat(rules.check(skin(rectangle(5, 9)))).isEmpty();
        assertThat(rules.check(skin(new Electrode(Electrode.Shape.ROUND, null, null, 2.5, null, null, null, null))))
                .isEmpty();
        assertThat(rules.check(skin(null))).isEmpty();
        assertThat(rules.check(skin(new Electrode(null, null, null, null, 0.5, null, Electrode.EffectModel.NONE,
                null)))).isEmpty();
    }

    @Test
    void electrodeIsRejectedOutsideSkinSurfaceLiterature() {
        FieldViolation only = new FieldViolation("electrode",
                "applies only to modelVariant LITERATURE with stimulationSite SKIN_SURFACE");
        assertThat(rules.check(with(ModelVariant.LITERATURE, StimulationSite.MOTONEURON_POOL, rectangle(5, 5))))
                .containsExactly(only);
        assertThat(rules.check(with(ModelVariant.ORIGINAL, StimulationSite.SKIN_SURFACE, rectangle(5, 5))))
                .containsExactly(only);
    }

    @Test
    void sizeFieldsMustMatchTheShapeAndTheAreaItsRange() {
        assertThat(rules.check(skin(new Electrode(Electrode.Shape.ROUND, 5.0, null, 2.5, null, null, null, null))))
                .containsExactly(new FieldViolation("electrode.shape", "ROUND takes diameterCm, not widthCm / lengthCm"));
        assertThat(rules.check(skin(new Electrode(Electrode.Shape.RECTANGLE, 5.0, 5.0, 2.5, null, null, null, null))))
                .containsExactly(new FieldViolation("electrode.shape",
                        "RECTANGLE takes widthCm and lengthCm, not diameterCm"));
        assertThat(rules.check(skin(rectangle(12, 12)))).containsExactly(new FieldViolation("electrode.widthCm",
                "gives an area of 144 cm²; it must be between 0.5 and 100 cm²"));
        assertThat(rules.check(skin(rectangle(0.6, 0.6)))).hasSize(1);
    }

    @Test
    void calibrationNeedsThresholdAndPulseWidthAndFullRecruitmentAboveTheThreshold() {
        Electrode.Calibration bad = new Electrode.Calibration(20.0, 15.0, 300.0, null);
        Electrode e = new Electrode(null, null, null, null, null, null, null, bad);
        assertThat(rules.check(skin(e))).containsExactly(new FieldViolation("electrode.calibration.fullRecruitmentMa",
                "must be greater than electrode.calibration.motorThresholdMa (20)"));
        Electrode missing = new Electrode(null, null, null, null, null, null, null,
                new Electrode.Calibration(null, null, null, null));
        assertThat(rules.check(skin(missing))).extracting(FieldViolation::field)
                .containsExactly("electrode.calibration.motorThresholdMa", "electrode.calibration.pulseWidthUs");
        Electrode good = new Electrode(null, null, null, null, null, null, null,
                new Electrode.Calibration(18.0, 42.0, 300.0, 25.0));
        assertThat(rules.check(skin(good))).isEmpty();
    }
}

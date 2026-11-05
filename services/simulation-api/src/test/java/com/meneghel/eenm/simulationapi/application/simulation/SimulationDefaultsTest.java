package com.meneghel.eenm.simulationapi.application.simulation;

import static com.meneghel.eenm.simulationapi.support.Drafts.variant;
import static org.assertj.core.api.Assertions.assertThat;

import com.meneghel.eenm.simulationapi.domain.simulation.CalibrationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.StimulationSite;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class SimulationDefaultsTest {

    private final SimulationDefaults defaults = new SimulationDefaults();

    @Test
    void missingRequestTakesTheContractDefaults() {
        SimulationRequest expected = new SimulationRequest(
                new Stimulus(1000, 0.01, 40, 20, 100, Waveform.MONOPHASIC,
                        new Modulation(ModulationTarget.AMPLITUDE, ModulationShape.STEP, null), null, null, null, 0, 0),
                ModelVariant.ORIGINAL,
                CalibrationTarget.WHOLE_MUSCLE,
                StimulationSite.SKIN_SURFACE,
                Muscle.SOLEUS,
                new MotorUnitCounts(5, 2, 2),
                80, 6.3,
                InjectionSite.SOMA, CompartmentGeometry.CYLINDRICAL, CompartmentGeometry.CYLINDRICAL,
                0, 0.1);

        assertThat(defaults.resolve(null)).isEqualTo(expected);
        assertThat(defaults.resolve(SimulationDraft.empty())).isEqualTo(expected);
    }

    @Test
    void originalVariantFillsTheMainMUnits() {
        assertThat(defaults.resolve(variant(ModelVariant.ORIGINAL, null)).unitsPerType())
                .isEqualTo(new MotorUnitCounts(5, 2, 2));
    }

    @Test
    void literatureVariantLeavesMissingUnitsToTheEngine() {
        SimulationRequest request = defaults.resolve(variant(ModelVariant.LITERATURE, null));

        assertThat(request.modelVariant()).isEqualTo(ModelVariant.LITERATURE);
        assertThat(request.unitsPerType()).isNull();
        assertThat(request.requestedUnits()).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(ModelVariant.class)
    void givenUnitsAreKeptAndMissingTypesTakeTheirDefault(ModelVariant modelVariant) {
        SimulationRequest request = defaults.resolve(variant(modelVariant, new MotorUnitCountsDraft(null, 7, null)));

        assertThat(request.requestedUnits()).contains(new MotorUnitCounts(5, 7, 2));
    }

    @Test
    void givenFieldsAreKeptAndOnlyMissingNestedFieldsAreFilled() {
        SimulationDraft draft = new SimulationDraft(
                new StimulusDraft(500.0, null, 60.0, null, null, Waveform.BIPHASIC,
                        new ModulationDraft(null, ModulationShape.TRIANGLE, 250.0), 330.0, 1000.0, null, 50.0, null),
                null,
                CalibrationTarget.SINGLE_UNIT,
                StimulationSite.MOTONEURON_POOL,
                Muscle.TIBIALIS_ANTERIOR,
                new MotorUnitCountsDraft(null, 7, null),
                null, 37.0, InjectionSite.DENDRITE, null, CompartmentGeometry.SPHERICAL, 42L, null);

        SimulationRequest request = defaults.resolve(draft);

        assertThat(request.stimulus()).isEqualTo(new Stimulus(500, 0.01, 60, 20, 100, Waveform.BIPHASIC,
                new Modulation(ModulationTarget.AMPLITUDE, ModulationShape.TRIANGLE, 250.0), 330.0, 1000.0, null, 50, 0));
        assertThat(request.modelVariant()).isEqualTo(ModelVariant.ORIGINAL);
        assertThat(request.calibrationTarget()).isEqualTo(CalibrationTarget.SINGLE_UNIT);
        assertThat(request.stimulationSite()).isEqualTo(StimulationSite.MOTONEURON_POOL);
        assertThat(request.muscle()).isEqualTo(Muscle.TIBIALIS_ANTERIOR);
        assertThat(request.unitsPerType()).isEqualTo(new MotorUnitCounts(5, 7, 2));
        assertThat(request.axonLengthPercent()).isEqualTo(80);
        assertThat(request.temperatureCelsius()).isEqualTo(37);
        assertThat(request.injectionSite()).isEqualTo(InjectionSite.DENDRITE);
        assertThat(request.somaGeometry()).isEqualTo(CompartmentGeometry.CYLINDRICAL);
        assertThat(request.dendriteGeometry()).isEqualTo(CompartmentGeometry.SPHERICAL);
        assertThat(request.seed()).isEqualTo(42);
        assertThat(request.outputStepMs()).isEqualTo(0.1);
    }
}

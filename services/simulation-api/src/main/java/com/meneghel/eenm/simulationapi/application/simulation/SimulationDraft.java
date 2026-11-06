package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.CalibrationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.CentralDrive;
import com.meneghel.eenm.simulationapi.domain.simulation.StimulationSite;
import com.meneghel.eenm.simulationapi.domain.simulation.Condition;
import com.meneghel.eenm.simulationapi.domain.simulation.CompartmentGeometry;
import com.meneghel.eenm.simulationapi.domain.simulation.InjectionSite;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;
import java.util.List;

/**
 * The public request as received: every field is optional and may be {@code null}.
 * {@link SimulationDefaults} turns it into a resolved {@code SimulationRequest}.
 */
public record SimulationDraft(
        StimulusDraft stimulus,
        ModelVariant modelVariant,
        CalibrationTarget calibrationTarget,
        StimulationSite stimulationSite,
        Condition condition,
        List<String> conditionAdjustments,
        Muscle muscle,
        MotorUnitCountsDraft unitsPerType,
        Double axonLengthPercent,
        Double temperatureCelsius,
        InjectionSite injectionSite,
        CompartmentGeometry somaGeometry,
        CompartmentGeometry dendriteGeometry,
        Long seed,
        Double outputStepMs,
        CentralDrive centralDrive,
        Boolean unitEvents) {

    public SimulationDraft(StimulusDraft stimulus, ModelVariant modelVariant, CalibrationTarget calibrationTarget,
            StimulationSite stimulationSite, Condition condition, List<String> conditionAdjustments, Muscle muscle,
            MotorUnitCountsDraft unitsPerType, Double axonLengthPercent, Double temperatureCelsius,
            InjectionSite injectionSite, CompartmentGeometry somaGeometry, CompartmentGeometry dendriteGeometry,
            Long seed, Double outputStepMs, CentralDrive centralDrive) {
        this(stimulus, modelVariant, calibrationTarget, stimulationSite, condition, conditionAdjustments, muscle,
                unitsPerType, axonLengthPercent, temperatureCelsius, injectionSite, somaGeometry, dendriteGeometry,
                seed, outputStepMs, centralDrive, null);
    }

    public static SimulationDraft empty() {
        return new SimulationDraft(null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null);
    }
}

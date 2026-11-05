package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.CompartmentGeometry;
import com.meneghel.eenm.simulationapi.domain.simulation.InjectionSite;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;

/**
 * The public request as received: every field is optional and may be {@code null}.
 * {@link SimulationDefaults} turns it into a complete {@code SimulationRequest}.
 */
public record SimulationDraft(
        StimulusDraft stimulus,
        Muscle muscle,
        MotorUnitCountsDraft unitsPerType,
        Double axonLengthPercent,
        Double temperatureCelsius,
        InjectionSite injectionSite,
        CompartmentGeometry somaGeometry,
        CompartmentGeometry dendriteGeometry,
        Long seed,
        Double outputStepMs) {

    public static SimulationDraft empty() {
        return new SimulationDraft(null, null, null, null, null, null, null, null, null, null);
    }
}

package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.CompartmentGeometry;
import com.meneghel.eenm.simulationapi.domain.simulation.InjectionSite;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;
import com.meneghel.eenm.simulationapi.web.validation.Between;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Public request body. Every field is optional; single-field ranges are checked here, defaults and
 * cross-field rules in the application layer.
 */
public record SimulationRequestDto(
        @Valid StimulusDto stimulus,
        ModelVariant modelVariant,
        Muscle muscle,
        @Valid UnitsPerTypeDto unitsPerType,
        @Between(min = "1", max = "100") Double axonLengthPercent,
        @Between(min = "0", max = "45") Double temperatureCelsius,
        InjectionSite injectionSite,
        CompartmentGeometry somaGeometry,
        CompartmentGeometry dendriteGeometry,
        @PositiveOrZero(message = "must be greater than or equal to 0") Long seed,
        @DecimalMax(value = "10", message = "must be less than or equal to 10") Double outputStepMs) {
}

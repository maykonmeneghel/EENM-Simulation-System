package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.CalibrationTarget;
import com.meneghel.eenm.simulationapi.domain.simulation.StimulationSite;
import com.meneghel.eenm.simulationapi.domain.simulation.Condition;
import com.meneghel.eenm.simulationapi.domain.simulation.CompartmentGeometry;
import com.meneghel.eenm.simulationapi.domain.simulation.InjectionSite;
import com.meneghel.eenm.simulationapi.domain.simulation.ModelVariant;
import com.meneghel.eenm.simulationapi.domain.simulation.Muscle;
import com.meneghel.eenm.simulationapi.web.validation.Between;
import jakarta.validation.Valid;
import java.util.List;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Public request body. Every field is optional; single-field ranges are checked here, defaults and
 * cross-field rules in the application layer.
 */
public record SimulationRequestDto(
        @Valid StimulusDto stimulus,
        ModelVariant modelVariant,
        CalibrationTarget calibrationTarget,
        StimulationSite stimulationSite,
        Condition condition,
        List<String> conditionAdjustments,
        Muscle muscle,
        @Valid UnitsPerTypeDto unitsPerType,
        @Between(min = "1", max = "100") Double axonLengthPercent,
        @Between(min = "0", max = "45") Double temperatureCelsius,
        InjectionSite injectionSite,
        CompartmentGeometry somaGeometry,
        CompartmentGeometry dendriteGeometry,
        @PositiveOrZero(message = "must be greater than or equal to 0") Long seed,
        @DecimalMax(value = "10", message = "must be less than or equal to 10") Double outputStepMs,
        @Valid CentralDriveDto centralDrive,
        OutputDto output) {

    public SimulationRequestDto(StimulusDto stimulus, ModelVariant modelVariant, CalibrationTarget calibrationTarget,
            StimulationSite stimulationSite, Condition condition, List<String> conditionAdjustments, Muscle muscle,
            UnitsPerTypeDto unitsPerType, Double axonLengthPercent, Double temperatureCelsius,
            InjectionSite injectionSite, CompartmentGeometry somaGeometry, CompartmentGeometry dendriteGeometry,
            Long seed, Double outputStepMs, CentralDriveDto centralDrive) {
        this(stimulus, modelVariant, calibrationTarget, stimulationSite, condition, conditionAdjustments, muscle,
                unitsPerType, axonLengthPercent, temperatureCelsius, injectionSite, somaGeometry, dendriteGeometry,
                seed, outputStepMs, centralDrive, null);
    }

    /** What the stream carries besides the series; {@code unitEvents}: the per-unit events of the 3D replay. */
    public record OutputDto(Boolean unitEvents) {
    }
}

package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.Electrode;
import com.meneghel.eenm.simulationapi.web.validation.Between;
import jakarta.validation.Valid;

/**
 * {@code electrode} of the public request (LITERATURE + SKIN_SURFACE only). Single-field ranges here
 * ({@code docs/design/electrode.md} §5); the area and the calibration's cross-field rules in the application layer.
 */
public record ElectrodeDto(
        Electrode.Shape shape,
        @Between(min = "0.5", max = "15") Double widthCm,
        @Between(min = "0.5", max = "15") Double lengthCm,
        @Between(min = "0.5", max = "11.3") Double diameterCm,
        @Between(min = "0", max = "3") Double fatThicknessCm,
        @Between(min = "0.1", max = "1.1") Double axonDepthCm,
        Electrode.EffectModel effectModel,
        @Valid CalibrationDto calibration) {

    public record CalibrationDto(
            @Between(min = "0.1", max = "200") Double motorThresholdMa,
            @Between(min = "0.1", max = "200") Double fullRecruitmentMa,
            @Between(min = "20", max = "1000") Double pulseWidthUs,
            @Between(min = "0.5", max = "100") Double electrodeAreaCm2) {
    }

    Electrode toDomain() {
        Electrode.Calibration c = calibration == null ? null
                : new Electrode.Calibration(calibration.motorThresholdMa(), calibration.fullRecruitmentMa(),
                        calibration.pulseWidthUs(), calibration.electrodeAreaCm2());
        return new Electrode(shape, widthCm, lengthCm, diameterCm, fatThicknessCm, axonDepthCm, effectModel, c);
    }
}

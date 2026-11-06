package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.CentralDrive;
import com.meneghel.eenm.simulationapi.web.validation.Between;
import jakarta.validation.Valid;

/** {@code centralDrive} of the public request; ranges as in the engine. */
public record CentralDriveDto(
        Boolean enabled,
        @Between(min = "0", max = "20") Double backgroundNa,
        @Between(min = "0", max = "20") Double voluntaryNa,
        @Between(min = "0", max = "2") Double noiseCv,
        CentralDrive.CurrentScale currentScale,
        CentralDrive.ThresholdRule thresholdRule,
        @Valid TremorDto tremor,
        @Between(min = "0.01", max = "1") Double electrodeFraction) {

    public record TremorDto(
            @Between(min = "0.1", max = "20") Double frequencyHz,
            @Between(min = "0", max = "20") Double amplitudeNa) {
    }

    CentralDrive toDomain() {
        CentralDrive.Tremor t = tremor == null ? null : new CentralDrive.Tremor(tremor.frequencyHz(), tremor.amplitudeNa());
        return new CentralDrive(enabled, backgroundNa, voluntaryNa, noiseCv, currentScale, thresholdRule, t,
                electrodeFraction);
    }
}

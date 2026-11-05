package com.meneghel.eenm.simulationapi.web.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.Waveform;
import com.meneghel.eenm.simulationapi.web.validation.Between;
import jakarta.validation.Valid;

public record StimulusDto(
        @Between(min = "10", max = "300000") Double durationMs,
        @Between(min = "0.005", max = "0.1") Double stepMs,
        @Between(min = "1", max = "200") Double frequencyHz,
        @Between(min = "1", max = "99") Double dutyCyclePercent,
        @Between(min = "0", max = "500") Double amplitude,
        Waveform waveform,
        @Valid ModulationDto modulation,
        Double trainOnMs,
        Double trainPeriodMs,
        @Between(min = "20", max = "1000") Double pulseWidthUs,
        @Between(min = "0", max = "60000") Double rampUpMs,
        @Between(min = "0", max = "60000") Double rampDownMs) {
}

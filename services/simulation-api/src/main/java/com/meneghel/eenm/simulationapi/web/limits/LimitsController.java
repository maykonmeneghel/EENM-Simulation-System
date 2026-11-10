package com.meneghel.eenm.simulationapi.web.limits;

import com.meneghel.eenm.simulationapi.application.simulation.SimulationLimits;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The limits this server enforces on a simulation request, so that the form can show them before a run. */
@RestController
@RequestMapping("/api/v1/limits")
public class LimitsController {

    private final LimitsDto limits;

    public LimitsController(SimulationLimits limits) {
        this.limits = LimitsDto.from(limits);
    }

    @GetMapping
    public LimitsDto limits() {
        return limits;
    }

    /** {@code maxOutputPoints} is {@code null} when the number of points per series is not capped. */
    public record LimitsDto(
            double minDurationMs,
            double maxDurationMs,
            double minStepMs,
            double maxStepMs,
            double maxFrequencyHz,
            int maxUnitsPerType,
            int maxTotalUnits,
            Long maxOutputPoints,
            double maxUnitEventsDurationMs) {

        static LimitsDto from(SimulationLimits limits) {
            SimulationLimits l = limits.withinContract();
            return new LimitsDto(SimulationLimits.MIN_DURATION_MS, l.maxDurationMs(), l.minStepMs(),
                    SimulationLimits.MAX_STEP_MS, l.maxFrequencyHz(), l.maxUnitsPerType(), l.maxTotalUnits(),
                    l.capsOutputPoints() ? l.maxOutputPoints() : null, l.maxUnitEventsDurationMs());
        }
    }
}

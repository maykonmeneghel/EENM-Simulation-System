package com.meneghel.eenm.simulationapi.config;

import com.meneghel.eenm.simulationapi.application.simulation.SimulationLimits;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Server limits (env {@code EENM_MAX_DURATION_MS}, {@code EENM_MIN_STEP_MS}, {@code EENM_MAX_FREQUENCY_HZ},
 * {@code EENM_MAX_UNITS_PER_TYPE}, {@code EENM_MAX_TOTAL_UNITS}, {@code EENM_MAX_OUTPUT_POINTS},
 * {@code EENM_MAX_UNIT_EVENTS_DURATION_MS}; see application.properties). Defaults: the contract ranges.
 */
@ConfigurationProperties("eenm.limits")
public record LimitsProperties(
        @DefaultValue("300000") double maxDurationMs,
        @DefaultValue("0.005") double minStepMs,
        @DefaultValue("200") double maxFrequencyHz,
        @DefaultValue("200") int maxUnitsPerType,
        @DefaultValue("600") int maxTotalUnits,
        @DefaultValue("0") long maxOutputPoints,
        @DefaultValue("30000") double maxUnitEventsDurationMs) {

    public SimulationLimits toLimits() {
        return new SimulationLimits(maxDurationMs, minStepMs, maxFrequencyHz, maxUnitsPerType, maxTotalUnits,
                maxOutputPoints, maxUnitEventsDurationMs).withinContract();
    }
}

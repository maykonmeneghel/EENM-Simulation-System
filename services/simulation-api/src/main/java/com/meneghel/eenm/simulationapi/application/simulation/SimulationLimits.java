package com.meneghel.eenm.simulationapi.application.simulation;

import com.meneghel.eenm.simulationapi.domain.simulation.SimulationRequest;

/**
 * Server-side caps on the request parameters that multiply compute or memory (docs/deployment.md). The defaults,
 * {@link #CONTRACT}, are the contract ranges, so a server without configuration accepts what it always accepted; a
 * configured cap can only tighten a range ({@link #withinContract()}).
 *
 * @param maxDurationMs           longest {@code stimulus.durationMs}
 * @param minStepMs               smallest {@code stimulus.stepMs} (integration steps per simulated ms)
 * @param maxFrequencyHz          highest {@code stimulus.frequencyHz} (pulses, hence spikes and events, per second)
 * @param maxUnitsPerType         most units of one type in {@code unitsPerType}
 * @param maxTotalUnits           most units in total (including the LITERATURE automatic 120)
 * @param maxOutputPoints         most samples per streamed series ({@code durationMs / outputStepMs}); 0 = no cap
 * @param maxUnitEventsDurationMs longest run with {@code output.unitEvents}
 */
public record SimulationLimits(
        double maxDurationMs,
        double minStepMs,
        double maxFrequencyHz,
        int maxUnitsPerType,
        int maxTotalUnits,
        long maxOutputPoints,
        double maxUnitEventsDurationMs) {

    public static final double MIN_DURATION_MS = 10;
    public static final double MAX_STEP_MS = 0.1;

    /** The contract ranges (docs/contracts.md §1): what the API accepts without any limit configured. */
    public static final SimulationLimits CONTRACT = new SimulationLimits(300_000, 0.005, 200, 200, 600, 0,
            SimulationRequest.MAX_UNIT_EVENTS_DURATION_MS);

    public SimulationLimits {
        requirePositive("maxDurationMs", maxDurationMs);
        requirePositive("minStepMs", minStepMs);
        requirePositive("maxFrequencyHz", maxFrequencyHz);
        requirePositive("maxUnitsPerType", maxUnitsPerType);
        requirePositive("maxTotalUnits", maxTotalUnits);
        requirePositive("maxUnitEventsDurationMs", maxUnitEventsDurationMs);
        if (maxOutputPoints < 0) {
            throw new IllegalArgumentException("maxOutputPoints must be 0 (no cap) or positive");
        }
    }

    /** The same caps, none looser than the contract range it narrows. */
    public SimulationLimits withinContract() {
        SimulationLimits c = CONTRACT;
        return new SimulationLimits(
                Math.min(maxDurationMs, c.maxDurationMs),
                Math.max(minStepMs, c.minStepMs),
                Math.min(maxFrequencyHz, c.maxFrequencyHz),
                Math.min(maxUnitsPerType, c.maxUnitsPerType),
                Math.min(maxTotalUnits, c.maxTotalUnits),
                maxOutputPoints,
                Math.min(maxUnitEventsDurationMs, c.maxUnitEventsDurationMs));
    }

    public boolean capsOutputPoints() {
        return maxOutputPoints > 0;
    }

    private static void requirePositive(String name, double value) {
        if (!(value > 0)) {
            throw new IllegalArgumentException(name + " must be positive (got " + value + ")");
        }
    }
}

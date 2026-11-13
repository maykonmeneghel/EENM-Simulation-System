package com.meneghel.eenm.simulationapi.domain.event;

/**
 * The electrode a skin-surface LITERATURE run used, as resolved by the engine ({@code started.electrode}): geometry,
 * fat, axon depth, the effect option, the threshold factor G it gave and the calibration, if any.
 */
public record RunElectrode(String shape, Double widthCm, Double lengthCm, Double diameterCm, double areaCm2,
        double fatThicknessCm, double axonDepthCm, String effectModel, double thresholdFactor,
        Calibration calibration) {

    public record Calibration(double motorThresholdMa, Double fullRecruitmentMa, double pulseWidthUs,
            Double electrodeAreaCm2) {
    }
}

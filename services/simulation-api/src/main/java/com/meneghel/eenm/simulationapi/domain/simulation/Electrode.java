package com.meneghel.eenm.simulationapi.domain.simulation;

/**
 * The surface electrode of a skin-surface LITERATURE run (engine {@code domain/electrode.py};
 * {@code docs/design/electrode.md}). Every field is optional: an unset geometry, fat or depth takes the muscle's default
 * electrode, where the threshold factor G is 1; an unset {@code effectModel} takes the engine's default
 * ({@code HALF_SPACE_AF}).
 */
public record Electrode(
        Shape shape,
        Double widthCm,
        Double lengthCm,
        Double diameterCm,
        Double fatThicknessCm,
        Double axonDepthCm,
        EffectModel effectModel,
        Calibration calibration) {

    public enum Shape {
        RECTANGLE,
        ROUND
    }

    /** How size, fat and depth change the threshold: one option per source. */
    public enum EffectModel {
        /** Derived: activating function of a disk on a homogeneous half-space (magnitude illustrative). */
        HALF_SPACE_AF,
        /** No effect of electrode size (Lieber &amp; Kelly 1991). */
        NONE
    }

    /** The user's own measurement, which puts the amplitude in mA. */
    public record Calibration(Double motorThresholdMa, Double fullRecruitmentMa, Double pulseWidthUs,
            Double electrodeAreaCm2) {
    }

    /** Area of the electrode as given (cm²), or {@code null} when the geometry is left to the muscle's default. */
    public Double areaCm2() {
        if (shape == Shape.ROUND) {
            return diameterCm == null ? null : Math.PI * diameterCm * diameterCm / 4;
        }
        if (shape == Shape.RECTANGLE) {
            return widthCm == null || lengthCm == null ? null : widthCm * lengthCm;
        }
        return null;
    }
}

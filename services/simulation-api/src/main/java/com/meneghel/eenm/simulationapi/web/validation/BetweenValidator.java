package com.meneghel.eenm.simulationapi.web.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.math.BigDecimal;

public class BetweenValidator implements ConstraintValidator<Between, Number> {

    private BigDecimal min;
    private BigDecimal max;

    @Override
    public void initialize(Between constraint) {
        this.min = new BigDecimal(constraint.min());
        this.max = new BigDecimal(constraint.max());
    }

    @Override
    public boolean isValid(Number value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }
        double number = value.doubleValue();
        if (!Double.isFinite(number)) {
            return false;
        }
        BigDecimal decimal = new BigDecimal(value.toString());
        return decimal.compareTo(min) >= 0 && decimal.compareTo(max) <= 0;
    }
}

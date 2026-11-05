package com.meneghel.eenm.simulationapi.web.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * The annotated number must lie in the closed interval [{@code min}, {@code max}]. Bounds are decimal
 * strings so that values such as {@code 0.005} are compared exactly. {@code null} is valid (the field
 * then takes its default).
 */
@Documented
@Constraint(validatedBy = BetweenValidator.class)
@Target({ElementType.FIELD, ElementType.RECORD_COMPONENT, ElementType.PARAMETER, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface Between {

    String min();

    String max();

    String message() default "must be between {min} and {max}";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}

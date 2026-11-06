package com.meneghel.eenm.simulationapi.web.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.meneghel.eenm.simulationapi.application.simulation.FieldViolation;
import com.meneghel.eenm.simulationapi.application.simulation.InvalidSimulationRequestException;
import com.meneghel.eenm.simulationapi.web.simulation.ModulationDto;
import com.meneghel.eenm.simulationapi.web.simulation.SimulationRequestDto;
import com.meneghel.eenm.simulationapi.web.simulation.StimulusDto;
import com.meneghel.eenm.simulationapi.web.simulation.UnitsPerTypeDto;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class RequestValidatorTest {

    private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();

    private final RequestValidator validator = new RequestValidator(FACTORY.getValidator());

    @AfterAll
    static void closeFactory() {
        FACTORY.close();
    }

    @Test
    void emptyRequestIsValid() {
        assertThatCode(() -> validator.validate(request(null, null, null, null))).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @CsvSource({
        "10, 0.005, 1, 1, 0",
        "300000, 0.1, 200, 99, 500"
    })
    void stimulusBoundsAreInclusive(double duration, double step, double frequency, double dutyCycle, double amplitude) {
        StimulusDto stimulus = new StimulusDto(duration, step, frequency, dutyCycle, amplitude, null, null, null, null,
                null, null, null);

        assertThatCode(() -> validator.validate(request(stimulus, null, null, null))).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "9.99   | 0.01  | 40  | 20  | 100 | stimulus.durationMs       | must be between 10 and 300000",
        "300001 | 0.01  | 40  | 20  | 100 | stimulus.durationMs       | must be between 10 and 300000",
        "1000   | 0.004 | 40  | 20  | 100 | stimulus.stepMs           | must be between 0.005 and 0.1",
        "1000   | 0.01  | 201 | 20  | 100 | stimulus.frequencyHz      | must be between 1 and 200",
        "1000   | 0.01  | 40  | 100 | 100 | stimulus.dutyCyclePercent | must be between 1 and 99",
        "1000   | 0.01  | 40  | 20  | -1  | stimulus.amplitude        | must be between 0 and 500"
    })
    void stimulusOutOfRangeIsReportedWithItsJsonPath(double duration, double step, double frequency, double dutyCycle,
            double amplitude, String field, String message) {
        StimulusDto stimulus = new StimulusDto(duration, step, frequency, dutyCycle, amplitude, null, null, null, null,
                null, null, null);

        assertViolations(request(stimulus, null, null, null), new FieldViolation(field, message));
    }

    @Test
    void unitCountsUseTheContractKeys() {
        assertViolations(request(null, new UnitsPerTypeDto(201, -1, 200), null, null),
                new FieldViolation("unitsPerType.FR", "must be between 0 and 200"),
                new FieldViolation("unitsPerType.S", "must be between 0 and 200"));
    }

    @Test
    void unitCountsUpTo200AreValid() {
        assertThatCode(() -> validator.validate(request(null, new UnitsPerTypeDto(200, 0, 200), null, null)))
                .doesNotThrowAnyException();
    }

    @Test
    void topLevelRangesAreChecked() {
        SimulationRequestDto dto = new SimulationRequestDto(null, null, null, null, null, null, null, null, 0.5, 46.0, null, null, null, -1L, 10.5);

        assertViolations(dto,
                new FieldViolation("axonLengthPercent", "must be between 1 and 100"),
                new FieldViolation("outputStepMs", "must be less than or equal to 10"),
                new FieldViolation("seed", "must be greater than or equal to 0"),
                new FieldViolation("temperatureCelsius", "must be between 0 and 45"));
    }

    @Test
    void nonFiniteNumbersAreRejected() {
        StimulusDto stimulus = new StimulusDto(Double.NaN, null, null, null, null, null, new ModulationDto(null, null, null),
                null, null, null, null, null);

        assertViolations(request(stimulus, null, null, null),
                new FieldViolation("stimulus.durationMs", "must be between 10 and 300000"));
    }

    private static SimulationRequestDto request(StimulusDto stimulus, UnitsPerTypeDto units, Double axon, Double output) {
        return new SimulationRequestDto(stimulus, null, null, null, null, null, null, units, axon, null, null, null, null, null, output);
    }

    private void assertViolations(SimulationRequestDto dto, FieldViolation... expected) {
        assertThatThrownBy(() -> validator.validate(dto))
                .isInstanceOfSatisfying(InvalidSimulationRequestException.class, error ->
                        assertThat(error.violations()).containsExactly(expected));
    }
}

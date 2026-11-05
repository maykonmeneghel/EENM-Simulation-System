import math

import numpy as np
import pytest

from eenm_engine.domain.stimulus import (
    ModulationShape,
    ModulationTarget,
    StimulusProtocol,
    Waveform,
    square,
    stimulus_current,
    stimulus_series,
)


def test_square_is_high_during_the_duty_fraction_of_each_period() -> None:
    assert square(0.0, 20) == 1.0
    assert square(0.19 * 2 * math.pi, 20) == 1.0
    assert square(0.2 * 2 * math.pi, 20) == -1.0
    assert square(0.99 * 2 * math.pi, 20) == -1.0
    assert square(2 * math.pi + 0.1, 20) == 1.0


def test_time_grid_matches_matlab_colon_range() -> None:
    protocol = StimulusProtocol(duration_ms=1000, step_ms=0.01)
    assert protocol.sample_count == 100_001
    grid = protocol.time_grid()
    assert grid[0] == 0.0 and grid[-1] == pytest.approx(1000.0)


def test_main_m_default_is_a_40hz_train_of_5ms_monophasic_pulses() -> None:
    protocol = StimulusProtocol()  # currentEENM(1000, 0.01, 40, 20, 100, 'Mono', ..., 'step', 'Amplitude')
    assert stimulus_current(0.0, protocol) == 100.0
    assert stimulus_current(4.99, protocol) == 100.0
    assert stimulus_current(5.01, protocol) == 0.0
    assert stimulus_current(24.99, protocol) == 0.0
    assert stimulus_current(25.01, protocol) == 100.0


def test_biphasic_waveform_goes_negative_between_pulses() -> None:
    protocol = StimulusProtocol(waveform=Waveform.BIPHASIC)
    assert stimulus_current(1.0, protocol) == 100.0
    assert stimulus_current(10.0, protocol) == -100.0


def test_amplitude_ramp_grows_linearly_with_time() -> None:
    protocol = StimulusProtocol(modulation_shape=ModulationShape.RAMP)
    assert stimulus_current(500.0 + 1.0, protocol) == pytest.approx(100.0 * 501.0 / 1000.0)


def test_amplitude_triangle_peaks_at_peak_time() -> None:
    protocol = StimulusProtocol(modulation_shape=ModulationShape.TRIANGLE, peak_time_ms=500.0)
    assert stimulus_current(250.0, protocol) == pytest.approx(50.0)  # 250 ms is inside a pulse
    assert stimulus_current(500.0, protocol) == pytest.approx(100.0)
    assert stimulus_current(751.0, protocol) == pytest.approx(100.0 - 100.0 * 251.0 / 500.0)


def test_amplitude_sinusoidal_uses_sin_of_time_in_ms() -> None:
    protocol = StimulusProtocol(modulation_shape=ModulationShape.SINUSOIDAL)
    assert stimulus_current(1.0, protocol) == pytest.approx(100.0 * math.sin(1.0))


def test_pulse_width_ramp_keeps_the_original_unshifted_square_wave_even_when_monophasic() -> None:
    # FES.m quirk preserved: this branch has no (+1)/2, so a "monophasic" stimulus goes to -Amp.
    protocol = StimulusProtocol(modulation_target=ModulationTarget.PULSE_WIDTH, modulation_shape=ModulationShape.RAMP)
    assert stimulus_current(10.0, protocol) == -100.0


def test_frequency_step_equals_amplitude_step() -> None:
    a = StimulusProtocol(duration_ms=60)
    f = StimulusProtocol(duration_ms=60, modulation_target=ModulationTarget.FREQUENCY)
    np.testing.assert_array_equal(stimulus_series(a), stimulus_series(f))


@pytest.mark.parametrize("peak", [None, 0.0, 1000.0])
def test_triangle_requires_a_peak_time_inside_the_duration(peak: float | None) -> None:
    with pytest.raises(ValueError):
        StimulusProtocol(modulation_shape=ModulationShape.TRIANGLE, peak_time_ms=peak)


def test_pulse_width_and_solver_step() -> None:
    protocol = StimulusProtocol(frequency_hz=40, duty_cycle_percent=20)
    assert protocol.pulse_width_ms == pytest.approx(5.0)
    assert protocol.solver_max_step_ms() == pytest.approx(2.5)
    tiny = StimulusProtocol(frequency_hz=40, duty_cycle_percent=0.01, step_ms=0.01)
    assert tiny.solver_max_step_ms() == pytest.approx(0.01)  # never below the sampling step


def test_intermittent_trains_silence_the_off_period() -> None:
    protocol = StimulusProtocol(train_on_ms=330, train_period_ms=1000)
    assert stimulus_current(1.0, protocol) == 100.0  # inside the first train, inside a pulse
    assert stimulus_current(500.0, protocol) == 0.0  # off period (500 ms is a pulse onset otherwise)
    assert stimulus_current(1000.0, protocol) == 100.0  # next train


def test_trains_need_both_parameters() -> None:
    with pytest.raises(ValueError):
        StimulusProtocol(train_on_ms=330)
    with pytest.raises(ValueError):
        StimulusProtocol(train_on_ms=1200, train_period_ms=1000)

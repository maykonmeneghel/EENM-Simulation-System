"""Stimulator parameters (not in the original): pulse width in µs, symmetric biphasic pulses, train ramps."""

from __future__ import annotations

import numpy as np
import pytest

from eenm_engine.domain.axon_stimulation import AxonExcitability, axon_spikes, pulses
from eenm_engine.domain.stimulus import ModulationShape, StimulusProtocol, Waveform, envelope, stimulus_series


def _runs(signal: np.ndarray, value: float) -> list[int]:
    """Lengths of the runs where ``signal == value``."""
    hit = np.concatenate(([0], (signal == value).astype(np.int8), [0]))
    edges = np.diff(hit)
    return list(np.flatnonzero(edges == -1) - np.flatnonzero(edges == 1))


def test_pulse_width_is_independent_of_the_frequency() -> None:
    for hz in (20.0, 40.0):
        p = StimulusProtocol(duration_ms=200, frequency_hz=hz, pulse_width_us=300)
        assert p.pulse_width_ms == pytest.approx(0.3)
        assert set(_runs(stimulus_series(p)[:-1], p.amplitude)) == {30}  # 0.3 ms at 0.01 ms per sample; the
        # last sample (t = duration) starts a pulse cut by the end of the run
    assert StimulusProtocol(frequency_hz=20, pulse_width_us=300).duty_cycle_percent == pytest.approx(0.6)


def test_symmetric_biphasic_is_plus_then_minus_for_the_pulse_width_then_zero() -> None:
    p = StimulusProtocol(duration_ms=100, frequency_hz=40, pulse_width_us=300, waveform=Waveform.BIPHASIC_SYMMETRIC)
    s = stimulus_series(p)[:-1]
    assert set(_runs(s, p.amplitude)) == {30} and set(_runs(s, -p.amplitude)) == {30}
    assert s[:30].min() == p.amplitude and s[30:60].max() == -p.amplitude and not s[60:2500].any()
    assert s.sum() == pytest.approx(0.0, abs=p.amplitude)  # charge-balanced


def test_ramps_rise_and_fall_inside_each_train() -> None:
    p = StimulusProtocol(duration_ms=4000, train_on_ms=1000, train_period_ms=2000, ramp_up_ms=200, ramp_down_ms=400)
    assert [envelope(t, p) for t in (0, 100, 200, 500, 600, 800, 1000, 1500)] == pytest.approx(
        [0, 0.5, 1, 1, 1, 0.5, 0, 0]
    )
    assert envelope(2100, p) == pytest.approx(0.5)  # second train starts over
    assert envelope(500, StimulusProtocol(ramp_up_ms=1000)) == pytest.approx(0.5)  # no trains: whole run


@pytest.mark.parametrize(
    "kwargs",
    [
        {"pulse_width_us": 30000, "frequency_hz": 40},  # longer than the 25 ms period
        {"pulse_width_us": 15000, "frequency_hz": 40, "waveform": Waveform.BIPHASIC_SYMMETRIC},  # 2 phases > period
        {"ramp_up_ms": 600, "ramp_down_ms": 500},  # > 1000 ms run
        {"ramp_up_ms": 200, "ramp_down_ms": 200, "train_on_ms": 330, "train_period_ms": 1000},
        {"ramp_up_ms": -1},
        {"waveform": Waveform.BIPHASIC_SYMMETRIC},  # needs pulse_width_us
        {"pulse_width_us": 300, "waveform": Waveform.BIPHASIC},
        {"pulse_width_us": 300, "modulation_shape": ModulationShape.RAMP},
    ],
)
def test_invalid_stimulator_settings_are_rejected(kwargs: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        StimulusProtocol(**kwargs)  # type: ignore[arg-type]


def test_biphasic_pulse_excites_with_the_width_of_its_first_phase_once() -> None:
    p = StimulusProtocol(duration_ms=100, frequency_hz=40, pulse_width_us=300, waveform=Waveform.BIPHASIC_SYMMETRIC)
    found = pulses(stimulus_series(p))[:-1]
    assert [x.samples for x in found] == [30] * 4 and all(x.amplitude == p.amplitude for x in found)
    mono = StimulusProtocol(duration_ms=100, frequency_hz=40, pulse_width_us=300)
    rheobase = np.array([40.0, 60.0])
    excit = AxonExcitability()
    both = [axon_spikes(stimulus_series(q), q.step_ms, rheobase, excit) for q in (p, mono)]
    assert np.array_equal(both[0], both[1])  # same threshold and one spike per pulse as monophasic


def test_a_ramp_recruits_units_progressively() -> None:
    p = StimulusProtocol(duration_ms=1000, frequency_hz=40, pulse_width_us=300, amplitude=150, ramp_up_ms=1000)
    excit = AxonExcitability()
    rheobase = excit.rheobases(50, seed=1)
    fired = axon_spikes(stimulus_series(p), p.step_ms, rheobase, excit)
    per_pulse = fired.sum(axis=1)[fired.any(axis=1)]
    assert per_pulse[0] < per_pulse[-1] == 50 and np.all(np.diff(per_pulse) >= 0)

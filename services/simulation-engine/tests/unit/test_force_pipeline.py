import numpy as np
import pytest

from eenm_engine.domain.force_pipeline import (
    LENGTH_CONSTANT,
    MuapShape,
    find_peaks_matlab,
    junction_potential,
    median_filter_3x3,
    muap_train,
    muap_waveform,
    spike_train,
)
from eenm_engine.domain.motor_unit_pool import MotorUnitGroup, MotorUnitType
from eenm_engine.domain.twitch import twitch_force


def group(n: int = 1, delay: int = 0, mt: float = 1.0, mttp: float = 10.0) -> MotorUnitGroup:
    return MotorUnitGroup(
        unit_type=MotorUnitType.S,
        soma_area_fraction=np.full(n, 0.2),
        muap_scale=np.full(n, 0.5),
        muap_time_factor=np.full(n, 0.8),
        muap_delay_samples=np.full(n, delay, dtype=np.int64),
        twitch_peak=np.full(n, mt),
        twitch_time_to_peak_ms=np.full(n, mttp),
    )


class TestFindPeaksMatlab:
    def test_strict_local_maxima_above_height(self) -> None:
        peaks, values = find_peaks_matlab(np.array([0, 2, 1, 3, 1, -1, -0.5, -2.0]))
        assert peaks.tolist() == [1, 3]
        assert values.tolist() == [2, 3]

    def test_flat_top_reports_first_sample(self) -> None:
        peaks, _ = find_peaks_matlab(np.array([0, 1, 4, 4, 4, 1, 0.0]))
        assert peaks.tolist() == [2]

    def test_shoulder_is_not_a_peak(self) -> None:
        peaks, _ = find_peaks_matlab(np.array([0, 4, 4, 5, 1.0]))
        assert peaks.tolist() == [3]

    def test_endpoints_are_never_peaks(self) -> None:
        peaks, _ = find_peaks_matlab(np.array([5, 1, 0, 1, 5.0]))
        assert peaks.size == 0

    def test_height_threshold_is_strict(self) -> None:
        peaks, _ = find_peaks_matlab(np.array([-1, 0, -1, 1, -1.0]), min_height=0.0)
        assert peaks.tolist() == [3]

    def test_short_signals_have_no_peaks(self) -> None:
        assert find_peaks_matlab(np.array([1.0, 2.0]))[0].size == 0


def test_median_filter_pads_with_zeros() -> None:
    a = np.full((3, 1), 9.0)
    # Each 3x3 window holds three 9s (the column) and six zeros of padding -> median 0.
    np.testing.assert_array_equal(median_filter_3x3(a), np.zeros((3, 1)))
    b = np.full((4, 3), 9.0)
    assert median_filter_3x3(b)[1, 1] == 9.0


def test_junction_potential_attenuates_with_axon_length() -> None:
    v = np.array([[40.0]])
    expected = 40.0 * 0.070 * LENGTH_CONSTANT / 2 * np.exp(-0.8 / LENGTH_CONSTANT)
    assert junction_potential(v, 80.0)[0, 0] == pytest.approx(expected)


def test_muap_waveforms() -> None:
    first = muap_waveform(0.8, MuapShape.FIRST_ORDER)
    second = muap_waveform(0.8, MuapShape.SECOND_ORDER)
    assert first.size == second.size == 251
    assert first[125] == pytest.approx(0.0) and second[125] == pytest.approx(1.0)  # t = 0


def test_muap_is_written_at_peak_plus_delay_scaled_by_peak_height_and_apsf() -> None:
    junction = np.zeros((400, 1))
    junction[10, 0] = 2.0
    out = muap_train(junction, group(delay=5), np.array([MuapShape.SECOND_ORDER]))
    wave = 2.0 * 0.5 * muap_waveform(0.8, MuapShape.SECOND_ORDER)
    np.testing.assert_allclose(out[15:266, 0], wave)
    assert not out[:15].any() and not out[266:].any()


def test_overlapping_muaps_overwrite_instead_of_adding() -> None:
    junction = np.zeros((600, 1))
    junction[10, 0] = 1.0
    junction[20, 0] = 3.0
    out = muap_train(junction, group(), np.array([MuapShape.SECOND_ORDER]))
    wave = 0.5 * muap_waveform(0.8, MuapShape.SECOND_ORDER)
    np.testing.assert_allclose(out[20:271, 0], 3.0 * wave)  # the later MUAP wins
    np.testing.assert_allclose(out[10:20, 0], 1.0 * wave[:10])


def test_muap_running_past_the_end_is_truncated() -> None:
    junction = np.zeros((100, 1))
    junction[90, 0] = 1.0
    out = muap_train(junction, group(), np.array([MuapShape.FIRST_ORDER]))
    assert out.shape == (100, 1)


def test_spike_train_keeps_peak_values() -> None:
    np.testing.assert_array_equal(spike_train(np.array([0, 2, 0, 0, 3, 1.0])), [0, 2, 0, 0, 3, 0])


def _matlab_twitch_loop(spikes: np.ndarray, mt: float, mttp: float, step: float) -> np.ndarray:
    """Literal transcription of the f_S loop in Main.m (1-based n = 3..L)."""
    f = np.zeros(spikes.size)
    for n in range(2, spikes.size):
        f[n] = (
            2 * np.exp(-step / mttp) * f[n - 1]
            - np.exp(-2 * step / mttp) * f[n - 2]
            + (mt * step**2 / mttp) * np.exp(1 - step / mttp) * spikes[n - 1]
        )
    return f


def test_twitch_filter_equals_the_original_loop() -> None:
    rng = np.random.default_rng(3)
    spikes = np.where(rng.random(3000) > 0.99, rng.random(3000), 0.0)
    spikes[0] = 7.0  # s(1) must be ignored, as in the loop
    out = twitch_force(spikes, group(mt=0.2, mttp=50.0), step_ms=0.1)
    np.testing.assert_allclose(out[:, 0], _matlab_twitch_loop(spikes, 0.2, 50.0, 0.1), rtol=1e-9, atol=1e-15)


def test_twitch_peaks_at_its_time_to_peak() -> None:
    spikes = np.zeros(5000)
    spikes[1] = 1.0
    out = twitch_force(spikes, group(mttp=10.0), step_ms=0.01)
    peak_time = (np.argmax(out[:, 0]) - 2) * 0.01
    assert peak_time == pytest.approx(10.0, abs=0.02)

import numpy as np
import pytest

from eenm_engine.domain.motor_unit_pool import MotorUnitGroup, MotorUnitType
from eenm_engine.domain.twitch import TwitchFilter, TwitchShape, twitch_force


def group(mttp: tuple[float, ...] = (50.0, 80.0), mt: tuple[float, ...] = (0.2, 0.3)) -> MotorUnitGroup:
    n = len(mttp)
    return MotorUnitGroup(
        unit_type=MotorUnitType.S,
        soma_area_fraction=np.full(n, 0.2),
        muap_scale=np.full(n, 0.5),
        muap_time_factor=np.full(n, 0.8),
        muap_delay_samples=np.zeros(n, dtype=np.int64),
        twitch_peak=np.array(mt),
        twitch_time_to_peak_ms=np.array(mttp),
    )


def spike_train(n: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return np.where(rng.random(n) > 0.995, rng.random(n), 0.0)


def test_exponent_one_kernel_equals_the_original_recursion() -> None:
    # The sparse-kernel path at m = 1 (forced with a value an ulp away from 1) must match the IIR.
    spikes = spike_train(20_000, 1)
    original = twitch_force(spikes, group(), 0.1)
    almost_one = twitch_force(spikes, group(), 0.1, TwitchShape(exponent=1.0 + 1e-12))
    np.testing.assert_allclose(almost_one, original, rtol=1e-9, atol=1e-15)


@pytest.mark.parametrize("shape", [TwitchShape(), TwitchShape(exponent=2.4)])
def test_segments_equal_the_whole_train(shape: TwitchShape) -> None:
    spikes = spike_train(30_000, 2)
    whole = twitch_force(spikes, group(), 0.05, shape)
    filt = TwitchFilter(group(), 0.05, shape)
    pieces = np.vstack([filt.segment(spikes[i : i + 977]) for i in range(0, spikes.size, 977)])
    np.testing.assert_allclose(pieces, whole, rtol=1e-12, atol=1e-18)


@pytest.mark.parametrize("ratio", [0.75, 1.0, 1.68])
def test_exponent_from_ratio_gives_that_half_relaxation(ratio: float) -> None:
    shape = TwitchShape.from_half_relaxation_ratio(ratio)
    assert shape.half_relaxation_ratio() == pytest.approx(ratio, rel=1e-6)
    impulse = np.zeros(100_000)
    impulse[1] = 1.0
    force = twitch_force(impulse, group(mttp=(100.0,), mt=(1.0,)), 0.01, shape)[:, 0]
    peak = int(np.argmax(force))
    half = peak + int(np.argmax(force[peak:] <= 0.5 * force[peak]))
    assert (peak - 2) * 0.01 == pytest.approx(100.0, abs=0.02)  # contraction time kept
    assert (half - peak) * 0.01 / 100.0 == pytest.approx(ratio, abs=2e-3)


def test_original_shape_ratio_is_about_1_68() -> None:
    assert TwitchShape().half_relaxation_ratio() == pytest.approx(1.678, abs=1e-3)


def test_exponent_must_be_positive() -> None:
    with pytest.raises(ValueError):
        TwitchShape(exponent=0)


class TestRateGain:
    def test_gain_is_one_up_to_the_breakpoint(self) -> None:
        from eenm_engine.domain.twitch import RateGain

        np.testing.assert_array_equal(RateGain.gain(np.array([0.0, 0.1, 0.4])), [1.0, 1.0, 1.0])

    def test_gain_is_nearly_continuous_at_the_breakpoint(self) -> None:
        from eenm_engine.domain.twitch import RateGain

        # 1 - e^{-2·0.4³} = 0.12015 vs 0.3·0.4 = 0.12: the published composite curve steps by 0.13 %
        assert RateGain.gain(np.array([0.4 + 1e-9]))[0] == pytest.approx(1.00125, abs=1e-4)

    def test_gain_follows_potvin_fuglevand_2017(self) -> None:
        from eenm_engine.domain.twitch import RateGain

        nr = np.array([0.7, 1.0, 2.0])
        np.testing.assert_allclose(RateGain.gain(nr), (1 - np.exp(-2 * nr**3)) / (0.3 * nr))

    def test_mean_force_of_a_regular_train_follows_the_normalised_force_curve(self) -> None:
        from eenm_engine.domain.twitch import RateGain

        g = group(mttp=(100.0,), mt=(1.0,))
        step, samples = 0.1, 40_000  # 4 s
        mean_force = []
        rates_per_ms = np.array([0.002, 0.004, 0.007, 0.01, 0.02])  # NR = 0.2, 0.4, 0.7, 1, 2
        for rate in rates_per_ms:
            drive = np.zeros((samples, 1))
            drive[:: round(1 / rate / step), 0] = 1.0
            drive[0, 0] = 0.0
            drive[1, 0] = 1.0
            gained = RateGain(g.twitch_time_to_peak_ms, step).apply(drive)
            force = TwitchFilter(g, step, TwitchShape(5.0)).segment(gained)[:, 0]
            mean_force.append(force[samples // 2 :].mean())
        nr = rates_per_ms * 100.0
        nf = np.where(nr <= 0.4, 0.3 * nr, 1 - np.exp(-2 * nr**3))
        np.testing.assert_allclose(np.array(mean_force) / mean_force[-1], nf / nf[-1], rtol=0.02)

    def test_first_spike_of_each_unit_is_not_scaled(self) -> None:
        from eenm_engine.domain.twitch import RateGain

        drive = np.zeros((100, 2))
        drive[10, 0] = drive[12, 0] = drive[50, 1] = 1.0
        out = RateGain(np.array([100.0, 100.0]), 0.1).apply(drive)
        assert out[10, 0] == 1.0 and out[50, 1] == 1.0
        assert out[12, 0] < 1.0  # 0.2 ms interval -> NR = 500


def test_rate_gain_requires_own_spikes() -> None:
    from eenm_engine.domain.model_options import ModelOptions

    with pytest.raises(ValueError):
        ModelOptions(rate_gain=True)

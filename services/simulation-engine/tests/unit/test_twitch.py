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

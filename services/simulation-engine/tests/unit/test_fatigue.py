import numpy as np
import pytest

from eenm_engine.domain.fatigue import FatigueModel, UnitFatigue
from eenm_engine.domain.model_options import ForceAggregation, ModelOptions, TwitchDrive, UnitSelection
from eenm_engine.domain.motor_unit_pool import MotorUnitGroup, MotorUnitType, Muscle, build_group
from eenm_engine.domain.twitch import RateGain, TwitchFilter, TwitchShape


def test_nominal_fatigability_spans_the_published_range() -> None:
    model = FatigueModel()
    rates = model.nominal(np.array([0, 449, 899]), 900)
    assert rates[0] == pytest.approx(0.0125)
    assert rates[-1] == pytest.approx(0.0125 * 180)  # 2.25 %/s
    assert rates[0] < rates[1] < rates[2]


def test_force_loss_integrates_fatigability_times_normalised_force() -> None:
    fatigue = UnitFatigue(FatigueModel(), np.array([2.0]))  # 2 %/s
    fatigue.on_spike(0, normalised_force=0.5, interval_ms=1000.0)  # 1 s at NF 0.5 -> 1 %
    assert fatigue.capacity[0] == pytest.approx(0.99)
    assert fatigue.contraction_time_scale(0) == pytest.approx(1 + 0.379 * 0.01)


def test_capacity_never_goes_negative() -> None:
    fatigue = UnitFatigue(FatigueModel(), np.array([1000.0]))
    fatigue.on_spike(0, 1.0, 10_000.0)
    assert fatigue.capacity[0] == 0.0


def test_pool_rank_orders_units_by_type_then_position() -> None:
    s = build_group(MotorUnitType.S, Muscle.SOLEUS, 2, 80, 1e5)
    ff = build_group(MotorUnitType.FF, Muscle.SOLEUS, 2, 80, 1e5)
    assert s.pool_rank is not None and ff.pool_rank is not None
    assert s.pool_rank.tolist() == [0, 1] and ff.pool_rank.tolist() == [850, 851]


def _group(rank: int) -> MotorUnitGroup:
    return MotorUnitGroup(
        unit_type=MotorUnitType.S,
        soma_area_fraction=np.array([0.2]),
        muap_scale=np.array([0.5]),
        muap_time_factor=np.array([0.8]),
        muap_delay_samples=np.array([0]),
        twitch_peak=np.array([1.0]),
        twitch_time_to_peak_ms=np.array([60.0]),
        pool_rank=np.array([rank]),
    )


def test_fatigability_from_force_spans_the_range_and_reduces_to_eq9() -> None:
    model = FatigueModel()
    rates = model.nominal_from_force(np.array([0.1, 1.0, 10.0]), weakest=0.1, strongest=10.0)
    np.testing.assert_allclose(rates, [0.0125, 0.0125 * np.sqrt(180), 0.0125 * 180])
    # In Potvin & Fuglevand's pool force is exponential in the index, so this is their Eq 9:
    index = np.arange(120)
    force = np.exp(np.log(100) * index / 119)
    np.testing.assert_allclose(model.nominal_from_force(force, 1.0, 100.0), model.nominal(index, 120))


def test_pauses_accrue_no_fatigue() -> None:
    fatigue = UnitFatigue(FatigueModel(), np.array([2.0]))
    fatigue.on_spike(0, normalised_force=0.04, interval_ms=670.0, normalised_rate=0.13)  # off period of a train
    assert fatigue.capacity[0] == 1.0


def test_soleus_pool_twitch_range() -> None:
    from eenm_engine.domain.motor_unit_pool import pool_twitch_range

    assert pool_twitch_range(Muscle.SOLEUS) == pytest.approx((0.103, 0.491))


def _tetanus(rank: int, seconds: float = 30.0) -> tuple[float, float]:
    """Mean force in the first and last second of a 40 Hz train, with fatigue."""
    step = 0.1
    samples = int(seconds * 1000 / step)
    drive = np.zeros((samples, 1))
    drive[1::250, 0] = 1.0  # 40 Hz
    group = _group(rank)
    fatigue = UnitFatigue(FatigueModel(), FatigueModel().nominal(np.array([rank]), 900))
    weights, scale = RateGain(group.twitch_time_to_peak_ms, step, fatigue).apply_with_timing(drive)
    force = TwitchFilter(group, step, TwitchShape(4.0)).segment(weights, scale)[:, 0]
    second = int(1000 / step)
    return float(force[:second].mean()), float(force[-second:].mean())


def test_strong_units_fatigue_and_weak_units_do_not() -> None:
    weak_start, weak_end = _tetanus(rank=0)
    strong_start, strong_end = _tetanus(rank=899)
    assert weak_end / weak_start > 0.98
    assert strong_end / strong_start < 0.6


def test_fatigue_needs_rate_gain_and_the_generalised_twitch() -> None:
    with pytest.raises(ValueError):
        ModelOptions(fatigue=FatigueModel())
    with pytest.raises(ValueError):
        ModelOptions(
            twitch_drive=TwitchDrive.OWN_SPIKES, rate_gain=True, fatigue=FatigueModel()
        )  # exponent 1 (original twitch)
    ModelOptions(
        unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
        twitch_shape=TwitchShape(4.0),
        twitch_drive=TwitchDrive.OWN_SPIKES,
        force_aggregation=ForceAggregation.SUM,
        rate_gain=True,
        fatigue=FatigueModel(),
    )


def test_original_twitch_rejects_slowing() -> None:
    with pytest.raises(ValueError):
        TwitchFilter(_group(0), 0.1).segment(np.ones((3, 1)), np.full((3, 1), 1.1))

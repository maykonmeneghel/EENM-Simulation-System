import numpy as np
import pytest

from eenm_engine.domain.fatigue import FatigueModel
from eenm_engine.domain.force_pipeline import type_signals
from eenm_engine.domain.model_options import ForceAggregation, ModelOptions, TwitchDrive, UnitSelection
from eenm_engine.domain.motor_unit_pool import MotorUnitType, pool_twitch_range
from eenm_engine.domain.simulation import UNIT_TYPES, IncrementalForce, MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol
from eenm_engine.domain.twitch import TwitchShape

MODELS = {
    "original": ModelOptions(),
    "step1": ModelOptions(
        unit_selection=UnitSelection.SPREAD_ACROSS_POOL, twitch_shape=TwitchShape(5.1), twitch_time_scale=1.5
    ),
    "step2": ModelOptions(
        unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
        twitch_shape=TwitchShape(5.1),
        twitch_drive=TwitchDrive.OWN_SPIKES,
        rate_gain=True,
        force_aggregation=ForceAggregation.SUM,
    ),
    "fatigue": ModelOptions(
        unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
        twitch_shape=TwitchShape(5.1),
        twitch_drive=TwitchDrive.OWN_SPIKES,
        rate_gain=True,
        force_aggregation=ForceAggregation.SUM,
        fatigue=FatigueModel(weakest_fatigability=5.0),  # exaggerated so 40 ms show measurable fatigue
    ),
}


def spiking_voltages(samples: int, units: int, seed: int) -> np.ndarray:
    """Synthetic soma voltages: rest near -57 mV with ~1 ms spikes to +40 mV at random times."""
    rng = np.random.default_rng(seed)
    v = -57.0 + rng.normal(0, 0.3, size=(samples, units))
    for k in range(units):
        for start in rng.choice(samples - 120, size=samples // 400, replace=False):
            v[start : start + 100, k] += 97.0 * np.sin(np.linspace(0, np.pi, 100))
    return v


def one_shot(setup: MotorUnitSetup, config: SimulationConfig, voltage: np.ndarray) -> dict[MotorUnitType, np.ndarray]:
    out = {}
    for t, cols in setup.column_slices().items():
        signals = type_signals(
            voltage[:, cols],
            setup.groups[t],
            setup.muap_shapes[t],
            config.axon_length_percent,
            config.stimulus.step_ms,
            config.model,
            pool_twitch_range(config.muscle),
        )
        summed = config.model.force_aggregation is ForceAggregation.SUM
        out[t] = signals.summed_force() if summed else signals.mean_force()
    return out


@pytest.mark.parametrize("model", list(MODELS))
@pytest.mark.parametrize("axon_length", [80.0, 0.01])  # 0.01 % gives a zero-sample MUAP delay
@pytest.mark.parametrize("block", [1, 7, 500, 4001])
def test_streamed_force_equals_force_on_the_complete_signal(model: str, axon_length: float, block: int) -> None:
    options = MODELS[model]
    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=40, step_ms=0.01), axon_length_percent=axon_length, model=options
    )
    setup = MotorUnitSetup.from_config(config)
    total = config.stimulus.sample_count
    voltage = spiking_voltages(total, setup.motoneurons.n_units, seed=block)
    expected = one_shot(setup, config, voltage)

    incremental = IncrementalForce(setup, config, total)
    streamed: dict[MotorUnitType, list[np.ndarray]] = {t: [] for t in UNIT_TYPES}
    released_until = 0
    for start in range(0, total, block):
        series = incremental.add(voltage[start : start + block])
        if series is not None:
            assert series.start == released_until  # contiguous, no gaps or overlaps
            released_until = series.stop
            for t in UNIT_TYPES:
                streamed[t].append(series.force_by_type[t])

    assert released_until == total
    for t in UNIT_TYPES:
        got = np.concatenate(streamed[t])
        if options.twitch_shape.is_original:
            np.testing.assert_array_equal(got, expected[t])
        else:  # the sparse kernel sum adds the same terms in another order: equal up to rounding
            np.testing.assert_allclose(got, expected[t], rtol=1e-12, atol=1e-15)


def test_rejects_more_samples_than_the_duration() -> None:
    config = SimulationConfig(stimulus=StimulusProtocol(duration_ms=1, step_ms=0.1))
    setup = MotorUnitSetup.from_config(config)
    incremental = IncrementalForce(setup, config, 11)
    with pytest.raises(ValueError):
        incremental.add(np.zeros((12, setup.motoneurons.n_units)))


def test_muap_shape_draws_are_reproducible_per_seed() -> None:
    a = MotorUnitSetup.from_config(SimulationConfig(seed=7)).muap_shapes
    b = MotorUnitSetup.from_config(SimulationConfig(seed=7)).muap_shapes
    for t in UNIT_TYPES:
        np.testing.assert_array_equal(a[t], b[t])


def test_config_rejects_more_units_than_the_muscle_has() -> None:
    with pytest.raises(ValueError):
        SimulationConfig(units_per_type={MotorUnitType.S: 801, MotorUnitType.FR: 0, MotorUnitType.FF: 0})


def test_config_requires_at_least_one_unit() -> None:
    with pytest.raises(ValueError):
        SimulationConfig(units_per_type={MotorUnitType.S: 0, MotorUnitType.FR: 0, MotorUnitType.FF: 0})


def test_own_spike_twitch_starts_one_sample_after_arrival() -> None:
    from eenm_engine.domain.force_pipeline import TypeForce

    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=20, step_ms=0.01),
        model=ModelOptions(twitch_drive=TwitchDrive.OWN_SPIKES),
    )
    setup = MotorUnitSetup.from_config(config)
    group = setup.groups[MotorUnitType.S]
    voltage = np.full((2001, group.size), -57.0)
    voltage[100:110, :] = 40.0 * np.sin(np.linspace(0.1, np.pi - 0.1, 10))[:, None]  # one spike, peak ~ 104
    pipeline = TypeForce(group, setup.muap_shapes[MotorUnitType.S], 80.0, 0.01, config.model)
    force = pipeline.compute(voltage, 0, 2001).force[:, 0]
    first = int(np.flatnonzero(force)[0])
    assert first == 104 + int(group.muap_delay_samples[0]) + 1


def test_a_plateau_at_the_end_of_the_data_holds_back_release() -> None:
    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=10, step_ms=0.01),
        axon_length_percent=0.01,
        model=MODELS["step2"],
    )
    setup = MotorUnitSetup.from_config(config)
    n = setup.motoneurons.n_units
    rising = np.linspace(-57, 40, 50)[:, None] * np.ones((1, n))
    flat = np.full((30, n), 40.0)  # a flat top still running at the end of the data
    incremental = IncrementalForce(setup, config, config.stimulus.sample_count)
    released = incremental.add(np.vstack([rising, flat]))
    assert released is None or released.stop <= 50  # nothing at or after the plateau start is final


def test_a_zero_plateau_does_not_hold_back_release() -> None:
    from eenm_engine.domain.force_pipeline import _trailing_run_start

    assert _trailing_run_start(np.array([1.0, 0.0, 0.0, 0.0])) is None  # zero can never be a peak
    assert _trailing_run_start(np.array([1.0, 2.0, 3.0, 3.0])) == 2


def test_long_axon_run_keeps_bounded_memory_and_equals_the_complete_computation() -> None:
    """Thousands of samples beyond the kept history: the dropped samples must not change any force value.

    Block (97 samples) and pulse period (37 Hz) are deliberately incommensurate: with aligned values (100 samples,
    40 Hz) a too-short history went unnoticed because spikes never fell in the samples it dropped.
    """
    BLOCK = 97  # noqa: N806
    from eenm_engine.domain.axon_stimulation import axon_spikes
    from eenm_engine.domain.force_pipeline import type_signals
    from eenm_engine.domain.model_options import LITERATURE_UNITS, ModelOptions
    from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS, Muscle, pool_twitch_range, proportional_units
    from eenm_engine.domain.simulation import IncrementalForce, MotorUnitSetup, SimulationConfig
    from eenm_engine.domain.stimulus import StimulusProtocol, Waveform, stimulus_series

    options = ModelOptions.literature()
    units = {t: max(1, n // 10) for t, n in proportional_units(Muscle.SOLEUS, LITERATURE_UNITS).items()}
    protocol = StimulusProtocol(
        duration_ms=600,
        step_ms=0.05,
        frequency_hz=37,
        pulse_width_us=300,
        amplitude=153,
        waveform=Waveform.BIPHASIC_SYMMETRIC,
        ramp_up_ms=200,
    )
    config = SimulationConfig(stimulus=protocol, model=options, units_per_type=units)
    setup = MotorUnitSetup.from_config(config)
    spikes = axon_spikes(stimulus_series(protocol), protocol.step_ms, setup.axon_rheobase, options.axon_excitability)
    spikes = spikes.astype(np.float64)

    force = IncrementalForce(setup, config, spikes.shape[0])
    streamed, most_buffered = [], 0
    for start in range(0, spikes.shape[0], BLOCK):
        series = force.add(spikes[start : start + BLOCK])
        most_buffered = max(most_buffered, force.buffered_samples)
        if series is not None:
            streamed.append(series.total_force)
    total = np.concatenate(streamed)

    pool = MUSCLE_PRESETS[Muscle.SOLEUS].pool_size
    expected = np.zeros(spikes.shape[0])
    for t, cols in setup.column_slices().items():
        weight = pool[t] / setup.groups[t].size
        sig = type_signals(
            spikes[:, cols],
            setup.groups[t],
            setup.muap_shapes[t],
            80.0,
            protocol.step_ms,
            options,
            pool_twitch_range(Muscle.SOLEUS),
        )
        expected += sig.summed_force() * weight
    assert total.shape == expected.shape
    np.testing.assert_allclose(total, expected, rtol=1e-9, atol=1e-12)
    assert most_buffered < spikes.shape[0] / 3  # 12 001 samples, history ≈ 600 + block

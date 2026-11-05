import numpy as np
import pytest

from eenm_engine.domain.force_pipeline import type_signals
from eenm_engine.domain.motor_unit_pool import MotorUnitType
from eenm_engine.domain.simulation import (
    UNIT_TYPES,
    IncrementalForce,
    MotorUnitSetup,
    SimulationConfig,
)
from eenm_engine.domain.stimulus import StimulusProtocol


def spiking_voltages(samples: int, units: int, seed: int) -> np.ndarray:
    """Synthetic soma voltages: rest near -57 mV with ~1 ms spikes to +40 mV at random times."""
    rng = np.random.default_rng(seed)
    v = -57.0 + rng.normal(0, 0.3, size=(samples, units))
    for k in range(units):
        for start in rng.choice(samples - 120, size=samples // 400, replace=False):
            v[start : start + 100, k] += 97.0 * np.sin(np.linspace(0, np.pi, 100))
    return v


def one_shot(setup: MotorUnitSetup, config: SimulationConfig, voltage: np.ndarray) -> dict[MotorUnitType, np.ndarray]:
    return {
        t: type_signals(
            voltage[:, cols], setup.groups[t], setup.muap_shapes[t], config.axon_length_percent, config.stimulus.step_ms
        ).mean_force()
        for t, cols in setup.column_slices().items()
    }


@pytest.mark.parametrize("axon_length", [80.0, 0.01])  # 0.01 % gives a zero-sample MUAP delay
@pytest.mark.parametrize("block", [1, 7, 500, 4001])
def test_streamed_force_equals_force_on_the_complete_signal(axon_length: float, block: int) -> None:
    config = SimulationConfig(stimulus=StimulusProtocol(duration_ms=40, step_ms=0.01), axon_length_percent=axon_length)
    setup = MotorUnitSetup.from_config(config)
    total = config.stimulus.sample_count
    voltage = spiking_voltages(total, setup.motoneurons.n_units, seed=block)
    expected = one_shot(setup, config, voltage)

    incremental = IncrementalForce(setup, config, total)
    streamed = {t: [] for t in UNIT_TYPES}
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
        np.testing.assert_array_equal(np.concatenate(streamed[t]), expected[t])


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

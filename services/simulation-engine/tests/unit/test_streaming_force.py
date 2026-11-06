"""Streaming force stages against the reference (``force_pipeline.type_signals`` on the complete record):
force *and* EMG, on the output grid, with fatigue pauses, and the bounded hold-back of an open plateau."""

from __future__ import annotations

import numpy as np
import pytest

from eenm_engine.domain.axon_stimulation import axon_spikes
from eenm_engine.domain.fatigue import FatigueModel
from eenm_engine.domain.force_pipeline import type_signals
from eenm_engine.domain.model_options import ForceAggregation, ModelOptions, TwitchDrive, UnitSelection
from eenm_engine.domain.motor_unit_pool import MUSCLE_PRESETS, Muscle, pool_twitch_range, proportional_units
from eenm_engine.domain.simulation import UNIT_TYPES, IncrementalForce, MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, Waveform, stimulus_series
from eenm_engine.domain.streaming_force import _PeakScanner
from eenm_engine.domain.twitch import TwitchShape

from .test_incremental_force import MODELS, spiking_voltages


def _reference(setup: MotorUnitSetup, config: SimulationConfig, record: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    pool = MUSCLE_PRESETS[config.muscle].pool_size
    force, emg = np.zeros(record.shape[0]), np.zeros(record.shape[0])
    for t, cols in setup.column_slices().items():
        sig = type_signals(
            record[:, cols], setup.groups[t], setup.muap_shapes[t], config.axon_length_percent,
            config.stimulus.step_ms, config.model, pool_twitch_range(config.muscle),
        )  # fmt: skip
        if config.model.force_aggregation is ForceAggregation.SUM:
            weight = pool[t] / setup.groups[t].size if config.model.represent_pool else 1.0
            force += sig.summed_force() * weight
        else:
            force += sig.mean_force()
        emg += sig.mean_muap()
    return force * config.model.force_scale, emg


def _stream(setup: MotorUnitSetup, config: SimulationConfig, record: np.ndarray, block: int, stride: int):
    incremental = IncrementalForce(setup, config, record.shape[0], stride=stride)
    force, emg, indices, released = [], [], [], 0
    for start in range(0, record.shape[0], block):
        series = incremental.add(record[start : start + block])
        if series is not None:
            assert series.start == released
            released = series.stop
            force.append(series.total_force)
            emg.append(series.emg)
            indices.append(series.indices)
    assert released == record.shape[0]
    return np.concatenate(force), np.concatenate(emg), np.concatenate(indices), incremental


@pytest.mark.parametrize("model", list(MODELS))
@pytest.mark.parametrize("stride", [1, 7, 100])
def test_force_and_emg_on_the_output_grid_equal_the_complete_computation(model: str, stride: int) -> None:
    config = SimulationConfig(stimulus=StimulusProtocol(duration_ms=40, step_ms=0.01), model=MODELS[model])
    setup = MotorUnitSetup.from_config(config)
    voltage = spiking_voltages(config.stimulus.sample_count, setup.motoneurons.n_units, seed=3)
    expected_force, expected_emg = _reference(setup, config, voltage)
    force, emg, indices, _ = _stream(setup, config, voltage, block=333, stride=stride)
    np.testing.assert_array_equal(indices, np.arange(0, voltage.shape[0], stride))
    np.testing.assert_allclose(force, expected_force[indices], rtol=1e-12, atol=1e-15)
    np.testing.assert_allclose(emg, expected_emg[indices], rtol=1e-12, atol=1e-15)


def test_literature_axons_with_pauses_and_fatigue_equal_the_complete_computation() -> None:
    """Intermittent 30 Hz train (off periods longer than four contraction times are fatigue pauses), exaggerated
    fatigability so the capacity and the twitch slowing change during the run."""
    options = ModelOptions.literature()
    options = ModelOptions(**{**options.__dict__, "fatigue": FatigueModel(weakest_fatigability=3.0)})
    units = {t: max(1, n // 12) for t, n in proportional_units(Muscle.SOLEUS, 120).items()}
    protocol = StimulusProtocol(
        duration_ms=2400, step_ms=0.05, frequency_hz=30, pulse_width_us=300, amplitude=153,
        waveform=Waveform.BIPHASIC_SYMMETRIC, train_on_ms=400, train_period_ms=1100,
    )  # fmt: skip
    config = SimulationConfig(stimulus=protocol, model=options, units_per_type=units)
    setup = MotorUnitSetup.from_config(config)
    spikes = axon_spikes(stimulus_series(protocol), protocol.step_ms, setup.axon_rheobase, options.axon_excitability)
    spikes = spikes.astype(np.float64)
    expected_force, expected_emg = _reference(setup, config, spikes)
    force, emg, indices, incremental = _stream(setup, config, spikes, block=101, stride=20)
    np.testing.assert_allclose(force, expected_force[indices], rtol=1e-11, atol=1e-13)
    np.testing.assert_allclose(emg, expected_emg[indices], rtol=1e-12, atol=1e-15)
    summary = incremental.capacity_summary()
    assert summary is not None and summary[0] < 0.97  # fatigue did act in this run


def test_soma_pool_with_pauses_equal_the_complete_computation() -> None:
    options = ModelOptions(
        unit_selection=UnitSelection.SPREAD_ACROSS_POOL, twitch_shape=TwitchShape(3.9),
        twitch_drive=TwitchDrive.OWN_SPIKES, rate_gain=True, force_aggregation=ForceAggregation.SUM,
        fatigue=FatigueModel(weakest_fatigability=5.0),
    )  # fmt: skip
    config = SimulationConfig(stimulus=StimulusProtocol(duration_ms=900, step_ms=0.05), model=options)
    setup = MotorUnitSetup.from_config(config)
    n = config.stimulus.sample_count
    voltage = spiking_voltages(n, setup.motoneurons.n_units, seed=11)
    voltage[n // 3 : 2 * n // 3] = -57.0  # a long silence: the next spike ends a pause
    expected_force, expected_emg = _reference(setup, config, voltage)
    force, emg, indices, _ = _stream(setup, config, voltage, block=250, stride=10)
    np.testing.assert_allclose(force, expected_force[indices], rtol=1e-11, atol=1e-13)
    np.testing.assert_allclose(emg, expected_emg[indices], rtol=1e-12, atol=1e-15)


def test_scanner_holds_back_only_an_open_rising_positive_plateau() -> None:
    scanner = _PeakScanner(3, np.array([0, 5, 0]))
    signal = np.array(
        [
            [0.0, 0.0, 0.0],
            [1.0, 1.0, -2.0],
            [3.0, 2.0, -1.0],
            [3.0, 1.0, -1.0],  # col 0: plateau 3 open; col 1: peak at 2 decided; col 2: negative, never holds back
        ]
    )
    scanner.feed(signal)
    np.testing.assert_array_equal(scanner.decided(), [2, 4, 4])
    assert int(scanner.queue.count[1]) == 1 and int(scanner.queue.start[1, 0]) == 2 + 5  # queued at peak + delay
    scanner.feed(np.array([[0.0, 1.0, -3.0]]))  # col 0's plateau falls: its peak is at the plateau's first sample
    assert int(scanner.queue.count[0]) == 1 and int(scanner.queue.start[0, 0]) == 2
    np.testing.assert_array_equal(scanner.decided(), [5, 5, 5])


def test_unit_types_without_units_contribute_nothing() -> None:
    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=10, step_ms=0.01),
        units_per_type={UNIT_TYPES[0]: 3, UNIT_TYPES[1]: 0, UNIT_TYPES[2]: 0},
    )
    setup = MotorUnitSetup.from_config(config)
    voltage = spiking_voltages(config.stimulus.sample_count, setup.motoneurons.n_units, seed=1)
    force, emg, _, _ = _stream(setup, config, voltage, block=97, stride=1)
    expected_force, expected_emg = _reference(setup, config, voltage)
    np.testing.assert_array_equal(force, expected_force)
    np.testing.assert_allclose(emg, expected_emg, rtol=1e-12, atol=1e-15)

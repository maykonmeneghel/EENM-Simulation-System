import numpy as np
import pytest

from eenm_engine.application.events import SimulationChunk, SimulationCompleted
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.axon_stimulation import AxonExcitability, axon_spikes, pulses
from eenm_engine.domain.model_options import (
    ForceAggregation,
    ModelOptions,
    StimulationSite,
    TwitchDrive,
    UnitSelection,
)
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, stimulus_series
from tests.fakes import FailingSolver

AXONS = ModelOptions(
    unit_selection=UnitSelection.SPREAD_ACROSS_POOL,
    twitch_drive=TwitchDrive.OWN_SPIKES,
    force_aggregation=ForceAggregation.SUM,
    rate_gain=True,
    stimulation_site=StimulationSite.MOTOR_AXONS,
)


def test_weiss_threshold() -> None:
    e = AxonExcitability(chronaxie_ms=0.5)
    assert e.threshold(np.array([10.0]), 0.5)[0] == pytest.approx(20.0)  # at chronaxie: twice rheobase
    assert e.threshold(np.array([10.0]), 5.0)[0] == pytest.approx(11.0)


def test_default_reproduces_the_original_recruitment_range_at_0_3_ms() -> None:
    e = AxonExcitability()
    lowest = e.lowest_rheobase
    assert e.threshold(np.array([lowest]), 0.3)[0] == pytest.approx(56.9)
    assert e.threshold(np.array([lowest * e.rheobase_range]), 0.3)[0] == pytest.approx(102.1)


def test_rheobases_are_spread_and_assigned_non_selectively_but_reproducibly() -> None:
    e = AxonExcitability()
    a, b = e.rheobases(120, seed=3), e.rheobases(120, seed=3)
    np.testing.assert_array_equal(a, b)
    np.testing.assert_allclose(np.sort(a), np.linspace(e.lowest_rheobase, e.lowest_rheobase * e.rheobase_range, 120))
    assert not np.all(np.diff(a) > 0)  # not ordered by unit index (i.e. not by size or type)


def test_pulses_are_found_with_width_and_amplitude() -> None:
    stimulus = np.array([0, 5, 5, 0, 0, -7, -7, -7, 0.0])
    found = pulses(stimulus)
    assert [(p.onset, p.samples, p.amplitude) for p in found] == [(1, 2, 5.0), (5, 3, 7.0)]


def test_amplitude_grades_recruitment() -> None:
    e = AxonExcitability()
    rheobase = e.rheobases(50, seed=0)
    protocol = StimulusProtocol(duration_ms=10, frequency_hz=100, duty_cycle_percent=3)  # 0.3 ms pulses

    def recruited(amplitude: float) -> int:
        stim = stimulus_series(
            StimulusProtocol(duration_ms=10, frequency_hz=100, duty_cycle_percent=3, amplitude=amplitude)
        )
        return int(axon_spikes(stim, protocol.step_ms, rheobase, e)[:, :].any(axis=0).sum())

    counts = [recruited(a) for a in (40, 60, 80, 100, 110)]
    assert counts[0] == 0 and counts[-1] == 50
    assert counts == sorted(counts) and 0 < counts[2] < 50


def test_longer_pulses_need_less_current() -> None:
    e = AxonExcitability()
    rheobase = np.array([e.lowest_rheobase])
    assert e.threshold(rheobase, 1.0)[0] < e.threshold(rheobase, 0.3)[0] < e.threshold(rheobase, 0.1)[0]


def test_axons_follow_every_pulse_at_high_frequency() -> None:
    protocol = StimulusProtocol(duration_ms=1000, frequency_hz=100, duty_cycle_percent=3, amplitude=153)
    rheobase = AxonExcitability().rheobases(10, seed=0)
    stimulus = stimulus_series(protocol)
    spikes = axon_spikes(stimulus, protocol.step_ms, rheobase, AxonExcitability())
    complete = [p for p in pulses(stimulus) if p.samples >= 29]  # the pulse starting at t = 1000 ms is cut off
    assert len(complete) == 100
    assert (spikes.sum(axis=0) == 100).all()


def test_axon_stimulation_runs_without_integrating_the_motoneurons() -> None:
    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=100, frequency_hz=40, duty_cycle_percent=1.2, amplitude=153),
        model=AXONS,
    )
    events = list(RunSimulation(FailingSolver()).execute(config))  # the solver would raise if used
    assert isinstance(events[-1], SimulationCompleted)
    force = np.concatenate([e.force_total for e in events if isinstance(e, SimulationChunk)])
    assert force.max() > 0


def test_axon_mode_streams_the_same_force_as_a_single_block() -> None:
    config = SimulationConfig(
        stimulus=StimulusProtocol(duration_ms=200, frequency_hz=40, duty_cycle_percent=1.2, amplitude=90),
        model=AXONS,
    )

    def force(block_ms: float) -> np.ndarray:
        events = RunSimulation(FailingSolver(), block_ms=block_ms).execute(config)
        return np.concatenate([e.force_total for e in events if isinstance(e, SimulationChunk)])

    np.testing.assert_allclose(force(1.0), force(200.0), rtol=1e-12, atol=1e-15)


def test_setup_gives_every_unit_a_rheobase() -> None:
    setup = MotorUnitSetup.from_config(SimulationConfig(model=AXONS))
    assert setup.axon_rheobase.size == setup.motoneurons.n_units

"""Explicit pulse sequences (``StimulusProtocol.pulse_times_ms``): a new stimulator input, not a model change.

1. A periodic train written as a list gives the same stimulus, spikes and force as the periodic stimulator, bit for
   bit, at both stimulation sites; the comparison is shown to fail when one pulse moves by one sample.
2. Doublets reach the sampled stimulus and the axons as written.
3. Invalid sequences are rejected with a clear message.
"""

from __future__ import annotations

import math
import random
from dataclasses import replace
from typing import Any

import numpy as np
import pytest

from eenm_engine.application.events import SimulationChunk
from eenm_engine.application.run_simulation import RunSimulation
from eenm_engine.domain.axon_stimulation import AxonExcitability, axon_spike_events, pulses
from eenm_engine.domain.model_options import ModelOptions, StimulationSite
from eenm_engine.domain.motor_unit_pool import MotorUnitType
from eenm_engine.domain.simulation import MotorUnitSetup, SimulationConfig
from eenm_engine.domain.stimulus import StimulusProtocol, Waveform, stimulus_current, stimulus_series
from eenm_engine.domain.unit_events import UnitEventKind
from eenm_engine.infrastructure.compiled_motoneuron import CompiledPoolIntegrator
from eenm_engine.infrastructure.scipy_solver import ScipyBdfSolver

# incommensurate with each other and with the 0.01 ms grid
HZ = 37.0
PULSE_US = 300.0
DURATION_MS = 1130.0
TRAIN_ON_MS = 301.7
TRAIN_PERIODS = 20  # the train period is 20 pulse periods, so the periodic pulses restart with every train
AMPLITUDE = 83.0  # partial recruitment: thresholds of 0.3 ms pulses are 56.9 – 102.1
UNITS = {MotorUnitType.S: 10, MotorUnitType.FR: 3, MotorUnitType.FF: 3}


def _periodic(waveform: Waveform, trains: bool) -> StimulusProtocol:
    period = 1000.0 / HZ
    extra: dict[str, Any] = (
        {
            "train_on_ms": TRAIN_ON_MS,
            "train_period_ms": TRAIN_PERIODS * period,
            "ramp_up_ms": 60.0,
            "ramp_down_ms": 90.0,
        }
        if trains
        else {"ramp_up_ms": 211.3, "ramp_down_ms": 157.9}
    )
    return StimulusProtocol(
        duration_ms=DURATION_MS, frequency_hz=HZ, pulse_width_us=PULSE_US, amplitude=AMPLITUDE, waveform=waveform,
        **extra,
    )  # fmt: skip


def _as_list(p: StimulusProtocol) -> StimulusProtocol:
    """The same train as explicit onsets: ``k · period`` (the periodic stimulator's own onsets) that fit whole."""
    period = 1000.0 / p.frequency_hz
    window = p.train_on_ms if p.train_on_ms is not None else p.duration_ms
    pulse = p.pulse_phases * p.pulse_width_ms
    onsets = tuple(period * k for k in range(math.ceil(window / period)) if period * k + pulse <= window)
    return replace(p, pulse_times_ms=onsets, frequency_hz=1.0)  # the frequency must have no effect


def _config(p: StimulusProtocol, site: StimulationSite) -> SimulationConfig:
    return SimulationConfig(
        stimulus=p,
        model=ModelOptions.literature(site=site),  # fatigue and rate saturation on
        units_per_type=UNITS,
        output_step_ms=0.1,
        unit_events=True,
    )


def _run(config: SimulationConfig) -> list[SimulationChunk]:
    use_case = RunSimulation(ScipyBdfSolver(), pool_integrator=CompiledPoolIntegrator())
    return [e for e in use_case.execute(config) if isinstance(e, SimulationChunk)]


def _arrivals(chunks: list[SimulationChunk]) -> np.ndarray:
    """(sample, unit) of every spike that reached the muscle, sorted."""
    rows = []
    for c in chunks:
        e = c.unit_events
        if e is not None:
            muscle = e.kind == UnitEventKind.MUSCLE_ARRIVAL
            rows.append(np.column_stack((e.sample[muscle], e.unit[muscle])))
    out = np.concatenate(rows) if rows else np.empty((0, 2), dtype=np.int64)
    return out[np.lexsort((out[:, 1], out[:, 0]))]


def _differences(a: StimulusProtocol, b: StimulusProtocol, site: StimulationSite) -> dict[str, float]:
    """Max |difference| of every compared quantity that is not bit-identical (empty = identical)."""
    out: dict[str, float] = {}

    def compare(name: str, x: np.ndarray, y: np.ndarray) -> None:
        if x.shape != y.shape:
            out[name] = math.inf
        elif not np.array_equal(x, y):
            out[name] = float(np.max(np.abs(x.astype(np.float64) - y.astype(np.float64))))

    compare("stimulus", stimulus_series(a), stimulus_series(b))
    config_a, config_b = _config(a, site), _config(b, site)
    if site is StimulationSite.MOTOR_AXONS:
        setup = MotorUnitSetup.from_config(config_a)
        excit = config_a.model.axon_excitability
        ia, fa = axon_spike_events(stimulus_series(a), a.step_ms, setup.axon_rheobase, excit)
        ib, fb = axon_spike_events(stimulus_series(b), b.step_ms, setup.axon_rheobase, excit)
        compare("axon spike samples", ia, ib)
        compare("axons fired", fa, fb)
    ca, cb = _run(config_a), _run(config_b)
    compare("spikes at the muscle", _arrivals(ca), _arrivals(cb))
    for name, get in {
        "chunk stimulus": lambda c: c.stimulus,
        "force": lambda c: c.force_total,
        "force S": lambda c: c.force_by_type[MotorUnitType.S],
        "force FF": lambda c: c.force_by_type[MotorUnitType.FF],
        "emg": lambda c: c.emg,
        "capacity": lambda c: np.array([c.fatigue.muscle, *c.fatigue.by_type.values()]),
    }.items():
        compare(name, np.concatenate([get(c) for c in ca]), np.concatenate([get(c) for c in cb]))
    return out


CASES = [
    pytest.param(site, waveform, trains, id=f"{site.value}-{waveform.value}-{'trains' if trains else 'continuous'}")
    for site in (StimulationSite.MOTOR_AXONS, StimulationSite.MOTONEURON_SOMA)
    for waveform in (Waveform.MONOPHASIC, Waveform.BIPHASIC_SYMMETRIC)
    for trains in (False, True)
]


@pytest.mark.parametrize(("site", "waveform", "trains"), CASES)
def test_a_periodic_train_written_as_a_list_is_bit_identical(
    site: StimulationSite, waveform: Waveform, trains: bool
) -> None:
    periodic = _periodic(waveform, trains)
    listed = _as_list(periodic)
    assert listed.pulse_count == len(pulses(stimulus_series(periodic)))  # no periodic pulse is cut by the run's end
    chunks = _run(_config(periodic, site))
    assert _arrivals(chunks).shape[0] > 0 and chunks[-1].fatigue is not None and chunks[-1].fatigue.muscle < 1.0
    assert _differences(periodic, listed, site) == {}


@pytest.mark.parametrize("site", [StimulationSite.MOTOR_AXONS, StimulationSite.MOTONEURON_SOMA])
def test_the_comparison_fails_when_one_pulse_moves_by_one_sample(site: StimulationSite) -> None:
    periodic = _periodic(Waveform.MONOPHASIC, trains=True)
    listed = _as_list(periodic)
    assert listed.pulse_times_ms is not None
    moved = list(listed.pulse_times_ms)
    moved[5] += periodic.step_ms
    found = _differences(periodic, replace(listed, pulse_times_ms=tuple(moved)), site)
    assert {"stimulus", "spikes at the muscle", "force", "capacity"} <= set(found)
    if site is StimulationSite.MOTOR_AXONS:
        assert "axon spike samples" in found


def test_the_continuous_current_matches_at_any_time() -> None:
    """The generic ODE solver reads ``stimulus_current(t)`` between samples: compare it off the grid too."""
    rng = random.Random(7)
    for waveform in (Waveform.MONOPHASIC, Waveform.BIPHASIC_SYMMETRIC):
        for trains in (False, True):
            periodic = _periodic(waveform, trains)
            listed = _as_list(periodic)
            times = [rng.uniform(0.0, DURATION_MS) for _ in range(200_000)]
            # and right at every onset and pulse end, where the two formulas could disagree
            assert listed.pulse_times_ms is not None
            period = listed.train_period_ms or 0.0
            for onset in listed.pulse_times_ms:
                for train in range(3 if trains else 1):
                    for d in (0.0, 1e-12, -1e-12, 0.3, 0.6, 0.3 - 1e-12, 0.6 + 1e-12):
                        times.append(train * period + onset + d)
            inside = [t for t in times if 0.0 <= t <= DURATION_MS]  # the run never asks beyond its end
            assert len(inside) > 200_000
            bad = [t for t in inside if stimulus_current(t, periodic) != stimulus_current(t, listed)]
            assert bad == []


def test_the_original_soma_model_through_the_ode_solver_is_bit_identical() -> None:
    periodic = StimulusProtocol(duration_ms=200.0, frequency_hz=HZ, pulse_width_us=PULSE_US, amplitude=120.0)
    listed = _as_list(periodic)

    def force(p: StimulusProtocol) -> np.ndarray:
        chunks = [e for e in RunSimulation(ScipyBdfSolver()).execute(SimulationConfig(stimulus=p))]
        return np.concatenate([c.force_total for c in chunks if isinstance(c, SimulationChunk)])

    a, b = force(periodic), force(listed)
    assert a.max() > 0 and np.array_equal(a, b)


# -- 2. doublets -----------------------------------------------------------------------------------------------


def _doublet_train() -> StimulusProtocol:
    """12 pulses at 15 Hz, the second 6 ms after the first (the rest every 1000/15 ms after the second)."""
    onsets = (0.0, *(6.0 + 1000.0 / 15.0 * k for k in range(11)))
    return StimulusProtocol(duration_ms=800.0, pulse_width_us=500.0, amplitude=60.0, pulse_times_ms=onsets)


def test_a_doublet_train_has_twelve_pulses_at_the_written_times() -> None:
    p = _doublet_train()
    assert p.pulse_times_ms is not None
    found = pulses(stimulus_series(p))
    assert len(found) == 12 and p.pulse_count == 12
    expected = [math.ceil(t / p.step_ms - 1e-6) for t in p.pulse_times_ms]  # first sample at or after the onset
    assert [x.onset for x in found] == expected
    assert expected[:3] == [0, 600, 7267]  # 0, 6 ms, 6 + 66.67 ms
    assert {x.samples for x in found} == {50} and {x.amplitude for x in found} == {60.0}


def test_every_recruited_axon_fires_on_every_pulse_of_the_doublet() -> None:
    """The FES-only axon layer has no refractoriness (``axon_stimulation`` docstring, "Firing"): a 6 ms interval
    fires every recruited axon twice."""
    p = _doublet_train()
    excit = AxonExcitability()
    rheobase = excit.rheobases(120, seed=1)
    index, fires = axon_spike_events(stimulus_series(p), p.step_ms, rheobase, excit)
    recruited = p.amplitude >= excit.threshold(rheobase, 0.5)
    assert 0 < recruited.sum() < rheobase.size  # partial recruitment, so the test can tell units apart
    assert np.array_equal(fires, np.repeat(recruited[None, :], 12, axis=0))
    assert list(np.diff(index)[:2]) == [600, 6667]  # spikes at the end of each pulse: 6 ms, then 66.67 ms later


# -- 3. validation ---------------------------------------------------------------------------------------------


def _seq(times: tuple[float, ...], **kwargs: Any) -> StimulusProtocol:
    base: dict[str, Any] = {"duration_ms": 100.0, "pulse_width_us": 500.0, "pulse_times_ms": times}
    return StimulusProtocol(**(base | kwargs))


@pytest.mark.parametrize(
    ("times", "kwargs", "message"),
    [
        ((0.0, 10.0), {"pulse_width_us": None}, "needs pulse_width_us"),
        ((), {}, "at least one pulse"),
        ((5.0, 3.0), {}, "strictly increasing"),
        ((5.0, 5.0), {}, "strictly increasing"),
        ((-1.0, 3.0), {}, "cannot be negative"),
        ((0.0, float("nan")), {}, "finite"),
        ((0.0, 99.8), {}, "must end within duration_ms"),
        ((0.0, 0.5), {}, "minimum is the pulse"),  # touching pulses would read as one
        ((0.0, 0.505), {}, "minimum is the pulse"),  # less than one sample of zero current between them
        ((0.0, 1.0), {"waveform": Waveform.BIPHASIC_SYMMETRIC}, "both phases"),  # 2 × 0.5 ms + one sample > 1 ms
        ((0.0, 30.0), {"train_on_ms": 30.2, "train_period_ms": 50.0}, "must end within train_on_ms"),
        ((0.0, 49.5), {"train_on_ms": 50.0, "train_period_ms": 50.0}, "first of the next"),
        ((0.0, 10.0, 20.0), {"max_pulses": 2}, "the limit is 2"),
        ((0.0, 10.0), {"train_on_ms": 20.0, "train_period_ms": 30.0, "max_pulses": 6}, "delivers 7 pulses"),
        ((0.0, 10.0), {"pulse_width_us": 5.0}, "at least one sample"),
        ((0.0, 10.0), {"waveform": Waveform.BIPHASIC}, "MONOPHASIC or BIPHASIC_SYMMETRIC"),
    ],
)
def test_invalid_sequences_are_rejected(times: tuple[float, ...], kwargs: dict[str, Any], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        _seq(times, **kwargs)


def test_the_tightest_valid_sequence_keeps_its_pulses_apart() -> None:
    p = _seq((0.0, 0.51, 1.02), step_ms=0.01)  # 0.5 ms pulses with exactly one zero sample between them
    assert [x.onset for x in pulses(stimulus_series(p))] == [0, 51, 102]
    b = _seq((0.0, 1.01), waveform=Waveform.BIPHASIC_SYMMETRIC)
    assert [x.onset for x in pulses(stimulus_series(b))] == [0, 101]


def test_frequency_and_duty_cycle_have_no_effect_and_a_pulse_cut_by_the_end_is_left_out() -> None:
    a = _seq((0.0, 10.0, 99.7), frequency_hz=1.0, duration_ms=100.2)
    b = _seq((0.0, 10.0, 99.7), frequency_hz=150.0, duty_cycle_percent=90.0, duration_ms=100.2)
    assert np.array_equal(stimulus_series(a), stimulus_series(b))
    trains = _seq((0.0, 10.0), duration_ms=100.0, train_on_ms=20.0, train_period_ms=50.0)
    assert trains.pulse_count == 4 and len(pulses(stimulus_series(trains))) == 4  # not the 1-sample pulse at 100 ms
    assert stimulus_series(trains)[-1] == 0.0


# -- the validation helper (protocols only) ----------------------------------------------------------------------


def test_doublet_protocols_of_the_validation_helper() -> None:
    from validation.doublets import chang_shields_constant, chang_shields_doublet, single_doublet, single_doublets

    constant, doublet = chang_shields_constant(amplitude=120.0), chang_shields_doublet(amplitude=120.0)
    for p in (constant, doublet):
        found = pulses(stimulus_series(p))
        assert p.pulse_count == len(found) == 72  # 6 trains × 12 pulses, every one whole
        assert (p.duration_ms, p.train_period_ms, p.pulse_width_us) == (12000.0, 2000.0, 500.0)
        assert {x.samples for x in found} == {50}
        onsets = np.array([x.onset for x in found]) * p.step_ms
        assert np.allclose(onsets[12:24] - onsets[:12], 2000.0)  # every train repeats the sequence
    c = np.array([x.onset for x in pulses(stimulus_series(constant))[:12]]) * 0.01
    d = np.array([x.onset for x in pulses(stimulus_series(doublet))[:12]]) * 0.01
    assert np.allclose(np.diff(c), 1000 / 15, atol=0.01)
    assert np.isclose(d[1] - d[0], 6.0) and np.allclose(np.diff(d)[1:], 1000 / 15, atol=0.01)
    assert single_doublet(10.0, amplitude=100.0, pulse_width_us=300.0).pulse_times_ms == (0.0, 10.0)
    assert sorted(single_doublets(100.0, 300.0)) == [float(i) for i in range(5, 16)]
    with pytest.raises(ValueError):
        single_doublet(4.0, amplitude=100.0, pulse_width_us=300.0)

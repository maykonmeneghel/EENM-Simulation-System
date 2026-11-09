"""Electrical stimulus applied to the motoneurons.

Faithful port of ``Mathematical Model/FES.m`` and ``currentEENM.m``. Every branch of the original
``switch`` is reproduced, including the ones whose behaviour looks unintended (they are listed in
``docs/matlab-port-notes.md``); the port deliberately changes no physics.

Time is in milliseconds, so the pulse frequency is converted from Hz to kHz exactly as
``currentEENM`` does (``Fb / 1000``).
"""

from __future__ import annotations

import itertools
import math
from bisect import bisect_right
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray


class Waveform(Enum):
    MONOPHASIC = "MONOPHASIC"
    BIPHASIC = "BIPHASIC"
    """``FES.m``: the raw square wave, +1 for the duty cycle and -1 for the rest of the period (never zero)."""
    BIPHASIC_SYMMETRIC = "BIPHASIC_SYMMETRIC"
    """Charge-balanced pulse of a stimulator (not in the original): +A for the pulse width, then -A for the same
    width, then zero. The pulse width is that of each phase."""


DEFAULT_MAX_PULSES = 100_000
"""Default cap on the pulses of an explicit sequence over the whole run (``StimulusProtocol.max_pulses``): 300 s at
200 Hz is 60 000 pulses. Axon stimulation keeps one row of fired units per pulse, so memory grows with this number."""


class ModulationTarget(Enum):
    AMPLITUDE = "AMPLITUDE"
    FREQUENCY = "FREQUENCY"
    PULSE_WIDTH = "PULSE_WIDTH"


class ModulationShape(Enum):
    STEP = "STEP"
    RAMP = "RAMP"
    TRIANGLE = "TRIANGLE"
    SINUSOIDAL = "SINUSOIDAL"


@dataclass(frozen=True)
class StimulusProtocol:
    """Parameters of ``currentEENM(tmax, step, Fb, Wb, Amp, Type, ..., ModulationType, ModulationWhere, tmed)``."""

    duration_ms: float = 1000.0
    step_ms: float = 0.01
    frequency_hz: float = 40.0
    duty_cycle_percent: float = 20.0
    amplitude: float = 100.0
    waveform: Waveform = Waveform.MONOPHASIC
    modulation_target: ModulationTarget = ModulationTarget.AMPLITUDE
    modulation_shape: ModulationShape = ModulationShape.STEP
    peak_time_ms: float | None = None
    train_on_ms: float | None = None
    """Intermittent stimulation (not in the original): pulses only during the first ``train_on_ms`` of every
    ``train_period_ms`` (e.g. 330 / 1000 ms, the fatigue protocol of Burke et al.). ``None`` = continuous."""
    train_period_ms: float | None = None
    pulse_width_us: float | None = None
    """Stimulator mode (not in the original): pulse width independent of the frequency, pulses generated in time
    (``within period < width``) instead of through the phase of ``square``, so every pulse has the same number of
    samples. Replaces ``duty_cycle_percent`` (stored as width / period); for ``BIPHASIC_SYMMETRIC`` it is the width
    of each phase. Needs the plain carrier (modulation AMPLITUDE / STEP); the envelope comes from the ramps."""
    ramp_up_ms: float = 0.0
    """Amplitude envelope of a stimulator (not in the original): linear rise from 0 to the amplitude over the
    first ``ramp_up_ms`` of every train (of the whole run without trains)..."""
    ramp_down_ms: float = 0.0
    """...and linear fall to 0 over its last ``ramp_down_ms``. Both lie inside the on time."""
    pulse_times_ms: tuple[float, ...] | None = None
    """Explicit pulse sequence (not in the original): the onset of every pulse, in ms, instead of a pulse every
    ``1000 / frequency_hz``. Each pulse has the stimulator's width (``pulse_width_us``, required), amplitude and
    waveform (MONOPHASIC or BIPHASIC_SYMMETRIC). Without trains the onsets are times of the run; with ``train_on_ms`` /
    ``train_period_ms`` they are times from the start of every train, and the sequence repeats in each train. The
    envelope (trains on / off, ramps) applies as in the periodic stimulator. Only whole pulses are delivered: a pulse
    the end of the run would cut is left out (the periodic train keeps it, cut). ``frequency_hz`` and
    ``duty_cycle_percent`` have no effect. ``None`` = the periodic train."""
    max_pulses: int = DEFAULT_MAX_PULSES
    """Largest number of pulses an explicit sequence may deliver over the whole run (all trains)."""

    def __post_init__(self) -> None:
        if self.pulse_times_ms is not None:
            self._check_sequence()
        elif self.pulse_width_us is not None:
            if self.pulse_width_us <= 0 or self.frequency_hz <= 0:
                raise ValueError("pulse_width_us and frequency_hz must be positive")
            # frozen dataclass: the derived duty cycle is stored once, so every branch below keeps using it
            object.__setattr__(self, "duty_cycle_percent", self.pulse_width_us / 1000.0 * self.frequency_khz * 100.0)
            if (self.modulation_target, self.modulation_shape) != (ModulationTarget.AMPLITUDE, ModulationShape.STEP):
                raise ValueError("pulse_width_us (stimulator mode) needs modulation AMPLITUDE / STEP; use the ramps")
            if self.waveform is Waveform.BIPHASIC:
                raise ValueError("the stimulator's biphasic pulse is BIPHASIC_SYMMETRIC")
        elif self.waveform is Waveform.BIPHASIC_SYMMETRIC:
            raise ValueError("BIPHASIC_SYMMETRIC needs pulse_width_us")
        phases = 2 if self.waveform is Waveform.BIPHASIC_SYMMETRIC else 1
        if self.pulse_times_ms is None and not 0 < phases * self.duty_cycle_percent < 100:
            raise ValueError("the pulse (both phases if biphasic) must be shorter than the period")
        if self.ramp_up_ms < 0 or self.ramp_down_ms < 0:
            raise ValueError("ramps cannot be negative")
        if self.ramp_up_ms + self.ramp_down_ms > self.on_time_ms:
            raise ValueError("ramp up + ramp down must fit in the on time (train_on_ms, or duration_ms)")
        if (self.train_on_ms is None) != (self.train_period_ms is None):
            raise ValueError("train_on_ms and train_period_ms go together")
        if (
            self.train_on_ms is not None
            and self.train_period_ms is not None
            and not (0 < self.train_on_ms <= self.train_period_ms)
        ):
            raise ValueError("need 0 < train_on_ms <= train_period_ms")
        if self.duration_ms <= 0 or self.step_ms <= 0:
            raise ValueError("duration_ms and step_ms must be positive")
        if self.modulation_shape is ModulationShape.TRIANGLE and (
            self.peak_time_ms is None or not 0 < self.peak_time_ms < self.duration_ms
        ):
            raise ValueError("TRIANGLE modulation needs 0 < peak_time_ms < duration_ms")

    def _check_sequence(self) -> None:
        """Rules of an explicit pulse sequence; the shared rules (ramps, trains, duration) are checked after."""
        if self.pulse_width_us is None or self.pulse_width_us <= 0:
            raise ValueError("pulse_times_ms needs pulse_width_us (the width of every pulse)")
        if (self.modulation_target, self.modulation_shape) != (ModulationTarget.AMPLITUDE, ModulationShape.STEP):
            raise ValueError("pulse_times_ms needs modulation AMPLITUDE / STEP; use the ramps")
        if self.waveform not in (Waveform.MONOPHASIC, Waveform.BIPHASIC_SYMMETRIC):
            raise ValueError("pulse_times_ms needs waveform MONOPHASIC or BIPHASIC_SYMMETRIC")
        if self.max_pulses < 1:
            raise ValueError("max_pulses must be at least 1")
        assert self.pulse_times_ms is not None
        times = tuple(float(t) for t in self.pulse_times_ms)
        object.__setattr__(self, "pulse_times_ms", times)  # frozen: a tuple of floats whatever the caller passed
        if not times:
            raise ValueError("pulse_times_ms must contain at least one pulse")
        if not all(math.isfinite(t) for t in times):
            raise ValueError("pulse_times_ms must be finite numbers")
        if times[0] < 0:
            raise ValueError("pulse_times_ms cannot be negative")
        if self.duration_ms <= 0 or self.step_ms <= 0:
            raise ValueError("duration_ms and step_ms must be positive")
        width = self.pulse_width_ms
        if width < self.step_ms:
            raise ValueError(f"the pulse width ({width:g} ms) must be at least one sample (step_ms = {self.step_ms:g})")
        pulse = self.pulse_phases * width
        # one sample of zero current at least between two pulses, or the sampled pulses touch and the axon layer
        # (``axon_stimulation.pulses``) reads them as one longer pulse (a biphasic one would lose its second pulse)
        gap = pulse + self.step_ms
        for i, (a, b) in enumerate(itertools.pairwise(times), start=1):
            if b <= a:
                raise ValueError(f"pulse_times_ms must be strictly increasing (pulse {i} at {a:g}, {i + 1} at {b:g})")
            if b - a < gap - _EPS_MS:
                raise ValueError(
                    f"pulses {i} and {i + 1} are {b - a:g} ms apart; the minimum is the pulse ({pulse:g} ms, both "
                    f"phases if biphasic) plus one sample ({self.step_ms:g} ms)"
                )
        trains = self.train_period_ms is not None and self.train_on_ms is not None
        window, where = (self.train_on_ms, "train_on_ms") if trains else (self.duration_ms, "duration_ms")
        assert window is not None
        if times[-1] + pulse > window + _EPS_MS:
            raise ValueError(
                f"the last pulse ({times[-1]:g} ms + {pulse:g} ms) must end within {where} ({window:g} ms)"
                + (": with trains the times are from the start of each train" if trains else "")
            )
        if trains:
            assert self.train_period_ms is not None
            wrap = self.train_period_ms - times[-1] + times[0]  # last pulse of a train to the first of the next
            if wrap < gap - _EPS_MS:
                raise ValueError(
                    f"the last pulse of a train and the first of the next are {wrap:g} ms apart; the minimum is "
                    f"{gap:g} ms (pulse plus one sample)"
                )
        if self.pulse_count > self.max_pulses:
            raise ValueError(f"the sequence delivers {self.pulse_count} pulses; the limit is {self.max_pulses}")

    @property
    def pulse_phases(self) -> int:
        return 2 if self.waveform is Waveform.BIPHASIC_SYMMETRIC else 1

    @property
    def pulse_count(self) -> int:
        """Pulses an explicit sequence starts within the run (all trains); 0 for the periodic train."""
        times = self.pulse_times_ms
        if times is None:
            return 0
        last = self.duration_ms - self.pulse_phases * self.pulse_width_ms + _EPS_MS  # latest onset of a whole pulse
        if self.train_period_ms is None:
            return sum(1 for t in times if t <= last)
        full = math.floor(last / self.train_period_ms)
        rest = last - full * self.train_period_ms
        return full * len(times) + sum(1 for t in times if t <= rest)

    @property
    def on_time_ms(self) -> float:
        """Length of one train, or of the whole run without trains."""
        return self.train_on_ms if self.train_on_ms is not None else self.duration_ms

    @property
    def frequency_khz(self) -> float:
        return self.frequency_hz / 1000.0

    @property
    def sample_count(self) -> int:
        """Length of MATLAB's ``0:step:tmax``."""
        return math.floor(self.duration_ms / self.step_ms + 1e-9) + 1

    @property
    def pulse_width_ms(self) -> float:
        """Nominal pulse duration: the duty-cycle fraction of one period (an explicit sequence: ``pulse_width_us``)."""
        if self.pulse_times_ms is not None:
            assert self.pulse_width_us is not None
            return self.pulse_width_us / 1000.0
        return self.duty_cycle_percent / 100.0 / self.frequency_khz

    def solver_max_step_ms(self) -> float:
        """Largest ODE step that cannot jump over a pulse: half the nominal pulse, but not below the
        sampling step (pulses shorter than a sample cannot be represented anyway). Pulse-width
        modulation produces shorter pulses than nominal; those are only resolved down to the sample step."""
        return max(self.step_ms, self.pulse_width_ms / 2.0)

    def time_grid(self) -> NDArray[np.float64]:
        """MATLAB's ``Parameters.time = 0:step:tmax``."""
        return np.arange(self.sample_count, dtype=np.float64) * self.step_ms


def square(x: float, duty_percent: float) -> float:
    """MATLAB/Octave ``square(x, duty)``: +1 during the first ``duty`` % of each 2π period, else -1."""
    return 1.0 if x % (2.0 * math.pi) < duty_percent / 100.0 * 2.0 * math.pi else -1.0


def envelope(t: float, protocol: StimulusProtocol) -> float:
    """Stimulator envelope at ``t`` (ms): 0 between trains, ramps at the start and end of each train, else 1."""
    p = protocol
    within = t % p.train_period_ms if p.train_period_ms is not None else t
    on = p.on_time_ms
    if within >= on and p.train_period_ms is not None:
        return 0.0
    level = 1.0
    if p.ramp_up_ms > 0 and within < p.ramp_up_ms:
        level = within / p.ramp_up_ms
    if p.ramp_down_ms > 0 and within > on - p.ramp_down_ms:
        level = min(level, max(0.0, (on - within) / p.ramp_down_ms))
    return level


def stimulus_current(t: float, protocol: StimulusProtocol) -> float:
    """Port of ``FES(t, cfg)``: injected current density at time ``t`` (ms), times the stimulator envelope."""
    level = envelope(t, protocol)
    if level == 0.0:
        return 0.0
    if protocol.pulse_times_ms is not None:
        return level * protocol.amplitude * _sequence_pulse(t, protocol)
    if protocol.pulse_width_us is not None:
        return level * protocol.amplitude * _stimulator_pulse(t, protocol)
    pulse = _PULSES[protocol.waveform]

    target = protocol.modulation_target
    if target is ModulationTarget.FREQUENCY:
        return level * _frequency_modulated(t, protocol, pulse)
    if target is ModulationTarget.PULSE_WIDTH:
        return level * _pulse_width_modulated(t, protocol, pulse)
    return level * _amplitude_modulated(t, protocol, pulse)


def stimulus_series(protocol: StimulusProtocol) -> NDArray[np.float64]:
    """``Parameters.data.EENM.IEENM``: the stimulus sampled on the simulation grid."""
    return np.array([stimulus_current(t, protocol) for t in protocol.time_grid()])


PulseFn = Callable[[float, float], float]


def _monophasic_pulse(x: float, duty_percent: float) -> float:
    return (square(x, duty_percent) + 1.0) / 2.0


_EPS_MS = 1e-9


def _stimulator_pulse(t: float, p: StimulusProtocol) -> float:
    """+1 for the pulse width at the start of each period; for BIPHASIC_SYMMETRIC -1 for the next width; else 0."""
    period = 1000.0 / p.frequency_hz
    within = t - period * math.floor(t / period + _EPS_MS)
    width = p.pulse_width_ms
    if within < width - _EPS_MS:
        return 1.0
    if p.waveform is Waveform.BIPHASIC_SYMMETRIC and within < 2.0 * width - _EPS_MS:
        return -1.0
    return 0.0


def _sequence_pulse(t: float, p: StimulusProtocol) -> float:
    """``_stimulator_pulse`` with the onsets read from ``pulse_times_ms`` (from each train's start with trains)."""
    times = p.pulse_times_ms
    assert times is not None
    within_train = t % p.train_period_ms if p.train_period_ms is not None else t
    latest = bisect_right(times, within_train + _EPS_MS) - 1  # an onset up to _EPS_MS ahead counts as reached
    if latest < 0:
        return 0.0
    within = within_train - times[latest]
    width = p.pulse_width_ms
    if t - within + p.pulse_phases * width > p.duration_ms + _EPS_MS:
        return 0.0  # a pulse the run would cut (a train starting at the end): only whole pulses are delivered
    if within < width - _EPS_MS:
        return 1.0
    if p.waveform is Waveform.BIPHASIC_SYMMETRIC and within < 2.0 * width - _EPS_MS:
        return -1.0
    return 0.0


_PULSES: dict[Waveform, PulseFn] = {Waveform.MONOPHASIC: _monophasic_pulse, Waveform.BIPHASIC: square}


def _amplitude_modulated(t: float, p: StimulusProtocol, pulse: PulseFn) -> float:
    carrier = pulse(2 * math.pi * (p.frequency_khz * t), p.duty_cycle_percent)
    shape = p.modulation_shape
    if shape is ModulationShape.RAMP:
        return p.amplitude * carrier * (1 / p.duration_ms) * t
    if shape is ModulationShape.TRIANGLE:
        assert p.peak_time_ms is not None
        if t <= p.peak_time_ms:
            return (p.amplitude / p.peak_time_ms * t) * carrier
        slope = (0 - p.amplitude) / (p.duration_ms - p.peak_time_ms)
        return (slope * (t - p.peak_time_ms) + p.amplitude) * carrier
    if shape is ModulationShape.SINUSOIDAL:
        return p.amplitude * carrier * math.sin(t)
    return p.amplitude * carrier


def _frequency_modulated(t: float, p: StimulusProtocol, pulse: PulseFn) -> float:
    fb, wb = p.frequency_khz, p.duty_cycle_percent
    shape = p.modulation_shape
    if shape is ModulationShape.RAMP:
        return p.amplitude * pulse(2 * math.pi * ((1 / p.duration_ms) * t * fb * t), wb)
    if shape is ModulationShape.TRIANGLE:
        assert p.peak_time_ms is not None
        if t <= p.peak_time_ms:
            return p.amplitude * pulse(2 * math.pi * fb * (t**2) / p.peak_time_ms, wb)
        slope = (-fb) / (p.duration_ms - p.peak_time_ms)
        freq = slope * (t - p.duration_ms)
        return p.amplitude * pulse(2 * math.pi * freq * (p.duration_ms - t), wb)
    if shape is ModulationShape.SINUSOIDAL:
        return p.amplitude * pulse(2 * math.pi * (math.sin(t) * fb * t), wb)
    return p.amplitude * pulse(2 * math.pi * (fb * t), wb)


def _pulse_width_modulated(t: float, p: StimulusProtocol, pulse: PulseFn) -> float:
    fb, wb = p.frequency_khz, p.duty_cycle_percent
    shape = p.modulation_shape
    if shape is ModulationShape.RAMP:
        # FES.m uses the raw square wave here, without the monophasic (+1)/2 shift, for both waveforms.
        return p.amplitude * square(2 * math.pi * (fb * t), wb * (1 / p.duration_ms) * t)
    if shape is ModulationShape.TRIANGLE:
        assert p.peak_time_ms is not None
        if t <= p.peak_time_ms:
            return p.amplitude * pulse(2 * math.pi * fb * t, wb * t / p.peak_time_ms)
        slope = (-wb) / (p.duration_ms - p.peak_time_ms)
        return p.amplitude * pulse(2 * math.pi * fb * t, slope * (t - p.duration_ms))
    if shape is ModulationShape.SINUSOIDAL:
        return p.amplitude * pulse(2 * math.pi * (fb * t), wb * math.sin(t))
    return p.amplitude * pulse(2 * math.pi * (fb * t), wb)

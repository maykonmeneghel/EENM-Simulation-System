"""Electrical stimulus applied to the motoneurons.

Faithful port of ``Mathematical Model/FES.m`` and ``currentEENM.m``. Every branch of the original
``switch`` is reproduced, including the ones whose behaviour looks unintended (they are listed in
``docs/matlab-port-notes.md``); the port deliberately changes no physics.

Time is in milliseconds, so the pulse frequency is converted from Hz to kHz exactly as
``currentEENM`` does (``Fb / 1000``).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

import numpy as np
from numpy.typing import NDArray


class Waveform(Enum):
    MONOPHASIC = "MONOPHASIC"
    BIPHASIC = "BIPHASIC"


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

    def __post_init__(self) -> None:
        if self.duration_ms <= 0 or self.step_ms <= 0:
            raise ValueError("duration_ms and step_ms must be positive")
        if self.modulation_shape is ModulationShape.TRIANGLE and (
            self.peak_time_ms is None or not 0 < self.peak_time_ms < self.duration_ms
        ):
            raise ValueError("TRIANGLE modulation needs 0 < peak_time_ms < duration_ms")

    @property
    def frequency_khz(self) -> float:
        return self.frequency_hz / 1000.0

    @property
    def sample_count(self) -> int:
        """Length of MATLAB's ``0:step:tmax``."""
        return math.floor(self.duration_ms / self.step_ms + 1e-9) + 1

    @property
    def pulse_width_ms(self) -> float:
        """Nominal pulse duration: the duty-cycle fraction of one period."""
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


def stimulus_current(t: float, protocol: StimulusProtocol) -> float:
    """Port of ``FES(t, cfg)``: injected current density at time ``t`` (ms)."""
    pulse = _monophasic_pulse if protocol.waveform is Waveform.MONOPHASIC else square

    target = protocol.modulation_target
    if target is ModulationTarget.FREQUENCY:
        return _frequency_modulated(t, protocol, pulse)
    if target is ModulationTarget.PULSE_WIDTH:
        return _pulse_width_modulated(t, protocol, pulse)
    return _amplitude_modulated(t, protocol, pulse)


def stimulus_series(protocol: StimulusProtocol) -> NDArray[np.float64]:
    """``Parameters.data.EENM.IEENM``: the stimulus sampled on the simulation grid."""
    return np.array([stimulus_current(t, protocol) for t in protocol.time_grid()])


PulseFn = Callable[[float, float], float]


def _monophasic_pulse(x: float, duty_percent: float) -> float:
    return (square(x, duty_percent) + 1.0) / 2.0


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

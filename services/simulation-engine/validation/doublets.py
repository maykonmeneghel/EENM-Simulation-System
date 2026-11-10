"""Doublet protocols of published studies, as explicit pulse sequences (``StimulusProtocol.pulse_times_ms``).

Protocols only: nothing here runs the model or compares it with the literature. That comparison is pre-registered and
runs later on a frozen commit.

* **Chang & Shields 2011** (Neurorehabil Neural Repair, PMC4066665; volume and pages not re-checked here), methods
  read in the full text on 2026-11-09: "six 15-Hz, 12-pulse trains, each train separated by 2 seconds"; constant train
  (CT) "on for 733 ms and off for 1267 ms"; doublet train (DT) the same, "however, the interpulse interval between
  the first and second pulses was 6 ms (666 ms on and 1334 off)". The paper states a 500 µs pulse width for the
  maximal M-waves; it does not repeat it for the CT / DT trains (500 µs here is that reading).
* **Thomas et al. 1999 / Griffin et al. 2002** — a single doublet whose interval is varied, 5–15 ms. Those papers'
  methods were *not* re-read for this helper: the interval range comes from the study plan, so the pulse width and
  amplitude are arguments with no default.

Reading of the DT train (to confirm before the frozen run): 12 pulses, the second 6 ms after the first and the next ten
every 1000/15 ms after the second, so the train spans 6 + 10·66.67 = 672.7 ms. The paper's "666 ms on" does not
match that span exactly (10·66.6 = 666 would, if the 15 Hz intervals were rounded to 66.6 ms); the CT train's
11·66.67 = 733.3 ms matches its "733 ms on".

The stimulator's on time (``train_on_ms``) must contain the whole last pulse, so it is the last onset plus the pulse
width, not the paper's rounded on time; the train period (2000 ms) is the paper's.
"""

from __future__ import annotations

from eenm_engine.domain.stimulus import StimulusProtocol, Waveform

CHANG_SHIELDS_PULSES = 12
CHANG_SHIELDS_HZ = 15.0
CHANG_SHIELDS_TRAINS = 6
CHANG_SHIELDS_PERIOD_MS = 2000.0
CHANG_SHIELDS_PULSE_US = 500.0
CHANG_SHIELDS_DOUBLET_MS = 6.0

SINGLE_DOUBLET_RANGE_MS = (5.0, 15.0)
"""First-interval range of Thomas et al. 1999 / Griffin et al. 2002, from the study plan (not re-read)."""


def constant_train_onsets(
    pulses: int = CHANG_SHIELDS_PULSES, frequency_hz: float = CHANG_SHIELDS_HZ
) -> tuple[float, ...]:
    """Onsets (ms from the train start) of ``pulses`` pulses at ``frequency_hz``."""
    period = 1000.0 / frequency_hz
    return tuple(period * k for k in range(pulses))


def doublet_train_onsets(
    pulses: int = CHANG_SHIELDS_PULSES,
    frequency_hz: float = CHANG_SHIELDS_HZ,
    first_interval_ms: float = CHANG_SHIELDS_DOUBLET_MS,
) -> tuple[float, ...]:
    """Onsets of a doublet train: the second pulse ``first_interval_ms`` after the first, the rest at ``frequency_hz``
    from the second (the reading in the module docstring)."""
    if pulses < 2:
        raise ValueError("a doublet train has at least two pulses")
    period = 1000.0 / frequency_hz
    return (0.0, *(first_interval_ms + period * k for k in range(pulses - 1)))


def _intermittent(
    onsets: tuple[float, ...],
    amplitude: float,
    pulse_width_us: float,
    waveform: Waveform,
    trains: int,
    train_period_ms: float,
    step_ms: float,
) -> StimulusProtocol:
    return StimulusProtocol(
        duration_ms=trains * train_period_ms,
        step_ms=step_ms,
        amplitude=amplitude,
        waveform=waveform,
        pulse_width_us=pulse_width_us,
        pulse_times_ms=onsets,
        train_on_ms=onsets[-1] + pulse_width_us / 1000.0 * (2 if waveform is Waveform.BIPHASIC_SYMMETRIC else 1),
        train_period_ms=train_period_ms,
    )


def chang_shields_constant(
    amplitude: float,
    pulse_width_us: float = CHANG_SHIELDS_PULSE_US,
    waveform: Waveform = Waveform.MONOPHASIC,
    step_ms: float = 0.01,
) -> StimulusProtocol:
    """Chang & Shields 2011 CT: six 12-pulse 15 Hz trains, one every 2 s."""
    return _intermittent(
        constant_train_onsets(), amplitude, pulse_width_us, waveform, CHANG_SHIELDS_TRAINS, CHANG_SHIELDS_PERIOD_MS,
        step_ms,
    )  # fmt: skip


def chang_shields_doublet(
    amplitude: float,
    pulse_width_us: float = CHANG_SHIELDS_PULSE_US,
    waveform: Waveform = Waveform.MONOPHASIC,
    step_ms: float = 0.01,
) -> StimulusProtocol:
    """Chang & Shields 2011 DT: as CT, but the first interpulse interval of every train is 6 ms."""
    return _intermittent(
        doublet_train_onsets(), amplitude, pulse_width_us, waveform, CHANG_SHIELDS_TRAINS, CHANG_SHIELDS_PERIOD_MS,
        step_ms,
    )  # fmt: skip


def single_doublet(
    interval_ms: float,
    amplitude: float,
    pulse_width_us: float,
    duration_ms: float = 1000.0,
    first_pulse_ms: float = 0.0,
    waveform: Waveform = Waveform.MONOPHASIC,
    step_ms: float = 0.01,
) -> StimulusProtocol:
    """Thomas 1999 / Griffin 2002: two pulses ``interval_ms`` apart, then nothing until ``duration_ms``."""
    low, high = SINGLE_DOUBLET_RANGE_MS
    if not low <= interval_ms <= high:
        raise ValueError(f"the single-doublet interval of these studies is {low:g}–{high:g} ms")
    return StimulusProtocol(
        duration_ms=duration_ms,
        step_ms=step_ms,
        amplitude=amplitude,
        waveform=waveform,
        pulse_width_us=pulse_width_us,
        pulse_times_ms=(first_pulse_ms, first_pulse_ms + interval_ms),
    )


def single_doublets(
    amplitude: float,
    pulse_width_us: float,
    intervals_ms: tuple[float, ...] = (5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
    duration_ms: float = 1000.0,
    step_ms: float = 0.01,
) -> dict[float, StimulusProtocol]:
    """One single-doublet protocol per interval (default 5–15 ms in 1 ms steps)."""
    return {
        float(i): single_doublet(float(i), amplitude, pulse_width_us, duration_ms=duration_ms, step_ms=step_ms)
        for i in intervals_ms
    }

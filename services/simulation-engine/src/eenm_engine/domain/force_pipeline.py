"""From soma membrane potential to muscle force: the post-processing block of ``Main.m``.

Stages, per unit type, in the original order:

1. ``medfilt2`` — 3×3 median filter over the (time × unit) voltage matrix, zero padded.
2. Axonal propagation — attenuation to the neuromuscular junction: ``V · 0.070 · λ / 2 · exp(-|x|/λ)``.
3. Motor-unit action potentials (MUAP) — a Hermite-Rodriguez-like waveform written at each junction
   peak, delayed by the unit's conduction delay.
4. Spike detection on the *summed* MUAP signal of the type (``detectSpike(e_S)``).
5. Twitch — a critically damped second-order impulse response per unit, driven by that spike train.
6. Force — mean over the type's units; the muscle force is the sum of the three type means.

All MATLAB semantics that change numbers are kept (``findpeaks`` peak rules, ``medfilt2`` padding,
MUAPs *overwriting* rather than adding). See ``docs/matlab-port-notes.md``.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from scipy.ndimage import median_filter

from eenm_engine.domain.fatigue import UnitFatigue
from eenm_engine.domain.model_options import ModelOptions, StimulationSite, TwitchDrive
from eenm_engine.domain.motor_unit_pool import MotorUnitGroup
from eenm_engine.domain.twitch import RateGain, TwitchFilter

MEMBRANE_CONDUCTANCE = 0.070
"""Leak conductance used for the axonal length constant (doi:10.1016/j.bpj.2012.01.055 in Main.m)."""

LENGTH_CONSTANT = float(np.sqrt(1.0 / MEMBRANE_CONDUCTANCE))
"""``lamb = sqrt(1.0/0.070)``."""

MUAP_TIME: NDArray[np.float64] = np.arange(251, dtype=np.float64) * 0.01 - 1.25
"""``t2 = -1.25:0.01:1.25`` — 251 samples, independent of the simulation step."""


class MuapShape:
    """``p = randi([0,1])`` chooses one of the two waveforms per unit."""

    FIRST_ORDER = 0  # AP1 = t · exp(-(t/λm)²)
    SECOND_ORDER = 1  # AP2 = (1 - 2(t/λm)²) · exp(-(t/λm)²)


@dataclass(frozen=True)
class TypeSignals:
    """Per-type outputs on the full sample grid."""

    muap: NDArray[np.float64]  # (samples, units) — UMAP_<type>
    force: NDArray[np.float64]  # (samples, units) — f_<type> transposed

    def mean_force(self) -> NDArray[np.float64]:
        return mean_over_units(self.force)

    def summed_force(self) -> NDArray[np.float64]:
        summed: NDArray[np.float64] = self.force.sum(axis=1)
        return summed

    def mean_muap(self) -> NDArray[np.float64]:
        return mean_over_units(self.muap)


def mean_over_units(matrix: NDArray[np.float64]) -> NDArray[np.float64]:
    # MATLAB's mean over zero units is NaN and would poison the total; a type with no simulated
    # units contributes zero instead (the original never ran with an empty type).
    if matrix.shape[1] == 0:
        return np.zeros(matrix.shape[0])
    return matrix.mean(axis=1)


def find_peaks_matlab(
    signal: NDArray[np.float64], min_height: float = 0.0
) -> tuple[NDArray[np.int64], NDArray[np.float64]]:
    """MATLAB ``findpeaks(y, 'MinPeakHeight', h)`` for finite real data.

    A peak is a sample strictly greater than its neighbours; on a flat top the *first* sample of the
    plateau is reported; the first and last samples are never peaks; heights must be ``> h``.
    """
    n = signal.size
    if n < 3:
        return np.empty(0, dtype=np.int64), np.empty(0)
    run_start = np.concatenate(([0], 1 + np.flatnonzero(signal[1:] != signal[:-1])))
    run_values = signal[run_start]
    slope = np.sign(np.diff(run_values))
    is_peak_run = 1 + np.flatnonzero((slope[:-1] > 0) & (slope[1:] < 0))
    peaks = run_start[is_peak_run].astype(np.int64)
    peaks = peaks[signal[peaks] > min_height]
    return peaks, signal[peaks]


def median_filter_3x3(matrix: NDArray[np.float64]) -> NDArray[np.float64]:
    """MATLAB ``medfilt2(A)``: 3×3 neighbourhood, zero padding at every border."""
    if matrix.size == 0:
        return matrix.copy()
    filtered: NDArray[np.float64] = median_filter(matrix, size=3, mode="constant", cval=0.0)
    return filtered


def junction_potential(soma_voltage: NDArray[np.float64], axon_length_percent: float) -> NDArray[np.float64]:
    """``VJN = (Vs · 0.070 · λ / 2) · exp(-|x| / λ)`` with ``x = compAxonioMotor / 100``."""
    x = axon_length_percent / 100.0
    scale = MEMBRANE_CONDUCTANCE * LENGTH_CONSTANT / 2.0 * float(np.exp(-abs(x) / LENGTH_CONSTANT))
    return soma_voltage * scale


def muap_waveform(time_factor: float, shape: int) -> NDArray[np.float64]:
    u = (MUAP_TIME / time_factor).astype(np.float64)
    envelope = np.exp(-(u**2)).astype(np.float64)
    if shape == MuapShape.FIRST_ORDER:
        return MUAP_TIME * envelope
    return (1 - 2 * u**2) * envelope


def muap_train(junction: NDArray[np.float64], group: MotorUnitGroup, shapes: NDArray[np.int64]) -> NDArray[np.float64]:
    """``UMAP_<type>``: each junction peak writes a scaled MUAP ``delay`` samples later.

    Later MUAPs overwrite earlier ones where they overlap — the original assigns, it does not add.
    """
    samples, units = junction.shape
    out = np.zeros((samples, units))
    for k in range(units):
        waveform = group.muap_scale[k] * muap_waveform(float(group.muap_time_factor[k]), int(shapes[k]))
        peaks, heights = find_peaks_matlab(junction[:, k])
        for peak, height in zip(peaks, heights, strict=True):
            start = int(peak + group.muap_delay_samples[k])
            if start >= samples:
                continue
            stop = min(start + waveform.size, samples)
            out[start:stop, k] = height * waveform[: stop - start]
    return out


def spike_train(summed_muap: NDArray[np.float64]) -> NDArray[np.float64]:
    """``detectSpike(e)``: the peak value at each peak of the summed signal, zero elsewhere."""
    spikes = np.zeros_like(summed_muap)
    peaks, heights = find_peaks_matlab(summed_muap)
    spikes[peaks] = heights
    return spikes


class TypeForce:
    """Force of one unit type, computed incrementally on a growing voltage record.

    One object per type and per simulation: it keeps the twitch filters and rate-gain state between
    calls. ``compute`` only reprocesses a trailing window — a MUAP reaches at most ``delay + 251`` samples
    after its peak — so each call costs the same however long the simulation already is.
    """

    _WINDOW_SLACK = 8

    def __init__(
        self,
        group: MotorUnitGroup,
        shapes: NDArray[np.int64],
        axon_length_percent: float,
        step_ms: float,
        options: ModelOptions,
        pool_twitch_range: tuple[float, float] | None = None,
    ) -> None:
        """``pool_twitch_range`` = (weakest, strongest) twitch amplitude in the whole muscle pool (fatigue)."""
        self._group = group
        self._shapes = shapes
        self._axon = axon_length_percent
        self._options = options
        self._twitch = TwitchFilter(group, step_ms, options.twitch_shape)
        fatigue = None
        if options.fatigue is not None:
            weakest, strongest = pool_twitch_range or (
                float(group.twitch_peak.min(initial=1.0)),
                float(group.twitch_peak.max(initial=1.0)),
            )
            nominal = options.fatigue.nominal_from_force(group.twitch_peak, weakest, strongest)
            fatigue = UnitFatigue(options.fatigue, nominal)
        self.fatigue = fatigue
        self._gain = RateGain(group.twitch_time_to_peak_ms, step_ms, fatigue) if options.rate_gain else None
        longest_delay = int(group.muap_delay_samples.max()) if group.size else 0
        self.history = longest_delay + MUAP_TIME.size + self._WINDOW_SLACK

    def compute(self, voltage: NDArray[np.float64], start: int, stop: int) -> TypeSignals:
        """Force and MUAP of samples ``[start, stop)``; ``voltage`` holds every known sample (rows).

        With axon stimulation ``voltage`` is the axons' spike train (1 at each action potential): its peaks
        are the spikes, so the same MUAP and twitch stages apply, without the soma-specific median filter
        and axonal attenuation; MUAP amplitudes are then in normalised units.
        """
        window_start = max(0, start - self.history)
        junction = self._junction(voltage, window_start)
        muap = muap_train(junction, self._group, self._shapes)
        local = slice(start - window_start, stop - window_start)

        drive: NDArray[np.float64]
        time_scale = None
        if self._options.twitch_drive is TwitchDrive.OWN_SPIKES:
            drive = self._arrivals(junction, window_start, start, stop)
            if self._gain is not None:
                drive, time_scale = self._gain.apply_with_timing(drive)
        else:
            drive = spike_train(muap.sum(axis=1))[local]
        return TypeSignals(muap=muap[local], force=self._twitch.segment(drive, time_scale))

    def _junction(self, voltage: NDArray[np.float64], window_start: int) -> NDArray[np.float64]:
        if self._options.stimulation_site is StimulationSite.MOTOR_AXONS:
            return np.asarray(voltage[window_start:], dtype=np.float64)
        filtered = median_filter_3x3(voltage[window_start:])
        if window_start > 0:
            # medfilt2's zero padding belongs to the start of the record, not to the window start
            filtered[0] = median_filter_3x3(voltage[window_start - 1 : window_start + 2])[1]
        return junction_potential(filtered, self._axon)

    def unresolved_from(self, voltage: NDArray[np.float64]) -> int:
        """First sample whose force may still change because a peak is not decided yet.

        ``findpeaks`` places a flat-topped peak at the *first* sample of the plateau, but whether it is a
        peak is only known when the plateau ends; the median filter does produce such plateaus. A plateau
        still running at the end of the data can therefore become a peak at its start, and its effects begin
        ``delay`` samples later. The last row is excluded: its median-filter padding is provisional.
        """
        known = voltage.shape[0]
        tail_start = max(0, known - self.history)
        junction = self._junction(voltage, tail_start)[:-1]
        unresolved = known
        for k in range(self._group.size):
            run = _trailing_run_start(junction[:, k])
            if run is not None:
                unresolved = min(unresolved, tail_start + run + int(self._group.muap_delay_samples[k]))
        if self._options.twitch_drive is TwitchDrive.SUMMED_MUAP_PEAKS:
            run = _trailing_run_start(muap_train(junction, self._group, self._shapes).sum(axis=1))
            if run is not None:
                unresolved = min(unresolved, tail_start + run)
        return int(unresolved)

    def _arrivals(self, junction: NDArray[np.float64], window_start: int, start: int, stop: int) -> NDArray[np.float64]:
        """1 where a unit's action potential reaches the muscle (junction peak + conduction delay)."""
        out = np.zeros((stop - start, self._group.size))
        for k in range(self._group.size):
            peaks, _ = find_peaks_matlab(junction[:, k])
            arrival = window_start + peaks + int(self._group.muap_delay_samples[k])
            arrival = arrival[(arrival >= start) & (arrival < stop)]
            out[arrival - start, k] = 1.0
        return out


def _trailing_run_start(signal: NDArray[np.float64], min_height: float = 0.0) -> int | None:
    """Start of the run of equal values that ends the signal, if it could still become a peak.

    Only runs longer than one sample and above ``findpeaks``' height threshold matter.
    """
    if signal.size < 2 or signal[-1] != signal[-2] or signal[-1] <= min_height:
        return None
    changes = np.flatnonzero(signal[1:] != signal[:-1])
    return int(changes[-1]) + 1 if changes.size else 0


def type_signals(
    soma_voltage: NDArray[np.float64],
    group: MotorUnitGroup,
    shapes: NDArray[np.int64],
    axon_length_percent: float,
    step_ms: float,
    options: ModelOptions | None = None,
    pool_twitch_range: tuple[float, float] | None = None,
) -> TypeSignals:
    """Stages 1–5 for one unit type on a complete record. ``soma_voltage`` is ``(samples, units)``."""
    pipeline = TypeForce(group, shapes, axon_length_percent, step_ms, options or ModelOptions(), pool_twitch_range)
    return pipeline.compute(soma_voltage, 0, soma_voltage.shape[0])

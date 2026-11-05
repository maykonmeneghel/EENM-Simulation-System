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
from scipy.signal import lfilter

from eenm_engine.domain.motor_unit_pool import MotorUnitGroup

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
        return _mean_over_units(self.force)

    def mean_muap(self) -> NDArray[np.float64]:
        return _mean_over_units(self.muap)


def _mean_over_units(matrix: NDArray[np.float64]) -> NDArray[np.float64]:
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


def twitch_force(spikes: NDArray[np.float64], group: MotorUnitGroup, step_ms: float) -> NDArray[np.float64]:
    """Second-order twitch filter of ``Main.m`` (Fuglevand-style), one column per unit.

    ``f(n) = 2e^{-Δ/T} f(n-1) - e^{-2Δ/T} f(n-2) + (P Δ² / T) e^{1-Δ/T} s(n-1)`` for ``n ≥ 3`` (1-based),
    with ``f(1) = f(2) = 0``; ``P`` = twitch peak (MT), ``T`` = time to peak (MTTP).
    """
    drive = spikes.copy()
    if drive.size:
        drive[0] = 0.0  # f(2) = 0 in the original regardless of s(1)
    out = np.zeros((spikes.size, group.size))
    for k in range(group.size):
        period = float(group.twitch_time_to_peak_ms[k])
        decay = np.exp(-step_ms / period)
        gain = float(group.twitch_peak[k]) * step_ms**2 / period * np.exp(1 - step_ms / period)
        out[:, k] = lfilter([0.0, gain], [1.0, -2.0 * decay, decay**2], drive)
    return out


def type_signals(
    soma_voltage: NDArray[np.float64],
    group: MotorUnitGroup,
    shapes: NDArray[np.int64],
    axon_length_percent: float,
    step_ms: float,
) -> TypeSignals:
    """Run stages 1–5 for one unit type. ``soma_voltage`` is ``(samples, units)``."""
    filtered = median_filter_3x3(soma_voltage)
    junction = junction_potential(filtered, axon_length_percent)
    muap = muap_train(junction, group, shapes)
    spikes = spike_train(muap.sum(axis=1))
    return TypeSignals(muap=muap, force=twitch_force(spikes, group, step_ms))

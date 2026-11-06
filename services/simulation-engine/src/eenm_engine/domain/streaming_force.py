"""Streaming force: the post-processing of ``Main.m`` done once per sample, as the voltages arrive.

``force_pipeline.TypeForce`` is the reference implementation: on every call it reprocesses a trailing window of
the record (median filter, peak detection, MUAP train, twitch sum), so a 5 ms block of 500 samples recomputes
a window of several thousand. Here each stage keeps its state between calls and touches each sample once:

* **median filter** — a row is filtered once its next row has arrived (``medfilt2`` looks one row ahead; the zero
  padding below the last row is applied when the record ends);
* **peaks** — a scanner per unit follows the runs of equal values; a run is a peak when the values before it
  rise to it and the next value falls (``findpeaks``: a plateau is reported at its first sample, and only when
  it ends). A rising run still in progress holds back every later sample of that unit;
* **MUAP train** — at each sample the unit shows the MUAP of its *latest* arrival (later MUAPs overwrite earlier
  ones in the original, so only the newest can be visible);
* **twitch** — a list of the twitches still in progress; force is evaluated only at the samples asked for (the
  output grid), from the twitch formula itself instead of cached sampled kernels.

Every value equals the reference up to floating-point rounding (``tests/unit/test_streaming_force.py``). The
original recursive twitch (exponent 1) keeps ``TwitchFilter``'s IIR filter, which needs every sample.
"""

from __future__ import annotations

import math

import numpy as np
from numba import njit, prange
from numpy.typing import NDArray

from eenm_engine.domain.fatigue import FatigueModel, UnitFatigue
from eenm_engine.domain.force_pipeline import MUAP_TIME, junction_potential, muap_waveform
from eenm_engine.domain.model_options import ModelOptions, StimulationSite, TwitchDrive
from eenm_engine.domain.motor_unit_pool import MotorUnitGroup
from eenm_engine.domain.twitch import KERNEL_CUTOFF, TwitchFilter
from eenm_engine.parallel import NUMBA_PARALLEL_LOCK

# -- compiled stages -------------------------------------------------------------------------------------------


@njit(cache=True, parallel=True)
def _median_3x3(rows: NDArray[np.float64], out: NDArray[np.float64]) -> None:
    """``out[i] = medfilt2`` of ``rows[i + 1]``: rows ``i`` and ``i + 2`` are its neighbours, columns padded with 0."""
    n_out, units = out.shape
    for i in prange(n_out):
        window = np.empty(9)
        for k in range(units):
            n = 0
            for di in range(3):
                for dk in range(-1, 2):
                    c = k + dk
                    window[n] = rows[i + di, c] if 0 <= c < units else 0.0
                    n += 1
            for a in range(1, 9):  # insertion sort of 9 values
                x = window[a]
                b = a - 1
                while b >= 0 and window[b] > x:
                    window[b + 1] = window[b]
                    b -= 1
                window[b + 1] = x
            out[i, k] = window[4]


@njit(cache=True, parallel=True)
def _scan_peaks(
    signal: NDArray[np.float64],
    base: int,
    scale: float,
    started: NDArray[np.bool_],
    run_value: NDArray[np.float64],
    run_start: NDArray[np.int64],
    rising: NDArray[np.bool_],
    delay: NDArray[np.int64],
    q_start: NDArray[np.int64],
    q_height: NDArray[np.float64],
    q_head: NDArray[np.int64],
    q_count: NDArray[np.int64],
) -> None:
    """``findpeaks`` (height > 0) over the next rows of ``signal · scale``; each peak is queued at peak + delay."""
    rows, units = signal.shape
    cap = q_start.shape[1]
    for k in prange(units):
        for i in range(rows):
            v = signal[i, k] * scale
            if not started[k]:
                started[k] = True  # the first sample is never a peak
                run_value[k] = v
                run_start[k] = base + i
                rising[k] = False
            elif v != run_value[k]:
                if rising[k] and v < run_value[k] and run_value[k] > 0.0:
                    slot = (q_head[k] + q_count[k]) % cap
                    q_start[k, slot] = run_start[k] + delay[k]
                    q_height[k, slot] = run_value[k]
                    q_count[k] += 1
                rising[k] = v > run_value[k]
                run_value[k] = v
                run_start[k] = base + i


@njit(cache=True)
def _advance_muap(
    n0: int,
    n1: int,
    q_start: NDArray[np.int64],
    q_height: NDArray[np.float64],
    q_head: NDArray[np.int64],
    q_count: NDArray[np.int64],
    current_start: NDArray[np.int64],
    current_height: NDArray[np.float64],
    wave: NDArray[np.float64],
    muap_sum: NDArray[np.float64],
    ev_unit: NDArray[np.int64],
    ev_index: NDArray[np.int64],
    ev_height: NDArray[np.float64],
) -> int:
    """Summed MUAP of samples ``[n0, n1)``; every arrival reached is emitted as an event. Returns the event count."""
    units, cap = q_start.shape
    width = wave.shape[1]
    count = 0
    for k in range(units):
        for n in range(n0, n1):
            while q_count[k] > 0 and q_start[k, q_head[k]] <= n:
                current_start[k] = q_start[k, q_head[k]]
                current_height[k] = q_height[k, q_head[k]]
                ev_unit[count] = k
                ev_index[count] = current_start[k]
                ev_height[count] = current_height[k]
                count += 1
                q_head[k] = (q_head[k] + 1) % cap
                q_count[k] -= 1
            j = n - current_start[k]
            if current_start[k] >= 0 and j < width:
                muap_sum[n - n0] += current_height[k] * wave[k, j]
    return count


@njit(cache=True)
def _rate_gain(
    ev_unit: NDArray[np.int64],
    ev_index: NDArray[np.int64],
    step: float,
    contraction_time: NDArray[np.float64],
    last_spike: NDArray[np.int64],
    fatigue: bool,
    capacity: NDArray[np.float64],
    fatigability: NDArray[np.float64],
    ct_gain: float,
    pause_rate: float,
    weight: NDArray[np.float64],
    time_scale: NDArray[np.float64],
) -> None:
    """``RateGain.apply_with_timing`` and ``UnitFatigue.on_spike``, one event at a time (each unit in time order)."""
    for e in range(ev_unit.size):
        k = ev_unit[e]
        index = ev_index[e]
        w = 1.0
        slowing = 1.0 + ct_gain * (1.0 - capacity[k]) if fatigue else 1.0
        if last_spike[k] >= 0:
            isi_ms = (index - last_spike[k]) * step
            rate = contraction_time[k] * slowing / isi_ms
            if rate > 0.4:
                w *= (1.0 - math.exp(-2.0 * rate**3)) / (0.3 * rate)
            if fatigue:
                nf = 0.3 * rate if rate <= 0.4 else 1.0 - math.exp(-2.0 * rate**3)
                if rate >= pause_rate:
                    loss_percent = fatigability[k] * nf * isi_ms / 1000.0
                    capacity[k] = max(0.0, capacity[k] - loss_percent / 100.0)
                slowing = 1.0 + ct_gain * (1.0 - capacity[k])
        if fatigue:
            w *= capacity[k]
        weight[e] = w
        time_scale[e] = slowing
        last_spike[k] = index


@njit(cache=True, parallel=True)
def _twitch_sum(
    indices: NDArray[np.int64],
    sp_unit: NDArray[np.int64],
    sp_index: NDArray[np.int64],
    sp_weight: NDArray[np.float64],
    sp_period: NDArray[np.float64],
    sp_length: NDArray[np.int64],
    peak: NDArray[np.float64],
    step: float,
    m: float,
    out: NDArray[np.float64],
) -> None:
    """Summed force of the units at each sample of ``indices``: ``Σ w·P·step·x^m·e^{m(1−x)}``, ``x = j·step/T``."""
    for i in prange(indices.size):
        n = indices[i]
        acc = 0.0
        for s in range(sp_unit.size):
            j = n - sp_index[s]
            if 1 <= j < sp_length[s]:
                x = j * step / sp_period[s]
                acc += sp_weight[s] * (peak[sp_unit[s]] * step * (x**m * math.exp(m * (1.0 - x))))
        out[i] = acc


# -- queue of pending arrivals (one ring buffer per unit) --------------------------------------------------------


class _Queue:
    def __init__(self, units: int, capacity: int = 64) -> None:
        self.start = np.zeros((units, capacity), dtype=np.int64)
        self.height = np.zeros((units, capacity))
        self.head = np.zeros(units, dtype=np.int64)
        self.count = np.zeros(units, dtype=np.int64)

    def reserve(self, extra: int) -> None:
        """Room for ``extra`` more entries per unit (a peak needs two samples, so ``rows // 2 + 1`` per block)."""
        cap = self.start.shape[1]
        needed = int(self.count.max(initial=0)) + extra
        if needed <= cap:
            return
        new_cap = max(needed, 2 * cap)
        order = (self.head[:, None] + np.arange(cap)[None, :]) % cap
        for name in ("start", "height"):
            old = getattr(self, name)
            grown = np.zeros((old.shape[0], new_cap), dtype=old.dtype)
            grown[:, :cap] = np.take_along_axis(old, order, axis=1)
            setattr(self, name, grown)
        self.head[:] = 0


class _PeakScanner:
    """``findpeaks`` state of each column, fed row by row."""

    def __init__(self, columns: int, delay: NDArray[np.int64]) -> None:
        self.started = np.zeros(columns, dtype=np.bool_)
        self.run_value = np.zeros(columns)
        self.run_start = np.zeros(columns, dtype=np.int64)
        self.rising = np.zeros(columns, dtype=np.bool_)
        self.delay = np.ascontiguousarray(delay, dtype=np.int64)
        self.queue = _Queue(columns)
        self.seen = 0

    def feed(self, signal: NDArray[np.float64], scale: float = 1.0) -> None:
        if signal.shape[0] == 0:
            return
        self.queue.reserve(signal.shape[0] // 2 + 1)
        q = self.queue
        with NUMBA_PARALLEL_LOCK:
            _scan_peaks(
                np.ascontiguousarray(signal),
                self.seen,
                scale,
                self.started,
                self.run_value,
                self.run_start,
                self.rising,
                self.delay,
                q.start,
                q.height,
                q.head,
                q.count,
            )
        self.seen += signal.shape[0]

    def decided(self) -> NDArray[np.int64]:
        """Per column, the first sample whose peak decision is still open: the start of a rising, positive run."""
        open_run = self.started & self.rising & (self.run_value > 0.0)
        return np.where(open_run, self.run_start, self.seen)


# -- one unit type -----------------------------------------------------------------------------------------------


class StreamingTypeForce:
    """Force and EMG of one unit type, fed with consecutive rows of its voltages (or axon spike trains).

    ``push`` consumes rows and advances every stage as far as it is decided; ``ready`` is then the number of leading
    samples whose force and MUAP are final; ``take`` returns them at the requested samples and forgets them.
    """

    def __init__(
        self,
        group: MotorUnitGroup,
        shapes: NDArray[np.int64],
        axon_length_percent: float,
        step_ms: float,
        options: ModelOptions,
        pool_twitch_range: tuple[float, float] | None = None,
    ) -> None:
        self._group = group
        self._units = group.size
        self._step = step_ms
        self._options = options
        # spike trains instead of soma voltages: axon stimulation, or Cisi & Kohn motoneurons under a central drive
        self._axons = options.stimulation_site is StimulationSite.MOTOR_AXONS or options.central_drive is not None
        self._own_spikes = options.twitch_drive is TwitchDrive.OWN_SPIKES
        self._scale = 1.0 if self._axons else float(junction_potential(np.ones(1), axon_length_percent)[0])
        delay = np.asarray(group.muap_delay_samples, dtype=np.int64)
        self._peaks = _PeakScanner(self._units, delay)
        self.record_arrivals = False
        """Keep ``arrivals`` (off by default: the list grows until the caller empties it)."""
        self.arrivals: list[tuple[NDArray[np.int64], NDArray[np.int64]]] = []
        """Spikes that reached the muscle since the caller last emptied this list (unit within the type, sample)."""
        self._summed_peaks = None if self._own_spikes else _PeakScanner(1, np.zeros(1, dtype=np.int64))
        self._above = np.zeros((1, self._units))  # medfilt2's zero row above the record
        self._pending = np.empty((0, self._units))  # rows waiting for their next row
        self._wave = np.zeros((self._units, MUAP_TIME.size))
        for k in range(self._units):
            self._wave[k] = group.muap_scale[k] * muap_waveform(float(group.muap_time_factor[k]), int(shapes[k]))
        self._current_start = np.full(self._units, -(10**12), dtype=np.int64)
        self._current_height = np.zeros(self._units)
        self._muap = np.empty(0)  # summed MUAP of samples [_muap_base, _muap_base + size)
        self._muap_base = 0
        self.ready = 0

        fatigue = None
        if options.fatigue is not None:
            weakest, strongest = pool_twitch_range or (
                float(group.twitch_peak.min(initial=1.0)),
                float(group.twitch_peak.max(initial=1.0)),
            )
            nominal = options.fatigue.nominal_from_force(group.twitch_peak, weakest, strongest)
            fatigue = UnitFatigue(options.fatigue, nominal)
        self.fatigue = fatigue
        self._last_spike = np.full(self._units, -1, dtype=np.int64)
        self._fatigability = np.asarray(fatigue.fatigability if fatigue else np.zeros(self._units), dtype=np.float64)
        self._capacity = fatigue.capacity if fatigue else np.ones(self._units)

        self._iir = TwitchFilter(group, step_ms, options.twitch_shape) if options.twitch_shape.is_original else None
        self._m = options.twitch_shape.exponent
        x_end = 1.0
        while self._m * (math.log(x_end) + 1 - x_end) > math.log(KERNEL_CUTOFF):
            x_end *= 1.25  # as TwitchFilter._kernel
        self._x_end = x_end
        self._peak = np.ascontiguousarray(group.twitch_peak, dtype=np.float64)
        self._ttp = np.asarray(group.twitch_time_to_peak_ms, dtype=np.float64)
        # twitches in progress (or, with the IIR filter, drive events not yet filtered)
        self._sp_unit = np.empty(0, dtype=np.int64)
        self._sp_index = np.empty(0, dtype=np.int64)
        self._sp_weight = np.empty(0)
        self._sp_period = np.empty(0)
        self._sp_length = np.empty(0, dtype=np.int64)

    @property
    def buffered_samples(self) -> int:
        return int(self._pending.shape[0] + self._muap.size)

    def push(self, rows: NDArray[np.float64], final: bool) -> None:
        """Consume the next rows; ``final`` when they end the record."""
        if self._units == 0:
            self.ready = self._peaks.seen = self._peaks.seen + rows.shape[0]
            return
        known = self._peaks.seen + self._pending.shape[0] + rows.shape[0]
        self._peaks.feed(self._junction(rows, final), self._scale)
        # the MUAP (and the arrivals) of a sample are final once every unit's peaks before it are decided
        muap_until = known if final else min(known, int((self._peaks.decided() + self._peaks.delay).min()))
        events = self._advance_muap(muap_until)
        if self.record_arrivals:
            self.arrivals.append((events[0].copy(), events[1].copy()))  # (unit, sample) reaching the muscle
        if self._own_spikes:
            self.ready = muap_until
            unit, index, height = events
            weight, scale = self._gain(unit, index, np.ones_like(height))
        else:
            summed = self._summed_peaks
            assert summed is not None
            summed.feed(self._muap[summed.seen - self._muap_base :, None])
            self.ready = known if final else int(summed.decided()[0])
            q = summed.queue
            n = int(q.count[0])
            slots = (q.head[0] + np.arange(n)) % q.start.shape[1]
            index_1, height_1 = q.start[0, slots], q.height[0, slots]
            q.head[0] = (q.head[0] + n) % q.start.shape[1]
            q.count[0] = 0
            # every unit twitches at each peak of the summed MUAP, weighted by its height (Main.m)
            unit = np.tile(np.arange(self._units, dtype=np.int64), index_1.size)
            index = np.repeat(index_1, self._units)
            weight, scale = np.repeat(height_1, self._units), np.ones(index.size)
        self._add_twitches(unit, index, weight, scale)

    def take(
        self, start: int, stop: int, indices: NDArray[np.int64]
    ) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """Summed unit force and mean MUAP at ``indices`` (within ``[start, stop)``, ``stop ≤ ready``); samples before
        ``stop`` are then forgotten."""
        if self._units == 0:
            return np.zeros(indices.size), np.zeros(indices.size)
        if self._iir is not None:
            force = self._iir_force(start, stop)[indices - start].sum(axis=1)
        else:
            force = np.empty(indices.size)
            with NUMBA_PARALLEL_LOCK:
                _twitch_sum(
                    indices, self._sp_unit, self._sp_index, self._sp_weight, self._sp_period, self._sp_length,
                    self._peak, self._step, self._m, force,
                )  # fmt: skip
            alive = self._sp_index + self._sp_length > stop
            self._sp_unit, self._sp_index, self._sp_weight = (
                self._sp_unit[alive], self._sp_index[alive], self._sp_weight[alive],
            )  # fmt: skip
            self._sp_period, self._sp_length = self._sp_period[alive], self._sp_length[alive]
        emg = self._muap[indices - self._muap_base] / self._units
        keep = stop - self._muap_base
        if self._summed_peaks is not None:
            keep = min(keep, self._summed_peaks.seen - self._muap_base)  # the scanner has read these already
        self._muap = self._muap[keep:]
        self._muap_base += keep
        return force, emg

    # -- stages ------------------------------------------------------------------------------------------------
    def _junction(self, rows: NDArray[np.float64], final: bool) -> NDArray[np.float64]:
        """Rows of the junction signal (before the attenuation factor, applied by the scanner) that are now known."""
        if self._axons:
            return np.asarray(rows, dtype=np.float64)
        stack = np.vstack((self._above, self._pending, rows))
        if final:
            stack = np.vstack((stack, np.zeros((1, self._units))))  # zero padding below the last row
        out = np.empty((max(0, stack.shape[0] - 2), self._units))
        if out.shape[0]:
            with NUMBA_PARALLEL_LOCK:
                _median_3x3(np.ascontiguousarray(stack), out)
            self._above = stack[-2:-1].copy()
            self._pending = stack[-1:].copy()
        else:
            self._above, self._pending = stack[:1].copy(), stack[1:].copy()
        if final:
            self._pending = np.empty((0, self._units))
        return out

    def _advance_muap(self, until: int) -> tuple[NDArray[np.int64], NDArray[np.int64], NDArray[np.float64]]:
        done = self._muap_base + self._muap.size
        q = self._peaks.queue
        size = int(q.count.sum())
        unit, index, height = np.empty(size, dtype=np.int64), np.empty(size, dtype=np.int64), np.empty(size)
        if until <= done:
            return unit[:0], index[:0], height[:0]
        block = np.zeros(until - done)
        n = _advance_muap(
            done, until, q.start, q.height, q.head, q.count, self._current_start, self._current_height,
            self._wave, block, unit, index, height,
        )  # fmt: skip
        self._muap = np.concatenate((self._muap, block))
        return unit[:n], index[:n], height[:n]

    def _gain(
        self, unit: NDArray[np.int64], index: NDArray[np.int64], weight: NDArray[np.float64]
    ) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        if not self._options.rate_gain:
            return weight, np.ones(index.size)
        out_weight, out_scale = np.empty(index.size), np.empty(index.size)
        model = self._options.fatigue
        _rate_gain(
            unit, index, self._step, self._ttp, self._last_spike, self.fatigue is not None, self._capacity,
            self._fatigability, model.contraction_time_gain if model else 0.0, FatigueModel.PAUSE_RATE,
            out_weight, out_scale,
        )  # fmt: skip
        return out_weight * weight, out_scale

    def _add_twitches(
        self, unit: NDArray[np.int64], index: NDArray[np.int64], weight: NDArray[np.float64], scale: NDArray[np.float64]
    ) -> None:
        drive = index > 0  # f(2) = 0 in the original regardless of s(1): a spike at sample 0 drives nothing
        unit, index, weight, scale = unit[drive], index[drive], weight[drive], scale[drive]
        rounded = np.array([round(float(s), 3) for s in scale])  # kernel time scale, as TwitchFilter._kernel
        period = self._ttp[unit] * rounded if unit.size else np.empty(0)
        length = np.array([math.ceil(self._x_end * p / self._step) + 1 for p in period], dtype=np.int64)
        self._sp_unit = np.concatenate((self._sp_unit, unit))
        self._sp_index = np.concatenate((self._sp_index, index))
        self._sp_weight = np.concatenate((self._sp_weight, weight))
        self._sp_period = np.concatenate((self._sp_period, period))
        self._sp_length = np.concatenate((self._sp_length, length))

    def _iir_force(self, start: int, stop: int) -> NDArray[np.float64]:
        """Exponent 1: the original recursion over every sample of ``[start, stop)``, per unit."""
        assert self._iir is not None
        drive = np.zeros((stop - start, self._units))
        mine = self._sp_index < stop
        np.add.at(drive, (self._sp_index[mine] - start, self._sp_unit[mine]), self._sp_weight[mine])
        for name in ("_sp_unit", "_sp_index", "_sp_weight", "_sp_period", "_sp_length"):
            setattr(self, name, getattr(self, name)[~mine])
        return self._iir.segment(drive)

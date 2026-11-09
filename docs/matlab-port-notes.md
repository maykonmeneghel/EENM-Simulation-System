# MATLAB → Python port notes

The Python engine (`services/simulation-engine`) is a **faithful** port of `Mathematical Model/`
(the script version used by `Main.m`). Nothing in the physics was changed. This file lists where the
code lives now and every behaviour of the original that looks unintended but was **kept on purpose**,
so that each one can be decided explicitly later (and validated against the literature) instead of
being silently "fixed" during the port.

The GUI copy in `EENM System/` has its own `FES.m`, `runnn.m` and `ratesS.m` variants; the port
follows `Mathematical Model/`.

## Where each MATLAB file went

| MATLAB | Python |
|---|---|
| `currentEENM.m`, `FES.m` | `domain/stimulus.py` (`StimulusProtocol`, `stimulus_current`, `stimulus_series`) |
| `createUMs.m`, `demangeMNs.m` | `domain/motor_unit_pool.py` (`TYPE_RANGES`, `MUSCLE_PRESETS`, `build_group`) |
| `rates.m`, `setInit.m`, `snaminf.m` … `hinfnap.m`, conductances block of `createUMs.m` | `domain/motoneuron.py` (`MotoneuronPool`, `Conductances`, gating functions) |
| `runnn.m` + `batch` jobs (`ode23s` per unit) | `application/run_simulation.py` + `infrastructure/scipy_solver.py` (BDF, all units in one system) |
| `Main.m` post-processing, `detectSpike.m` | `domain/force_pipeline.py` |
| — | `domain/simulation.py` (`IncrementalForce`: streaming that is provably equal to the batch result) |

## Numerical differences (not physics)

1. **Solver.** `ode23s` (Rosenbrock, one call per unit) → SciPy `BDF` with the same default
   tolerances (`RelTol 1e-3`, `AbsTol 1e-6`), all units in one block-diagonal system, integrated in
   5 ms blocks so the force can be streamed. Spike times agree to a fraction of a millisecond, not bit
   for bit.
2. **Randomness.** `randi([0,1])` (MUAP shape per unit) → NumPy generator with an explicit `seed`, so a
   run is reproducible.
3. **Bounded solver step.** The solver's internal step is limited to half the pulse width (never below
   the sampling step). Without it a stiff solver steps over short pulses: with 0.3 ms pulses at 40 Hz an
   unbounded BDF produced 1 spike instead of 40 (found during the validation, now tested). MATLAB's
   `ode23s` with its default `MaxStep = 0.1·(tf − t0)` (100 ms for 1 s) is exposed to the same problem;
   the original's 5 ms pulses happened to be long enough.
4. **Empty unit type.** `mean` over zero units is `NaN` in MATLAB and would make the total force `NaN`;
   the port treats a type with no simulated units as contributing zero.

5. **Compiled pool integrator (default since 2026-11-06).** The app integrates the motoneuron pool with a compiled
   fixed-step scheme (`infrastructure/compiled_motoneuron.py`, Numba, parallel over units): gates and calcium by exact
   exponential updates (Rush–Larsen), the two compartment voltages by backward Euler (2 × 2 solve), one substep per
   0.01 ms sample while quiet and 20 while a unit is driven, above −50 mV or moving > 0.2 mV per sample. Against an
   accurate BDF reference (rtol 1e-7) it is closer than the production BDF (rtol 1e-3): 6 vs 21 of 120 near-threshold
   units with a different spike count (300 µs pulses into the soma, 200 ms), spike times within 0.01 ms; on `Main.m`
   (1 s) it matches Octave with Vs rms 0.41 mV (BDF 0.76), spike times within 0.02 ms (BDF 0.06), mean force 0.15 %
   (BDF 0.18 %). About 23× faster than BDF on the pool. The BDF solver stays the reference for the Octave comparison
   and the validation scripts.

6. **Streaming force stages (since 2026-11-06).** The post-processing (median filter, junction peaks, MUAP train,
   twitch sum) runs on each sample once as the voltages arrive (`domain/streaming_force.py`, Numba) instead of
   reprocessing a trailing window every 5 ms block, and the twitch sum is evaluated only at the output samples
   (`outputStepMs`). Every streamed force and EMG value equals the reference (`force_pipeline.type_signals` on the
   complete record) to within 1e-11 relative (`tests/unit/test_streaming_force.py`); a 1.5 s run with 120 units gives
   the same chunks as before to 3e-15. Consequence: `completed.summary` (peak, mean, time to peak) is now taken on the
   output grid, so the time to peak is a multiple of `outputStepMs`.

## Checked against the original code run in GNU Octave

`services/simulation-engine/validation/octave/run.sh [duration_ms]` (needs Docker) runs `Mathematical Model/Main.m`
in GNU Octave 9.4 and the Python engine (ORIGINAL, production solver and force pipeline) on the same defaults, and
compares them; it exits 1 if a tolerance is exceeded. The harness is generated from `Main.m` by
`make_harness.sh` and differs from it only where Octave needs it:

- `batch` / `wait` / `fetchOutputs` (Parallel Computing Toolbox, absent in Octave) → direct calls to `runnn`.
- `randi([0,1])` (MUAP shape) → the shapes drawn by the Python engine (`seed = 0`), so both sides use the same.
- `tmax` as a parameter (1000 in `Main.m`); `clc` / `clear` / `close all` removed.

Two Octave functions behave differently from MATLAB's and are shadowed by versions written from MATLAB's
documentation: `medfilt2` (Octave's refuses inputs narrower than the 3 × 3 window — FR and FF have 2 units) and
`findpeaks` (Octave's refuses negative data). **Consequence:** the comparison does not test the semantics of
MATLAB's `findpeaks`, because the shadow and `force_pipeline.find_peaks_matlab` follow the same reading of the
documentation. Octave's `ode23s` is also not MATLAB's; this is a comparison with the original *code*, run in
Octave, not with MATLAB itself.

Result for `Main.m`'s 1 s (`validation/results/octave/comparison-1000ms.txt`): every one of the 9 units fires
40 spikes on both sides, spike times within 0.02 ms (S, FR) and 0.06 ms (FF); mean force differs by 0.18 %,
peak force by 0.17 % at the same instant (981.35 ms), correlation 0.99999. Tolerances: same spike counts, spike
times within 0.1 ms, mean and peak force within 1 %.

**Negative controls** (`run.sh 1000 --negative-controls`): the same Octave run is compared with Python runs
perturbed on purpose, and each must fail; the script exits 1 if one passes. Results in
`validation/results/octave/negative-control-*-1000ms.txt` (rerun 2026-11-09; the baseline file came out
identical to the one of 2026-11-05):

| Perturbation (Python side only) | What it changes | Detected by | Mean force off |
|---|---|---|---|
| Temperature 6.8 °C instead of 6.3 °C | ODE (channel kinetics) | FF spike times 0.27–0.28 ms (> 0.1 ms) | 0.52 % (below the 1 % tolerance) |
| Temperature 8.0 °C | ODE | FF spike times 0.60–0.62 ms; force | 1.73 % |
| MUAP-shape seed 1 instead of 0 | force path only (Q2: twitch weight = MUAP peak) | force | 49.9 % |

Two things these show. A 0.5 °C perturbation is caught only by the spike-time check, not by the force
tolerance: the force check alone would miss it. And the correlation of the force traces stays at 0.9992 with a
50 % amplitude error, so correlation is not evidence of equivalence; only the spike and amplitude checks are.
(Earlier controls, run at 50 ms, gave 1.8 % and 63 %; the duration also changes the conduction delay (Q4), so those
numbers are not comparable with the 1 s run; the cause of the difference was not isolated.)

## Behaviours kept as in the original (to be reviewed)

| # | Behaviour | Where in MATLAB | Effect |
|---|---|---|---|
| Q1 | The stimulus current is injected **directly into the motoneuron soma** (or dendrite), not through skin/electrodes. | `rates.m` (`IappS`) | The master's-thesis committee's main criticism. Opt-in fix: `stimulation_site = MOTOR_AXONS` (analytic recruitment layer, step 4). |
| Q2 | Twitches of every unit of a type are driven by the peaks of the **summed MUAP signal of the type** (`detectSpike(e_S)`), not by that unit's own spikes, and the impulse weight is the **peak value of that sum**, not 1. | `Main.m`, lines with `spikeS = detectSpike(e_S)` and the `f_S` loop | Force depends on MUAP amplitudes and on how MUAPs of different units overlap. |
| Q3 | Overlapping MUAPs of a unit **overwrite** each other instead of adding. | `UMAP_S(...) = ...` assignment | At high firing rates part of the earlier MUAP disappears. |
| Q4 | The MUAP **conduction delay in samples is `round((x/100)/APAT · tmax/step)`**, i.e. it scales with the simulated duration (18 ms for 1 s, 0.9 ms for 50 ms). | `createUMs.m` (`APAT.Value = round(...)`) | Delay is not a physical constant. Opt-in fix: `fixed_conduction_delay` (APAT read as m/s, 1000 ms per s; identical to the original at 1 s). |
| Q5 | The MUAP waveform is always 251 samples of `t2 = -1.25:0.01:1.25`, independent of `step`. | `Main.m` (`t2`) | Its duration in ms changes if `step ≠ 0.01`. |
| Q6 | `medfilt2` is applied to the (time × unit) matrix, so the filter also mixes **neighbouring units**, with zero padding at the edges. | `Main.m` (`medfilt2(cell2mat(...))`) | A unit's voltage is influenced by its neighbours; edge units by zeros. |
| Q7 | Force per type is the **mean** over units, and the muscle force is the **sum of the three means**. Tetanic force (`MTF`) is defined but never used. | `Main.m` (`EENMResults.force`), `createUMs.m` | Force does not scale with the number of units recruited. |
| Q8 | `demangeMNs` simulates only the **first** 5 S, 2 FR, 2 FF units of the interpolated pool — the smallest of each type. | `demangeMNs.m` | The simulated muscle is not a representative sample of the pool. |
| Q9 | In `FES.m`, pulse-width modulation with a ramp uses the raw square wave (±1) even for a monophasic stimulus. | `FES.m`, `'Pulse Width'` / `'Ramp'` | A "monophasic" stimulus goes negative. |
| Q10 | Sinusoidal modulations use `sin(t)` with `t` in ms (period ≈ 6.28 ms). | `FES.m` | Modulation frequency ≈ 159 Hz, probably meant to be slower. |
| Q11 | Default pulses are 5 ms wide (20 % duty cycle at 40 Hz); FES of the quadriceps (e.g. FES cycling) uses 300–600 µs pulses (Doucet, Lam & Griffin 2012, *Yale J Biol Med* 85:201–215, PMID 22737049). | `Main.m` (`currentEENM(..., 20, ...)`) | Each pulse is long enough to keep the soma depolarised. |

How the force compares with published physiology is reported separately in
`docs/validation/literature-comparison.md`.

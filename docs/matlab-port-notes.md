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

## Behaviours kept as in the original (to be reviewed)

| # | Behaviour | Where in MATLAB | Effect |
|---|---|---|---|
| Q1 | The stimulus current is injected **directly into the motoneuron soma** (or dendrite), not through skin/electrodes. | `rates.m` (`IappS`) | This is the master's-thesis committee's main criticism; future work. |
| Q2 | Twitches of every unit of a type are driven by the peaks of the **summed MUAP signal of the type** (`detectSpike(e_S)`), not by that unit's own spikes, and the impulse weight is the **peak value of that sum**, not 1. | `Main.m`, lines with `spikeS = detectSpike(e_S)` and the `f_S` loop | Force depends on MUAP amplitudes and on how MUAPs of different units overlap. |
| Q3 | Overlapping MUAPs of a unit **overwrite** each other instead of adding. | `UMAP_S(...) = ...` assignment | At high firing rates part of the earlier MUAP disappears. |
| Q4 | The MUAP **conduction delay in samples is `round((x/100)/APAT · tmax/step)`**, i.e. it scales with the simulated duration (18 ms for 1 s, 0.9 ms for 50 ms). | `createUMs.m` (`APAT.Value = round(...)`) | Delay is not a physical constant. |
| Q5 | The MUAP waveform is always 251 samples of `t2 = -1.25:0.01:1.25`, independent of `step`. | `Main.m` (`t2`) | Its duration in ms changes if `step ≠ 0.01`. |
| Q6 | `medfilt2` is applied to the (time × unit) matrix, so the filter also mixes **neighbouring units**, with zero padding at the edges. | `Main.m` (`medfilt2(cell2mat(...))`) | A unit's voltage is influenced by its neighbours; edge units by zeros. |
| Q7 | Force per type is the **mean** over units, and the muscle force is the **sum of the three means**. Tetanic force (`MTF`) is defined but never used. | `Main.m` (`EENMResults.force`), `createUMs.m` | Force does not scale with the number of units recruited. |
| Q8 | `demangeMNs` simulates only the **first** 5 S, 2 FR, 2 FF units of the interpolated pool — the smallest of each type. | `demangeMNs.m` | The simulated muscle is not a representative sample of the pool. |
| Q9 | In `FES.m`, pulse-width modulation with a ramp uses the raw square wave (±1) even for a monophasic stimulus. | `FES.m`, `'Pulse Width'` / `'Ramp'` | A "monophasic" stimulus goes negative. |
| Q10 | Sinusoidal modulations use `sin(t)` with `t` in ms (period ≈ 6.28 ms). | `FES.m` | Modulation frequency ≈ 159 Hz, probably meant to be slower. |
| Q11 | Default pulses are 5 ms wide (20 % duty cycle at 40 Hz); FES of the quadriceps (e.g. FES cycling) uses 300–600 µs pulses (Doucet, Lam & Griffin 2012, *Yale J Biol Med* 85:201–215, PMID 22737049). | `Main.m` (`currentEENM(..., 20, ...)`) | Each pulse is long enough to keep the soma depolarised. |

How the force compares with published physiology is reported separately in
`docs/validation/literature-comparison.md`.

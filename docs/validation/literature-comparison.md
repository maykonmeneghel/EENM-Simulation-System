# Model force vs published physiology

Status: baseline of the faithful port, followed by the correction log (section "Corrections"), one step
at a time. Each correction is an opt-in `ModelOptions` flag; `original` stays reproducible.
Model numbers come from `services/simulation-engine/validation/protocols.py`
(`uv run --group validation python -m validation.protocols`, results in `validation/results/`).
Default pool: soleus, 5 S + 2 FR + 2 FF units, 5 ms monophasic pulses of 100 µA/cm² injected into the soma,
1 s trains. Force is in model units (dimensionless twitch amplitudes), so only **shapes and ratios** are compared.

Every reference DOI was checked against Crossref; numbers come from abstracts or open full text
(paywalled tables were not read and are marked as gaps).

## Summary

| # | Benchmark | Literature | Model | Verdict |
|---|---|---|---|---|
| 1 | Whole-muscle twitch time-to-peak (human triceps surae) | 112 ± 11 ms [Sale 1982]; 129 ± 14 ms [Zoughaib 2026] | 92 ms | ✗ ~20 % too fast |
| 2 | Whole-muscle half-relaxation time | 100 ± 14 ms [Sale 1982]; 95 ± 15 ms [Zoughaib 2026] | 158 ms | ✗ ~60 % too slow |
| 3 | HRT / CT ratio | ≈ 0.75–1.05 (human MUs: 78.6/74.8 [Macefield 1996]; triceps 0.74–0.89) | 1.68 for every unit | ✗ shape of the twitch |
| 4 | S-unit contraction time | ≥ 40 ms (cat) [Burke 1967]; 28 ms (rat) [Kanda 1992] | 110 ms | ≈ human whole muscle; slow for cat/rat units |
| 5 | Fast units (FR/FF) contraction time | ≤ 30 ms (cat F) [Burke 1967]; FR 15.7, FF 17.1 ms (rat) [Kanda 1992] | FR 73, FF 82 ms | ✗ 2.5–5× too slow |
| 6 | Fast (F) units faster than slow (S) units | F ≤ 30 ms vs S ≥ 40 ms [Burke 1967]; FF 17.1 ≈ FR 15.7 < S 28.0 ms [Kanda 1992] — FF is *not* faster than FR in the verified data | S 110 > FF 82 ≈ FR 73 ms | ✓ (an earlier version of this table wrongly required FF < FR) |
| 7 | Frequency at half-maximal force (f50) | 9.6 ± 0.6 Hz, human MUs [Macefield 1996]; ≈ 7 Hz from Kernell's 1.4×HRT rule [Kernell 1983] for soleus HRT ≈ 95–100 ms | ≈ 21 Hz | ✗ curve shifted right |
| 8 | Force–frequency shape | Sigmoid, maximal force at 15–100 Hz (median 50 Hz) and then a plateau [Macefield 1996]; triceps fusion ≈ 60 Hz [Sale 1982] | Nearly linear 5–50 Hz, max at 50 Hz, then **falls** to 0.79 at 100 Hz | ✗ no saturation; decline above 50 Hz |
| 9 | Twitch/tetanus ratio, whole muscle | 0.22 ± 0.02 (0.15–0.41) [Macefield 1996]; S ≈ 0.19, F ≈ 0.38 [Burke 1967] | 0.09 | ✗ about half |
| 10 | Tetanus/twitch per type | S ≈ 5.4, F ≈ 2.6 [Burke 1967] | S 14.8, FR 7.3, FF 7.4 | ✗ ≈ 3× too high; S > F order is right ✓ |
| 11 | Fusion by type at 40 Hz | S fused by ≈ 25 Hz, F only by ≈ 85 Hz [Burke 1967] → at 40 Hz S smooth, F rippling | Ripple S 6.1 %, FR 1.8 %, FF 2.8 % | ✗ inverted (fast units smoother than slow) |
| 12 | Motoneuron follows each pulse 1:1 | (expected for suprathreshold stimulation within physiological rates) | 1:1 at 1–10 Hz and 30–50 Hz; **fails at 15–20 Hz** (3 and 14 spikes); FF fails from 60 Hz | ✗ / to investigate |
| 13 | SCI soleus (the original target population) | Faster twitch (TPT −20 ms, HRT −25 %), much more fatigable, higher Tw/Tet, f–F curve shifts right after fatigue [Shields 2002; Chang & Shields 2011; Cope 1986] | Fast twitch ✓ partially (by accident: TPT 92 ms); no fatigue model; Tw/Tet low | Not comparable yet (no fatigue) |

**Bottom line:** the force produced by the ported model does **not** yet match published physiology,
neither in twitch shape (relaxation too slow, fast units too slow, FF/FR order inverted) nor in the
force–frequency relationship (no saturation, f50 ≈ 21 Hz instead of ≈ 7–10 Hz, decline above 50 Hz).
These are properties of the original model, reproduced by the port — not port errors (the port's
equivalence to MATLAB is checked separately).

## Likely causes (hypotheses — not yet tested)

Each hypothesis points to a behaviour already listed in `docs/matlab-port-notes.md`; none was changed.

| Finding | Probable cause | Note |
|---|---|---|
| 3, 2 — relaxation too slow | The critically damped twitch `t·e^{1-t/T}` has HRT ≈ 1.68·T by construction. Real twitches relax faster than they contract. | Twitch model choice (Fuglevand 1993 uses the same kernel; known limitation). |
| 5 — fast units too slow | `demangeMNs` simulates the **first** units of each interpolated range (Q8), and the MTTP ranges go from slow to fast (FF 82.3 → 56.9 ms), so the 2 simulated FF units are the slowest FF of the pool. Even the fastest values in the table (FR 55.5, FF 56.9 ms) are ~2× the literature. | Q8 + parameter table. |
| 7, 8, 10 — no saturation, right-shifted curve, high tetanus/twitch | Forces are summed **linearly** (no sigmoidal gain as in Fuglevand 1993), so mean force grows ∝ frequency until spikes fail. The impulse weight is the **peak of the summed MUAP** (Q2), not 1, and the force is a **mean** over units (Q7). | Q2, Q7; missing force saturation. |
| 8 (decline), 12 — force falls above 50 Hz | Fast motoneurons enter **depolarisation block** with long (5 ms) pulses at high rates (Q11): spikes drop (FF 23/100 at 100 Hz) and the force with them. This is neuronal failure, not muscle fatigue. | Q11; would not happen with clinical 0.1–0.5 ms pulses or nerve stimulation. |
| 8 (decline) — force falls above 50–60 Hz, revisited | Spike failures come from soma injection (Q1); with axon stimulation (step 4) every unit follows every pulse up to 100 Hz. | Fixed by step 4. |
| 12 — missing spikes at 15–20 Hz | **Solver artefact, not physiology** (found in step 3): the unbounded stiff solver stepped over pulses. With the step bounded by half the pulse width the motoneurons fire 15/15 and 20/20. The earlier candidate explanation (dendritic Ca / persistent Na) was wrong. | Fixed; `docs/matlab-port-notes.md`, numerical difference 3. |
| 11 — fusion order inverted | Consequence of 5: the simulated "fast" units are slow. | Q8. |

## Corrections

All variants below are computed by `validation/protocols.py` (same protocols as above; the numbers of
`original` differ slightly from the baseline table because the solver is no longer restarted every 5 ms
and tetanus is now the maximum over all frequencies). Current table: `validation/results/summary.md`.

### Step 1 — representative units and human twitch timing

- `unit_selection = SPREAD_ACROSS_POOL`: one unit at the centre of each equal slice of the pool instead of
  the first (smallest/slowest) units (Q8).
- Twitch shape `h(t) = P·(t/T)^m·e^{m(1-t/T)}` (`m = 1` is the original kernel exactly; tested), so
  relaxation is no longer tied to 1.68 × contraction time. This parameterisation is ours; Raikova et al.
  2013 (doi:10.1155/2013/625427) is cited only as evidence that MU twitch models use independent
  contraction and half-relaxation times.
- Two numbers fitted (`validation/calibrate.py`) to human whole-soleus twitch timing — contraction
  120.7 ms, half-relaxation 97.3 ms (means of Sale 1982 and Zoughaib 2026): every unit's contraction
  time × **1.5718** (S/FR/FF proportions of the original table kept) and **m = 5.1232**. No per-type human
  value was invented: the verified sources give none.

| Metric | Literature | original | spread-units | human-twitch |
|---|---|---|---|---|
| Twitch CT / HRT (ms) | 112–129 / 95–100 | 92 / 158 | 80 / 142 | **121 / 97** (fitted) |
| HRT / CT | 0.74–1.05 | 1.72 | 1.79 | **0.81** |
| S CT (ms) | slow (≥ 40 cat) | 110 | 105 | 160 |
| FR / FF CT (ms) | fast (≤ 30 cat; 16–17 rat) | 73 / 82 | 63 / 68 | 97 / 104 |
| Tetanus / twitch S · FR · FF | S 5.4, F 2.6 | 16.4 · 9.2 · 8.2 | 14.1 · 3.7 · 5.2 | **9.2 · 3.2 · 3.5** |
| Ripple at 40 Hz S · FR · FF | S fused (≈ 25 Hz), F not (≈ 85 Hz) | 6 · 2 · 3 % | 5 · 27 · 24 % | **0.3 · 28 · 25 %** ✓ |
| Twitch / tetanus, whole | 0.15–0.41 (mean 0.22) | 0.09 | 0.12 | **0.15** ✓ (lower bound) |
| f50 (Hz) | 7–10 | 23 | 19 | 20 ✗ |
| Max force at (Hz) / force at 100 Hz | plateau 15–100 Hz | 50 / 0.80 | 60 / 0.52 | 60 / 0.57 ✗ |

Caveats: per-unit twitches are now slower than human single units measured in toe extensors
(CT ≈ 75 ms, Macefield 1996) — soleus units are not in the verified data, so this is not a contradiction
but it is untested; per-unit HRT/CT is 0.64 against ≈ 1.05 for those units (the whole-muscle value is
the one fitted). The force–frequency curve (f50, decline above 60 Hz) is still wrong: that is steps 2–3.

### Step 2 — own spikes, summed force, rate saturation

- `twitch_drive = OWN_SPIKES`: each unit's twitches are triggered by its own action potentials on
  arrival at the muscle (junction peak + conduction delay), weight 1 (Q2).
- `force_aggregation = SUM`: muscle force is the linear sum of all unit forces, as in Potvin &
  Fuglevand 2017, instead of the sum of per-type means (Q7).
- `rate_gain`: each twitch is scaled by `g(NR) = NF(NR) / (0.3·NR)`, with `NR = CT / ISI` of that unit and
  `NF` the composite force–rate curve of **Potvin & Fuglevand 2017, Eqs 4–6** (doi:10.1371/journal.pcbi.1005581,
  read in the full text: `NF = 0.3·NR` for `NR ≤ 0.4`, `NF = 1 − exp(−2·NR³)` above). The paper computes force
  directly from the rate; the per-twitch gain that makes a twitch sum follow that curve is **our derivation**.
- Twitch time scale and shape re-fitted on this pipeline (`validation/calibrate.py step2`):
  × **1.6553**, **m = 4.7887** (step 1's fit no longer held once the drive and aggregation changed).

| Metric | Literature | human-twitch (step 1) | own-spikes (no gain) | **rate-gain (step 2)** |
|---|---|---|---|---|
| Twitch CT / HRT (ms) | 112–129 / 95–100 | 121 / 97 | 114 / 90 | **121 / 97** (fitted) |
| Twitch / tetanus, whole | 0.22 ± 0.02 (0.15–0.41) | 0.15 | 0.08 | **0.21** ✓ |
| f50 (Hz) | 9.6 ± 0.6 (human MUs); ≈ 7 (Kernell rule) | 20 | 40 | **11.8** ≈ (slightly high) |
| Force–frequency shape | plateau, max 15–100 Hz | max 60 Hz, then falls to 0.57 | max 80 Hz | **plateau, 0.98 at 100 Hz** ✓ |
| Tetanus / twitch S · F | 5.4 · 2.6 | 9.2 · 3.2–3.5 | 20.6 · 10–11 | **4.6** ✓ · 4.3–4.7 ✗ |
| Ripple at 40 Hz S · F | S fused; F not (fusion ≈ 85 Hz) | 0.3 · 25–28 % | 0.3 · 0 % | 0.2 · **0 %** ✗ |

**Tension found (not resolved, on purpose).** The fast units now fuse completely at 40 Hz, against
Burke 1967 (F units fuse at ≈ 85 Hz). Their contraction time is ≈ 100–110 ms, against ≤ 30 ms (cat) or
16–17 ms (rat). The cause is the **composition** of the simulated pool, not the fit: with forces summed,
the 2 FF units (twitch amplitude 0.29–0.49) outweigh the 5 S units (0.10–0.12), so matching the slow
human soleus twitch stretches *every* unit's contraction time (the fit went from × 1.57 to × 1.66). A human
soleus is predominantly slow; reproducing that needs per-type composition and contraction times for human
soleus, which the verified sources do not give. Until then the fast units of this model are too slow.
The earlier ripple of fast units at 40 Hz (step 1) came from the summed-MUAP drive (Q2), not from physiology.

### Step 3 — clinical pulse width, and a solver fix

- Pulses of **0.3 ms** (FES of the quadriceps uses 300–600 µs: Doucet, Lam & Griffin 2012, *Yale J Biol
  Med* 85:201–215, PMID 22737049) at a supramaximal amplitude (1.5 × the amplitude at which every simulated
  unit fires).
- **Solver bug found and fixed:** with unbounded steps, the stiff solver stepped over short pulses
  (1 spike instead of 40 at 0.3 ms / 40 Hz). The step is now bounded by half the pulse width. This also
  removed the "missing spikes at 15–20 Hz" of the baseline (row 12), which were the same artefact.
- With 0.3 ms pulses the amplitude grades recruitment (9 units: first fires at 57.7, all at 99.4 µA/cm²).
- Pulse width barely changes force once supramaximal; motoneurons still fail to follow above 60 Hz with
  0.3 ms pulses, so that failure comes from injecting current into the soma (Q1), not from pulse width.

### Pool size and composition

The 9 simulated units (5 S / 2 FR / 2 FF, from `demangeMNs`) gave S units only 32 % of the twitch force,
while the model's own soleus pool (800 / 50 / 50) gives them 75 %. Verified composition data for human
soleus: **70–80 % slow fibres** (Gollnick et al. 1974, doi:10.1007/BF00587415, as cited by Brain Commun 2020,
doi:10.1093/braincomms/fcaa018) and **> 85 %** (Johnson et al. 1973, doi:10.1016/0022-510x(73)90023-3, as cited
by J Sport Health Sci 2013, doi:10.1016/j.jshs.2013.07.001) — the percentages are read in those open reviews,
the primary papers have no accessible abstract. The pool's 75 % is inside that range; the 5/2/2 sample was not.
No verifiable count of motor units in human soleus was found; the number simulated follows the modelling
convention of Potvin & Fuglevand 2017 (**120 units**, verified in the full text).

- `units_per_type = proportional_units(SOLEUS, 120)` → **106 S / 7 FR / 7 FF**.
- `represent_pool`: each simulated unit is weighted by the pool units it stands for (S 800/106, FR and FF
  50/7), so the summed force keeps the pool's composition and the scale of the whole muscle.
- Twitch re-fitted on this configuration (`validation/calibrate.py pool120`): × **1.2775**, **m = 3.9482**.
- Cost: 1 s of simulated time takes ≈ 24 s with 120 units (3.6 s with 9).

| Metric | Literature | rate-gain (9 units) | **pool120** |
|---|---|---|---|
| Fitted time scale | — | × 1.66 | **× 1.28** |
| S / FR / FF contraction time (ms) | S slow; F ≤ 30 (cat) | 170 / 102 / 111 | **132 / 80 / 86** |
| Twitch / tetanus, whole | 0.22 ± 0.02 | 0.21 | **0.21** ✓ |
| Force at 100 Hz / max | plateau | 0.98 | **1.00** ✓ |
| f50 (Hz) | 9.6 ± 0.6 (human MUs); ≈ 7 | 5.0 | **5.2** ✗ |
| Ripple at 40 Hz, fast units | F not fused (≈ 85 Hz) | 0 % | 0.1 % ✗ |

**Remaining conflict between two verified datasets.** With the Potvin & Fuglevand curve, half-maximal force
occurs at `NR ≈ 0.70`, i.e. `f50 ≈ 0.70 / CT`. Reaching Macefield's 9.6 Hz needs unit contraction times of
≈ 73 ms — which is what Macefield measured in human units (75 ms) — but then the whole-muscle twitch would be
much faster than the 112–129 ms measured for human triceps surae. The two datasets come from different
muscles (toe extensors vs triceps surae) and preparations (single axons vs whole nerve). One possible reason
for a slower whole-muscle twitch, **not verified here**, is tendon/series elasticity. Both targets are
available as an option — see "Calibration target" below.

### Step 4 — stimulation of motor axons (analytic recruitment layer)

Per the PhD project's choice of an analytic electrode model ("recruitment curve and strength–duration
relation", OE1), `stimulation_site = MOTOR_AXONS` replaces the current injected into the motoneuron soma (Q1)
by a recruitment layer (`domain/axon_stimulation.py`):

- **Strength–duration (Weiss):** a pulse of width `PW` excites an axon when its amplitude reaches
  `I_rh·(1 + τ_SD/PW)`. Weiss's formula fits human peripheral-nerve data and `τ_SD = 0.459 ms` is the
  mean for compound muscle action potentials (459 ± 126 µs, n = 20) — Mogyoros, Kiernan & Burke 1996,
  *Brain* 119:439–447, doi:10.1093/brain/119.2.439 (abstract).
- **Order:** non-selective and spatially fixed (Gregory & Bickel 2005, *Phys Ther* 85:358–364,
  doi:10.1093/ptj/85.4.358, abstract): rheobases are spread over a range and assigned in a seeded random
  order, independent of unit type.
- **Range — inherited, not literature:** no verified threshold-to-maximal current ratio was found, so the
  defaults reproduce the original model's own recruitment with 0.3 ms soma pulses (first unit 56.9, all
  units 102.1). The resulting force–amplitude curve at 40 Hz is therefore almost linear from 57 to 102
  (`validation/results/axons/recruitment.json`); its shape is a consequence of that assumption, not a
  validated result.
- The axon fires at the end of each suprathreshold pulse; no ODE is integrated (120 units: 1 s of
  simulated time in ≈ 2.5 s instead of ≈ 24 s).

| Metric | Literature | pool120 (soma) | **axons** |
|---|---|---|---|
| Units following 1:1 at 60 / 80 / 100 Hz | axons follow (nerve stimulation) | min 45 / 41 / 51 of 60 / 81 / 101 | **all, every pulse** ✓ |
| Twitch CT / HRT (ms) | 112–129 / 95–100 | 121 / 97 | 121 / 97 (re-fitted: × 1.2772, m = 3.9461) |
| Twitch / tetanus | 0.22 ± 0.02 | 0.21 | 0.21 ✓ |
| f50 (Hz) | 9.6 ± 0.6; ≈ 7 | 5.2 | **5.2** ✗ (unchanged) |

As expected when option (c) was chosen, moving the stimulus to the axons removes the high-frequency
failures but **does not change f50**, which depends on the units' contraction times: the conflict between
whole-muscle and single-unit human data described above is resolved by making the target an option
("Calibration target" below).

### Step 5 — peripheral fatigue

`fatigue = FatigueModel()` implements Potvin & Fuglevand 2017 (equations read in the full text):
nominal fatigability 0.0125–2.25 %/s (Eq 9; Burke et al.'s electrical-stimulation data, ×3 to express the
rate during activity), instantaneous fatigability × normalised force (Eq 10), contraction time +0.379 % per %
force loss (Eq 11, from electrically stimulated paralysed human soleus, Shields et al.), force capacity as the
integral (Eq 14). No recovery (not modelled in the paper either). `fixed_conduction_delay` fixes Q4, which
made the conduction delay grow with the simulated duration (4.4 s in a 4-min run).

Two adaptations to a twitch-based pool, ours and documented in `domain/fatigue.py`, were needed after the
first run failed the benchmarks (fatigue index 0.50 instead of 0.89):

1. **Fatigability follows twitch force**, not unit index: in the paper both grow exponentially with the
   index, so log-fatigability is linear in log-force (their Fig 1D); our soleus pool is 89 % S units of nearly
   equal force, and mapping by index made hundreds of them highly fatigable. Mapping by force is exactly Eq 9
   for the paper's own pool (tested).
2. **Pauses accrue no fatigue**: the per-spike integration counted the 670 ms off period of each train as
   firing at 1.5 Hz; an interval longer than four contraction times is now a pause (the paper's rate is 0).

| Protocol | Literature | **Model** (axons, 120 units, 0.3 ms, 153) |
|---|---|---|
| 20 Hz, 330 ms every 1 s, 4 min — whole-muscle fatigue index | **0.89 ± 0.08** acutely paralysed soleus, 0.19 ± 0.06 chronic (Chang & Shields 2011, doi:10.1177/1545968310390224; protocol of Shields 1995, doi:10.1152/jn.1995.73.6.2195 — the 2011 abstract does not restate it) | **0.85** ✓ (0.92 at 2 min) |
| 40 Hz, 33 % duty, 2 min — weakest unit | ≈ 0.995 (Potvin & Fuglevand's estimate from Burke et al. Fig 5) | **0.995** ✓ |
| same — strongest unit | ≈ 0.10 (same) | 0.19 ≈ (the strongest *simulated* unit sits at the centre of the top slice of the pool) |
| Mean capacity after 2 min, S · FR · FF | S resistant, FF fatigable (Burke) | 0.99 · 0.94 · 0.55 ✓ (qualitative) |

The model is a healthy (acute-like) soleus: reproducing the chronic-SCI fatigue index (0.19) needs the
slow-to-fast transformation of the paralysed muscle (Shields 2002; Chang & Shields 2011), not done here.

### Calibration target — whole muscle or single units

The two verified human datasets above cannot both be met by one twitch calibration, so the target is a
model option, `calibration_target` (API field `calibrationTarget`, LITERATURE only; no effect on ORIGINAL).
Only the twitch time scale and exponent change; everything else in `ModelOptions.literature()` is the same.

- `WHOLE_MUSCLE` (default, the values above): fitted to the twitch of the whole human triceps surae,
  CT 120.7 ms / HRT 97.3 ms (Sale 1982; Zoughaib 2026).
The fit depends on where the stimulus acts (`stimulationSite`): through the skin (axons, below) ×1.2772 / m 3.9461;
injected into the motoneurons (`pool120`) ×1.2775 / m 3.9482 for `WHOLE_MUSCLE`. The `SINGLE_UNIT` fit is the same for
both (×0.7426 / m 2.0862, `calibration-pool120-single-unit.json`): it depends only on each unit's twitch kernel.

- `SINGLE_UNIT`: fitted to the **mean twitch of single human motor units**, CT **74.8 ± 3.9** ms /
  HRT **78.6 ± 6.0** ms, 19 units of the toe extensors (Macefield, Fuglevand & Bigland-Ritchie 1996,
  PMID 8793760 — values read in the abstract). The mean is over the simulated units, each weighted by the pool
  units it represents (`validation/calibrate.py axons single-unit`): × **0.7426**, **m = 2.0862**.

| Metric | Literature | **WHOLE_MUSCLE** (axons) | **SINGLE_UNIT** (axons-single-unit) |
|---|---|---|---|
| Mean unit twitch CT / HRT (ms) | 74.8 / 78.6 (human units, toe extensors) | not fitted (S 132 / 96) | **74.8 / 78.6** (fitted) |
| Whole-muscle twitch CT / HRT (ms) | 112–129 / 95–100 (triceps surae) | **121 / 97** ✓ (fitted) | 71 / 80 ✗ (fast) |
| f50 (Hz) | 9.6 ± 0.6 (human units) | 5.2 ✗ | **9.2** ✓ |
| Twitch / tetanus, whole | 0.22 ± 0.02 (0.15–0.41) | 0.21 ✓ | 0.16 ≈ (inside the range, below the mean) |
| Force at 100 Hz / max | plateau | 1.00 ✓ | 0.99 ✓ |
| Frequency of max force (Hz) | 15–100 (median 50) | 15 | 30 |
| Shields 20 Hz, 4 min — fatigue index | 0.89 ± 0.08 | 0.85 ✓ | 0.88 ✓ (0.94 at 2 min) |
| Burke 40 Hz, 2 min — weakest / strongest unit | ≈ 0.995 / ≈ 0.10 | 0.995 / 0.19 | 0.995 / 0.19 (unchanged) |

How to choose: `WHOLE_MUSCLE` when the output compared with measurements is the twitch of the whole muscle
(time course of a single response); `SINGLE_UNIT` when it is the force–frequency relation (FES frequency
choice). Caveats: Macefield's units are from the toe extensors, not the soleus, and the f50 that they report
is of single units, compared here with the f50 of the whole simulated muscle. The explanation proposed above
for the gap between the two datasets (tendon/series elasticity) is still **not verified** and not modelled.
Results: `validation/results/axons-single-unit/`, `validation/results/fatigue-axons-single-unit/`,
`validation/results/calibration-axons-single-unit.json`.

### Conditions — per-article adjustments

`domain/conditions.py` turns the verified findings of `docs/research/disease-literature.md` into switchable
adjustments of the LITERATURE model. Only one is fitted; the others copy a published ratio.

| Condition | Adjustment (default) | Model change | Source (read) | Measured in |
|---|---|---|---|---|
| Chronic SCI | **Fatigability slow → fast** (on) | `fatigue.fast_shift = 0.997`: each unit's log-fatigability moved 99.7 % toward the most fatigable unit's; twitch force kept (fibre force preserved, Malisoux 2007) | Chang & Shields 2011, full text: soleus FI 0.19 ± 0.06 chronic vs 0.89 ± 0.08 acute | soleus, ASIA A ≥ 3 y |
| Chronic SCI | Faster twitch | CT × 0.86, HRT × 0.62 | Scott et al. 2006, abstract | quadriceps |
| Chronic SCI | Atrophy | force × 0.56 (1.36 / 2.44 kg) | Modlesky et al. 2004, abstract | thigh |
| Chronic SCI | Smaller τSD | Weiss τ 0.459 → 0.13 ms, rheobases kept — alone this *lowers* short-pulse thresholds, while the paper reports higher ones (no value in the abstract) | Lin et al. 2007, abstract (full text not accessible) | median/peroneal, nerve of the value not stated |
| Parkinson | **Motor unit loss** (on) | force × 0.845 (MUNIX 109 / 129); reinnervation not modelled | Krenovsky et al. 2020, abstract | hypothenar; group includes atypical parkinsonism |
| Parkinson | Polyneuropathy | force × 0.49 (tibial CMAP 5.35 / 10.90 mV, read as excitable axons) | Kwon et al. 2024, full text | tibial, PD with polyneuropathy only |
| Parkinson | Rest tremor 4–6 Hz | needs the central layer — not available | Zach et al. 2015 (review) | — |

**Fit of the SCI fatigability** (`validation/conditions.py`, `results/condition-sci-fatigability.json`): in Chang &
Shields's protocol (20 Hz, 330 ms every 1 s, FI = peak of train 120 / train 1) the unmodified model gives 0.916;
`fast_shift` 0.997 gives **0.192** (target 0.19). A uniform multiplier of every unit's fatigability was rejected:
reaching 0.19 needs ≈ ×100, which would make the fast units ~100× more fatigable than the published maximum, while the
shift leaves the most fatigable units where they are. Converting S units into FF units was also rejected: FF twitches
are 3–4× stronger, so the muscle force would rise, contrary to the preserved fibre force.

Not representable in this model (central): spasticity, rigidity, bradykinesia, tremor generation — see the central
layer design. Parkinson's peripheral data for leg muscles are weak: these adjustments are options, not a verified
Parkinsonian muscle.

## What this means for the next steps

The end-to-end system can be used now, but its force output should be read as **qualitative**.
Suggested order for the improvement phase (each change behind a flag, re-running this comparison):

1. Pick representative units instead of the first ones (Q8), and calibrate MTTP per type against
   Burke 1967 / Kanda 1992 (or human data if the target is human soleus).
2. Add force saturation (Fuglevand-style sigmoid gain) and drive each unit's twitch by its own spikes
   with unit weight (Q2, Q7); add tetanic force (MTF, currently unused).
3. Use clinical pulse widths (Q11) — and then the skin/electrode layer (Q1).
4. Then fatigue (Ding/Binder-Macleod) and the SCI-specific checks of row 13.

## Gaps in the literature extraction

Not read (paywalled or behind a captcha): per-type tables of Burke et al. 1973; full texts of Sale 1982,
Marsh 1981, Shields 1995/1997, Shields & Chang 1997; supplement of Zoughaib 2026 (normalised
force–frequency points). Consequently there is **no** published benchmark here for ripple values at
10/20/40 Hz or rise time at 40 Hz (model: ripple 15 % / 6 % / 4 %; rise to 90 % of plateau 380 ms).

## References

- Burke RE (1967). Motor unit types of cat triceps surae muscle. *J Physiol* 193:141–160. doi:10.1113/jphysiol.1967.sp008348
- Burke RE, Levine DN, Tsairis P, Zajac FE (1973). Physiological types and histochemical profiles in motor units of the cat gastrocnemius. *J Physiol* 234:723–748. doi:10.1113/jphysiol.1973.sp010369
- Kanda K, Hashizume K (1992). Factors causing difference in force output among motor units in the rat medial gastrocnemius muscle. *J Physiol* 448:677–695. doi:10.1113/jphysiol.1992.sp019064
- Chamberlain S, Lewis DM (1989). Contractile characteristics and innervation ratio of rat soleus motor units. *J Physiol* 412:1–21. doi:10.1113/jphysiol.1989.sp017601
- Kernell D, Eerbeek O, Verhey BA (1983). Relation between isometric force and stimulus rate in cat's hindlimb motor units of different twitch contraction time. *Exp Brain Res* 50:220–227. doi:10.1007/BF00239186
- Macefield VG, Fuglevand AJ, Bigland-Ritchie B (1996). Contractile properties of single motor units in human toe extensors assessed by intraneural motor axon stimulation. *J Neurophysiol* 75:2509–2519. doi:10.1152/jn.1996.75.6.2509
- Sale D, Quinlan J, Marsh E, McComas AJ, Belanger AY (1982). Influence of joint position on ankle plantarflexion in humans. *J Appl Physiol* 52:1636–1642. doi:10.1152/jappl.1982.52.6.1636
- Zoughaib WS et al. (2026). *Med Sci Sports Exerc*. doi:10.1249/MSS.0000000000003932
- Marsh E, Sale D, McComas AJ, Quinlan J (1981). Influence of joint position on ankle dorsiflexion in humans. *J Appl Physiol* 51:160–167. doi:10.1152/jappl.1981.51.1.160
- Fuglevand AJ, Winter DA, Patla AE (1993). Models of recruitment and rate coding organization in motor-unit pools. *J Neurophysiol* 70:2470–2488. doi:10.1152/jn.1993.70.6.2470
- Shields RK (2002). Muscular, skeletal, and neural adaptations following spinal cord injury. *J Orthop Sports Phys Ther* 32:65–74. doi:10.2519/jospt.2002.32.2.65
- Chang YJ, Shields RK (2011). Doublet electrical stimulation enhances torque production in people with spinal cord injury. *Neurorehabil Neural Repair* 25:423–432. doi:10.1177/1545968310390224 (PMID 21304018; the title was wrong here before — checked against Crossref and PubMed on 2026-11-05)
- Cope TC, Bodine SC, Fournier M, Edgerton VR (1986). Soleus motor units in chronic spinal transected cats. *J Neurophysiol* 55:1202–1220. doi:10.1152/jn.1986.55.6.1202

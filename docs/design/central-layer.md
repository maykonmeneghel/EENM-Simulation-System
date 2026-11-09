# Design: the central layer (descending drive, motoneuron pools, FES collision, wrist)

Status: **proposal, not implemented**. This is OE2 of the PhD project ("a wrist joint with the flexor/extensor carpi
radialis pair and a non-stationary Parkinsonian tremor generator"). Sources and values are in
`docs/research/central-layer-literature.md`; every number below comes from there, with its read level
(**FT** full text, **A** abstract only). Items marked **DECISION** need the author's choice before implementation.

## 1. Purpose and context of use

The engine today drives a single muscle from the stimulator only: surface FES excites the motor axons (Weiss law),
or the current is injected into the motoneurons (master's-thesis path). Neither path has a nervous system *behind*
the muscle. Tremor-suppression FES needs both at once:

- the **central command** — voluntary drive plus the Parkinsonian tremor oscillation — reaching two antagonist
  motoneuron pools (FCR, ECR), and
- the **stimulator** acting on the same motor axons, so that FES-evoked and centrally generated spikes meet.

Context of use (for the credibility plan, ASME V&V 40 / FDA 2023 in the proposal): an **in-silico plant** with which
controllers (open loop, phase-tracking counter-phase, adaptive MPC) are compared with everything else constant. The
plant must therefore reproduce tremor frequency, antagonist phase and FES suppression *ranges* reported in PD; it does
not have to predict an individual patient.

## 2. Signal path

```
 descending drive ──► FCR motoneuron pool ──► FCR axons ──┐            ┌──► FCR fibres ──► F_FCR ─┐
 (voluntary + tremor        (2-compartment HH)     ▲       │ collision  │   (twitch, rate gain,     │
  oscillator + noise) ──► ECR motoneuron pool ──► ECR axons ┼──────────┤    fatigue; % of max)    ├─► wrist joint ─► θ, ω, a
                                                    ▲       │            └──► ECR fibres ──► F_ECR ─┘   (1 DOF)
 stimulator (2 channels) ── FES pulses ─────────────┘ (Weiss recruitment at the electrode)
```

Existing modules reused unchanged: `motoneuron.py` (HH pool), `axon_stimulation.py` (Weiss recruitment), twitch,
rate gain, fatigue, `max_force.py`. New: descending drive, per-unit motoneuron input, the axon merge with collision,
two-muscle setup, the joint.

## 3. Components

### 3.1 Descending drive

Each motoneuron *k* of pool *p* receives a current

$$ I_k(t) = I_{bg} + I_{vol,p}(t) + g_p\,A_{tr}(t)\,\sin\!\big(\Phi(t) + \varphi_p\big) + \eta_k(t), \qquad \dot\Phi = 2\pi f_{tr}(t) $$

| Term | Value and source |
|---|---|
| Background `I_bg` | 3.5 nA, subthreshold (smallest-MN rheobase 4 nA) — Gallego et al. 2015, FT (same Cisi & Kohn motoneurons as ours) |
| Voluntary `I_vol` | 4.5–5.5 nA to the agonist in posture; 0 at rest — Gallego 2015, FT |
| Tremor amplitude `A_tr` | 3 nA sinusoid — Gallego 2015, FT (essential tremor model) |
| Tremor frequency `f_tr` | PD wrist 4.4 ± 1.0 Hz (Dideriksen et al. 2017, FT, n = 5); 5.9 ± 0.8 Hz rest, 6.1 ± 0.8 Hz posture (Agapaki et al. 2018, FT, n = 23) |
| Antagonist phase `φ_ECR − φ_FCR` | PD alternating (Milanov 2001, A); flexor–extensor burst delay 32.8 ± 12.8 % of the period (Dideriksen 2017, FT, PD + ET pooled) |
| Independent noise `η_k` | white noise low-passed < 100 Hz, SD ∝ mean current, tuned to ISI CV 10–30 % — Gallego 2015, FT |
| Non-stationarity | one central oscillator is enough; harmonic content set by burst variability and duration — Dideriksen et al. 2015, **A**; implemented as slow random walks of `f_tr` and `A_tr` and on/off bursts |

**DECISION 1 — units.** Gallego's currents are in nA into a soma; our HH motoneuron (`rates.m` lineage) takes a
current density (µA/cm²) that the stimulus also uses. Proposal: convert with each unit's absolute soma area, so the
nA values above apply as published. `build_group` computes that area but keeps only the soma/total area fraction
(`MotorUnitGroup.soma_area_fraction`), so the absolute area has to be stored as well.

**DECIDED (2026-11-06) — antagonist phase emerges from the Ia loop from the first version.** No phase parameter:
both pools receive the same central oscillator (`φ_p = 0`), and the alternation must arise from Ia reciprocal
inhibition, as Gallego 2015 shows (Ia afferents alone can carry tremor to an antagonist without supraspinal tremor
input). The 32.8 ± 12.8 % burst delay becomes a validation target instead of an input. This adds Section 3.6.

Not modelled: basal ganglia–thalamo–cortical loop (the proposal's Section 5.1 represents the pathology by its
peripheral consequence, the oscillatory descending drive).

### 3.2 Motoneuron pools (FCR, ECR)

The existing two-compartment pool, one per muscle. Change needed: today `MotoneuronPool.derivatives` gives **one**
current function to every unit; the drive above is per unit (noise), so the input becomes a vector `I(t) ∈ R^N`.

Pool sizes and per-type parameters of FCR/ECR: **no verified data yet** (step 3 of the plan: motor-unit number,
fibre-type %, twitch times for FCR/ECR). Gallego 2015 uses 180 motoneurons per muscle.

**Cost (measured 2026-11-05):** 9.2 s of computation per simulated second with 120 HH units; two pools ≈ 18 s/s.
The virtual population (OE3) × 3 controllers × repetitions makes this the main risk the proposal already lists.

**DECIDED (2026-11-06) — speed: compiled Hodgkin–Huxley.** Keep the master's-thesis motoneuron; (a) representative
units weighted by the pool they stand for (already used: 120 units); (b) a compiled right-hand side (Numba), target
≥ 10×; (c) only if still too slow, a reduced motoneuron validated against the HH pool (firing rate vs current, ISI
variability). Gate: one 4-s trial of both pools in ≤ 10 s.

### 3.3 Axon merge: FES-evoked and central spikes on the same axon

Every motor axon *k* now carries two spike sources:

- **orthodromic central spikes**, leaving the soma when the motoneuron fires;
- **FES spikes** generated at the electrode by the existing Weiss layer, which travel **orthodromically** to the
  muscle *and* **antidromically** toward the soma.

Algorithm (event-based, per axon; Formento et al. 2018, FT, sensory axons — applying it to motor axons is our step):

1. An FES pulse recruits the axon only if the axon is not refractory at the electrode (refractory period
   1.6 ± 0.16 ms, Formento 2018).
2. The antidromic FES spike and an orthodromic central spike travelling toward each other **annihilate** if they
   meet between soma and electrode, i.e. if the central spike left the soma less than `L_se / v` before the
   pulse (`L_se` soma–electrode length, `v` axon velocity).
3. An antidromic spike that reaches the soma **resets** the motoneuron (treated as a soma spike: the next interspike
   interval restarts). Measured in a deafferented patient on ECR: the interval containing the stimulus lengthens,
   most at 20–30 ms after a spike, followed by facilitation for up to 5 intervals (Mattei et al. 2003, **A**).
4. Orthodromic FES spikes and uncollided central spikes reach the muscle after their conduction delay; a fibre
   cannot follow two spikes within its refractory period.

Expected behaviour to check: collision probability from ~16 % (early-recruited units) to ~100 % (late-recruited)
in a pool under voluntary drive plus stimulation (Herbert & Gandevia 1999, **A**, model); nearly 100 % when the
stimulation rate is at or above the natural rate with 10–20 ms propagation times (Formento 2018, FT).

Lengths and velocities: efferent axons of wrist muscles 75 cm, velocities 60–100 m/s (Gallego 2015, FT) → 7.5–12.5
ms soma→muscle. **DECISION 4** — electrode position along the axon (`L_se`): forearm surface electrodes over the
muscle belly put the stimulation site near the muscle end; proposal: `L_se` = 90 % of the axon length, configurable.

Not in the first version (listed so the limitation is explicit):
- **Afferent volley.** Sub-motor-threshold stimulation alone reduced tremor by 35–48 % (Dosen et al. 2015, A) and
  52 % on average at its optimum (Dideriksen 2017, FT): part of FES tremor suppression is reflex, not motor. The
  plant without afferents will under-represent it.
- **Renshaw recurrent inhibition** between FCR and ECR exists in humans (Aymard et al. 1997, A; Katz et al. 1993, A).

### 3.4 Muscles

The existing per-unit force (twitch, rate saturation, fatigue) for each muscle, as **% of its maximal force**
(PR #7), turned into newtons with the peak isometric force: FCR 407.9 N, ECRL 337.3 N + ECRB 252.5 N = 589.8 N
(Saul et al. 2015, FT, doi:10.1080/10255842.2014.916698; reused by Corie & Charles 2019). These are **not** the
Holzbaur 2005 values: Saul 2015 fitted them to the muscle volumes and strength of 5 adult males (Holzbaur 2007) with a
specific tension of 50.8 N/cm², about three times the 17.1 N/cm² measured directly in living human muscle
(Binder-Markey et al. 2023, gracilis) — so PCSA × measured tension would not reproduce them.

**Motor-unit pool presets for FCR / ECR** (`docs/research/wrist-muscles-literature.md`): verified human data exist
only for FCR fibre types (slow 40.9 ± 17.4 %, IIA 29.7 ± 21.8 %, "fast-b" 29.4 ± 16.6 %, Mizuno 1994, FT, n = 7),
median-innervated wrist-flexor twitch timing (CT 67.3 ± 5.3 ms, HRT 57.6 ± 7.7 ms, Behrens 2019, FT, n = 18), ECR
single-unit contraction time (51.0 ± 21.7 ms, slow 63.7 ± 11.1, fast 25.6 ± 3.7 ms, Aimonetti 2000, FT, 25 units) and
the forces above. **No verified data** for motor-unit numbers, single-unit twitch force or HRT, f50, twitch/tetanus
ratio, healthy fatigue index under stimulation, muscle-specific conduction velocity, or anything in Parkinson's
disease. Those fields are inherited from the soleus preset and labelled so (Decision 6, implemented in
`domain/muscle_profiles.py`; fits in `validation/results/calibration-*-fcr.json`). Force–length/velocity (Hill, Millard 2013 in the proposal) are left out in v1:
tremor amplitudes are small around a fixed posture. Corie & Charles's second-order excitation–contraction filter
(30/40 ms) is **not** added: the twitch model already provides the activation dynamics.

### 3.5 Wrist joint (1 DOF, flexion–extension)

$$ I\,\ddot\theta + B\,\dot\theta + K\,\theta = r_{FCR}\,F_{FCR} - r_{ECR}\,F_{ECR} + \tau_{ext} $$

| Parameter | Value | Source |
|---|---|---|
| Inertia `I` | 0.003 kg·m² | Davidson & Charles 2017, FT (de Leva segments, 50th-percentile male) |
| Damping `B` | 0.028 N·m·s/rad | same |
| Stiffness `K` | 0.992 N·m/rad | same (from Drake & Charles 2014) |
| Moment arms | FCR +14.9 mm, ECR −11.5 mm (ECRL/ECRB mean) | Corie & Charles 2019, FT (Holzbaur 2005, in the proposal's list) |

Derived (ours): natural frequency √(K/I)/2π ≈ 2.9 Hz, damping ratio B / (2√(KI)) ≈ 0.26 — inside the 0.15–0.68 range
reported for the multi-DOF model (Davidson & Charles 2017). Tremor at 4–6 Hz is above the joint's natural frequency.

Outputs: θ, ω and the tangential acceleration at a sensor distance `d` from the wrist, plus the EMG of each muscle
(existing MUAP pipeline). **DECIDED (2026-11-06):** `d` = 8 cm (hand dorsum, where Agapaki 2018 placed the
accelerometer); the exact distance is not in the text read, so it is configurable and labelled as an assumption.

**Partly implemented 2026-11-06 (for the 3D step), single muscle:** `domain/wrist_joint.py`. The run's stimulated
muscle (FCR or ECR) drives the 1-DOF equation above with F = force / healthy maximum × peak isometric force. There is
no antagonist yet.

**Revised 2026-11-07** (with SCI and PD runs the wrist slammed into a 54° stop in ≈ 30 ms and rebounded ≈ 18° to the
other side — in every condition, NORMAL included):

- **Force–velocity.** F = F_iso · f_v(v), v = r θ' (rigid tendon), Thelen 2003 eqs. 6–7 as in OpenSim's
  `Thelen2003Muscle` (code read in full): Vmax = 10 optimal fibre lengths/s, Af = 0.25, Flen = 1.4, at full activation
  and optimal length. Optimal fibre length FCR 6.3 cm (Saul 2015, FT); ECR 7.2 cm (force-weighted mean of ECRL 8.1 and
  ECRB 5.9 cm, derived). Offline it delayed the arrival at the stop from 95 to 125 ms but left the rebound (−17°).
- **Peak force, a choice:** Saul 2015 (FT; specific tension 50.8 N/cm²) or the same × 17.1 / 50.8, the tension
  measured directly in living human gracilis (Binder-Markey et al. 2023, abstract): FCR ≈ 137 N. Corie & Charles 2019
  scale the 407.9 N by 0.33; their reason was not read, but 17.1 / 50.8 = 0.34 is close.
- **Passive moment, a choice:** the linear K above (measured with small perturbations) or Delp, Grierson & Buchanan
  1996 (J Biomech 29:1371, abstract): near zero in the central 150°, 0.5 N·m at 90° flexion, 1.2 N·m at 90°
  extension; drawn as zero to 75° and a quadratic through the two points (the shape is ours). The two disagree: K gives
  0.94 N·m at 54°, Delp ≈ 0. The linear spring is what throws the wrist to the other side after release.
- **Limits** 90° / 90° (where Delp measured; the anatomical maximum was not verified), replacing Ryu 1991's 54° / 60°
  (the angles daily tasks need, not the joint's range). A supramaximal FCR train still reaches the limit: 2–6 N·m
  against < 1 N·m of passive moment.

### 3.6 Ia afferent loop (spindles and reciprocal inhibition)

Needed from the first version because the antagonist phase must emerge from it (Section 3.1). Following Gallego
2015 (FT), which builds it on the same motoneurons:

| Element | Value and source |
|---|---|
| Spindles per muscle | 54, Mileusnic et al. 2006 spindle model; static/dynamic γ drive 6 × the α rate — Gallego 2015 |
| Ia afferent velocity, delay | 100 ± 10 m/s; Ia conduction delay 7.5 ms (75 cm) — Gallego 2015 |
| Ia inhibitory interneurons | 60 per muscle, each projecting to 20 % of the antagonist motoneurons; noise SD 0.15 nA (< 100 Hz); rate < 2 pps without Ia input — Gallego 2015 |
| Synapses | EPSC τ 0.5 ms, IPSC τ 1 ms; mean +1 nA / −2 nA; lognormal strengths (mean 1, variance 1); Ia EPSC twice as large in high-threshold motoneurons — Gallego 2015 |
| Loop delay (check) | efferent–afferent loop 198.7 ms at 4.5 nA voluntary drive (257.0 ms at 3.5 nA) — Gallego 2015, Table 1 |

Consequences: the spindles read **muscle length and velocity**, so the joint (3.5) closes the loop and muscle length
must be computed from θ with the moment arms (fibre length = optimal length − r·θ; tendon rigid in v1). The spindle
model (Mileusnic 2006) must be read in full before implementation; it is not yet in the verified extraction. FES
also excites Ia afferents (the afferent volley of 3.3) — once the loop exists, adding the stimulator's effect on the
afferents becomes possible and should be reconsidered.

## 4. Validation targets (per layer, against published data)

| Layer | Quantity | Target | Source |
|---|---|---|---|
| Drive → joint | Tremor frequency at the wrist | 4.4 ± 1.0 Hz (rest task); 5.9 ± 0.8 Hz (rest), 6.1 ± 0.8 Hz (posture) | Dideriksen 2017 FT; Agapaki 2018 FT |
| Drive → joint | Tremor acceleration (hand dorsum) | 0.84 m/s² rest, 0.96 m/s² posture (controls 0.16) | Agapaki 2018 FT |
| Pools | FCR–ECR burst delay | 32.8 ± 12.8 % of the period | Dideriksen 2017 FT |
| Pools | Motor unit–EMG coherence at the tremor frequency | 0.73 ± 0.18 rest, 0.76 ± 0.16 posture | Agapaki 2018 FT |
| Pools | Doublet / triplet interspike interval | 41.6 ± 5.1 ms / 42.0 ± 4.3 ms; motor unit rate 10.9 ± 2.9 Hz | Agapaki 2018 FT |
| Collision | Probability vs recruitment rank | ~16 % → ~100 % | Herbert & Gandevia 1999 A (model; qualitative) |
| FES | Tremor reduction with out-of-phase FES | PD 62 % (Javidan 1992, A); 67 ± 13 % (Popović Maneski 2011, A) | in the proposal's list |
| FES | Co-contraction FES | residual tremor power 52.3 ± 25.5 % of baseline (Gallego 2013, FT — note: residual, not reduction) | in the proposal's list |

Gaps (no verified data): PD wrist tremor amplitude in degrees/rad/s with SD; PD-specific wrist impedance; the split
between common and independent input in PD; measured collision during surface FES; FCR/ECR motor unit numbers,
fibre types and twitch times.

## 5. Interfaces (sketch)

Request additions (all optional; absent = today's single-muscle behaviour):

```json
{
  "plant": "WRIST",
  "centralDrive": {
    "voluntary": { "FCR": 0.0, "ECR": 0.0 },
    "tremor": { "frequencyHz": 4.4, "amplitudeNa": 3.0, "phaseLagPercent": 33, "nonStationary": true },
    "noiseCv": 0.2
  },
  "stimulus": { "FCR": { … }, "ECR": { … } },
  "joint": { "sensorDistanceCm": 8 }
}
```

Stream additions: θ, ω, sensor acceleration, per-muscle force (%, N) and EMG, collision counts. The UI gains a
two-channel Estimulador and a joint panel; the `PD_TREMOR` condition adjustment becomes available.

## 6. Phases and gates

1. **Per-unit motoneuron input + compiled HH.** Gate: firing of the existing pool unchanged with a constant input
   (regression to the Octave-checked behaviour), one 4-s two-pool trial ≤ 10 s.
2. **Descending drive** (3.1). Gate: motor unit rate, ISI CV 10–30 %, doublets within the Agapaki ranges.
   **Implemented 2026-11-06; gate passed with the Cisi & Kohn (2008) motoneuron** (author's choice, Decision 3c:
   a different motoneuron for the drive; `domain/cisi_kohn.py`, `docs/research/cisi-kohn-motoneuron.md`):
   rest tremor → units at 7.0 Hz (2.9–10.8; target 10.9 ± 2.9, range 6–18.5) ✓, short ISIs 49.7 ms (doublets
   41.6 ± 5.1, range 30–50) ✓, tonic ISI CV 0.15 ✓, force at 4.33 Hz for a 4.4 Hz drive ✓. The inherited Booth 1997
   motoneuron (50–95 Hz, bistable) stays only for the invasive mode without a drive
   (`validation/results/central-drive-booth1997.json`).
3. **FCR/ECR muscles** (step 3 research) and **joint** (3.4–3.5), open loop. Gate: tremor frequency inside the
   Section 4 targets with a phase-free common drive (antagonists in phase at this stage — expected).
4. **Ia loop** (3.6: spindles, Ia interneurons, reciprocal inhibition). Gate: FCR–ECR burst delay 32.8 ± 12.8 %,
   coherence and acceleration inside the targets, without FES.
5. **Axon merge with collision** (3.3). Gate: unit tests of the event rules; collision vs rank as Herbert & Gandevia.
   **Rules 1–4 implemented 2026-11-06**, ahead of phases 3–4, so the non-invasive mode can carry the tremor
   (`_integrate_merged` in `infrastructure/compiled_motoneuron.py`; scripted tests of each rule in
   `tests/unit/test_central_drive.py`, each caught by a negative probe). The antidromic reset is a 0.3 ms soma current
   whose spike is not sent. Not done yet: collision vs rank against Herbert & Gandevia.
6. **FES on the wrist** (two channels) — open-loop suppression in the published range. Then the controllers (OE4).

## 7. Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Drive units: nA converted through each unit's absolute soma area | default (technical) |
| 2 | Antagonist phase emerges from the Ia loop from the first version | **decided by the author, 2026-11-06** |
| 3 | Speed: compiled HH (Numba), reduced model only if the 10-s gate fails | **decided by the author, 2026-11-06** |
| 4 | Electrode at 90 % of the axon length, configurable | default (technical) |
| 5 | Sensor 8 cm from the wrist (hand dorsum), configurable, labelled an assumption | **decided by the author, 2026-11-06** |
| 6 | FCR/ECR presets: verified values where they exist (FCR fibre types → unit proportions, FCR twitch fitted to Behrens 2019, ECR unit CT to Aimonetti 2000); every other field inherited from the soleus and labelled so in the app (`domain/muscle_profiles.py`) | **decided by the author, 2026-11-06** |

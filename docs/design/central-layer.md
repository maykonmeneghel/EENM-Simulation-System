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

**DECISION 2 — antagonist phase.** (a) an explicit phase `φ` per pool (simple, directly matches the 32.8 % target);
or (b) let it emerge from Ia reciprocal inhibition as in Gallego 2015 (needs spindles, Ia interneurons and the
afferent loop — 60 interneurons, Ia delay 7.5 ms). Proposal: (a) first; (b) as a later refinement.

Not modelled: basal ganglia–thalamo–cortical loop (the proposal's Section 5.1 represents the pathology by its
peripheral consequence, the oscillatory descending drive).

### 3.2 Motoneuron pools (FCR, ECR)

The existing two-compartment pool, one per muscle. Change needed: today `MotoneuronPool.derivatives` gives **one**
current function to every unit; the drive above is per unit (noise), so the input becomes a vector `I(t) ∈ R^N`.

Pool sizes and per-type parameters of FCR/ECR: **no verified data yet** (step 3 of the plan: motor-unit number,
fibre-type %, twitch times for FCR/ECR). Gallego 2015 uses 180 motoneurons per muscle.

**Cost (measured 2026-11-05):** 9.2 s of computation per simulated second with 120 HH units; two pools ≈ 18 s/s.
The virtual population (OE3) × 3 controllers × repetitions makes this the main risk the proposal already lists.

**DECISION 3 — speed.** In order: (a) representative units weighted by the pool they stand for (already used for
the corrected model: 120 units); (b) a compiled right-hand side (Numba) — target ≥ 10×; (c) only if still too slow,
a reduced motoneuron validated against the HH pool on firing rate vs current and ISI variability. Gate: one
4-s trial of both pools in ≤ 10 s.

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
(PR #7), turned into newtons with the peak isometric force: FCR 407.9 N, ECRB + ECRL 589.8 N (Corie & Charles 2019,
FT, from the Holzbaur upper-limb model). Force–length/velocity (Hill, Millard 2013 in the proposal) are left out in v1:
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

Outputs: θ, ω and the tangential acceleration at a sensor distance `d` from the wrist (needed to compare with
accelerometer data; **DECISION 5**: `d`, e.g. hand dorsum), plus the EMG of each muscle (existing MUAP pipeline).

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

1. **Per-unit motoneuron input + speed** (Decision 3). Gate: firing of the existing pool unchanged with a constant
   input (regression), one 4-s two-pool trial ≤ 10 s.
2. **Descending drive** (3.1). Gate: motor unit rate, ISI CV 10–30 %, doublets within the Agapaki ranges.
3. **Axon merge with collision** (3.3). Gate: unit tests of the event rules; collision vs rank qualitatively as
   Herbert & Gandevia.
4. **FCR/ECR muscles** (step 3 research) and **joint** (3.4–3.5). Gate: tremor frequency, acceleration and burst delay
   inside the targets of Section 4 without FES.
5. **FES on the wrist** (two channels) — open-loop suppression in the published range. Then the controllers (OE4).

## 7. Decisions for the author

1. Units of the drive: convert nA via soma area (proposed).
2. Antagonist phase: explicit parameter first, Ia loop later (proposed).
3. Speed path: weights → Numba → reduced model if needed (proposed), with the 10 s gate.
4. Electrode position along the axon: 90 % of the length, configurable (proposed).
5. Accelerometer distance from the wrist for comparison with Agapaki 2018.

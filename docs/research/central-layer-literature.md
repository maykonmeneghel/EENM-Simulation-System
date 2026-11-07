# Central-layer literature: descending drive, tremor drive, FES–motoneuron interaction, wrist mechanics

Compiled 2026-11-05. Every number below was read in the source named. Read level: **A** = PubMed abstract only, **FT** = full text read (Europe PMC XML or PMC HTML). "In ref list" = already in the proposal's reference list.

Retrieval: PubMed E-utilities (esearch/esummary/efetch) and Europe PMC REST (`fullTextXML`), plus PMC HTML for author manuscripts. Publisher sites returned 403 (for example, journals.physiology.org for Herbert & Gandevia 1999).

---

## Q1. Antidromic collision, recurrent effects and afferent volleys during FES

### 1a. Verified quantitative findings

| Quantity | Value | n / population | Muscle / site | Source (PMID, DOI) | Read | In ref list |
|---|---|---|---|---|---|---|
| Probability that an antidromic stimulus volley collides with an orthodromic MN spike (simulated) | ~16% in early-recruited MNs up to ~100% in late-recruited MNs | computer model of the MN pool | adductor pollicis | Herbert & Gandevia 1999 J Neurophysiol 82:2271; PMID 10561405; 10.1152/jn.1999.82.5.2271 | A | no |
| Interpolated twitch in a simulated MVC | 4.7% of the resting twitch; almost fully occluded when the mean peak firing rate was raised to ~60 Hz | model | adductor pollicis | same | A | no |
| Effect of removing collisions from that model | interpolated twitch amplitude rose slightly and time-to-peak was longer; reflex effects were not modelled | model | adductor pollicis | same | A | no |
| How an axon collision model works (sensory afferents, but the logic carries over to motor axons) | each stimulus recruits the fibre only if it is not refractory; refractory period 1.6 ± 0.16 ms (mean ± SD); an antidromic AP meeting an orthodromic AP cancels both; collision probability = f(stimulation frequency, natural firing rate, end-to-end propagation time) | model | propagation time 2 ms (rat), 10 ms (human proximal), 20 ms (human distal), 16 ms (human ankle afferents) | Formento et al. 2018 Nat Neurosci 21:1728; PMID 30382196; 10.1038/s41593-018-0262-6 (PMC6268129) | FT | no |
| Collision probability in human distal afferents | "nearly 100%" at a natural rate of 30 imp/s with 30 Hz stimulation; never above 20% in rat at 40 Hz | model | epidural SCS | same | FT | no |
| Antidromic motor-axon stimulation of ECR in a deafferented patient (pure motor-axon effect, no Ia) | biphasic inhibition: an early short component, then a longer component 20–40 ms later. The ISI containing the stimulus lengthened. Most effective 20–30 ms after a spike, less effective at 70–100 ms. The lengthening could extend over 1–2 following ISIs, then shortening (facilitation) for up to 5 ISIs | 1 patient, 21 single MUs | ECR (radial nerve) | Mattei et al. 2003 J Physiol 549:975; PMID 12702741; 10.1113/jphysiol.2003.039040 | A | no |
| Recurrent (Renshaw) inhibition between FCR and ECR | antagonistic motor volleys (just below MT up to 0.5 Mmax) gave early, long-lasting inhibition in wrist motor nuclei but none at the elbow. The authors' interpretation is that FCR-coupled Renshaw cells inhibit ECR MNs and vice versa | healthy humans | FCR, ECR, biceps, triceps | Aymard et al. 1997 J Physiol 499:267; PMID 9061654; 10.1113/jphysiol.1997.sp021925 | A | no |
| Homonymous recurrent inhibition | present in FCR, ECR, FCU, ECU (absent in OP, ADM); wrist MNs project recurrent inhibition to proximal nuclei but receive none from them | 25 healthy | upper limb | Katz et al. 1993 Acta Physiol Scand 149:183; PMID 8266808; 10.1111/j.1748-1716.1993.tb09611.x | A | no |
| Recurrent IPSPs in primate upper-limb MNs | weak to wrist and digit extensors; the recurrent loop carried up to 100 Hz with a coherence peak near 20 Hz; flexor↔extensor recurrent connections were sometimes present | 89 MNs, 4 macaques | cervical enlargement | Edgley et al. 2021 J Neurosci 41:1443; PMID 33334866; 10.1523/JNEUROSCI.1589-20.2020 | A | no |
| Supramaximal median-nerve shock during wrist tremor | EMG inhibited for 90–210 ms (inversely related to tremor frequency), then resynchronised; resetting index did not differ between ET, PD and mimicking subjects | 10 ET, 9 PD, 8 controls | forearm flexors | Britton et al. 1993 JNNP 56:1085; PMID 8410007; 10.1136/jnnp.56.10.1085 | A | no |
| Central (reflex-mediated) torque in NMES | absent at ≤ 20 Hz, maximal at ≥ 80 Hz; up to 10.7 ± 5.5 %MVC (20 s, 100 Hz). The authors advise low intensity "to avoid antidromic block" | 8 healthy | triceps surae | Dean et al. 2007 J Appl Physiol 103:170; PMID 17463296; 10.1152/japplphysiol.01361.2006 | A | no |

### 1b. Qualitative or mechanistic statements (no numbers)

- **Bergquist et al. 2011** (Eur J Appl Physiol 111:2409; PMID 21805156; 10.1007/s00421-011-2087-9; **A**; not in ref list). NMES works through a peripheral pathway (motor axons) and a central pathway (sensory volley through the spinal cord). The balance between them depends on the stimulation parameters and on site (nerve trunk vs muscle belly). There is no number in the abstract. The full text is not open access.
- **Pascual-Valdunciel et al. 2021 review** (J NeuroEng Rehabil 18:33; PMID 33588841; 10.1186/s12984-021-00811-9; **FT**; in ref list). It names four mechanisms:
  - (b) FES generates antagonist force and raises joint impedance;
  - (c) Ia afferent stimulation lowers antagonist MN-pool excitability through reciprocal inhibition;
  - (d) cutaneous afferents inhibit propriospinal interneurons (Hao et al.);
  - single shocks "reset" the central oscillator (Britton, Mones).

  **The review never mentions antidromic collision or Renshaw recurrent inhibition** (full-text grep for "antidrom", "collision", "Renshaw" found nothing).
- **Dideriksen et al. 2017** (Front Neurosci 11:178; PMID 28420958; 10.3389/fnins.2017.00178; **FT**; not in ref list). This is a conceptual Ia model: homonymous excitation plus reciprocal inhibition of the antagonist, timed out of phase with the tremor bursts. Stimulation settings:
  - intensity set by the H-reflex recruitment curve (low vs high H-reflex);
  - 100 Hz trains, burst = 20% or 40% of the tremor period;
  - train centred 15 ms before the predicted EMG burst centre to allow for conduction delay.

  The M-wave could not be discriminated, so the authors say some motor-axon activation cannot be ruled out. Collision is not discussed.
- **Gallego et al. 2015 model** (Q2) explicitly leaves out Renshaw inhibition (see "Model limitations" in that paper).

### 1c. Does the afferent volley matter for wrist FES tremor suppression?

Yes. Sub-motor-threshold (afferent) stimulation alone suppresses wrist tremor:

| Study | Stimulation | Outcome (as reported) | n | Read |
|---|---|---|---|---|
| Dosen et al. 2015 IEEE TNSRE 23:385; PMID 25051555; 10.1109/TNSRE.2014.2328296 (in ref list) | out-of-phase, EMG-triggered, above vs below MT | average tremor reduction 46–81% (motor) and 35–48% (sensory) "across five patients"; no effect in 1 of 6 | 4 PD + 2 ET, wrist flex/ext | A |
| Dideriksen et al. 2017 (above) | below MT, H-reflex-calibrated, surface or intramuscular | significant suppression in 6/9 patients; >75% in 3; average optimal suppression 52%; out-of-phase timing was no better than random timing | 5 PD + 4 ET | FT |
| same, as summarised in the P-V 2021 review | | 54 ± 20% (intramuscular), 50 ± 41% (surface) | | FT (review) |

**No computational model that combines FES-evoked antidromic collision with voluntary or tremor drive in a tremor context was found.** Search strings tried: "antidromic collision model electrical stimulation motoneuron"; "antidromic AND (NMES OR FES) AND voluntary"; "electrical stimulation AND tremor AND (antidromic OR collision)"; "computational model AND electrical stimulation AND voluntary AND motor unit pool AND (antidromic OR collision)". The nearest models are Herbert & Gandevia 1999 (motor axons, voluntary + stimulus, abstract only) and Formento 2018 (sensory axons, full text, implementable algorithm).

**NO VERIFIED DATA** on:
- measured motor-axon conduction times for FCR/ECR;
- the size of the collision window in human wrist FES;
- the measured effect of FES-induced collision on tremor output.

---

## Q2. Models of tremor as a common oscillatory input to motoneurons

### 2a. Gallego et al. 2015, J Neurosci 35:8925 (PMID 26063924; 10.1523/JNEUROSCI.0106-15.2015; PMC6605200; **FT**; not in ref list; ET patients)

This is the most directly reusable model: it uses **Cisi & Kohn 2008 two-compartment HH MNs**, the same lineage as our model.

| Parameter | Value |
|---|---|
| MN model | 2-compartment HH (Cisi & Kohn 2008); parameters exponentially distributed across the pool (Fuglevand 1993) |
| MNs per muscle | 180 |
| Ia inhibitory interneurons | 60, each projecting to 20% of the antagonist MNs |
| Efferent / afferent axon length | 75 cm ("muscles acting on the wrist") |
| MN axon conduction velocity | exponentially distributed, 60–100 m/s |
| Ia conduction velocity | 100 ± 10 m/s (normal distribution); Ia conduction delay 7.5 ms |
| Spindles per muscle | 54 (Mileusnic 2006 model); gamma rate = 6 × the α rate |
| Background (subthreshold) current | 3.5 nA; rheobase of the smallest MN 4 nA |
| Voluntary ("postural") drive | 4.5 or 5.5 nA to pool 1 (3.5 nA to pool 2) |
| Tremor drive | sinusoidal current, 5 Hz, amplitude 3 nA, gain 1 to pool 1; gain to pool 2 from 0 to 1 in 12 steps |
| Independent noise | white noise low-passed below 100 Hz, SD proportional to the mean current, tuned so ISI CV = 10–30% |
| Interneuron noise | SD 0.15 nA (<100 Hz); interneuron rate <2 pps without Ia input |
| Synapses | EPSC τ 0.5 ms, IPSC τ 1 ms; mean amplitudes +1 nA and −2 nA; lognormal strength (mean 1, variance 1); Ia EPSC twice as large in high-threshold MNs |
| Muscle | Fuglevand 1993 twitch force; MVC 40 N (22.5 N/cm², PCSA 1.8 cm²); 100-fold twitch range; Zajac force–length/velocity |
| Limb | antagonist pair acting on a 50 g mass ("finger"); tendon plateau stiffness 6000 N/m above 3% strain; fibre viscosity 20 N·s/m; optimal fibre and tendon slack length 30 mm |
| Run length | 108 simulations of 4 s each; last 3 s analysed |
| Simulated tremor frequency | 4.98 ± 0.25 Hz |
| Model delays (Table 1, I1 = 4.5 nA) | MN CST → force 86.0 ± 0.4 ms; total efferent–afferent loop 198.7 ms (257.0 ms at 3.5 nA; 191.1 ms at 5.5 nA) |
| Main finding | without voluntary drive (rest), antagonist drives are more likely in phase; with voluntary drive (posture), more likely out of phase. Ia afferents alone can carry tremor to an antagonist that receives no supraspinal tremor input |
| Validation (11 ET) | postural: antagonist phase difference 130.8 ± 48.3° (circular mean ± SD; 13/20 pairs near out-of-phase); rest: 34.84 ± 40.14° (7/8 near in-phase); inter-pool CST coherence at the tremor frequency 0.600 ± 0.169 (n = 20 pairs) |

### 2b. Other tremor-drive models and motor-unit validation targets

| Source | What was verified | Read | In ref list |
|---|---|---|---|
| Dideriksen et al. 2015 J Neural Eng 12:046019; PMID 26061277; 10.1088/1741-2560/12/4/046019 | One central oscillator at the tremor frequency explains the harmonic content of the neural drive; a second oscillator at twice the frequency is not needed. Relative harmonic power is set by the variability and duration of tremor bursts. 22 patients (11 ET, 11 PD); wrist angular velocity + HD-sEMG; ET-vs-PD classification accuracy 86% | A (full text not open access) | no |
| Dideriksen, Enoka & Farina 2011 IEEE TBME 58(8); PMID 21342835; 10.1109/TBME.2011.2118756 | Multi-scale model: antagonist pair, voluntary command + "oscillatory noise in the descending signal" + afferent feedback, freely moving limb. Reproduces EMG PSD, angular velocity and single-MU behaviour. **No parameter values in the abstract** | A | no |
| Gallego et al. 2011 EMBC; PMID 22254736; 10.1109/IEMBS.2011.6090375 | A common central oscillator to all MNs produces doublets and higher synchronisation; the oscillator is transmitted "linearly" when 7–8 MNs are sampled | A | no |
| Gallego et al. 2015 J Neurophysiol 113:182; PMID 25274343; 10.1152/jn.00531.2014 | In ET (n = 9), MU short-term synchronisation is higher than in healthy subjects and is driven by common input at the tremor frequency. Cortical input is present but uncorrelated with net common input. No numbers in the abstract | A | no |
| Puttaraksa et al. 2019 J Neurophysiol; PMID 31509467; 10.1152/jn.00407.2019 (PMC6998026) | ET, n = 15, forearm flexors/extensors during postural tremor. Intramuscular MU coherence 0.2 ± 0.2 at 1–3 Hz (voluntary) and 0.6 ± 0.3 at 3–10 Hz (tremor) (mean ± SD). Within-muscle phase 3.3 ± 25.2° / 3.9 ± 22.0°. Antagonist phase 0.6 ± 48.8° (voluntary band) vs 126.9 ± 75.6° (tremor band) | FT (abstract section) | no |
| Hao et al. 2013 PLoS One 8:e79829; PMID 24278189; 10.1371/journal.pone.0079829 (PMC3835930) | **PD-specific** model. Sinusoidal cortical inputs at the single tremor frequency (3–8 Hz; nominal 5 Hz) and double frequency (6–16 Hz), normalised 0–1, zero phase shift. Without a C3–C4 propriospinal network the antagonists co-contract; with it they alternate. Validation: 7 PD patients, tremor 3.8–5.4 Hz (mean 4.6 Hz) | FT | no |
| Christakos et al. 2009 J Physiol 587:4811; PMID 19703960; 10.1113/jphysiol.2009.173989 | PD (n = 19), isometric finger-muscle force tremor. In-phase MU rhythms, synchrony above normal, rhythmic doublets/triplets with mean intra-burst ISI "fairly fixed around 50 ms" | A | no |
| Agapaki et al. 2018 Front Hum Neurosci 12:179; PMID 29780311; 10.3389/fnhum.2018.00179 (PMC5946021) | **PD, n = 23, wrist/digit muscles including FCR and ECR** (see Q3 for numbers). Tremor alternates between epoch-II (4–8 Hz overt tremor, high synchrony, doublets/triplets 1:1 with cycles) and epoch-I (6–10 Hz physiological-like tremor). MU discharge vs sEMG lag −2 ± 12 ms (N = 66), i.e. in phase. Doublet ISI 41.6 ± 5.1 ms, triplet ISI 42.0 ± 4.3 ms (one MU; N = 526 and 208); per-patient range 30–50 ms | FT | no |

**NO VERIFIED DATA** on the fraction of PD motor units phase-locked to tremor, or on the split between common and independent input in PD. Gallego 2015 and Puttaraksa 2019 are ET; Dideriksen 2015 (PD + ET) was read only as an abstract.

---

## Q3. Validation targets at the wrist in PD, and FES outcomes

### 3a. PD tremor frequency, amplitude and EMG pattern

| Quantity | Value | n / condition | Site | Source | Read | In ref list |
|---|---|---|---|---|---|---|
| Wrist tremor frequency (PD) | **4.4 ± 1.0 Hz** (mean ± SD) | 5 PD, rest-type task (hand hanging) | wrist flex/ext | Dideriksen 2017 (PMID 28420958) | FT | no |
| Flexor–extensor burst delay | 32.8 ± 12.8% of the tremor period (range 13.7–49.7%; 50% = perfect out-of-phase) | 5 patients (2 ET + 3 PD pooled) | wrist flexors/extensors | same | FT | no |
| Primary tremor frequency, rest | 5.9 (0.80) Hz, range 4.5–7.0 | PD, 32 recordings | hand dorsum accelerometer | Agapaki 2018 (PMID 29780311) | FT | no |
| Primary tremor frequency, posture | 6.1 (0.84) Hz, range 4.5–7.0 | PD, 31 recordings | same | same | FT | no |
| Tremor acceleration amplitude, rest | 0.843 (0.056) m/s², range 0.252–2.309 | PD, 32 recordings | same | same | FT | no |
| Tremor acceleration amplitude, posture | 0.958 (0.076) m/s², range 0.376–3.085 | PD, 31 recordings | same | same | FT | no |
| Same in controls (physiological) | 0.156 (0.072) m/s²; frequency 8.2 (0.93) Hz | 34 recordings | same | same | FT | no |
| MU firing rate, PD | 10.9 (2.9) Hz, range 6.0–18.5 | PD | FCR/ECR/EDC/FDS | same | FT | no |
| MU/EMG coherence at the primary tremor frequency | rest 0.73 (0.18); posture 0.76 (0.16) | PD | same | same | FT | no |
| Tremor frequency per PD patient | ~3.5 Hz and ~4.8 Hz | 2 PD | wrist (gyroscope) | Gallego 2013 (PMID 23587119) | FT | **yes** |
| Tremor frequency, PD | 3.8–5.4 Hz, mean 4.6 Hz | 7 PD | arm (shoulder/elbow) | Hao 2013 (PMID 24278189) | FT | no |
| Annual decline of rest-tremor frequency | 0.09 Hz/year (postural 0.08; ET 0.12) | 53 PD, 38 ET, mean follow-up 44.9 months | accelerometry/EMG | Hellwig et al. 2009 Clin Neurophysiol 120:431; PMID 19101200; 10.1016/j.clinph.2008.11.002 | A | no |
| EMG pattern | PD tremor falls in the "alternating" antagonist group (ET type A synchronous, ET type B alternating) | 110 PD out of 525 patients | most affected part | Milanov 2001 Clin Neurophysiol 112:1626; PMID 11514245; 10.1016/S1388-2457(01)00629-0 | A | no |
| EMG pattern within the arm | PD: reciprocal alternation between forearm flexor and upper-arm extensor, vs co-contraction between hand flexors and triceps; intra-limb coherence in 70% of PD | 22 PD, 28 ET | arm muscles | Raethjen et al. 2000 Mov Disord 15:84; PMID 10634246 | A | no |

Background reviews read as abstracts only, with no numbers used: Deuschl et al. 2000 J Neurol 247 Suppl 5:V33 (PMID 11081802; in ref list as "Deuschl 2000"), Dirkx & Bologna 2022 (PMID 35240491; in ref list) and Helmich 2012 Brain (PMID 22382359; in ref list).

**NO VERIFIED DATA** on PD wrist tremor amplitude in degrees or rad/s with SD. Agapaki gives acceleration only. Jitkritsadakul 2017 and Keba 2025 (PMID 40142880, full text checked) report angular velocity only in figures or as percentages.

### 3b. FES / electrical-stimulation tremor-suppression outcomes

| Study | Population | Strategy | Reported outcome (primary source) | Read | Secondary-source numbers | In ref list |
|---|---|---|---|---|---|---|
| Prochazka et al. 1992 Ann Biomed Eng 20:205; PMID 1575377; 10.1007/BF02368521 | method paper | closed-loop out-of-phase FES, wrist/elbow | loop designs attenuated **2–5 Hz** tremor and only minimally attenuated 0–1 Hz movement | A | — | yes |
| Javidan et al. 1992 Ann Biomed Eng 20:225; PMID 1575378; 10.1007/BF02368522 | ET, PD, MS-cerebellar | same | attenuation ET **73%**, PD **62%**, cerebellar **38%** | A | P-V 2021: 73 ± 14% (ET), 62 ± 5% (PD), 62 ± 38% (cerebellar), 3 ET/4 PD/6 cerebellar. Dideriksen 2017: pooled 53 ± 25% | yes |
| Popović Maneski et al. 2011 Med Biol Eng Comput 49:1187; PMID 21755318; 10.1007/s11517-011-0803-6 | 7 PD + ET | adaptive out-of-phase, wrist | **67 ± 13%** amplitude decrease in 6/7 | A | P-V: 3 ET, 4 PD; 250 µs, 40 Hz | yes |
| Gallego et al. 2013 J NeuroEng Rehabil 10:36; PMID 23587119; 10.1186/1743-0003-10-36 | 4 ET + 2 PD | co-contraction FES on FCU + ECR; 300 µs/40 pps or 250 µs/30 pps | **Ratt = 52.33 ± 25.48%**, where Ratt = residual tremor PSD integral (on/off). Consistent reduction in 26/30 trials; tremor frequency unchanged (p = 0.831) | FT | P-V and Dideriksen tables list this as a "52% reduction" (see Conflicts) | yes |
| Bó et al. 2014 Artif Organs 38:984; PMID 24571719; 10.1111/aor.12261 | 10 ET | fixed-intensity co-contraction | consistent attenuation in **8/10**; abstract gives no % | A | P-V: 37.18–94.68% (most significant); Dideriksen: 60 ± 27% | yes |
| Dosen et al. 2015 (above) | 4 PD + 2 ET | out-of-phase, motor vs sensory | 46–81% (motor), 35–48% (sensory), across 5 patients | A | P-V and Dideriksen: 60 ± 14% (>MT), 42 ± 5% (<MT) | yes |
| Jitkritsadakul et al. 2017 J Neurol Sci 381:331; PMID 28991711; 10.1016/j.jns.2017.08.3246 | 30 PD (15 active, 15 sham) | "Tremor's glove" EMS, 30 min | significant reduction in RMS angular velocity (all axes) and UPDRS tremor vs sham; effect lasted 107.78 ± 104.15 s after stimulation. **No % in the abstract** | A | P-V: 60.22 ± 38.85% (RMS, x-axis), 150 µs, 50 Hz, APB/FDI/SDI | yes |
| Jitkritsadakul 2015 pilot (cited in the reviews; not retrieved) | 34 PD | >MT continuous | — | not read | P-V: 49.57 ± 38.89%; Dideriksen: 44 ± 33% | no |

---

## Q4. 1-DOF wrist flexion–extension mechanics

| Quantity | Value | Units | Basis | Source | Read | In ref list |
|---|---|---|---|---|---|---|
| WFE inertia (diagonal, posture 1) | **0.003** | kg·m² | de Leva 1996 segment parameters, 50th-percentile male, RVC toolbox | Davidson & Charles 2017 Ann Biomed Eng 45:1133–1147 (pages checked on Crossref 2026-11-07); PMID 27957608; 10.1007/s10439-016-1765-5 (PMC5541859) | FT | no (used by Corie & Charles 2019) |
| WFE passive damping | **0.028** | N·m·s/rad | damping = 0.028 s × stiffness for the forearm–wrist block; single-DOF damping ratios 0.18–0.42 vs measured 0.14–0.48 | same | FT | no |
| WFE passive stiffness | **0.992** | N·m/rad | Drake & Charles 2014 (3×3 wrist–forearm matrix, 10 subjects) | same; Drake & Charles 2014 Ann Biomed Eng 42:1853, PMID 24912766 (A, no numbers in the abstract) | FT / A | no |
| Off-diagonal couplings | WFE–WRUD stiffness −0.099 N·m/rad; FPS–WFE 0.018 N·m/rad; WFE–WRUD damping −0.003 N·m·s/rad; inertia WFE–SAA 0.009, WFE–SIER 0.011 kg·m² | — | — | same | FT | no |
| 7-DOF natural frequencies | 0.67, 1.08, 1.63, 1.90, 3.22, 4.77, 6.98 Hz; damping ratios 0.15–0.68 | — | — | same | FT | no |
| Excitation–contraction dynamics | 2nd-order low-pass, τ1 = 30 ms, τ2 = 40 ms (literature range 20–75 ms); cut-off about 3 Hz | ms | — | Corie & Charles 2019 J Biomech Eng 141:081001; PMID 30964940; 10.1115/1.4043442 (PMC6528735) | FT | **yes** |
| FCR moment arm on WFE | **+14.9** (flexion positive) | mm | OpenSim upper-limb model (Holzbaur 2005), 50th-percentile male, posture 1 | same | FT | yes (Holzbaur 2005 in list) |
| ECRB/ECRL (pooled) moment arm on WFE | **−11.5** | mm | same (average of ECRL and ECRB) | same | FT | yes |
| FCR / ECR moment arm on WRUD | −7.47 / −17.3 | mm | same | same | FT | — |
| Peak isometric force | FCR **407.9 N**; ECRB + ECRL **589.8 N** (sum) | N | Refs 35–37 of Corie & Charles (Holzbaur-based) | same | FT | — |
| Wrist passive stiffness nonlinearity | linear approximation error 20–30%; eigenvalue ratio 2.69 ± 0.52 vs 1.58 ± 0.39 (prior); misalignment 12.1 ± 4.6° | — | about 70% of the functional ROM | Pando et al. 2014 IEEE TBME 61:2235; PMID 24686225; 10.1109/TBME.2014.2313532 | A | no |

Gallego 2013 used `θ/T = G/(Is² + (D+D_NP)s + (K+K_NP))` with parameters "identified for the wrist" in Belda-Lois et al. 2013 (conference book chapter), but it **does not print the numbers** (FT checked). Healthy muscle cut-off frequency is about 2–3 Hz (Gallego 2013, citing others).

---

## Q5. FCR/ECR motoneuron pool (quick pass only)

- **Number of motor units (MUNE) for human FCR or ECR: NO VERIFIED DATA.** The search "motor unit number estimation AND (FCR OR ECR)" returned no MUNE study.
- **Fibre type: no percentage verified.** Mizuno et al. 1994 (PMID 8175559, A) found that FCR fibre-type composition varies between subjects (predominantly slow, mixed, or predominantly fast) but gives no % in the abstract. Green et al. 2015 (PMID 26502178, A) report histochemical type II differences between ECRB and trapezius, with no % in the abstract.
- **Twitch contraction time: NO VERIFIED DATA.**
- **Model assumption, not a measurement:** Gallego 2015 used 180 MNs per wrist muscle, MVC 40 N and a 100-fold twitch range.

---

## Conflicts and caveats

1. **Gallego 2013 outcome is misreported downstream.** The primary paper defines Ratt as the ratio of tremor PSD with stimulation to without, and states that Ratt > 100% means the tremor got worse. So Ratt = 52.33 ± 25.48% means about 52% of tremor *power* remained, roughly a 48% power reduction. The P-V 2021 review ("Average acute reduction: 52.33 ± 25.48%") and Dideriksen 2017 Table 1 ("52 ± 25%" suppression) present it as a reduction. Use the primary definition.
2. **Dosen 2015.** The abstract gives ranges (46–81% motor, 35–48% sensory). Both reviews give 60 ± 14% and 42 ± 5%, which may be means from the full text (not open access, not verified).
3. **Javidan 1992.** The abstract gives cerebellar 38%; the P-V review gives cerebellar 62 ± 38%. The ±SDs for ET and PD come from the review only. Dideriksen pools all groups as 53 ± 25%.
4. **Bó 2014 and Jitkritsadakul 2017 percentages** are review-only (no % in the abstracts) and the two reviews disagree for Bó 2014. Bó 2014 is ET-only, not PD.
5. **Agapaki 2018 amplitude SDs look implausibly small** for the ranges given (e.g. mean 0.843, "SD" 0.056, range 0.252–2.309 m/s²). They may be SEs or a typesetting error. Report the ranges.
6. **PD wrist tremor frequency disagrees between sources:** 4.4 ± 1.0 Hz (Dideriksen 2017, n = 5, wrist), ~4.6 Hz (Hao 2013, n = 7, arm), 5.9–6.1 Hz (Agapaki 2018, hand accelerometer). Sensor, posture, segment and cohort differ, so treat 4–6 Hz as the band.
7. **ET vs PD.** The best-parameterised drive model (Gallego 2015) and the coherence targets (Puttaraksa 2019) come from ET. PD-specific motor-unit data are Agapaki 2018 and Christakos 2009. Gallego 2015 predicts that rest tremor tends to be *in phase*. In contrast, PD is classically described as *alternating* (Milanov 2001; Hao 2013), and Dideriksen 2017 found partial out-of-phase delays (32.8 ± 12.8% of the period) in mixed PD/ET.
8. **The collision evidence is indirect.** The human motor-axon data come from Mattei 2003 (one deafferented patient, ECR, abstract only). The quantitative collision model is either abstract-only (Herbert & Gandevia 1999) or for sensory axons in epidural SCS (Formento 2018). No paper was found that quantifies collision during surface FES of FCR/ECR in tremor.
9. **Wrist I/D/K values are model inputs assembled from the literature, not one measurement.** Damping was derived by proportionality to stiffness (0.028 s), and inertia is for a 50th-percentile young male. PD rigidity is expected to raise K and D (Gallego 2013 discussion), but **no verified PD-specific wrist impedance values were found**.
10. **Abstract-only items** (full text not open access or blocked): Dideriksen 2015, Dideriksen 2011, Gallego 2015 J Neurophysiol, Holobar 2012, Dosen 2015, Popović Maneski 2011, Bó 2014, Javidan 1992, Prochazka 1992, Jitkritsadakul 2017, Herbert & Gandevia 1999, Mattei 2003, Aymard 1997, Katz 1993, Edgley 2021, Britton 1993, Dean 2007, Bergquist 2011, Hellwig 2009, Milanov 2001, Raethjen 2000, Christakos 2009, Drake & Charles 2014, Pando 2014.
11. **Proposal reference-list items used here:** Deuschl 2000, Dirkx & Bologna 2022, Helmich 2012, Gallego 2013, Pascual-Valdunciel 2021, Dosen 2015, Prochazka 1992, Javidan 1992, Popović Maneski 2011, Bó 2014, Jitkritsadakul 2017, Corie & Charles 2019, Holzbaur 2005 (via Corie & Charles), Cisi & Kohn 2008 and Fuglevand 1993 (via Gallego 2015).

    Strong sources **not** in the list: Gallego 2015 J Neurosci, Dideriksen 2015 J Neural Eng, Dideriksen 2017 Front Neurosci, Agapaki 2018, Davidson & Charles 2017, Herbert & Gandevia 1999, Formento 2018, Mattei 2003, Aymard 1997, Hao 2013, Puttaraksa 2019.

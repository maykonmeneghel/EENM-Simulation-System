# Model force vs published physiology

Status: **baseline of the faithful port, before any model change** (branch `feature/microservices-port`).
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
| 6 | Ordering FF ≤ FR < S in speed | FF and FR fast, S slow [Burke 1967, 1973; Kanda 1992] | FF (82) slower than FR (73) | ✗ order inverted |
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
| 5, 6 — fast units too slow, FF slower than FR | `demangeMNs` simulates the **first** units of each interpolated range (Q8), and the MTTP ranges go from slow to fast (FF 82.3 → 56.9 ms), so the 2 simulated FF units are the slowest FF of the pool. Even the fastest values in the table (FR 55.5, FF 56.9 ms) are ~2× the literature. | Q8 + parameter table. |
| 7, 8, 10 — no saturation, right-shifted curve, high tetanus/twitch | Forces are summed **linearly** (no sigmoidal gain as in Fuglevand 1993), so mean force grows ∝ frequency until spikes fail. The impulse weight is the **peak of the summed MUAP** (Q2), not 1, and the force is a **mean** over units (Q7). | Q2, Q7; missing force saturation. |
| 8 (decline), 12 — force falls above 50 Hz | Fast motoneurons enter **depolarisation block** with long (5 ms) pulses at high rates (Q11): spikes drop (FF 23/100 at 100 Hz) and the force with them. This is neuronal failure, not muscle fatigue. | Q11; would not happen with clinical 0.1–0.5 ms pulses or nerve stimulation. |
| 12 — missing spikes at 15–20 Hz | Not explained yet. Candidate: interaction of the slow dendritic Ca/persistent-Na currents (SCI conductance set) with 5 ms pulses. | Needs a dedicated sweep. |
| 11 — fusion order inverted | Consequence of 5 + 6: the simulated "fast" units are slow. | Q8. |

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
- Chang YJ, Shields RK (2011). Within-train neuromuscular propagation varies with torque in paralyzed human muscle. *Neurorehabil Neural Repair*. doi:10.1177/1545968310390224
- Cope TC, Bodine SC, Fournier M, Edgerton VR (1986). Soleus motor units in chronic spinal transected cats. *J Neurophysiol* 55:1202–1220. doi:10.1152/jn.1986.55.6.1202

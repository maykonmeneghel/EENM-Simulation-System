# Surface electrodes: verified literature on electrode characteristics and their effect on recruitment

Compiled 2026-11-12 for the Electrode section of the Stimulator panel (`docs/design/electrode.md`). Every number below
was read in the source named, on 2026-11-12.

**Read levels:** **A** = PubMed abstract only (E-utilities `efetch`, `rettype=abstract`). **FT** = I read the full text
(PMC XML through E-utilities `efetch db=pmc`).

**How each source was checked:** the DOI was resolved on Crossref (`https://api.crossref.org/works/<doi>`), and title,
authors, journal, volume and pages were compared with PubMed. All DOIs in this file resolved on 2026-11-12. Two of them
have a different year on Crossref (online-first date) and on PubMed (issue date): Kuhn et al. 2009 MBEC (Crossref 2008)
and Vieira et al. 2016 (Crossref 2015). Crossref lists Alon et al. 1994 with the first author as "Alon C". PubMed says
"Alon G", and the 1985 paper by the same author also says "Alon G".

Rules I followed (the same as `wrist-muscles-literature.md`):

- I computed no means, ranges or conversions from the sources. The one exception is a single ratio of two published
  conductivities in §7, and it is labelled "computed here".
- If a number was read only in an abstract, the Read column says **A**.
- **NO VERIFIED DATA** means I found no number in anything I read. Each gap lists the searches I ran.
- If the only place a number appears is a figure, I give no value and write "figure only, not extracted".
- I did not read any study at a level deeper than the Read column says.

**Could not open** (no open-access copy on Unpaywall, publisher 403, or host unreachable). Only the abstract was read
for these, or nothing where they have no abstract:

- Doheny et al. 2010, Kuhn et al. 2010, Alon et al. 1994, Lyons et al. 2004, Maffiuletti et al. 2011, Gobbo et al. 2011,
  Botter et al. 2011, Okuma et al. 2013, Vieira et al. 2016, Lieber & Kelly 1991, Petrofsky 2008 (both),
  Farina et al. 2004, Vargas Luna et al. 2015 (Artif Organs).
- Bergquist et al. 2011: the APS site returned an HTTP 403 challenge page.
- Keller & Kuhn 2008: Unpaywall lists an open-access PDF on doiserbia.nb.rs, but the host timed out from this machine.
  **Not read.**
- Merrill, Bikson & Jefferys 2005 and Maffiuletti 2010 (review): only the metadata was checked. **Not read.**
- Rattay 1986 has no abstract on PubMed: only the metadata was checked. **Not read.**

---

## 1. Electrode size (area) and current density

| Finding | Value | n / population | Muscle / site | Stimulus | Source | Read |
|---|---|---|---|---|---|---|
| A larger electrode needs **more current** at every excitatory level | Larger electrodes needed significantly less voltage but more current and more phase charge. They also gave a nonlinearly falling voltage/current ratio and better comfort for the same plantar-flexion force. The four sizes are **not given in the abstract** | 20 healthy | medial + lateral gastrocnemius | symmetric biphasic, 200 µs phase, 50 pps | Alon G, Kantor G, Ho HS. "Effects of electrode size on basic excitatory responses and on selected stimulus parameters." *J Orthop Sports Phys Ther* 1994;20(1):29–35. doi:10.2519/jospt.1994.20.1.29, PMID 8081407 | A |
| A larger electrode needs **less charge density**, and the two largest gave more torque | Electrode pairs 3×3, 6×6, 9×9 and 5×16.2 cm. Larger electrodes needed more voltage but less pulse-charge density. The two largest gave greater non-painful and maximally tolerated torque | 14 healthy | quadriceps | **high-voltage** monophasic stimulator (voltage output measured) | Alon G. "High voltage stimulation. Effects of electrode size on basic excitatory responses." *Phys Ther* 1985;65(6):890–895. doi:10.1093/ptj/65.6.890, PMID 3873661 | A |
| A larger electrode needs **more total current but less current density**; the smallest electrode is the least comfortable | Sizes 2×2, 5×5 and 5×9 cm. On all three muscle groups, 5×5 and 5×9 were significantly more comfortable than 2×2 and needed less current density. 5×5 needed **lower total intensity but higher current density** than 5×9 (stated in the text for quadriceps, hamstrings and gluteus). Median NRS on the quadriceps: 2×2 → 2, 5×5 → 0.33, 5×9 → 0. The per-size mA values are in Fig. 4 only, **not extracted** | 15 healthy (median BMI 23) | quadriceps (VM + VL), hamstrings, gluteus maximus | **constant-current** device (Chattanooga Physio), symmetric biphasic, 400 µs phase, 36 Hz | Flodin J, Juthberg R, Ackermann PW. "Effects of electrode size and placement on comfort and efficiency during low-intensity neuromuscular electrical stimulation of quadriceps, hamstrings and gluteal muscles." *BMC Sports Sci Med Rehabil* 2022;14:11. doi:10.1186/s13102-022-00403-7, PMID 35034633, PMC8761348 | FT |
| Current for a visible contraction, 5×9 cm electrode (Table 2), median (IQR) | quadriceps 20 (17–22) mA vertical / 20 (17–22) horizontal; hamstrings 24 (22–26) / 25 (22–26); gluteus 29 (24–32) / 29 (23–37). Orientation made no significant difference (p 0.21–0.57) | same | same | same. The device's 0–999 level maps non-linearly to 0–120 mA through the manufacturer's table | same | FT |
| Discomfort depends on **electrode size × fat thickness × nerve depth** (model, checked against measured thresholds) | At constant recruitment, small electrodes (0.8 × 0.8 cm², as written) were more comfortable for thin fat (0.25 cm) and superficial nerves (0.1 cm). Large electrodes (4.1 × 4.1 cm²) were more comfortable for thick fat (2 cm) and deep nerves (1.1 cm). Model motor thresholds were compared with thresholds measured on the forearms of 10 volunteers; **the measured values are not in the abstract** | FE + nerve model; 10 volunteers | forearm | – | Kuhn A, Keller T, Lawrence M, Morari M. "The influence of electrode size on selectivity and comfort in transcutaneous electrical stimulation of the forearm." *IEEE Trans Neural Syst Rehabil Eng* 2010;18(3):255–262. doi:10.1109/TNSRE.2009.2039807, PMID 20071267 | A |
| Threshold current **rises with electrode size, fat thickness and inter-electrode distance**, and is less sensitive to size and distance when fat is thick | Experiment and model agree: "the stimulus current required to reach the threshold for muscle activation increased with fat thickness, electrode size, and inter-electrode distance". Experimental criterion: current for 10 % of Mmax. **No numbers or n in the abstract** | 3D FE thigh model + activating function + neural model; experiment (n not stated in the abstract) | thigh | – | Doheny EP, Caulfield BM, Minogue CM, Lowery MM. "Effect of subcutaneous fat thickness and surface electrode configuration during neuromuscular electrical stimulation." *Med Eng Phys* 2010;32(5):468–474. doi:10.1016/j.medengphy.2010.03.004, PMID 20417145 | A |
| The activating function **falls as electrode size grows**, less so with thick fat (monopolar and bipolar) | qualitative | model | thigh | – | Doheny EP et al. "The effect of subcutaneous fat thickness on the efficacy of transcutaneous electrical stimulation." *Conf Proc IEEE EMBC* 2008:5684–5687. doi:10.1109/IEMBS.2008.4650504, PMID 19164007 | A |
| Size matters for **comfort**: the 19.63 cm² round electrode at the best site was most comfortable | Round electrodes of 19.63 and 38.48 cm². Of 4 sites, 2 failed to give a good contraction. The most comfortable set-up was the cathode high on the calf (below the proximal end of the heads), the anode towards the end of the belly, and 19.63 cm² electrodes (p < 0.001). Outcome: pain threshold and pain tolerance amplitudes, **values not in the abstract** | 12 healthy | gastrocnemius | – | Lyons GM, Leane GE, Clarke-Moloney M, O'Brien JV, Grace PA. "An investigation of the effect of electrode size and electrode location on comfort during stimulation of the gastrocnemius muscle." *Med Eng Phys* 2004;26(10):873–878. doi:10.1016/j.medengphy.2004.08.003, PMID 15567703 | A |
| **Conflicting:** electrode size is **not** a main determinant of torque | Three electrode types (carbonized rubber, sponge, adhesive) in a multiple regression. The main determinant of torque was the muscle's "intrinsic ability to be activated" ("efficiency"), "as opposed to electrode size, current, current density, or skin impedance". The carbonized-rubber electrode delivered the greatest current with the lowest impedance and gave the highest torque. The abstract does **not** say whether the stimulator was current- or voltage-controlled | 40 subjects | quadriceps | – | Lieber RL, Kelly MJ. "Factors influencing quadriceps femoris muscle torque using transcutaneous neuromuscular electrical stimulation." *Phys Ther* 1991;71(10):715–721. doi:10.1093/ptj/71.10.715, PMID 1946610 | A |
| Selectivity better with small electrodes, similar at high current (model) | qualitative | FE thigh + nerve model | thigh | – | Gomez-Tames JD, Gonzalez J, Yu W. "A simulation study: effect of the inter-electrode distance, electrode size and shape in transcutaneous electrical stimulation." *Conf Proc IEEE EMBC* 2012:3576–3579. doi:10.1109/EMBC.2012.6346739, PMID 23366700 | A |

**Electrode shape:** **NO VERIFIED DATA** on an effect of shape on threshold or torque in humans. Gomez-Tames 2012 lists
shape in its title, but its abstract gives no shape result. Flodin 2022 found no effect of **orientation** of a 5×9 cm
electrode (Table 2 above). Searches run: `electrode size AND (neuromuscular electrical stimulation OR transcutaneous
electrical stimulation) AND (torque OR comfort OR discomfort OR threshold)` (40 hits), plus a Europe PMC full-text
search for open-access papers that mention electrode size, motor threshold and mA (14 hits).

## 2. Inter-electrode distance (IED)

| Finding | Value | n / population | Muscle | Source | Read |
|---|---|---|---|---|---|
| Torque at a given current **rises steeply with IED** | IED of 32.5 % (L1), 45 % (L2), 57.5 % (L3) and 70 % (L4) of the patella apex–ASIS distance, 20 pps. Maximal knee-extension torque was the same for L3 and L4 (P = 0.15), and both exceeded L1 and L2 (P < 0.024); "two to three times greater" on average. The maximal tolerated current was **60–100 mA** and did not depend on IED. Except for L1, the current giving maximal torque did not change with configuration (P > 0.16) | 10 healthy males | quadriceps (VM, RF, VL) | Vieira TM, Potenza P, Gastaldi L, Botter A. "Electrode position markedly affects knee torque in tetanic, stimulated contractions." *Eur J Appl Physiol* 2016;116(2):335–342. doi:10.1007/s00421-015-3289-3, PMID 26526290 | A |
| Threshold current **rises with IED** (model and experiment) | qualitative, see §1 | – | thigh | Doheny et al. 2010 (above) | A |

These two do not contradict each other. Doheny measured the **threshold** (10 % Mmax). Vieira measured **maximal torque**
at tolerated currents, which depends on how much muscle volume the current crosses. The model has a single pool and no
spatial volume, so it has nothing that represents Vieira's effect (see the design, §3.5).

## 3. Placement relative to the motor point; muscle belly vs nerve trunk; depth of recruitment

| Finding | Value | n / population | Muscle | Source | Read |
|---|---|---|---|---|---|
| Motor-point (MP) definition and mapping procedure | The MP is "the skin area above the muscle where the motor threshold is the lowest for a given electrical input". Mapping uses a pen electrode of ≈ 1 cm² plus a reference electrode of "tens of square centimeters" (**monopolar** configuration), 1–2 Hz, starting at 1 mA, monophasic or biphasic 100–200 µs | commentary | – | Gobbo M, Maffiuletti NA, Orizio C, Minetto MA. "Muscle motor point identification is essential for optimizing neuromuscular electrical stimulation use." *J Neuroeng Rehabil* 2014;11:17. doi:10.1186/1743-0003-11-17, PMID 24568180, PMC3938308 | FT |
| MP placement gives **more torque and is more comfortable** than reference-chart placement | MP mode (cathode on the main MP, amplitude set at maximal EMG) vs RC mode (chart placement, amplitude set at tolerance). Peak twitch, tetanic torque, area under torque build-up and O₂ consumption were all significantly higher in MP mode, for both muscles; MP mode was more comfortable. **No numbers in the abstract.** The two modes also differ in how the amplitude was chosen | 10 (28.4 ± 8.2 y) | TA, VL | Gobbo M, Gaffurini P, Bissolotti L, Esposito F, Orizio C. "Transcutaneous neuromuscular electrical stimulation: influence of electrode positioning and stimulus amplitude settings on muscle response." *Eur J Appl Physiol* 2011;111(10):2451–2459. doi:10.1007/s00421-011-2047-4, PMID 21717122 | A |
| MP atlas of the lower limb | Pen electrode, 0.15 ms pulses, < 10 mA, 2 Hz. 16 MPs in 10 muscles: 2 in TA, 1 in lateral and 1 in medial gastrocnemius (soleus not studied). Medial gastrocnemius is one of the 4 MPs with "important inter-individual variability" | 53 healthy, 18–50 y | VM, RF, VL, BF, ST, SM, TA, PL, GL, GM | Botter A, Oprandi G, Lanfranco F, Allasia S, Maffiuletti NA, Minetto MA. "Atlas of the muscle motor points for the lower limb: implications for electrical stimulation procedures and electrode positioning." *Eur J Appl Physiol* 2011;111(10):2461–2471. doi:10.1007/s00421-011-2093-y, PMID 21796408 | A |
| The MP **moves** with the joint angle | Rectus femoris proximal MP moved **6.89 cm** on average (≈ 15 % of thigh length) between knee angles of 90°, 120° and 180°, mostly medially and distally | 13 healthy | rectus femoris | Osorio R, Saavedra F, Vieira TM, Aqueveque P, Andrews BJ. "Motor point displacement: optimising electrode positioning in FES." *Conf Proc IEEE EMBC* 2025:1–4. doi:10.1109/EMBC58623.2025.11254181, PMID 41336336 | A |
| **Muscle-belly stimulation recruits from superficial to deep**; nerve-trunk stimulation does not | Over the TA belly, significantly more current was needed for M5%max, M50%max and M95%max at the **deep** fine-wire site than at the superficial one. Over the common peroneal nerve there was no difference. **No mA values or n in the abstract** | healthy (n not in abstract) | TA | Okuma Y, Bergquist AJ, Hong M, Chan KM, Collins DF. "Electrical stimulation site influences the spatial distribution of motor units recruited in tibialis anterior." *Clin Neurophysiol* 2013;124(11):2257–2263. doi:10.1016/j.clinph.2013.04.015, PMID 23692977 | A |
| MP stimulation recruits **superficial → deep** and **low → high conduction velocity** | Constant current at 40, 60, 80 and 100 % of supramaximal current, plus linearly increasing current. The conclusion rests on M-wave analysis plus an EMG model | 10 healthy males | biceps brachii | Farina D, Blanchietti A, Pozzo M, Merletti R. "M-wave properties during progressive motor unit activation by transcutaneous stimulation." *J Appl Physiol* 2004;97(2):545–555. doi:10.1152/japplphysiol.00064.2004, PMID 15121744 | A |
| Nerve vs muscle site at equal torque | At 10–30 % MVT, torque did not differ between the sites. Over the nerve, M-waves were ≈ 5–6× smaller and H-reflexes ≈ 2–3× larger | healthy (n not in abstract) | triceps surae (tibial nerve vs belly) | Bergquist AJ, Clair JM, Collins DF. "Motor unit recruitment when neuromuscular electrical stimulation is applied over a nerve trunk compared with a muscle belly: triceps surae." *J Appl Physiol* 2011;110(3):627–637. doi:10.1152/japplphysiol.01103.2010, PMID 21183628 | A |
| Maximal tolerable torque by site | nerve-trunk 65 % MVIC; interleaved 49 % MVIC; muscle-belly 33 % MVIC. At ≤ 20 % MVIC, discomfort did not differ between them | healthy (n not in abstract) | TA | Wiest MJ, Bergquist AJ, Collins DF. "Torque, current, and discomfort during 3 types of neuromuscular electrical stimulation of tibialis anterior." *Phys Ther* 2017;97(8):790–789 (pages as indexed). doi:10.1093/ptj/pzx053, PMID 28789468 | A |
| MP stimulation is predominantly **motor** | Soleus MP stimulation produced no H-reflex, whereas tibial-nerve stimulation did. MP stimulation above 30 mA (conditioning interval < 100 ms) inhibited the soleus H-reflex, which the authors read as antidromic motor firing | 10 healthy | soleus, TA | Nakagawa K, Bergquist AJ, Yamashita T, Yoshida T, Masani K. "Motor point stimulation primarily activates motor nerve." *Neurosci Lett* 2020;736:135246. doi:10.1016/j.neulet.2020.135246, PMID 32673689 | A |

**Offset from the motor point → threshold (mA per cm): NO VERIFIED DATA.** Gobbo 2011 and the Gobbo 2014 commentary
say MP placement lowers the current needed, but neither abstract nor the commentary gives a value. Searches run:
`motor point AND electrical stimulation AND (electrode position* OR identification)` (25 hits) and
`Gobbo M[au] AND (motor point OR electrode)`.

## 4. Subcutaneous fat, BMI and skin blood flow

| Finding | Value | n / population | Muscle | Source | Read |
|---|---|---|---|---|---|
| Thresholds **higher in obese subjects**; BMI predicts motor excitability | Sensory and motor thresholds were higher in obese than in non-obese subjects (P < 0.05). BMI was a strong predictor of motor excitability, **r² = 0.56–0.61**. Sensory threshold was lower in women. Current tolerance to motor stimulation was reduced in obese subjects. **No mA values in the abstract** | 32 obese + 35 non-obese, men and women | quadriceps | Maffiuletti NA, Morelli A, Martin A, Duclay J, Billot M, Jubeau M, Agosti F, Sartorio A. "Effect of gender and obesity on electrical current thresholds." *Muscle Nerve* 2011;44(2):202–207. doi:10.1002/mus.22050, PMID 21698650 | A |
| Fat thickness at the stimulation site, and current to threshold | Ultrasound fat thickness: quadriceps and gastrocnemius **0.75 ± 0.13 cm**, biceps **0.48 ± 0.16 cm**. Current to threshold was significantly higher for quadriceps and gastrocnemius than for biceps (p < 0.01). Warming the skin (more blood flow) raised the current; cooling lowered it. Stimulus: sine wave, 100 µs, 30 Hz, at the motor point. **No mA in the abstract** | 25 (24.4 ± 2.3 y, 70.3 ± 21 kg) | quadriceps, biceps, lateral gastrocnemius | Petrofsky JS, Suh HJ, Gunda S, Prowse M, Batt J. "Interrelationships between body fat and skin blood flow and the current required for electrical stimulation of human muscle." *Med Eng Phys* 2008;30(7):931–936. doi:10.1016/j.medengphy.2007.12.007, PMID 18243763 | A |
| Fat acts as an **RC low-pass filter** | Fat thickness correlated with the RC time constant, **r = 0.96** (p < 0.001). Square-wave stimuli were transmitted into muscle less well than sine waves. Stimulus: 5 mA, 250 µs, 30 Hz, measured on the skin and with intramuscular needles | 6 + 30 subjects | quadriceps | Petrofsky J. "The effect of the subcutaneous fat on the transfer of current through skin and into muscle." *Med Eng Phys* 2008;30(9):1168–1176. doi:10.1016/j.medengphy.2008.02.009, PMID 18400550 | A |
| Fat and nerve depth ranges used in a forearm model | fat 0.25–2 cm; nerve depth 0.1–1.1 cm | model | forearm | Kuhn et al. 2010 (above) | A |
| Threshold rises with fat thickness | qualitative | model + experiment | thigh | Doheny et al. 2010 (above); Doheny et al. 2008 (above) | A |

**Fat thickness over FCR, ECR, soleus and TA: NO VERIFIED DATA.** Petrofsky 2008 measured the gastrocnemius (lateral)
and the biceps of the upper arm, **not the forearm**. Searches run: `Petrofsky J[au] AND (subcutaneous fat OR
electrode)` (25 hits). I ran no separate ultrasound-anthropometry search for forearm fat, so that remains open.

## 5. Electrode material, skin impedance, and current- vs voltage-controlled stimulators

| Finding | Value | n / population | Source | Read |
|---|---|---|---|---|
| **Current control fixes the current in the tissue independently of the electrode–skin boundary**; voltage control does not | "the current-controlled reliably defines the current in the body … independent of the highly variable electrode/tissue boundary. However, in the case of voltage-controlled tVNS, the resulting current in the tissue depends strongly on the electrode-skin boundary properties". Caveat in the same paragraph: a higher impedance raises the output voltage, up to the stimulator's **compliance voltage**. A sudden fall in impedance (for example, re-attaching an electrode) can transiently overshoot the current | consensus review (auricular VNS, but the statement is general and cites Merrill et al. 2005) | Farmer AD et al. "International consensus based review and recommendations for minimum reporting standards in research on transcutaneous vagus nerve stimulation (version 2020)." *Front Hum Neurosci* 2021;14:568051. doi:10.3389/fnhum.2020.568051, PMID 33854421, PMC8040977 | FT |
| CC vs VC on the thigh | With current control, both pulse width and amplitude change nerve depolarisation. With voltage control, only the amplitude does, for pulse widths > 150 µs. The differences depend on the electrode–skin interface. Large thigh electrodes have strong capacitive effects | healthy (n not in abstract), anterior thigh | Vargas Luna JL, Krenn M, Löfler S, Kern H, Cortés R JA, Mayr W. "Comparison of twitch responses during current- or voltage-controlled transcutaneous neuromuscular electrical stimulation." *Artif Organs* 2015;39(10):868–875. doi:10.1111/aor.12623, PMID 26471138 | A |
| Electrode–skin impedance depends mainly on the **current intensity** | A dynamic model that includes electroporation and charge-dependent effects; R² ≈ 0.99 in both CC and VC modes | model fitted to measurements with electrodes of different sizes | Vargas Luna JL, Krenn M, Cortés Ramírez JA, Mayr W. "Dynamic impedance model of the skin-electrode interface for transcutaneous electrical stimulation." *PLoS One* 2015;10(5):e0125609. doi:10.1371/journal.pone.0125609, PMID 25942010 | A |
| **Textile (with lotion) = hydrogel** under current control | Current-controlled stimulator (MotiMove), 400 µs, 40 Hz; hydrogel electrodes 5×9 cm. Minimum current evoking torque (Imin): hydrogel median 24 mA (range 17.4–26.4); textile median 23 mA, mean 23.6 ± 3.6 (range 19.8–30); p = 0.500. Maximal tolerated (IMAX, n = 9): hydrogel 66 ± 23.4 mA (median 60); textile 67.3 ± 28.6 (median 63). Torque vs intensity: no effect of electrode type (LMM, p = 0.842). Textile **without** lotion gave painful contractions in preliminary trials and was dropped | 10 healthy (28.9 ± 5.8 y) | Jafari E, Descollonges M, Deley G, Di Marco J, Popovic-Maneski L, Metani A. "Comfort, consistency, and efficiency of garments with textile electrodes versus hydrogel electrodes for neuromuscular electrical stimulation in a randomized crossover trial." *Sci Rep* 2025;15:6869. doi:10.1038/s41598-025-91452-8, PMID 40011562, PMC11865617 | FT |
| Electrode type changed the delivered current | See Lieber & Kelly 1991 in §1. The carbonized-rubber electrode "delivered the greatest current with the lowest impedance". The control mode is not stated in the abstract, so this result cannot be used for or against the constant-current claim | 40 | Lieber & Kelly 1991 (above) | A |
| Array gaps and gel resistivity change nerve activation (model) | gaps should be < 3 mm; the right gel resistivity depends on the gap size | simulation | Kuhn A, Keller T, Micera S, Morari M. "Array electrode design for transcutaneous electrical stimulation: a simulation study." *Med Eng Phys* 2009;31(8):945–951. doi:10.1016/j.medengphy.2009.05.006, PMID 19540788 | A |

**Conclusion for the model (claim verified, with its limits).** The app models a current-controlled stimulator: the
amplitude is a current. Within the compliance voltage, the electrode material and the skin impedance therefore do
**not** change the delivered current (Farmer et al. 2021, FT; the textile-vs-hydrogel null result, Jafari et al. 2025,
FT, is consistent with this). Impedance would matter in two cases, and the model has neither:

- a voltage-controlled stimulator (Vargas Luna et al. 2015);
- the compliance limit being reached.

The low-pass filtering by fat (Petrofsky 2008, r = 0.96) acts **inside** the tissue. It is a separate effect, and the
model does not represent it either: its Weiss threshold assumes a rectangular current at the axon.

## 6. Configuration (monopolar vs bipolar)

| Finding | Value | Source | Read |
|---|---|---|---|
| Motor-point mapping uses a **monopolar** set-up (small active + large distant reference) | see §3 | Gobbo et al. 2014 | FT |
| Monopolar electrodes give "better recruitment characteristics" than ring electrodes (theory) | qualitative | Rattay F. "Analysis of models for extracellular fiber stimulation." *IEEE Trans Biomed Eng* 1989;36(7):676–682. doi:10.1109/10.32099, PMID 2744791 | A |
| Activating function studied for monopolar and bipolar surface stimulation (model) | no comparison stated in the abstract | Doheny et al. 2008 | A |

**Human surface-NMES comparison of monopolar vs bipolar (threshold or torque): NO VERIFIED DATA.** Search run:
`(monopolar OR unipolar) AND bipolar AND (neuromuscular electrical stimulation OR surface electrical stimulation OR
transcutaneous electrical stimulation) AND (torque OR force OR discomfort OR threshold) AND muscle` (11 hits). None
was a human surface-NMES comparison: the hits were spinal stimulation, recording montages and epimysial electrodes.

## 7. Mechanistic basis: volume conductor and activating function

| Item | Content | Source | Read |
|---|---|---|---|
| Activating function (AF) | The AF is "the second derivative of the extracellular potential along the axon course", introduced by Rattay (1986) for unmyelinated axons. Positive = depolarisation. It has also been used for myelinated fibres in FES simulation (Kuhn 2008; Gomez-Tames 2011, 2013). Kuhn (2008) added thresholds that depend on axon diameter and pulse width | Baier J, Selkmann S, Bender B. "Simulation of FES on the forearm with muscle-specific activation resolution." *Front Bioeng Biotechnol* 2024;12:1384617. doi:10.3389/fbioe.2024.1384617, PMID 38994126, PMC11236753 (secondary statement of Rattay 1986) | FT |
| Stimulus/response of fibres as a function of electrode geometry | "results follow from the extracellular potential along the fiber as a function of electrode geometry"; monopolar, bipolar and ring electrodes analysed | Rattay 1989 (above) | A |
| Original AF paper | metadata only (no abstract on PubMed) | Rattay F. "Analysis of models for external stimulation of axons." *IEEE Trans Biomed Eng* 1986;33(10):974–977. doi:10.1109/TBME.1986.325670, PMID 3770787 | **not read** |
| TES model = volume conductor (electrode, interface, skin, fat, muscle, bone; resistive + capacitive) + published nonlinear nerve models, checked against measured **chronaxie** and twitch forces in volunteers | qualitative; **no numbers in the abstract** | Kuhn A, Keller T, Lawrence M, Morari M. "A model for transcutaneous current stimulation: simulations and experiments." *Med Biol Eng Comput* 2009;47(3):279–289. doi:10.1007/s11517-008-0422-z, PMID 19005714 | A |
| Standard tissue conductivities (Kuhn & Keller 2005, as reported in Baier 2024 Table 1) | hydrogel 1/11 S/m; skin 1/700; fat 1/33; muscle axial 1/3, radial 1/9; bone 1/50 (cortical). Computed here: muscle-axial / fat conductivity = 11 | Baier et al. 2024 Table 1 (**secondary**: Kuhn & Keller 2005 itself not checked) | FT |
| Forearm digital twin with **measured** strength–duration diagrams and force–intensity curves | One subject (34 y, female). KT Motion stimulator; active round hydrogel electrode **25 mm** diameter over the muscle, indifferent 50 mm square near the wrist. Amplitude 1 mA steps; PW 20–500 µs. Muscles ECU, ED, ECRB, ECRL, **FCR**, FDS, FCU. FCR: 4 repeated measurements, RSD 0.08 (Fig. 4 caption). The measured amplitudes still fell above 300 µs. The **mA values are in figures only, not extracted** | Baier et al. 2024 | FT |

## 8. Candidate anchors for an mA calibration of the model's amplitude

The model's recruitment needs, for each muscle, the current that recruits the first unit and the current that recruits
all units, at a known pulse width and electrode. This is what I found:

| Muscle | What was found | Value | Population | Electrode / stimulus | Source | Read |
|---|---|---|---|---|---|---|
| Wrist extensors (electrode over ECRB, distal to the lateral epicondyle) | highest current reached in a 12-step protocol (1 mA steps from the first measurable force). This is **not** full recruitment and **not** the motor threshold | **29 ± 5 mA** (low frequency); 40 ± 9 mA (1 kHz); highest force 32 ± 18 N; highest efficiency 1.22 ± 0.79 N/mA | 20 **post-stroke** patients, 66 ± 12 y | 4×4 cm sponge plates (~12 g water), 15 mm apart; biphasic 500 µs, ≈ 50 Hz | Tenberg S, Weinig J, Niederer D, Vogt L, Leisse M, Müller S. "Effects of kilohertz versus low-frequency electrical stimulation of the wrist extensors in patients after stroke: a randomized crossover trial." *PM R* 2025;17(9):1055–1068. doi:10.1002/pmrj.13368, PMID 40359388, PMC12434222 | FT |
| Wrist extensors (ED, ECU) | sensory, motor and functional thresholds were measured, but the text reports **no values** | – | 12 healthy | cathode 3×3.5 cm, anode 5×5 cm 5 cm distal; 35 Hz, 300 µs | Insausti-Delgado A, López-Larraz E, Omedes J, Ramos-Murguialday A. *Front Neurosci* 2021;14:593360. doi:10.3389/fnins.2020.593360, PMC7845652 | FT |
| FCR, ECRB (and other forearm muscles) | strength–duration and force–intensity curves | figure only, not extracted | 1 healthy | 25 mm round active | Baier et al. 2024 | FT |
| Quadriceps (not a model muscle) | current for the first torque (Imin) | median 24 mA (hydrogel) | 10 healthy | 5×9 cm, 400 µs | Jafari et al. 2025 | FT |
| Quadriceps (not a model muscle) | current for a visible contraction | median 20 (IQR 17–22) mA | 15 healthy | 5×9 cm, 400 µs | Flodin et al. 2022 | FT |
| Lower-limb MPs | pen-electrode MP search current | < 10 mA at 0.15 ms | 53 healthy | ≈ pen electrode | Botter et al. 2011 | A |
| **FCR, ECR, soleus, gastrocnemius, TA: motor threshold and full-recruitment current (mA) with surface electrodes** | **NO VERIFIED DATA** | – | – | – | – | – |

Searches run for the last row:

- PubMed: `(wrist extensor* OR wrist flexor* OR flexor carpi radialis OR extensor carpi radialis) AND (surface electrical
  stimulation OR neuromuscular electrical stimulation OR functional electrical stimulation) AND (mA OR current amplitude
  OR recruitment curve)` (30 hits).
- PubMed: `(M-wave OR torque) AND (recruitment curve OR motor threshold) AND (muscle belly OR motor point) AND (tibialis
  anterior OR soleus OR gastrocnemius OR triceps surae) AND electrical stimulation AND free full text[sb]` (1 hit:
  Bergquist 2011, which would not open).
- Europe PMC full-text searches restricted to open access: 0 and 1 relevant hits.

The studies most likely to hold these values are Okuma 2013 (TA M-wave recruitment curves), Bergquist 2011 (triceps
surae), Gobbo 2011 (TA) and Kuhn 2010 (forearm motor thresholds). I could open none of their full texts. Elboim-Gabyzon
& Awad 2021 (wrist extensors, n = 18, maximally tolerated current; doi:10.1111/aor.13794, PMID 32780476) give no mA in
the abstract.

**Strength–duration time constant** (already in the model): 459 ± 126 µs for compound muscle action potentials, n = 20.
This was measured by threshold tracking at the nerve, not through large surface electrodes over the muscle (Mogyoros I,
Kiernan MC, Burke D. "Strength-duration properties of human peripheral nerve." *Brain* 1996;119(2):439–447.
doi:10.1093/brain/119.2.439, PMID 8800939, A). Baier 2024 (FT) reports that amplitudes measured through a 25 mm forearm
electrode were still falling above 300 µs. Whether τ_SD measured over the muscle differs from Mogyoros's value is an
**open question**. I found no verified surface-electrode τ_SD for the model's muscles.

## 9. Summary: what is verified, and at what level

| Electrode characteristic | Direction of the effect | Magnitude usable in the model? |
|---|---|---|
| Area | larger → more total current to threshold, less current density, more comfort (Alon 1994 A, Alon 1985 A, Flodin 2022 FT, Doheny 2010 A); **conflict:** not a main torque determinant (Lieber & Kelly 1991 A) | no: magnitudes are in figures or closed full texts |
| Fat thickness / BMI | thicker → higher threshold (Doheny 2010 A, Maffiuletti 2011 A, Petrofsky 2008 A), and less sensitivity to size and IED (Doheny 2010 A) | thickness values only (gastrocnemius 0.75 ± 0.13 cm; biceps 0.48 ± 0.16 cm); no threshold-vs-fat slope |
| Inter-electrode distance | larger → higher threshold (Doheny 2010 A) but 2–3× more torque at tolerated currents on the quadriceps (Vieira 2016 A) | one ratio (2–3×) for a muscle the model does not have |
| Placement on the MP | lower current, more torque, more comfort (Gobbo 2011 A, Gobbo 2014 FT) | no |
| Muscle belly vs nerve | belly: superficial → deep (Okuma 2013 A, Farina 2004 A) | no |
| Material / impedance | none under current control within compliance (Farmer 2021 FT; Jafari 2025 FT) | yes: **zero effect** is the verified value |
| Configuration | monopolar used for MP mapping (Gobbo 2014 FT) | no human comparison |
| Shape / orientation | orientation: none (Flodin 2022 FT) | no data on shape |
| mA calibration for FCR, ECR, soleus, gastrocnemius, TA | – | **no verified data** |

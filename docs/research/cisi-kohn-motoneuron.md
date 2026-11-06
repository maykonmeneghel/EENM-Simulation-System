# Cisi & Kohn (2008) motoneuron — sources, parameters, discrepancies

Compiled 2026-11-06 for the central drive (design §3.1–3.2, Decision 3c). **FT** = read in the full text or code.

## Sources

| Item | Source | Read |
|---|---|---|
| Equations (Eqs 1–8), geometry / resistances / rheobases per type (Table 2, p. 526), model properties (Table 5, p. 531), pulse kinetics (p. 526) | Cisi RRL, Kohn AF. Simulation system of spinal cord motor nuclei and associated nerves and muscles, in a Web-based architecture. J Comput Neurosci 25:520–542 (2008), doi:10.1007/s10827-008-0092-8 (publisher PDF hosted in a public repo by R. Watanabe, `rnwatanabe/Modelo-Motoneuronio`, commit 972d207) | FT |
| ḡNa, ḡKf, ḡKs, rate constants, thresholds (Table 1; the 2008 paper only points to the simulator) | Watanabe RN, Magalhães FH, Elias LA, et al. Influences of premotoneuronal command statistics on the scaling of motor output variability during isometric plantar flexion. J Neurophysiol 110:2592–2606 (2013), doi:10.1152/jn.00073.2013 | FT |
| Parameter values used (soleus) and implementation details | projectPR (Python port of ReMoto by R. Watanabe), commit 318286f: `confTest.rmto` lines 162–288, `PulseConductanceState.py` 143–209, `MotorUnit.py` 31–60 and 398–470, `Compartment.py`; ReMoto (Java), commit a6d148a | FT |

Titles and DOIs checked against Crossref on 2026-11-06.

## Model (as implemented in `domain/cisi_kohn.py`, `infrastructure/compiled_cisi_kohn.py`)

- Potentials relative to rest (rest = 0 mV); E_Na 120, E_K −10, E_L 0 mV; C_m 1 µF/cm²; R_i 70 Ω·cm.
- Soma active (Na m³h, Kf n⁴, Ks q²); dendrite passive (ReMoto's dendritic Ca PIC is off by default: `gammaCa` = 0).
- Spike: V_s > V_th with 5 ms since the last spike → every gate's pulse (0.6 ms) starts. Gates follow the exact pulse
  solutions; voltages by backward Euler (2 × 2), sub-steps finer during a pulse. ReMoto/projectPR use RK4 at 0.05 ms.
- An antidromic spike reaching the soma is a soma spike (starts the pulse if not refractory) and is not sent down the
  axon — as `MotorUnit.atualizeDelay` in projectPR.
- Units: area = π d l · 1e-8 cm² (soma l = d); C (nF) = C_m · area · 1e3; g_leak (µS) = 1e6 · area / R_m;
  g_c (µS) = 200 / (R_i l_s / π r_s² + R_i l_d / π r_d²) with lengths in µm; ḡ (µS) = area · ḡ (µS/cm²).
- Per-type spans interpolated linearly by the unit's index within its type in the muscle pool.

## Threshold — two published rules (an option in the app, `ThresholdRule`)

| Rule | Definition | Smallest unit's rheobase |
|---|---|---|
| `CISI_KOHN_2008` (default) | V_th = rheobase × input resistance, rheobases of Table 2 (S 3.5–6.5, FR 6.5–17.5, FF 17.5–25.1 nA) | 3.5 nA (Gallego 2015: 4 nA) |
| `WATANABE_2013` | V_th given directly (S 12.35–16.45, FR 16.45–19.30, FF 19.30–20.90 mV), as in the code | 5.6 nA |

## Discrepancies (code used, both noted)

1. **ḡKs per type:** code 17 / 37.5 / 8 mS/cm² (S / FR / FF); Watanabe 2013 Table 1 interpolates 16–25 / 25–19 / 19–4.
2. **FR/FF rate constants in Watanabe 2013 Table 1** (e.g. αH 0.50–11.25) do not match the code, where they are constant across types — probably a typesetting error.
3. Watanabe 2013 Eq A1 prints (t − t_off) during the pulse; the code uses the pulse onset.
4. FF soma diameter 113 µm (2008) vs 112.5 µm (code); rounded dendrite lengths and R_m in the paper.

## Reproduction of the paper's model properties (`tests/unit/test_cisi_kohn.py`, middle unit of each type)

| Property (Table 5) | S | FR | FF |
|---|---|---|---|
| Input resistance, MΩ — paper / here | 1.6 / 1.60 | 0.9 / 0.90 | 0.6 / 0.60 |
| Membrane time constant (slowest exponential), ms | 10.4 / 10.7 | 8.0 / 8.0 | 5.9 / 6.1 |
| AHP magnitude, mV | 4.9 / 4.3 | 4.3 / 5.1 | 3.0 / 1.3 |
| f–I slope, first segment, pps/nA | 2.7 / ≈ 2.4 | 2.5 / ≈ 2.4 | 3.6 / ≈ 5.5 |
| Rheobase (2008 rule), nA | 3.5–6.5 / exact | 6.5–17.5 / exact | 17.5–25.1 / exact |

AHP duration depends on its definition (not stated in the paper); time below −0.1 mV here: S ≈ 110, FR ≈ 58, FF ≈ 38 ms
(paper 160 / 87 / 67). The FF AHP is smaller than published, consistent with discrepancy 1.

## Phase-2 gate with this motoneuron (`validation/results/central-drive.json`, FCR, 120 units, 4 s)

Default (2008 thresholds, published currents): rest with a 4.4 Hz, 3 nA tremor → units at 7.0 Hz (2.9–10.8), short
ISIs 49.7 ms, force peak 4.33 Hz with 99.97 % of the 2–15 Hz power; posture (5 nA) → 21.9 Hz, ISI CV 0.15.
Targets: PD motor units 10.9 ± 2.9 Hz (6–18.5), doublets 41.6 ± 5.1 ms (30–50) (Agapaki 2018); tonic ISI CV 10–30 %
(Gallego 2015). The inherited Booth 1997 motoneuron gave 50–95 Hz and ≈ 17 ms
(`validation/results/central-drive-booth1997.json`).

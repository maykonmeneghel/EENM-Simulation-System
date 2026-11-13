# Design: electrode characteristics in the surface-stimulation model

Status: **implemented** (branch `feature/electrode`, 2026-11-12), with the author's answers to the decisions of §9,
given on 2026-11-12. The author asked for an Electrode section in the Stimulator panel whose values change the math,
with every value sourced. Sources and values are in `docs/research/electrode-literature.md`, checked on 2026-11-12.
Read levels: **FT** = full text, **A** = abstract only. Section 9 records each decision, the proposal and the answer;
section 10 lists where the implementation differs from the text above it.

## 1. What exists today (read in the code on 2026-11-12)

| Item | Where | What it does now |
|---|---|---|
| Recruitment | `domain/axon_stimulation.py` | Unit k fires on a pulse of width PW when `A ≥ I_rh,k · (1 + τ_SD/PW)` (Weiss). τ_SD = 0.459 ms (Mogyoros 1996, A) |
| Rheobase spread | same, `AxonExcitability.rheobases` | linear over `[I_rh,min, R·I_rh,min]`, `I_rh,min = 56.9/(1 + 0.459/0.3)`, `R = 102.1/56.9`. Values are **inherited from the original model, not from the literature**. Units get them in a seeded random order (Gregory & Bickel 2005) |
| Amplitude unit | `StimulusProtocol.amplitude`, `docs/contracts.md` | **model units ("u.m.")**. The contract table says "0 – 500 (µA/cm²)". That holds for the soma path (`MOTONEURON_POOL`, `ORIGINAL`), not for `SKIN_SURFACE`: there the number is only compared with the inherited thresholds |
| Electrode position | `ModelOptions.electrode_fraction` (default 0.9) | Position **along the axon**, from the soma. It is used only with a central drive (collision, `infrastructure/axon_merge.py`); it does not change recruitment |
| Web mirror | `apps/web/src/domain/modelEquations.ts` `axonRecruitment`, `stimulator.ts` | The Stimulator panel's recruitment meter recomputes the same thresholds in the browser |
| 3D electrode | `apps/web/src/ui/three/ForearmScene.tsx` `PAD_RADIUS = 0.0125` | A pad of radius 12.5 mm is drawn at the motor point. The comment calls it "a common 5 × 5 cm-class pad, illustrative". A 12.5 mm radius is a 25 mm-diameter disk (4.9 cm²), not a 5 × 5 cm pad. The comment is wrong. The size happens to be Baier et al. 2024's active electrode (FT) |

**Nothing about the electrode enters the recruitment math today.** The central fact behind every decision below:
**the literature I could verify gives the direction of most electrode effects but almost no magnitudes.** Most
magnitudes sit in figures or in full texts that would not open. A recruitment curve in mA for FCR, ECR, soleus,
gastrocnemius or TA with surface electrodes: **NO VERIFIED DATA** (research file §8).

## 2. How electrode characteristics can enter the math

All proposals keep the Weiss structure and add one multiplicative factor on the threshold:

$$ A \;\ge\; G \cdot I_{rh,k}\left(1 + \frac{\tau_{SD}}{PW}\right) $$

- `G` is dimensionless and the **same for every unit**: a muscle-level factor. It shifts the whole recruitment curve
  along the amplitude axis. It does not change the curve's shape or the order of recruitment.
- `G = 1` reproduces today's results bit for bit.

A per-unit G, with each axon at its own depth, would make the depth distribution set the recruitment range. Section
3.6 explains why this is not proposed.

### 2.1 The derived factor: activating function under a disk electrode (model, derived here)

Basis:

- The activating function (AF), the second derivative of the extracellular potential along the axon, predicts
  excitation (Rattay; definition as stated in Baier et al. 2024, FT; Rattay 1989, A).
- The AF has been used for surface FES of myelinated fibres (Kuhn et al. 2009, A; Doheny et al. 2010, A;
  Baier et al. 2024, FT).

Simplest geometry with a closed form:

- a homogeneous half-space of resistivity ρ;
- a monopolar disk electrode of radius `a` with uniform current density `J = I/(πa²)`;
- an axon parallel to the skin at depth `d`.

Under the centre of the disk:

$$ \mathrm{AF}(0) \;=\; \frac{\partial^2 V}{\partial x^2}\Big|_{x=0} \;=\; -\,\frac{\rho\, I}{2\pi\,(a^2+d^2)^{3/2}} $$

Derivation: integrate the point-source kernel `ρJ/(2π)·(3u² − R²)/R⁵` over the disk in polar coordinates. It reduces
to `π[−w^{-1/2} + d² w^{-3/2}]` evaluated from `w = d²` to `a² + d²`. For `a → 0` it gives the point-source result
`ρI/(2πd³)`.

How this was checked:

- **Closed form.** I integrated the disk numerically (2D trapezoid, 1500 × 1500) for four (a, d) pairs. The
  numerical and closed-form values agreed to 6 significant figures.
- **Where the AF peaks.** I also probed whether the centre is where depolarisation peaks along the axon. **It is
  not always.** When the electrode is wide relative to the depth, the depolarising peak moves under the electrode
  edge:

  | a (cm) | d (cm) | peak / centre value |
  |---|---|---|
  | 2.8 | 0.35 | 2.36 (peak at x = 2.45 cm) |
  | 1.25 | 0.35 | 1.22 |
  | 2.8 | 1.25 | 1.01 |
  | 2.8 | 2.5 | 1.00 (peak at the centre) |

  The factor must therefore use the **peak along the axon**, computed numerically once per run (a 2D quadrature,
  milliseconds). The closed form is the deep-axon limit and serves as the test oracle.

With a fixed AF threshold, the threshold current scales as 1/peak AF. Relative to a reference electrode:

$$ G_{\text{size,depth}} = \frac{\max_x \mathrm{AF}(a_{ref}, d_{ref}, x)}{\max_x \mathrm{AF}(a, d, x)}, \qquad a = \sqrt{S/\pi},\quad d = f + h $$

| Symbol | Meaning |
|---|---|
| `S` | electrode area. Shape enters only through `S`: a rectangle becomes the disk of equal area, which is an assumption. Shape data: NO VERIFIED DATA |
| `f` | subcutaneous fat thickness |
| `h` | depth of the motor axons below the fat |
| ρ | cancels in the ratio |

**What this factor gets right and wrong** against the verified directions. These are sign checks at
`f + h = 0.75 + 0.5 cm`. Both values are illustrative (see §4). I computed them on 2026-11-12:

| Check | Source | Result |
|---|---|---|
| Larger area → more total current to threshold | Alon 1994 A; Doheny 2010 A; Flodin 2022 FT (5×5 < 5×9) | **passes**: G(5×9) / G(5×5) = 1.95 |
| Thicker fat → higher threshold | Doheny 2010 A; Maffiuletti 2011 A; Petrofsky 2008 A | **passes**: 5×5 pad, G = 0.68 at f = 0.25 cm and 1.84 at f = 2 cm |
| Thicker fat → less sensitive to size | Doheny 2010 A | **passes**: d ln G / d ln S between 4×4 and 5×9 is 1.06 at f = 0.25 cm and 0.87 at f = 2 cm |
| Larger area → **lower current density** at threshold | Flodin 2022 FT: 2×2 needed more density than 5×5 and 5×9, and 5×5 more density than 5×9 | **fails or is borderline at shallow depth**: density ratio 2×2 / 5×5 ≈ 1.0, and 5×9 slightly *higher* than 5×5 |

The last row is the important one. A homogeneous half-space with uniform current density makes the threshold current
grow roughly with the **area** once `a ≫ d`, so the current density at threshold stays flat. Flodin measured that it
falls. The model therefore **overstates the size effect for shallow targets**.

Likely missing physics:

- the resistive fat layer, which spreads current (fat/muscle-axial conductivity ratio 1/11, from the Kuhn & Keller
  standard values as reported in Baier 2024 Table 1, FT, secondary);
- the skin;
- edge current concentration under real electrodes.

A two-layer analytic model is possible, but its magnitude would still be unvalidated. **DECISION 6** covers this.

### 2.2 An mA calibration of the amplitude (optional, from the user's own measurement)

If the user enters, for one electrode `E_c` and one pulse width `PW_c`:

- `I_MT`: the measured motor threshold, in mA;
- `I_full` (optional): the current at full recruitment, for example at the M-wave or torque plateau;

then:

$$ I_{rh,\min} = \frac{I_{MT}}{1 + \tau_{SD}/PW_c}, \qquad R = \frac{I_{full}}{I_{MT}} \ (\text{else the inherited } 102.1/56.9), \qquad G = \frac{G(E)}{G(E_c)} $$

The amplitude is then in **mA**, and `R` becomes a measured value instead of an inherited one. That would also close
the "rheobase range — inherited" gap in `axon_stimulation.py`. With no calibration, the amplitude stays in u.m. and
`G` is taken relative to the muscle's default electrode (§4).

No literature calibration is proposed as a default: none exists for the model's muscles (research §8). The nearest is
Tenberg et al. 2025 (FT): 29 ± 5 mA at the last of 12 steps, wrist extensors, **post-stroke**, 4×4 cm, 500 µs. That
value is neither the motor threshold nor full recruitment. Quadriceps values (Flodin 2022, Jafari 2025) are for a
muscle the model does not have.

### 2.3 Electrode material and skin impedance: no effect (verified)

The app's stimulator is current-controlled: the amplitude is a current. Under current control, the current in the
tissue does not depend on the electrode–skin boundary within the compliance voltage (Farmer et al. 2021, FT). Textile
electrodes with lotion and hydrogel gave the same minimum current, tolerated current and torque under a
current-controlled stimulator (Jafari et al. 2025, FT; Imin median 24 vs 23 mA, p = 0.500). **The verified value of
the effect is zero.**

The section shows this explicitly instead of offering a material that does nothing silently. Impedance would matter
under two conditions the model does not have:

- voltage control (Vargas Luna et al. 2015, A);
- reaching the compliance limit.

The fat's RC filtering of square pulses (Petrofsky 2008, A, r = 0.96) is a tissue effect, not a material effect, and
is out of scope.

## 3. Per characteristic: model, literature or illustrative

| Characteristic | Enters the math? | Tag | Basis |
|---|---|---|---|
| 3.1 Area and shape (→ `a`) | through `G`, if the AF option is chosen (DECISION 2/6) | model (derived, §2.1); direction literature; magnitude **illustrative** | Alon 1994 A, Alon 1985 A, Doheny 2010 A, Flodin 2022 FT. Conflict: Lieber & Kelly 1991 A |
| 3.2 Subcutaneous fat `f` | through `G` (`d = f + h`) | value literature where measured, else inherited/illustrative (§4) | Petrofsky 2008 A (gastrocnemius 0.75 ± 0.13 cm); Kuhn 2010 A (range 0.25–2 cm) |
| 3.3 Axon depth below fat `h` | through `G` | **illustrative** | Kuhn 2010 A gives a 0.1–1.1 cm "nerve depth" range in a forearm model |
| 3.4 Material / hydrogel / impedance | **no** (verified zero) | literature | Farmer 2021 FT; Jafari 2025 FT |
| 3.5 Inter-electrode distance | no (v1) | – | Vieira 2016 A: 2–3× torque on the quadriceps. Doheny 2010 A: threshold rises with distance. The single-pool model has no muscle volume for Vieira's effect to act on |
| 3.6 Position vs motor point / depth order | no (v1) | – | Gobbo 2011 A, Botter 2011 A, Okuma 2013 A, Farina 2004 A. No magnitude per cm of offset. Superficial→deep order (Okuma, Farina) would change the force only if depth correlated with unit type. The model's rheobases are already random with respect to type, so ordering by an independent random depth is mathematically the same as today |
| 3.7 Configuration (monopolar/bipolar) | no (v1) | – | Gobbo 2014 FT describes monopolar MP mapping; no human comparison verified |
| 3.8 Position along the axon (`electrodeFraction`) | yes, already (collision timing with a central drive) | model | unchanged; proposed to move into this section in the UI only (DECISION 8) |
| 3.9 mA calibration | yes (§2.2) | user measurement | – |

## 4. Defaults (when the derived option is on, `G = 1` at these values)

| Muscle | Active electrode | Fat `f` | Depth `h` | Source of each default |
|---|---|---|---|---|
| FCR | round, Ø 25 mm (4.9 cm²); return 50 × 50 mm near the wrist | **0.56 cm** | 0.5 cm | Electrode: Baier 2024 FT (the only verified study that stimulated FCR and ECRB through surface electrodes; it also matches the pad the 3D view already draws). Fat: **Doğan et al. 2022 FT**, anterior forearm 1/3 proximal, fat only 5.6 ± 2.8 mm, control group n = 78 (research §4b; decision 9, run on 2026-11-12). Also selectable: Chatlaong 2026 FT (skin + fat, women 0.70, men 0.51 cm) and the biceps value. `h`: **illustrative**, chosen here inside Kuhn 2010's 0.1–1.1 cm |
| ECR | as FCR | 0.48 cm | 0.5 cm | Fat: Petrofsky 2008 A, **biceps (upper arm), INHERITED**: the targeted search found no trustworthy posterior-forearm value (research §4b). Also selectable: Aruna 2023 FT (lateral forearm, men 0.48, women 0.54 cm; implausibly small SDs) and the anterior value of Doğan 2022 (other side of the forearm, INHERITED) |
| Gastrocnemius (medial, lateral) | round, 19.63 cm² | 0.75 cm | 0.5 cm | Lyons 2004 A (most comfortable size on the gastrocnemius); Petrofsky 2008 A (fat below quadriceps and gastrocnemius); `h` illustrative |
| Soleus, TA | square 5 × 5 cm | 0.75 cm | 0.5 cm | Flodin 2022 FT (quadriceps, **INHERITED**); fat inherited from the gastrocnemius; `h` illustrative. No verified electrode study for these muscles |

The author chose the AF option as the default (decision 4), so these defaults are where `G = 1`: a default run of
each muscle is numerically unchanged. This is tested per muscle (`tests/unit/test_electrode.py`,
`test_default_electrode_of_each_muscle_leaves_the_run_unchanged`: the force of a default run equals, sample for sample,
the force of the same run with the electrode removed and with the `NONE` option).

## 5. UI: the Electrode section (Stimulator panel, `SKIN_SURFACE` only)

A collapsible section under **Modo**, hidden for `MOTONEURON_POOL`. Texts follow `tr({ 'pt-BR', en })`. Every value
carries the evidence badge the panel already uses for conditions (`ui/evidence.ts`).

```
Eletrodo                                                     [?]
  Formato         (●) Retangular  ( ) Redondo
  Dimensões       [ 5.0 ] × [ 5.0 ] cm      área 25.0 cm²     ← range 0.5–100 cm² (Kuhn 2010: 0.64; Alon 1985: 81)
  Gordura subcutânea   [ 0.75 ] cm   badge: Petrofsky 2008 · resumo · gastrocnêmio      ← 0–3 cm
  Profundidade do axônio abaixo da gordura  [ 0.5 ] cm   badge: ilustrativo (faixa Kuhn 2010)  ← 0.1–1.1 cm
  Efeito no recrutamento   ▾ Sem efeito do tamanho — Lieber & Kelly 1991 · resumo   (default)
                             Meio semi-infinito, função de ativação — derivado; direção Doheny 2010, Alon 1994 · modelo
  Material / impedância   "Sem efeito: estimulador de corrente constante" badges Farmer 2021 · texto completo; Jafari 2025 · texto completo
  Posição no axônio (com comando central)   [ 0.9 ]          ← electrodeFraction, moved here
  ▸ Calibrar em mA (opcional)
      Limiar motor medido [   ] mA · Recrutamento total [   ] mA (opcional) · Largura de pulso da medida [   ] µs
  Leitura: G = 1.00 · 1ª unidade 56.9 u.m. · todas 102.1 u.m. (com 300 µs)
  Não modelado (com fontes): ponto motor (Gobbo 2011, Botter 2011), distância entre eletrodos (Vieira 2016,
  Doheny 2010), configuração (Gobbo 2014), forma (sem dado verificado)
```

- The recruitment meter and the amplitude dial use `G` and, when calibrated, show mA. The dial's label changes from
  "u.m." to "mA".
- The scopes keep the same time axes.

## 6. Contract changes

**Engine** (`interfaces/http/schemas.py`): a new optional `electrode` object, LITERATURE + `SKIN_SURFACE` only, ignored
otherwise:

```json
"electrode": {
  "shape": "RECTANGLE",            // RECTANGLE | ROUND
  "widthCm": 5.0, "lengthCm": 5.0, // or "diameterCm" for ROUND
  "fatThicknessCm": 0.75,
  "axonDepthCm": 0.5,
  "effectModel": "NONE",           // NONE (Lieber & Kelly 1991) | HALF_SPACE_AF (derived)
  "calibration": null              // or { "motorThresholdMa": 18, "fullRecruitmentMa": null, "pulseWidthUs": 300 }
}
```

- `domain/model_options.py`: an `ElectrodeModel` that yields `G` (and the calibrated `I_rh,min`, `R`) into
  `AxonExcitability`. `threshold()` multiplies by `G`.
- The engine owns a catalog `GET /v1/electrode-options?lang=` with the effect options, their sources, evidence level
  and the per-muscle defaults. It follows the pattern of `GET /v1/conditions` and of the per-article choices in
  `domain/wrist_joint.py` (`PeakForce.SAUL_2015` / `DIRECT_SPECIFIC_TENSION`).
- The run metadata echoes `electrode`, the `G` used and `amplitudeUnit` (`MODEL_UNIT` | `MA`), as it already echoes
  `electrodeFraction`.

**API** (Spring Boot):

- `SimulationRequestDto` + mapper, `SimulationRequestRules`: ranges as in §5; the calibration needs `pulseWidthUs`
  20–1000 and `fullRecruitmentMa > motorThresholdMa`; `electrode` is rejected unless LITERATURE + SKIN_SURFACE.
- `EngineRequestMapper` / `EngineSimulationRequestBody`.
- A relay for the catalog.
- `docs/contracts.md`: fix the amplitude row, which is in µA/cm² only for the soma path and in u.m. or mA for
  `SKIN_SURFACE`.

**Web:**

- `formModel.ts` / `formFields.ts` (the section);
- `modelEquations.ts` `axonRecruitment(amplitude, pw, τ, G, calibration)` and `stimulator.ts`, kept equal to the engine
  by extending `stimulator.fixture.json` (`validation/stimulator_fixture.py`);
- `EquationsView` (stage 2b shows `G`);
- the Compare view: do not overlay amplitudes of runs whose `amplitudeUnit` differs.

**Saved runs** (IndexedDB `eenm`, export `eenm-simulations` v1):

- `electrode` is optional. An absent `electrode` means `effectModel = NONE` with no calibration, which is exactly
  today's math, so every saved run re-runs identically.
- When an old run is loaded into the form, the section shows the muscle's defaults but keeps `NONE`.
- `EXPORT_VERSION` stays 1: a new optional field in `request` does not need a migration.
- Known limit: an older app importing a new export ignores `electrode` and would read an mA amplitude as u.m. The
  import should warn when `amplitudeUnit = MA` is present. This is noted, not proposed to be solved.

## 7. 3D view

- The pad is drawn from the run's `electrode`: radius `√(S/π)` for round pads, a rectangle for rectangular ones.
  `PAD_RADIUS` stays as the fallback for runs without `electrode`, and its comment is corrected (§1).
- Optionally, a translucent fat slab of thickness `f` and the axon depth `f + h` in the L1/L2 cut-away, tagged
  **model** (from the run) where they come from the run and **illustrative** for `h`.
- The inspector shows `G`, its option and its source, with the same model / atlas / illustrative tags as the rest of
  the 3D view (`docs/design/3d-view.md` §1).
- The electrode stays anchored over the motor point (Hosapatna 2020, A, for FCR). Moving it in 3D is still read-only
  (3D-view decision on `electrode_fraction`).

## 8. Validation plan

| # | What | Reference | Pass criterion |
|---|---|---|---|
| V0 | No `electrode`, or `NONE` → unchanged | current `master` | outputs **identical** (`pool120`, stimulator fixture, conditions, doublets) |
| V1 | Closed form = numeric AF at the centre | §2.1 | relative error < 1e-5 for (a, d) ∈ {(0.5, 1), (2.8, 1.25), (3.8, 1.25), (1.25, 0.35)} |
| V2 | Peak AF off-centre for wide, shallow electrodes | §2.1 probe | peak/centre = 2.36 ± 0.05 at (2.8, 0.35); 1.00 at (2.8, 2.5) |
| V3 | Direction: area ↑ → threshold ↑ | Alon 1994 A, Doheny 2010 A, Flodin 2022 FT | sign test, HALF_SPACE_AF |
| V4 | Direction: fat ↑ → threshold ↑, and size sensitivity ↓ | Doheny 2010 A, Maffiuletti 2011 A | sign tests |
| V5 | Direction: area ↑ → current density at threshold ↓ | Flodin 2022 FT | **expected to fail at shallow depth** (§2.1). Kept as `xfail` with the reason, so a better conductor model is caught when it fixes it |
| V6 | Material: changing it changes nothing | Farmer 2021 FT, Jafari 2025 FT | outputs identical |
| V7 | Calibration identity | §2.2 | the first unit fires at `I_MT` and all units at `I_full` (± one amplitude step) at `PW_c`; at other PWs the thresholds follow Weiss |
| V8 | Magnitude of `G` and of the mA curve | **no verified dataset** | blocked. Options: (a) full texts of Doheny 2010, Alon 1994, Kuhn 2010 and Okuma 2013 through institutional access, to read their tables; (b) a recruitment curve measured by the author's lab: torque or M-wave vs mA, FCR/ECR, two electrode sizes, PW 300 µs, with fat measured by ultrasound. Tolerance: within the inter-subject SD of that dataset |

## 9. Decisions

The author answered on **2026-11-12**. The last column is the answer; the proposal is kept for the record.

| # | Decision | Proposal | Author's answer (2026-11-12) |
|---|---|---|---|
| 1 | **mA or a relative factor?** | **Relative** (`G`, amplitude in u.m.) by default. mA only through the **user's own calibration** (§2.2): there is no verified per-muscle mA curve to use as a default (research §8). The calibration also replaces the inherited range `R` with a measured one | Relative factor `G` on the threshold, amplitude in model units, **plus** the optional mA calibration from the user's own measurement (motor threshold, optional full recruitment, pulse width of the measurement; it replaces R when given). The amplitude dial and the recruitment meter show mA when calibrated |
| 2 | **Which parameters ship in v1?** | Area/shape, fat `f`, depth `h`, and the effect option, all recorded in the run and drawn in 3D. Material shown as a verified zero effect. mA calibration. Motor-point offset, inter-electrode distance, configuration and shape effects are listed as "not modelled", with their sources | As proposed |
| 3 | **Default electrode** | Per muscle, as in §4: forearm Ø 25 mm (Baier 2024 FT); gastrocnemius 19.63 cm² (Lyons 2004 A); soleus/TA 5 × 5 cm (inherited from Flodin 2022, quadriceps). Inherited values are labelled INHERITED, as in the muscle presets | As in §4. The leg muscles have a 3D view too (PR #32): the electrode is drawn with its chosen size and shape in both regions |
| 4 | **Conflicting sources** | One selectable option per article, with its evidence badge (the author's preference), as for conditions and `wrist_joint` choices. For the size effect: "No effect: Lieber & Kelly 1991 (A)" vs "Half-space AF: derived; direction Doheny 2010 / Alon 1994". **Default: "No effect"**, because it is the option that reproduces today's results and because the derived option's magnitude fails V5. The author may prefer the AF option as the default, accepting an illustrative magnitude | One option per article with its evidence badge, **but the default is the derived formula** ("Fórmula derivada"), not "no effect". Consequences: `G = 1` at each muscle's default (tested per muscle); the option is labelled "modelo derivado, magnitude ilustrativa, não validada" with V5 as a visible `xfail`; "Sem efeito — Lieber & Kelly 1991" stays selectable |
| 5 | **Depth order of recruitment (Okuma 2013, Farina 2004) vs the current random order (Gregory & Bickel 2005)** | Keep the random order: in this model, ordering by an independent depth changes nothing in the force (§3.6). Revisit only if a verified depth–fibre-type relation for these muscles is found | Keep the random order (proposal) |
| 6 | **The derived AF factor overstates the size effect at shallow depth** | Ship it as an opt-in option labelled "model, magnitude illustrative, not validated", with V5 as a visible `xfail`. Before making it the default, either read the closed full texts (V8a) or measure (V8b). A two-layer (fat + muscle) conductor is a v2 candidate | Compute the AF factor numerically by the peak along the axon (§2.1, the edge-peak case). It is the default (decision 4), labelled as derived and unvalidated |
| 7 | **Muscle-level or per-unit G** | Muscle-level: it shifts the curve and keeps the recruitment range `R` (inherited or calibrated). A per-unit G over the Kuhn 2010 depth range of 0.1–1.1 cm would make the range span about three orders of magnitude (∝ d³ in the far field), which no verified curve supports | Muscle-level G (proposal) |
| 8 | **`electrodeFraction` in the Electrode section** | Move the control there (UI only; the request field and the math are unchanged) | Move it (UI only; request field and math unchanged) |
| 9 | **Fat over the forearm** | Use the biceps value (0.48 ± 0.16 cm, Petrofsky 2008 A) labelled INHERITED until a forearm ultrasound value is verified. A targeted search for forearm fat thickness was not run and is the next research step | Research first. Done on 2026-11-12 (research §4b): FCR uses Doğan 2022 (0.56 cm, FT), with Chatlaong 2026 selectable; ECR keeps 0.48 cm from Petrofsky 2008 (biceps), INHERITED, with Aruna 2023 selectable |

## 10. Where the implementation differs from the text above

- **No `GET /v1/electrode-options` catalog.** The effect options, their sources and the per-muscle defaults live in
  `domain/electrode.py` (engine) and `apps/web/src/domain/electrode.ts` (labels and badges), as the wrist-joint choices
  do. `electrode.fixture.json` (`validation/electrode_fixture.py`) keeps the two equal: the defaults, peaks of the
  activating function, `G` for a set of electrodes and calibrated thresholds.
- **The calibration names its electrode.** `calibration.electrodeAreaCm2` is the area of the electrode the measurement
  was made with (the run's electrode when absent), so `G = G(E) / G(E_c)` of §2.2 is computable; the depth of `E_c` is
  the run's (same person, same site).
- **The fat is chosen from measured values.** The fat field has one button per measured value (one per article), each
  with its badge; the first is the default.
- **Request without `electrode`.** It means the muscle's default electrode with the default effect (the derived formula),
  which is `G = 1`: the same numbers as `NONE` without calibration, so every saved run re-runs identically.
- **Calibration and the condition's τ.** The calibrated `I_rh,min` uses the τ_SD the run actually has (after a condition
  such as `SCI_CHRONAXIE`), so the first unit fires at `I_MT` with `PW_c` in every case.
- **Compare view.** Currents of runs in different units (mA calibrated vs model units) are not overlaid; a notice says so.

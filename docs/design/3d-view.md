# Design: the 3D view (forearm at human scale, structure + firing replay)

Status: **decided, in implementation**. The author accepted every proposal of Section 9 on 2026-11-06. Everything below was checked on 2026-11-06 unless marked otherwise. Items
marked **DECISION** need the author's choice before implementation.

## 1. What the view is for

A new step of the app that draws, at real human scale, what a run did: the skin and the electrode on the forearm,
the stimulated muscle (FCR or ECR), the motor axons and the motoneurons, and then **replays the run** on that
structure: FES pulses, action potentials travelling along the axons, collisions with central spikes, and the muscle
contracting with the force.

Choices already made by the author (2026-11-06):

- **Hybrid anatomy.** The arm silhouette, skin and bones come from an open atlas. The muscles' motor units, the
  axons, the electrode and the motoneurons are **generated from the model's own parameters**, so the 3D view shows the
  run's values and not a drawing.
- **Structure + firing.** Not a static model: a replay of the run's events.
- **Zoom across scales** with level of detail (LOD): whole forearm (≈ 30 cm) → motoneuron (≈ 100 µm).
- three.js through react-three-fiber; its own PR.

Rule for every element: each one is tagged **model** (from a run parameter or event), **atlas** (from the meshes)
or **illustrative** (shape needed to draw something the model does not have). The tag is shown in the inspector,
like the "Origem dos valores" panel of the muscle presets.

## 2. Atlas: BodyParts3D

### 2.1 Source and license (verified)

| Item | Value | How it was checked |
|---|---|---|
| Dataset | BodyParts3D, Database Center for Life Science (DBCLS), mesh set `isa_BP3D_4.0_obj_99` (OBJ, "polygon reduction rate = 99 %"), 136 MB zip | downloaded from `https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/` on 2026-11-06 |
| License on the **site** | **CC Attribution 4.0 International**; required credit: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International" | `https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html` (page updated 2025-02-27) and the archive's `README_e.html` |
| License in **each OBJ header** | **CC Attribution-Share Alike 2.1 Japan**; credit "BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan" | header of the extracted files (dated 2011-05-19) |

The two disagree: the files predate the relicensing. **DECISION 1 — license to comply with.** Proposal: comply with
**both**, which costs nothing here. The adapted meshes (cropped, decimated, converted to glTF) live in their own
folder `apps/web/public/anatomy/` with a `LICENSE.md` that gives the CC BY 4.0 credit, notes the BY-SA 2.1 JP header,
and states that the adapted meshes are offered under BY-SA. Share-alike covers the adapted meshes, not the app's
code. The credit also goes in the 3D view's footer.

### 2.2 Parts used (right arm)

From `isa_element_parts.txt`, measured from the vertices of the extracted OBJ files (units: **mm**, as the header's
`Bounds(mm)` states; z points up, standing pose with the arms down; the whole body is 1 719.5 mm tall):

| Part | FMA | File | Faces | Size x × y × z (mm) | z range (mm) |
|---|---|---|---|---|---|
| Right flexor carpi radialis | FMA38460 | FJ1496 | 1 148 | 87.8 × 65.5 × 276.8 | 780.7 – 1 057.5 |
| Right extensor carpi radialis longus | FMA38495 | FJ1490 | 2 474 | 57.8 × 67.8 × 322.5 | 779.1 – 1 101.6 |
| Right extensor carpi radialis brevis | FMA38498 | FJ1489 | 2 098 | 44.3 × 65.5 × 302.7 | 776.1 – 1 078.7 |
| Right radius | FMA23464 | FJ3349 | 672 | 59.7 × 65.8 × 229.2 | 805.8 – 1 035.0 |
| Right ulna | FMA23467 | FJ3391 | 834 | 50.3 × 78.7 × 247.3 | 805.2 – 1 052.5 |
| Right humerus (elbow end only) | FMA23130 | FJ3368 | 3 784 | 100.8 × 49.2 × 307.3 | 1 029.2 – 1 336.5 |
| Skin (whole body, one mesh) | FMA7163 | FJ2810 | 203 382 | 666.9 × 292.0 × 1 719.5 | −78.1 – 1 641.4 |

Sanity check against measured anatomy: the FCR mesh spans 27.7 cm along the arm; dissected FCR belly + tendon is
16.15 ± 2.39 + 12.48 ± 1.72 = 28.6 cm (Hosapatna et al. 2020, abstract, in `docs/research/wrist-muscles-literature.md`).
The scale is right, so the meshes are used **as they are, in mm**, with no rescaling.

What the atlas does not have:

- **No median or radial nerve** (the 55 "nerve" entries of the IS-A list contain neither). The motor nerve is
  generated (Section 4), which is what the hybrid choice asked for anyway.
- **No forearm-only skin.** The skin is one 203 k-face body mesh. The asset script crops it to the right forearm
  (z from 760 to 1 120 mm, right-arm side) and decimates it.
- **One body**, an adult (sex and anthropometry not stated in what was read). It is drawn as "a forearm", not as the
  simulated person.

The model's ECR is ECRL and ECRB together (`Muscle.EXTENSOR_CARPI_RADIALIS`: the human motor-unit studies do not
separate the heads), so with an ECR run both meshes are the stimulated muscle.

Rejected alternative: Z-Anatomy (GitHub `LluisV/Z-Anatomy`, CC BY-SA 4.0, `.blend` / FBX). Share-alike again, a
Blender export step, and I did not verify where its meshes come from. BodyParts3D is OBJ, in mm, with an FMA id per part.

### 2.3 Asset pipeline

**Implemented 2026-11-06** as `apps/web/scripts/anatomy/build-forearm.mjs`, run by hand, with its output committed. It
downloads the zip (or takes a path) and checks its SHA-256. It then extracts the seven files and checks each size
against the table above (1 %); the check fails when a size is changed by hand, which is the negative probe. It moves
the parts into the forearm frame: metres, origin at the **elbow end of radius + ulna** (the mean of their vertices
within 10 mm of the top; the meshes have no epicondyle landmark), x toward the wrist end, y toward the flexor side.
It crops the skin (6 cm above to 4 cm past the bones, ≤ 7 cm from the axis) and the humerus (its distal 8 cm), and
welds the vertices. Output:

- `apps/web/public/anatomy/forearm.glb`, **0.20 MB** without compression, so no meshopt decoder is needed
  (budget 1.5 MB), with `LICENSE.md` beside it;
- `apps/web/src/domain/forearm.json`: frame, forearm length (0.249 m) and each muscle's cross-sections every 1 cm,
  used by the layout and its tests.

## 3. Levels of zoom

| Level | Field of view | What is drawn | Source of each element |
|---|---|---|---|
| L0 forearm | ≈ 40 cm | skin (translucent), radius/ulna, FCR or ECR (stimulated muscle coloured, the other grey), electrode pads on the skin, motor nerve entering the muscle, the sensor 8 cm from the wrist (once the joint exists) | atlas; electrode position = model; electrode size and nerve path = illustrative |
| L1 muscle | ≈ 5 cm | the muscle cut open: one territory per simulated unit, coloured by type (S / FR / FF), brightness = that unit's force now | unit count, type, force = model; territory shape and place = illustrative |
| L2 nerve and axons | ≈ 5 mm | the bundle of the run's motor axons, from the electrode to the muscle; spikes moving along them; collisions | conduction times, electrode fraction, events = model; axon diameter and spacing = illustrative |
| L3 motoneuron | ≈ 0.5 mm | each motoneuron as the model has it: soma cylinder + equivalent dendrite cylinder, membrane flash on each spike, antidromic arrivals | soma and dendrite diameters and lengths = model |

Two things about these scales:

1. **The motoneurons are not in the forearm.** They sit in the cervical spinal cord. Gallego et al. (2015, FT) uses
   75 cm efferent axons for wrist muscles, and our model's delay implies 0.8 m (Section 4). Drawing that at scale
   would put L3 1 m from L0. **DECISION 2 — where the motoneurons go.** Proposal: a **broken axis** — the axon bundle
   leaves the forearm toward the elbow, a visible gap marked "≈ 0.6 m de axônio omitidos", and the spinal segment with
   the motoneurons beyond it. The spike times keep the full length; only the drawing is cut. The 0.6 m depends on
   where the cut sits and is computed, not hard-coded.
2. **The "1 µm" level asked for earlier has nothing from the model to show.** The model has no nodes of Ranvier,
   channels or myelin: the axon is a delay, and the soma is a two-compartment cylinder. A 1 µm level would be all
   illustrative. **DECISION 3** — proposal: stop at L3 (≈ 0.5 mm, a whole soma of 77.5–113 µm on screen) and leave
   out a node-of-Ranvier drawing until a model has nodes.

LOD switches on camera distance with hysteresis. Each level's objects are mounted only near its range. Labels in
SF at the app's type scale, with a fixed-size scale bar in every level ("1 cm", "1 mm", "100 µm").

## 4. Parameter → structure

| Structure | Parameter | Where in the engine | Value today |
|---|---|---|---|
| Stimulated muscle mesh | `muscle` | `Muscle` | FCR → FJ1496; ECR → FJ1490 + FJ1489; leg muscles → see DECISION 5 |
| Number of units drawn | simulated units per type | `unitsPerType`, `MotorUnitGroup` | e.g. 120 (106/7/7) |
| Unit colour | type | `MotorUnitType` | S / FR / FF, palette of the charts |
| Unit brightness | the unit's force now | **new event data** (Section 5) | – |
| Territory size | the pool units the simulated unit represents | `represent_pool` weight | pool size / simulated of the type (illustrative shape) |
| Soma | soma diameter = length | `soma_diameter_um`, `soma_length_um` (`motor_unit_pool.py`, `cisi_kohn.py`) | 77.5–82.5 (S), 82.5–87.5 (FR), 87.5–113 / 112.5 µm (FF) |
| Dendrite | equivalent cylinder diameter × length | `dendrite_diameter_um`, `dendrite_length_mm` | 41.5–92.5 µm × 5.5–10.6 mm — an *equivalent cylinder*, not a branched tree; the label says so |
| Axon length (time) | soma → muscle delay | `muap_delay_samples` = `axon_length_percent`/100 ÷ APAT | 0.8 ÷ 44–53 → 15.1–18.2 ms. Read as metres and m/s (`fixed_conduction_delay`), that is 0.8 m at 44–53 m/s |
| Electrode position | fraction of the axon from the soma | `electrode_fraction` (default 0.9) | 0.9 → electrode 8 cm from the muscle end along a 0.8 m axon |
| Electrode on the skin | over the motor point | illustrative, anchored by: FCR motor branches 3.5–6.9 cm distal to the bi-epicondylar line (Hosapatna 2020, A) | – |
| Electrode–nerve depth | tissue layers | illustrative, range from Kuhn et al. 2010 (fat 0.25–2 cm, nerve depth 0.1–1.1 cm, A; doi 10.1109/TNSRE.2009.2039807) | the model's recruitment is analytic (Weiss), so depth does not enter it; the label says so |
| Axon diameter | – | **not in the model** | illustrative. A diameter could be derived from the velocity (Hursh 1939, doi 10.1152/ajplegacy.1939.127.1.131 — **not read**; do not use a ratio before reading it) |

Two inconsistencies the 3D view will make visible, recorded here so they are not "fixed" silently in the drawing:

- **Velocity.** The model's 44–53 m/s (APAT read as m/s) is below the 60–100 m/s that Gallego 2015 uses for wrist
  efferents, and below the radial-nerve motor velocity across the elbow, 71.7 ± 4.7 m/s (Date et al. 2002, A, in
  the wrist research file). The 3D view draws spikes at the model's velocity. Changing that is a model decision,
  not a view decision.
- **Electrode position is a fraction, not a place.** The 3D view anchors the electrode on the skin over the motor
  point and derives the soma side from `electrode_fraction`. Moving the electrode in 3D would change
  `electrode_fraction`. Proposal: read-only in the first version.

**DECISION 5 — leg muscles.** The atlas has the leg too, but the request was the forearm. Proposal: the 3D step is
enabled for FCR and ECR runs; for leg-muscle runs it shows a short message and a button to switch to FCR.

## 5. Events: what the engine streams today and what the replay needs

Today (`docs/contracts.md` §2): per chunk, `force` (total and per type, means), `emg`, `stimulus`, `fatigue` per
type at the end of the chunk, and `axonEvents` — **cumulative counts only** (`central`, `centralTransmitted`,
`fesTransmitted`, `collisions`, `fesBlocked`, `resets`). That is enough for L0 (muscle contraction from
`force.total / maxForce`, the stimulus) but **not** for L1–L3: no per-unit spike times, no per-unit force.

Internally the engine already has the events per unit and per sample, in a different place for each mode:

- **non-invasive with a central drive** (the merge): `electrode_events` / `soma_events` in
  `infrastructure/axon_merge.py` write `spikes[j, k]` and increment `counters[k, …]` at the sample where each happens;
- **non-invasive, FES only**: the axons fired by the Weiss recruitment (`domain/axon_stimulation.py`), no collisions;
- **invasive (current into the soma)**: the soma spikes, from the per-unit peak scanner of the force pipeline
  (`domain/streaming_force.py`).

So the spike events are a tap on code that exists, not new physics. Which kinds can occur depends on the mode.

The **per-unit force is not always there.** With twitch exponent 1 it exists before the sum
(`streaming_force.py:378`, `_iir_force(…)[indices - start].sum(axis=1)`). With the generalised twitch the app uses
(`LITERATURE`, exponent ≠ 1), the compiled `_twitch_sum` adds every unit straight into the total. Per-unit force there
means a second output array in that kernel. That costs time, so it needs measuring.

### 5.1 Proposed contract addition (opt-in)

Request: `"output": { "unitEvents": true }` (default `false`: nothing changes for existing clients).

`started` gains a `units` table, sent once. **Implemented 2026-11-06 on every run, not opt-in**: it is ≈ 10 kB for 120 units, and the static scene (phase 2) needs it for any run. Only `unitEvents` stays opt-in. Implemented shape, in `docs/contracts.md` §2, column arrays:

```json
"units": [ { "id": 0, "type": "S", "poolRank": 0, "somaDiameterUm": 77.5, "dendriteDiameterUm": 41.5,
             "dendriteLengthMm": 5.5, "toElectrodeMs": 13.6, "toMuscleMs": 1.5, "weight": 7.57 }, … ]
```

`chunk` gains `unitEvents`, events inside the chunk in time order, as parallel integer arrays (compact, and easy to
check against the counters):

```json
"unitEvents": { "sample": [ … ], "unit": [ … ], "kind": [ … ] }
```

| `kind` | Meaning | Where it happens in the engine |
|---|---|---|
| 0 `SOMA_SPIKE` | the motoneuron fired (central spike leaves the soma) | `soma_events` |
| 1 `FES_FIRE` | an FES pulse fired the axon at the electrode | `electrode_events`, recruited and not refractory |
| 2 `FES_BLOCKED` | pulse recruited the axon but the electrode was refractory | `electrode_events` |
| 3 `COLLISION` | the antidromic FES spike annihilated the in-flight central spike | `electrode_events`, `n_inflight > 0` |
| 4 `ANTIDROMIC_RESET` | an antidromic spike reached the soma and reset it | `soma_events` |
| 5 `CENTRAL_PASSED` | a central spike passed the electrode | `electrode_events` |

The client derives positions: a spike that left the soma at `t0` is at fraction `(t − t0) / toElectrodeMs` of the
soma→electrode segment, and so on. Arrivals at the muscle are `CENTRAL_PASSED` / `FES_FIRE` + `toMuscleMs`, so they
are not sent.

**DECISION 4 — where a collision is drawn.** The engine resolves the collision **at the instant of the FES pulse**
(it removes the oldest in-flight central spike), without computing where the two spikes meet. For the counts this is
equivalent (Formento 2018's rule: they meet if the central spike is between soma and electrode). For the picture
there are two options:
(a) draw the annihilation where the central spike is at the pulse instant: exactly what the engine computes, no
invented kinematics; (b) draw the antidromic spike travelling to meet it at the same velocity, meeting halfway
between the two positions, which looks physical but is a timing the engine does not compute. Proposal: **(a)**,
with the antidromic flash at the electrode.

Per-unit force for L1 brightness (see above: a new kernel output in the app's path). Proposal: send it
**decimated** (e.g. every 5 ms, in % of that unit's rested twitch peak), only with `unitEvents`, and only if the
kernel change keeps the run time within 10 % (measured, end to end). Fallback without it: brightness flashes on
each muscle arrival and decays with the unit's twitch time to peak (tagged illustrative).

**Implemented 2026-11-06 (phases 3–4).** Differences from the proposal above, each for a reason:

- **Arrivals at the muscle are sent** (`MUSCLE_ARRIVAL`), not derived: with the current into the soma and no drive,
  the soma spikes exist only as the force pipeline's peaks at the muscle, and in every mode the arrival is what drives
  the twitch. The replay ends each orthodromic spike at its logged arrival.
- **`SOMA_COLLISION` and `CENTRAL_BLOCKED`** added: the merge also annihilates at the soma (a new soma spike meets a
  pending antidromic one) and drops central spikes that reach a refractory electrode. Both were in the counters or
  implicit, now they are events.
- `origin` links each end event to the spike it ends, so the client draws trajectories without re-running the
  merge's queues.
- Logged per unit inside the compiled merge (one log per unit: the loop is parallel over units) and drained per block.
- Test (§5.3, `tests/unit/test_unit_events.py`): with partial recruitment at 20 Hz under a 6 nA voluntary drive,
  every kind occurs and each count equals its counter. Removing the log of any one kind makes it fail. The first
  scenario tried (supramaximal 30 Hz) had no electrode collision at all, so it could not have caught a missing
  `COLLISION` log.

**Found while testing, not fixed (needs the author):** in the FES-only mode (skin surface, no drive) the force
pipeline applies the whole soma → muscle delay (≈ 18 ms) after the axon fires at the electrode. It should apply only
the electrode → muscle part (≈ 1.8 ms). This is the same error commit e9decea fixed for the drive mode. The replay shows it: in
that mode a spike takes 18 ms from the electrode to the muscle.

**Development hazard found:** `electrode_events` / `soma_events` are inlined (`inline="always"`) into the compiled
integrator with `cache=True`, and Numba's cache is keyed on the caller's file, so editing only `axon_merge.py`
leaves a stale compiled kernel locally (the Docker image builds fresh). Clear `__pycache__/*.nb[ic]` after editing
it.

### 5.2 Volume

Upper bound for the events: 120 units × 3 events per spike (fire, pass, arrival is derived) × 50 Hz × 300 s ≈ 5.4 M
events ≈ 60 MB of JSON — too much to stream and keep in IndexedDB. A 10-s run at 30 Hz: ≈ 0.1 M events ≈ 1.2 MB, fine.
Proposal: `unitEvents` is allowed up to 30 s of simulated time (422 above that, message saying why), and saving a run
saves its events (the Comparar store gains an optional `events` record). Measure the real size on the first
implementation run before fixing the 30 s.

### 5.3 Test that keeps the replay honest

For every run with `unitEvents`, the sum of the events of each kind must equal the final `axonEvents` counters
(`collisions` = count of kind 3, etc.). This is an engine test **and** a client assertion: the replay refuses to play
a run whose events do not add up. Negative probe: drop one event and check that the test fails.

## 5b. The hand and the wrist (implemented 2026-11-06)

The asset script adds the **27 bones of the right hand** (BodyParts3D, merged into one mesh; combined size
105.0 × 84.9 × 158.7 mm checked like the others) and the skin down to the fingertips. The wrist centre is the
**capitate's centroid** (2.0 cm past the end of the radius, on the forearm axis). The engine streams the wrist angle
(central-layer §3.5). The scene turns the hand about z by the angle, and the skin and tendons blend over 3 cm across
the wrist (weight 0 on the forearm → 1 on the hand; illustrative). The forearm level now looks from the radial side
and starts at 1/10× so the motion shows. A readout gives the angle, the limits and the run's wrist choices (peak
force source, passive model; central-layer §3.5).

**Fixed 2026-11-07:** `useGLTF` hands the same cached scene to every mount, so reopening the step with the hand bent
copied the bent vertices as the "rest" pose and the next bend added to it (the wrist looked broken). The rest pose is
now read once from the unbent atlas and kept on each geometry; the hand goes back to rest on unmount, and every new
run starts at 0° (the joint buffer is reset and the replay clock goes back to 0).

## 6. The view in the app

- New step **"3D"** after Resultados (⌘5), Comparar moves to ⌘6. Its settings sidebar: level shortcuts (L0–L3),
  replay controls (play/pause, speed 1/100 × to 1 ×, scrub on the same time axis as the charts), and which units to
  highlight. **DECISION 6** — placement: as a sixth step, or as a mode inside Resultados. Proposal: sixth step.
- The replay's time cursor is shared with the Resultados charts (the zoom/drag sync the app already has): scrub
  in 3D and the cursor moves on the force chart, and the other way round.
- Inspector on click (the app's pattern): click a unit, axon or soma → its parameters, with the model / atlas /
  illustrative tag and the source.
- Contraction at L0: the model is **isometric** today (the joint is phase 3 of the central layer), so the muscle does
  not shorten. The mesh is **thickened** in proportion to `force / maxForce` and tagged illustrative. Once the joint
  exists, the hand rotates with θ (model).
- Fatigue: unit colour saturation follows the type's remaining capacity.
- Text in pt-BR and en through `tr()`, like the rest of the app.

## 7. Technology

- `three`, `@react-three/fiber`, `@react-three/drei` (camera controls, glTF loader, instancing), versions pinned at
  implementation and checked against their current docs.
- The step is a lazy chunk (`React.lazy`) so the other steps do not download three.js.
- Units, axons and spikes are instanced meshes (one draw call per kind). 120 units × a few spikes in flight is far
  under what instancing handles. Event replay runs on `requestAnimationFrame` from the event arrays (binary search on
  `sample` for scrubbing).
- jsdom cannot render WebGL: unit tests cover the pure parts (event → position, LOD choice, the counter check, the
  parameter → geometry mapping); a Playwright screenshot of each level is the visual check.

## 8. Phases and gates

1. **Assets.** Script + glTF + `LICENSE.md`. Gate: the script's size check passes and fails when a size is changed
   by hand (negative probe); bundle ≤ 1.5 MB.
2. **Static L0–L3** from a finished run's parameters (no new engine data). Gate: soma and dendrite dimensions
   in the scene equal the run's `units` table; screenshot per level.
3. **Engine `unitEvents`** (contract, engine, API relay). Gate: Section 5.3 equality on runs with and without
   drive, with FES above and below the natural rate; size measured for 10 s and 30 s.
4. **Replay** with shared cursor. Gate: a scripted run with one unit and known pulse times reproduces each kind of
   event at the expected frame; collision drawn per DECISION 4.
5. **Save/compare** of events. Gate: an exported run replays the same after import.

## 9. Decisions

| # | Decision | Status (all accepted by the author, 2026-11-06) |
|---|---|---|
| 1 | License of the BodyParts3D meshes (site CC BY 4.0, file headers CC BY-SA 2.1 JP) | comply with both; adapted meshes under BY-SA, in their own folder with `LICENSE.md` |
| 2 | Motoneurons are ≈ 0.8 m away in the spinal cord | broken axis with the omitted length written on it |
| 3 | "1 µm" level | stop at L3 (≈ 0.5 mm); no nodes of Ranvier without a model that has them |
| 4 | Where a collision is drawn | (a) where the central spike is at the pulse instant, as the engine computes |
| 5 | Leg-muscle runs | 3D step for FCR/ECR only, with a message for the others |
| 6 | Placement in the app | sixth step "3D" after Resultados |
| 7 | Velocity 44–53 m/s vs 60–100 / 71.7 m/s in the literature | out of scope for the view; draw the model's value, list it as a model question |

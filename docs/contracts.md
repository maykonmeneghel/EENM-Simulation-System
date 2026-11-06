# Service contracts

Three components, one direction of data flow:

```
web (React, :5173)  --HTTP/SSE-->  simulation-api (Spring Boot, :8080)  --HTTP/NDJSON-->  simulation-engine (FastAPI, :8001)
```

The engine computes the model; the API validates requests, owns the public contract and relays the
stream; the web app only talks to the API. All JSON is camelCase. Times are in milliseconds.

---

## 1. Shared request: `SimulationRequest`

Same body on the public API and on the engine. Defaults reproduce `Mathematical Model/Main.m`.

```json
{
  "stimulus": {
    "durationMs": 1000,
    "stepMs": 0.01,
    "frequencyHz": 40,
    "dutyCyclePercent": 20,
    "amplitude": 100,
    "waveform": "MONOPHASIC",
    "modulation": { "target": "AMPLITUDE", "shape": "STEP", "peakTimeMs": null },
    "trainOnMs": null,
    "trainPeriodMs": null,
    "pulseWidthUs": null,
    "rampUpMs": 0,
    "rampDownMs": 0
  },
  "modelVariant": "ORIGINAL",
  "calibrationTarget": "WHOLE_MUSCLE",
  "stimulationSite": "SKIN_SURFACE",
  "condition": "NORMAL",
  "conditionAdjustments": null,
  "muscle": "SOLEUS",
  "unitsPerType": { "S": 5, "FR": 2, "FF": 2 },
  "axonLengthPercent": 80,
  "temperatureCelsius": 6.3,
  "injectionSite": "SOMA",
  "somaGeometry": "CYLINDRICAL",
  "dendriteGeometry": "CYLINDRICAL",
  "seed": 0,
  "outputStepMs": 0.1
}
```

| Field | Type | Default | Valid range (enforced by the API) | MATLAB origin |
|---|---|---|---|---|
| `stimulus.durationMs` | number | 1000 | 10 – 300000 (fatigue protocols last minutes) | `currentEENM` `tmax` |
| `stimulus.stepMs` | number | 0.01 | 0.005 – 0.1 | `step` |
| `stimulus.frequencyHz` | number | 40 | 1 – 200 | `Fb` |
| `stimulus.dutyCyclePercent` | number | 20 | 1 – 99 | `Wb` |
| `stimulus.amplitude` | number | 100 | 0 – 500 (µA/cm²) | `Amp` |
| `stimulus.waveform` | enum | `MONOPHASIC` | `MONOPHASIC`, `BIPHASIC`, `BIPHASIC_SYMMETRIC` (needs `pulseWidthUs`) | `Type` |
| `stimulus.modulation.target` | enum | `AMPLITUDE` | `AMPLITUDE`, `FREQUENCY`, `PULSE_WIDTH` | `ModulationWhere` |
| `stimulus.modulation.shape` | enum | `STEP` | `STEP`, `RAMP`, `TRIANGLE`, `SINUSOIDAL` | `ModulationType` |
| `stimulus.modulation.peakTimeMs` | number \| null | null | required (0 < x < durationMs) when shape = `TRIANGLE` | `tmed` |
| `stimulus.trainOnMs`, `stimulus.trainPeriodMs` | number \| null | null | both or neither; 0 < on ≤ period ≤ durationMs | — (new: intermittent trains, e.g. 330 / 1000) |
| `stimulus.pulseWidthUs` | number \| null | null | 20 – 1000 µs; phases × width < period; modulation AMPLITUDE / STEP; waveform MONOPHASIC or BIPHASIC_SYMMETRIC | — (new: stimulator mode; replaces `dutyCyclePercent`) |
| `stimulus.rampUpMs`, `stimulus.rampDownMs` | number | 0 | 0 – 60000 each; up + down ≤ on time (`trainOnMs`, or `durationMs`) | — (new: amplitude ramps of every train) |
| `modelVariant` | enum | `ORIGINAL` | `ORIGINAL`, `LITERATURE` | — (new, see below) |
| `calibrationTarget` | enum | `WHOLE_MUSCLE` | `WHOLE_MUSCLE`, `SINGLE_UNIT` | — (new, see below; LITERATURE only) |
| `stimulationSite` | enum | `SKIN_SURFACE` | `SKIN_SURFACE`, `MOTONEURON_POOL` | — (new, see below; LITERATURE only) |
| `condition` | enum | `NORMAL` | `NORMAL`, `PARKINSON`, `SCI_CHRONIC` | — (new, see below; LITERATURE only) |
| `conditionAdjustments` | string[] \| null | null (= the condition's defaults) | ids of that condition's available adjustments (`GET /api/v1/conditions`); `[]` = none | — (new) |
| `muscle` | enum | `SOLEUS` | `SOLEUS`, `GASTROCNEMIUS_MEDIAL`, `GASTROCNEMIUS_LATERAL`, `TIBIALIS_ANTERIOR`, `FLEXOR_CARPI_RADIALIS`, `EXTENSOR_CARPI_RADIALIS` | `createUMs` `muscleWork` |
| `unitsPerType.S/FR/FF` | int | 5 / 2 / 2 (`ORIGINAL`); 120 units in the pool's proportions (`LITERATURE`, soleus 106 / 7 / 7) | 0 – 200 each, sum ≥ 1, each ≤ the muscle's pool size | `demangeMNs` |
| `axonLengthPercent` | number | 80 | 1 – 100 | `compAxonal` / `compAxonioMotor` |
| `temperatureCelsius` | number | 6.3 | 0 – 45 | `temperature` |
| `injectionSite` | enum | `SOMA` | `SOMA`, `DENDRITE` | `runnn` `key` (1 = soma) |
| `somaGeometry`, `dendriteGeometry` | enum | `CYLINDRICAL` | `CYLINDRICAL`, `SPHERICAL` | `'Cilindric'`, `'Espheric'` |
| `seed` | int | 0 | ≥ 0 | replaces `randi` (MUAP shape choice) |
| `outputStepMs` | number | 0.1 | ≥ `stepMs`, multiple of it, ≤ 10 | downsampling of the streamed series |
| `centralDrive` | object | absent (no drive) | see below; `LITERATURE` only | — (central layer, phase 2) |

`centralDrive` — descending drive into the motoneurons (`domain/central_drive.py`, design §3.1). The drive is applied
when `enabled` is true **or** the condition is `PARKINSON` with the `PD_TREMOR` adjustment; the tremor oscillator is
added only in the second case.

```json
"centralDrive": { "enabled": true, "backgroundNa": 3.5, "voluntaryNa": 0, "noiseCv": 0.2,
                  "currentScale": "PUBLISHED", "thresholdRule": "CISI_KOHN_2008", "tremor": { "frequencyHz": 4.4, "amplitudeNa": 3.0 },
                  "electrodeFraction": 0.9 }
```

| Field | Default | Range | Meaning |
|---|---|---|---|
| `backgroundNa`, `voluntaryNa` | 3.5, 0 | 0 – 20 nA | Gallego 2015; posture 4.5 – 5.5 nA |
| `noiseCv` | 0.2 | 0 – 2 | SD of the per-unit noise (< 100 Hz) / mean current |
| `currentScale` | `PUBLISHED` | `PUBLISHED`, `RHEOBASE` | `RHEOBASE`: × our smallest rheobase / Gallego's 4 nA (3.5/4 or 5.6/4) |
| `thresholdRule` | `CISI_KOHN_2008` | `CISI_KOHN_2008`, `WATANABE_2013` | thresholds of the drive's Cisi & Kohn motoneurons |
| `tremor.frequencyHz`, `tremor.amplitudeNa` | 4.4, 3.0 | 0.1 – 20 Hz, 0 – 20 nA | Dideriksen 2017 (4.4 Hz) or Agapaki 2018 (5.9 Hz) |
| `electrodeFraction` | 0.9 | 0.01 – 1 | electrode position along the axon from the soma (Decision 4) |

The drive goes into Cisi & Kohn (2008) motoneurons (in nA, as published). With `stimulationSite = MOTONEURON_POOL`
(invasive) the stimulus density is converted to nA through each soma area and added to the drive in the soma. With
`SKIN_SURFACE` (non-invasive) the motoneurons fire from the drive, the stimulus fires the axons at the electrode and the
two meet on the axon (collision, refractoriness, antidromic reset; design §3.3). Without a drive, `SKIN_SURFACE` does not
simulate the motoneurons, as before.

Every field is optional; missing fields take the default. A partial `unitsPerType` (e.g. only `S`) fills the missing types with 5 / 2 / 2 under either variant; omit `unitsPerType` entirely to get the variant default.

### `modelVariant`

- `ORIGINAL` — the MATLAB model as ported, unchanged (`docs/matlab-port-notes.md`).
- `LITERATURE` — every correction validated in `docs/validation/literature-comparison.md`: representative
  units in the pool's proportions weighted by the pool units they represent, human-calibrated twitch,
  each unit's own spikes, summed force with rate saturation (Potvin & Fuglevand 2017), stimulation of the
  motor axons (Weiss strength–duration), duration-independent conduction delay and peripheral fatigue (no
  recovery). With this variant `injectionSite`, `somaGeometry`, `dendriteGeometry` and `temperatureCelsius`
  have no effect (the motoneuron compartments are not simulated), and `amplitude` is a current in the same
  units, whose recruitment range (≈ 57–102 with 0.3 ms pulses) is inherited from the original model.

### `condition` and `conditionAdjustments`

A condition is a set of per-article adjustments of the LITERATURE model, each switchable (overlapping findings are
separate adjustments). The engine owns the catalog — `GET /v1/conditions`, relayed verbatim by the API as
`GET /api/v1/conditions` — with, for every adjustment: `id`, `label`, `effect`, `finding`, `source` (`citation`,
`title`, `doi`, `pmid`), `evidence` (`FULL_TEXT` | `ABSTRACT`), `measuredIn`, `default`, `available`. An id of another
condition, an unknown id or an unavailable adjustment is a validation error. Sources and values:
`docs/research/disease-literature.md`; effects: `docs/validation/literature-comparison.md`, "Conditions".
The texts (`label`, `effect`, `finding`, `measuredIn`) come in the language of `?lang=` (see "Catalog language").

### `stimulationSite`

Where the LITERATURE stimulus acts; ignored by `ORIGINAL` (always the motoneurons).

- `SKIN_SURFACE` — surface FES: the motor axons are excited through the analytic recruitment layer (Weiss
  strength–duration); the motoneurons are not simulated, so `injectionSite`, geometries and `temperatureCelsius` have
  no effect.
- `MOTONEURON_POOL` — the master's-thesis path: the current enters the two-compartment motoneurons, which produce
  the spikes (validated as `pool120` in `docs/validation/literature-comparison.md`); the motoneuron fields apply. About
  3× slower (≈ 9 s per simulated second with 120 units).

Both at once (FES-evoked and motoneuron spikes colliding in the same axon) is part of the central-layer design.

### `calibrationTarget`

Which human data the LITERATURE twitch is calibrated to; ignored by `ORIGINAL`. The two verified datasets
cannot both be met (`docs/validation/literature-comparison.md`, "Calibration target"):

- `WHOLE_MUSCLE` — twitch of the whole human triceps surae (CT 120.7 ms): whole-muscle twitch matches,
  f50 ≈ 5 Hz is low.
- `SINGLE_UNIT` — mean twitch of single human motor units (Macefield 1996, CT 74.8 ms): f50 ≈ 9 Hz matches
  9.6 ± 0.6 Hz, the whole-muscle twitch (CT ≈ 71 ms) is faster than measured.

---

## 2. Stream events

The engine streams **NDJSON** (`application/x-ndjson`, one JSON object per line).
The API relays the very same objects as **Server-Sent Events** (`text/event-stream`), using the
object's `type` as the SSE `event:` name and the whole object as `data:`.

### `started` (exactly once, first)
```json
{ "type": "started", "simulationId": "6f1c…", "durationMs": 1000, "outputStepMs": 0.1,
  "motorUnits": { "S": 5, "FR": 2, "FF": 2 }, "muscle": "SOLEUS", "maxForce": 5.1754 }
```

`maxForce` is the maximal force of the **healthy** muscle in the same units as `force` (`domain/max_force.py`): the
peak of a fused tetanus with every simulated unit firing at 100 Hz, rested (no fatigue), same muscle, units, axon
length, twitch calibration and integration step as the run, without the condition's adjustments — so `force /
maxForce` is the fraction of maximum and a condition shows as a deficit. It uses the run's step because force in model
units is proportional to the step (tetanus peak / step = 517.54 for the soleus). `null` for `ORIGINAL`.

### `chunk` (many, in time order, no gaps, no overlap)
```json
{ "type": "chunk", "progress": 0.05,
  "timeMs":   [0.0, 0.1, …],
  "stimulus": [100.0, 100.0, …],
  "force":    { "total": […], "S": […], "FR": […], "FF": […] },
  "emg":      […],
  "fatigue":  { "timeMs": 4.99, "muscle": 0.998, "S": 1.0, "FR": 0.999, "FF": 0.991 },
  "axonEvents": null }
```

`axonEvents` — cumulative counts of the axon merge (non-invasive mode with a central drive), else `null`:
`{ "central", "centralTransmitted", "fesTransmitted", "collisions", "fesBlocked", "resets" }` (integers).
All arrays in one chunk have the same length. `progress` ∈ (0, 1]. `force.total = S + FR + FF`
(each the mean over that type's units, as in `Main.m`). `emg` is the mean motor-unit action potential
(`EENMResults.MFAP`).

`fatigue` is the remaining force capacity (1 = rested, 0 = exhausted; Potvin & Fuglevand 2017, no recovery) at the
end of the chunk, `timeMs` being that instant: `S` / `FR` / `FF` the mean over the simulated units of the type (`null`
when the type has none), `muscle` the units weighted by their rested twitch force and the pool units they represent.
`null` when the model has no fatigue (`ORIGINAL`). The fatigue index per train (peak ÷ first peak) is computed by the
client from `force.total`.

### `completed` (exactly once, last, on success)
```json
{ "type": "completed", "elapsedSeconds": 12.3,
  "summary": { "peakForce": 1.23, "meanForce": 0.45, "timeToPeakMs": 310.0 } }
```

`summary` is taken over the streamed samples (the `outputStepMs` grid): `timeToPeakMs` is a multiple of it.

### `error` (instead of `completed`)
```json
{ "type": "error", "message": "human readable", "code": "ENGINE_FAILURE" }
```

---

## 3. Simulation engine (Python) — internal, port 8001

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{"status":"ok"}` |
| GET | `/v1/muscles?lang=` | list of muscle presets (below) |
| GET | `/v1/conditions?lang=` | catalog of conditions and their adjustments (§2, `condition`) |
| POST | `/v1/simulations/stream` | `200 application/x-ndjson` stream of events; `422` on invalid body |

Muscle preset:
```json
{ "id": "SOLEUS", "label": "Soleus", "poolSize": { "S": 800, "FR": 50, "FF": 50 }, "provenance": [] }
```

`muscle` ∈ `SOLEUS`, `GASTROCNEMIUS_MEDIAL`, `GASTROCNEMIUS_LATERAL`, `TIBIALIS_ANTERIOR`, `FLEXOR_CARPI_RADIALIS`,
`EXTENSOR_CARPI_RADIALIS`. `provenance` says where each value of a preset comes from; it is empty for the leg presets
(the original model's table) and filled for the wrist presets (`domain/muscle_profiles.py`):

```json
{ "field": "Tempo do abalo", "provenance": "FITTED", "value": "…",
  "source": { "citation": "Behrens et al. 2019", "title": "…", "doi": "10.3389/fbioe.2019.00181", "pmid": null },
  "evidence": "FULL_TEXT", "calibrationTarget": "WHOLE_MUSCLE" }
```

`provenance` ∈ `MEASURED` (read in a human study of this muscle), `FITTED` (calibrated to reproduce one),
`INHERITED` (no verified data: the soleus value; `source` null). `calibrationTarget` non-null = the entry applies only
to that twitch calibration. With `LITERATURE`, the muscle also selects its own twitch calibration where one exists
(FCR whole muscle, ECR single unit); otherwise the soleus fit is used.

### Catalog language

`GET /v1/muscles` and `GET /v1/conditions` take an optional `lang` query parameter: `pt-BR` (default, the texts as
they have always been) or `en`. It changes only the texts — preset `label`, provenance `field` and `value`, condition
`label`, adjustment `label`, `effect`, `finding` and `measuredIn` — never ids, numbers, flags or `source` (citations
and titles stay as published). Any other value is `422`. English texts: `domain/texts_en.py`, keyed by the pt-BR text.

## 4. Simulation API (Java) — public, port 8080

| Method | Path | Response |
|---|---|---|
| GET | `/actuator/health` | Spring health |
| GET | `/api/v1/muscles?lang=` | relays engine presets |
| GET | `/api/v1/conditions?lang=` | relays the engine catalog of conditions verbatim |
| POST | `/api/v1/simulations` | `200 text/event-stream` relaying events; `400` problem+json on validation errors |

Validation errors use RFC 9457 `application/problem+json` with an `errors` array of
`{ "field": "stimulus.frequencyHz", "message": "must be between 1 and 200" }`.
`lang` (optional on the two catalog endpoints, forwarded to the engine; `pt-BR` when absent) other than `pt-BR` or
`en` is `400` problem+json with `{ "field": "lang", "message": "must be pt-BR or en" }`.
If the engine is unreachable: `502` problem+json before streaming starts, or an `error` event
(`code: "ENGINE_UNAVAILABLE"`) once streaming has started. CORS allows `http://localhost:5173`.

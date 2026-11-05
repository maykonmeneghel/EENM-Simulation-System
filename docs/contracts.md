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
| `muscle` | enum | `SOLEUS` | `SOLEUS`, `GASTROCNEMIUS_MEDIAL`, `GASTROCNEMIUS_LATERAL`, `TIBIALIS_ANTERIOR` | `createUMs` `muscleWork` |
| `unitsPerType.S/FR/FF` | int | 5 / 2 / 2 (`ORIGINAL`); 120 units in the pool's proportions (`LITERATURE`, soleus 106 / 7 / 7) | 0 – 200 each, sum ≥ 1, each ≤ the muscle's pool size | `demangeMNs` |
| `axonLengthPercent` | number | 80 | 1 – 100 | `compAxonal` / `compAxonioMotor` |
| `temperatureCelsius` | number | 6.3 | 0 – 45 | `temperature` |
| `injectionSite` | enum | `SOMA` | `SOMA`, `DENDRITE` | `runnn` `key` (1 = soma) |
| `somaGeometry`, `dendriteGeometry` | enum | `CYLINDRICAL` | `CYLINDRICAL`, `SPHERICAL` | `'Cilindric'`, `'Espheric'` |
| `seed` | int | 0 | ≥ 0 | replaces `randi` (MUAP shape choice) |
| `outputStepMs` | number | 0.1 | ≥ `stepMs`, multiple of it, ≤ 10 | downsampling of the streamed series |

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
  "motorUnits": { "S": 5, "FR": 2, "FF": 2 }, "muscle": "SOLEUS" }
```

### `chunk` (many, in time order, no gaps, no overlap)
```json
{ "type": "chunk", "progress": 0.05,
  "timeMs":   [0.0, 0.1, …],
  "stimulus": [100.0, 100.0, …],
  "force":    { "total": […], "S": […], "FR": […], "FF": […] },
  "emg":      […],
  "fatigue":  { "timeMs": 4.99, "muscle": 0.998, "S": 1.0, "FR": 0.999, "FF": 0.991 } }
```
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

### `error` (instead of `completed`)
```json
{ "type": "error", "message": "human readable", "code": "ENGINE_FAILURE" }
```

---

## 3. Simulation engine (Python) — internal, port 8001

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{"status":"ok"}` |
| GET | `/v1/muscles` | list of muscle presets (below) |
| POST | `/v1/simulations/stream` | `200 application/x-ndjson` stream of events; `422` on invalid body |

Muscle preset:
```json
{ "id": "SOLEUS", "label": "Soleus", "poolSize": { "S": 800, "FR": 50, "FF": 50 } }
```

## 4. Simulation API (Java) — public, port 8080

| Method | Path | Response |
|---|---|---|
| GET | `/actuator/health` | Spring health |
| GET | `/api/v1/muscles` | relays engine presets |
| POST | `/api/v1/simulations` | `200 text/event-stream` relaying events; `400` problem+json on validation errors |

Validation errors use RFC 9457 `application/problem+json` with an `errors` array of
`{ "field": "stimulus.frequencyHz", "message": "must be between 1 and 200" }`.
If the engine is unreachable: `502` problem+json before streaming starts, or an `error` event
(`code: "ENGINE_UNAVAILABLE"`) once streaming has started. CORS allows `http://localhost:5173`.

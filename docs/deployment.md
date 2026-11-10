# Hosted deployment (nmes-simulator.meneghel.me)

How the code supports a public, hosted copy of the simulator on AWS Lambda. The infrastructure itself (Lambda
functions, CloudFront, S3, secrets, Firebase project) lives in a private repository; this page is the contract between
the two. **Every behaviour described here is off by default**: without the variables below, `docker compose up`,
`scripts/dev.sh` and `npm run dev` behave exactly as before (checked: the local images answer the contract limits,
send no security header, need no token and accept a 300 s run).

```
browser ──https──> CloudFront (nmes-simulator.meneghel.me)
                     ├── /*        → S3 (apps/web build, static files)
                     └── /api/*    → API Lambda function URL  (adds X-Origin-Verify: <EENM_ORIGIN_SECRET>)
                                       └── Spring Boot (services/simulation-api, Dockerfile.lambda, port 8080)
                                             └──https──> engine Lambda function URL (sends X-Engine-Key: <EENM_ENGINE_SECRET>)
                                                           └── uvicorn (services/simulation-engine, Dockerfile.lambda, port 8001)
```

The web app calls `/api/v1/...` on its own origin (no CORS in production). Both Lambdas run their HTTP server behind
the [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) 1.1.0 with response streaming, so the
engine's NDJSON and the API's Server-Sent Events reach the browser while they are computed.

## CloudFront path layout

| Path pattern | Origin | Cache | Notes |
|---|---|---|---|
| `/api/*` | API function URL (invoke mode `RESPONSE_STREAM`) | disabled | forward `Authorization`, `Content-Type`, `Accept` and the query string (`?lang=`); add the custom origin header `X-Origin-Verify`; allow `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE` (POST is needed) |
| `/*` (default) | S3 bucket with the `apps/web` build (`npm run build` → `dist/`) | yes | single-page app: `index.html` for `/` |

Endpoints under `/api`: `GET /api/v1/muscles`, `GET /api/v1/conditions`, `GET /api/v1/limits` (public),
`GET /api/v1/session` and `POST /api/v1/simulations` (signed-in, when sign-in is on). The health check
`/actuator/health` is used by the Lambda Web Adapter inside the function; CloudFront does not need to expose it.

The engine function URL is called only by the API (`ENGINE_BASE_URL`, no trailing slash). Its own guard is
`X-Engine-Key`; an IAM-authorised function URL would need SigV4 signing in the API, which is not implemented.

## Environment variables

"Hosted" is the value proposed for nmes-simulator.meneghel.me. Secrets are random strings kept in the private infra
(e.g. Secrets Manager / encrypted Lambda environment); never commit them.

### API (`services/simulation-api`)

| Variable | Default | Hosted | What it protects / does |
|---|---|---|---|
| `ENGINE_BASE_URL` | `http://localhost:8001` | engine function URL | where the engine is |
| `ENGINE_CONNECT_TIMEOUT` | `2s` | `5s` | TCP + TLS connect to the engine. A cold engine Lambda does not delay the *connect* (the function URL front end accepts it; the cold start shows as time to first byte, ≈ 2.5 s measured below), so 2 s would do; 5 s is margin for TLS across services. Not measured on AWS. |
| `API_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | `https://nmes-simulator.meneghel.me` | browsers' cross-origin calls (same origin in production, so mostly moot) |
| `EENM_MAX_DURATION_MS` | `300000` | `5000` | compute: simulated time is the main multiplier of the run time |
| `EENM_MIN_STEP_MS` | `0.005` | `0.01` | compute: integration steps per simulated ms (0.01 is the default step) |
| `EENM_MAX_FREQUENCY_HZ` | `200` | `100` | compute and payload: pulses, spikes and 3D events per second (measured: 200 Hz is up to 1.9× slower than 40 Hz in the motoneuron-pool mode) |
| `EENM_MAX_UNITS_PER_TYPE` | `200` | `120` | compute and memory per simulated unit |
| `EENM_MAX_TOTAL_UNITS` | `600` | `120` | same, in total; 120 keeps the `LITERATURE` automatic 120 units (a request without `unitsPerType` counts as 120) |
| `EENM_MAX_OUTPUT_POINTS` | `0` (no cap) | `50000` | payload and browser memory: samples per streamed series = `durationMs / outputStepMs` (at 5 s, output step ≥ 0.1 ms, the default). Above 6 MB a Lambda stream is limited to 2 MB/s ([AWS](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html#config-rs-bandwidth-cap)); measured worst case at 50 000 points: 11.8 MB |
| `EENM_MAX_UNIT_EVENTS_DURATION_MS` | `30000` | `5000` | payload of `output.unitEvents` (3D replay); equal to the duration cap |
| `EENM_AUTH_FIREBASE_PROJECT_ID` | empty (no sign-in) | the Firebase project id | who may run the engine. When set, `POST /api/v1/simulations` and `GET /api/v1/session` (and every path not listed as public) need `Authorization: Bearer <Firebase ID token>`: RS256 signature against Google's JWKS (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`), `iss` = `https://securetoken.google.com/<projectId>`, `aud` = `<projectId>`, `exp` in the future, `iat` and `auth_time` in the past (60 s skew), non-empty `sub`, and a verified e-mail (`email_verified` true). No or a bad token: 401 problem+json. Public: muscles, conditions, limits, health, CORS preflights. The uid (`sub`), never the e-mail, is logged per simulation. |
| `EENM_AUTH_ALLOWED_EMAILS` | empty | the allowlist (private infra only) | with sign-in on, only these e-mails (comma separated, trimmed, case-insensitive; verified) may run simulations; any other account gets 403 problem+json that does not reveal the list. **Empty with sign-in on: any verified Google account is allowed** and the API logs a warning at start. Ignored when sign-in is off. Never put real addresses in this public repository. |
| `EENM_ORIGIN_SECRET` | empty (no check) | random secret, also set on CloudFront | requests that bypass CloudFront: without `X-Origin-Verify: <secret>` every path but `/actuator/health` is 403 problem+json (constant-time comparison) |
| `EENM_ENGINE_SECRET` | empty | random secret, same as the engine's | sent as `X-Engine-Key` on every engine call |
| `PORT` | `8080` | `8080` (set in `Dockerfile.lambda`) | |

The limits are enforced as 400 problem+json naming the field, like any validation error, e.g.
`{"field":"stimulus.durationMs","message":"must be less than or equal to 5000 (limit of this server)"}`. A configured
limit can only narrow the contract range (a looser value is ignored). `GET /api/v1/limits` reports the active ones:

```json
{"minDurationMs":10,"maxDurationMs":5000,"minStepMs":0.01,"maxStepMs":0.1,"maxFrequencyHz":100,
 "maxUnitsPerType":120,"maxTotalUnits":120,"maxOutputPoints":50000,"maxUnitEventsDurationMs":5000}
```

### Engine (`services/simulation-engine`)

| Variable | Default | Hosted | What it protects / does |
|---|---|---|---|
| `EENM_ENGINE_SECRET` | empty (no check) | same secret as the API's | only the API reaches the engine: without `X-Engine-Key: <secret>` every path but `/health` is 403 (constant-time comparison) |
| `EENM_MAX_DURATION_MS`, `EENM_MIN_STEP_MS`, `EENM_MAX_FREQUENCY_HZ`, `EENM_MAX_UNITS_PER_TYPE`, `EENM_MAX_TOTAL_UNITS`, `EENM_MAX_OUTPUT_POINTS`, `EENM_MAX_UNIT_EVENTS_DURATION_MS` | unset (no cap) | **the same values as the API** | defence in depth: the same caps, checked again by the engine (422 in FastAPI's format, which the API turns into the same 400 problem+json). Unset, the engine accepts what it accepted before. |
| `NUMBA_CPU_NAME` | `generic` in `Dockerfile.lambda` (build argument) | `generic` | the CPU the cached kernels are compiled for; must not be the build machine's |

> Infra note: the engine caps are only a second line if the engine Lambda gets the same `EENM_MAX_*` / `EENM_MIN_*`
> values as the API. With only `EENM_ENGINE_SECRET` on the engine, the API is the single check.

### Web (`apps/web`, build time)

| Variable | Default | Hosted | Notes |
|---|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | empty (no sign-in) | the Firebase web app config | all four set: a sign-in screen ("Entrar com Google" / "Sign in with Google") comes before the simulator |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_STORAGE_BUCKET` | empty | optional | passed to `initializeApp` when set |
| `VITE_API_BASE_URL` | `''` (same origin) | `''` | |

**Everything with the `VITE_` prefix is public by design**: Vite writes the values into the JavaScript bundle that any
visitor downloads (a Firebase web API key is an identifier, not a secret; access is enforced by the API and the
allowlist). Never give a secret a `VITE_` name. The app reads no other variable (Vite exposes only `VITE_` ones to the
client); `main.tsx` names the six Firebase variables one by one, so no other `VITE_` value is inlined (checked: a
`VITE_OTHER_PROBE` and a non-`VITE_` probe set during a build do not appear in `dist/`). Root `.gitignore` ignores
`.env` and `.env.*` (but `.env.example`).

Firebase console: enable the Google provider and add `nmes-simulator.meneghel.me` to the authorised domains.

## Sign-in flow (web)

- Firebase JS SDK `firebase@13.1.0` (exact pin), loaded only when the variables are set; Google sign-in with
  `signInWithPopup` (the page and its unsaved form stay; no dependency on third-party storage the way a redirect from
  the `firebaseapp.com` auth domain has).
- After sign-in the app calls `GET /api/v1/session` with the token: 200 → the simulator; 403 → "Sua conta não tem
  acesso a este simulador." / "Your account does not have access to this simulator." with a sign-out button.
- The simulation stream is read with `fetch` (not `EventSource`), so the ID token goes in the `Authorization` header;
  it is sent only to the calls that run the engine, never to the public catalogues. The SDK refreshes the hour-long
  token before it expires (`getIdToken()`); a 401 is retried once with a forced refresh, then the user is signed out.
  A 403 on a simulation also shows the no-access screen. The toolbar shows the account with "Sair" / "Sign out".
- The form reads `GET /api/v1/limits`: the duration field's range and a note ("Este servidor permite até 5.000 ms por
  simulação.") follow the server, and an over-limit value is refused before the call ("este servidor limita a
  duração a 5000 ms" / "this server limits the duration to 5000 ms"). The output step is raised automatically to stay
  within `maxOutputPoints`.
- `npm audit` reports advisories in `@grpc/grpc-js` through `@firebase/firestore`; the app imports only
  `firebase/app` and `firebase/auth`, so no Firestore or gRPC code is in the bundle (checked in `dist/`: the only
  mention is the package-name table of `@firebase/app`).

## Lambda images

`services/simulation-engine/Dockerfile.lambda` and `services/simulation-api/Dockerfile.lambda` (the local `Dockerfile`s
are unchanged). Both copy `/lambda-adapter` from `public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0` into
`/opt/extensions/` and set `AWS_LWA_INVOKE_MODE=response_stream`, `AWS_LWA_PORT` (8001 / 8080) and
`AWS_LWA_READINESS_CHECK_PATH` (`/health` / `/actuator/health`). Configure each function URL with invoke mode
`RESPONSE_STREAM`.

```sh
docker build --platform linux/arm64 -f Dockerfile.lambda -t eenm/simulation-engine:lambda services/simulation-engine
docker build --platform linux/arm64 -f Dockerfile.lambda -t eenm/simulation-api:lambda services/simulation-api
```

- **Engine — Numba cache.** The `cache=True` kernels are compiled at build time (`python -m eenm_engine.warmup`, one
  short run of every mode) for a generic CPU of the target architecture, then `python -m eenm_engine.warmup
  --expect-cached` fails the build if any kernel would compile again. Lambda's filesystem is read-only except `/tmp`,
  and Numba uses a cache directory only if it can write a test file in it
  (`numba/core/caching.py`, `ensure_cache_path`): with the cache left in the image, importing the engine fails
  (`RuntimeError: cannot cache function '_median_3x3': no locator available`, reproduced). So the entrypoint copies the
  cache (0.5 MB, 1–3 ms) to `/tmp/numba-cache` once per container and points `NUMBA_CACHE_DIR` there; the image
  filesystem is never written. Checked in a `--read-only --tmpfs /tmp` container: all 8 kernels loaded from the cache,
  0 compiled, and a write to `/app` fails with EROFS. uvicorn is started directly (not through `uv run`, which may write).
- **API — class data sharing.** The jar is extracted and a training run (`-XX:ArchiveClassesAtExit`,
  `-Dspring.context.exit=onRefresh`) produces `application.jsa`; the JVM starts with it, `-XX:TieredStopAtLevel=1` and
  the serial GC (a relay with little steady-state work).
- **Architecture: arm64 (recommended) or x86_64.** Both images build and run: arm64 natively on the build machine,
  x86_64 under emulation (`linux/amd64` on Apple silicon; works, timings not representative). Numba (llvmlite wheels for
  `manylinux aarch64`), the Python 3.12 slim image, Temurin 21 and the adapter image exist for both. arm64 is the
  cheaper Lambda architecture (lower price per GB-s; AWS pricing, not measured here) and the one measured below; on
  arm64 the generic CPU target was as fast as the host target (24.19 s vs 24.04 s, worst case, 2 threads). On x86_64,
  `generic` means the baseline instruction set (no AVX2) — its cost on Lambda x86 CPUs is **not measured**; if the
  default x86_64 is kept, compare once with `--build-arg NUMBA_CPU_NAME=<a level the Lambda CPUs have>`.

## Measured timings

Machine: Apple M4 Pro (14 cores), macOS; containers in Docker Desktop's Linux VM (arm64), `--read-only --tmpfs /tmp`,
`--cpus` as stated. Engine wall time = the whole request (setup, integration, force, JSON serialisation of every
event). **None of this was measured on AWS**: Lambda's Graviton cores are likely slower than M4 cores, and Lambda
gives about 1 vCPU per 1769 MB of memory (6 vCPU at 10 240 MB; AWS documentation, not measured).

### Worst case allowed by the hosted caps

5 s, step 0.01 ms, 100 Hz, 120 units (40 / 40 / 40, flexor carpi radialis, so 3D events on), output 0.05 ms
(100 000 points — twice the proposed cap; at 50 000 points the native ORIGINAL run took 24.04 s vs 24.47 s, so the
compute dominates).

| Mode | native, 14 threads | native, 6 threads | native, 2 threads | container 6 CPUs | container 2 CPUs |
|---|---|---|---|---|---|
| `ORIGINAL` (Booth motoneurons, 120 units) — **the worst** | 7.88 s | 11.57 s | 24.47 s | 10.37 s | 32.54 s |
| `LITERATURE`, skin surface | 2.83 s | 2.69 s | 5.35 s | | |
| `LITERATURE`, motoneuron pool | 4.67 s | 5.22 s | 11.86 s | | 25.62 s cold / 21.20 s warm |
| `LITERATURE`, skin surface + central drive | 4.09 s | 4.37 s | 8.80 s | | |
| `LITERATURE`, motoneuron pool + central drive | 4.17 s | 4.45 s | 8.90 s | | |

Frequency (native, 14 threads, same run): motoneuron pool 3.71 s at 40 Hz, 4.67 s at 100 Hz, 8.65 s at 200 Hz.
Stream size at 50 000 points: 5.5 MB (`ORIGINAL`) to 11.8 MB (`LITERATURE` + drive with 3D events). For comparison,
the contract's worst case (600 units, step 0.005 ms, 200 Hz) took 6.3–9.4 s for **0.5 s** simulated (native, 14
threads), i.e. on the order of a minute or more per 5 s (extrapolated, not run).

### Cold start (read-only containers, 2 CPUs)

| | measured |
|---|---|
| engine container healthy (`/health`) after `docker run` | 1.08 – 1.35 s |
| API container healthy (`/actuator/health`), with CDS | 1.33 s (Spring context 0.49 s) |
| API without CDS (same image, plain `java -jar`) | 1.24 s (Spring context 0.81 s) |
| first simulation on a cold engine (`LITERATURE` default, 1 s simulated), direct | first byte 2.43 s, total 2.96 s |
| first simulation through a cold API + cold engine, started together | first byte 2.51 s, total 2.99 s |
| same, second request (warm) | first byte 0.06 s, total 0.56 s |
| x86_64 images under emulation (only to show they work) | healthy 3.2 / 4.1 s, first byte 7.2 s |

The ≈ 2.4 s before the first byte of a cold engine is the first use of the cached kernels, not compilation (0 kernels
compiled, checked); where exactly that time goes was not profiled. Lambda adds its own container
start (image pull, init) to these numbers; not measured. CloudFront's 60 s origin response timeout applies to the first
byte and to the gaps between packets (CloudFront documentation, not tested here): the first byte arrives in ≈ 2.5 s cold, and the stream then sends a chunk per 5 ms of
simulated time.

## Proposed hosted configuration

- Caps: `EENM_MAX_DURATION_MS=5000`, `EENM_MIN_STEP_MS=0.01`, `EENM_MAX_FREQUENCY_HZ=100`,
  `EENM_MAX_UNITS_PER_TYPE=120`, `EENM_MAX_TOTAL_UNITS=120`, `EENM_MAX_OUTPUT_POINTS=50000`,
  `EENM_MAX_UNIT_EVENTS_DURATION_MS=5000`, on the API **and** the engine. They keep every default run of the app
  (LITERATURE, 120 automatic units, 1 s, step 0.01, output 0.1) and allow up to 5 s of it.
- Engine Lambda: arm64, 10 240 MB (≈ 6 vCPU) → worst case ≈ 10.4 s in the 6-CPU container; timeout **60 s** (×5–6
  margin for slower cores, not measured). With 3 538 MB (≈ 2 vCPU) the worst case is ≈ 33 s in the 2-CPU container:
  use a 90 s timeout then. Similar cost per worst-case run (≈ 104 vs ≈ 112 GB-s, memory × measured time), much
  shorter waits with more memory.
  A typical 1 s run takes ≈ 0.6 s warm.
- API Lambda: arm64, 1 024 MB (not tuned; peak heap of a relay is small), timeout longer than the engine's (e.g. 90 s
  with a 60 s engine), `ENGINE_CONNECT_TIMEOUT=5s`.
- Concurrency: a Lambda environment serves one request at a time (AWS documentation); set reserved concurrency on the engine (e.g. 2–5) to
  cap the cost of a burst. Streamed responses are not stopped when the client disconnects (AWS documentation), so the
  timeout and the caps are what bound the cost of an abandoned run.

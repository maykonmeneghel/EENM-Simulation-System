# simulation-engine

Python port of the EENM neuromuscular model (master's thesis, `Mathematical Model/` in MATLAB).
Streams the muscle force produced by an electrical current applied to a motoneuron pool.

## Architecture

```
src/eenm_engine/
  domain/          pure model: stimulus, motor-unit pool, HH motoneuron, force pipeline, streaming
  application/     use case RunSimulation + ports (OdeSolver) + events
  infrastructure/  adapters: ScipyBdfSolver
  interfaces/http/ FastAPI app, request/response schemas
```

Dependencies point inwards: `interfaces → application → domain`; `infrastructure` implements
`application.ports`. The domain uses NumPy/SciPy only as maths libraries.

See `../../docs/contracts.md` (API), `../../docs/matlab-port-notes.md` (what maps to what, and the
original behaviours kept on purpose).

## Run

```sh
uv sync
uv run uvicorn eenm_engine.interfaces.http.app:app --port 8001
curl -N -X POST localhost:8001/v1/simulations/stream -H 'content-type: application/json' \
     -d '{"stimulus":{"durationMs":200}}'
```

## Hosted deployment

Optional guards (`EENM_ENGINE_SECRET`, the `EENM_MAX_*` / `EENM_MIN_STEP_MS` caps; all off by default) and the Lambda
image with the Numba cache built in (`Dockerfile.lambda`, `python -m eenm_engine.warmup`):
[`docs/deployment.md`](../../docs/deployment.md).

## Test

```sh
uv run pytest            # unit tests (fake solver) + streaming == batch equivalence
uv run ruff check src tests && uv run mypy
```

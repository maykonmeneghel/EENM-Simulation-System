# simulation-api

Public HTTP API of the EENM simulator (Spring Boot 4.1, Java 21, WebFlux). It validates the simulation
request, calls the Python engine (`POST /v1/simulations/stream`, NDJSON) and relays every event to the
browser as Server-Sent Events while the engine produces it. The binding contract is
[`docs/contracts.md`](../../docs/contracts.md).

## Endpoints (port 8080)

| Method | Path | Response |
|---|---|---|
| GET | `/actuator/health` | Spring health (does not depend on the engine) |
| GET | `/api/v1/muscles` | engine muscle presets; `502` problem+json if the engine is unreachable |
| POST | `/api/v1/simulations` | `200 text/event-stream` (`started`, `chunk`..., then `completed` or `error`); `400` problem+json with an `errors` array on invalid input; `502` problem+json if the engine is unreachable before the first event |

Every request field is optional; missing fields take the contract defaults (an empty body runs the
`Main.m` default simulation). If the engine is lost after streaming started, the stream ends with an
`error` event with code `ENGINE_UNAVAILABLE`. Closing the browser connection cancels the engine call.

```bash
curl -N -X POST localhost:8080/api/v1/simulations \
  -H 'Content-Type: application/json' \
  -d '{"stimulus":{"frequencyHz":50,"modulation":{"shape":"TRIANGLE","peakTimeMs":500}}}'
```

## Configuration

| Property | Env | Default |
|---|---|---|
| `server.port` | `PORT` | `8080` |
| `engine.base-url` | `ENGINE_BASE_URL` | `http://localhost:8001` |
| `engine.connect-timeout` | `ENGINE_CONNECT_TIMEOUT` | `2s` |
| `engine.max-line-size` | `ENGINE_MAX_LINE_SIZE` | `16MB` (largest single NDJSON event) |
| `engine.preset-cache-ttl` | `ENGINE_PRESET_CACHE_TTL` | `10m` (presets cached for the pool-size check) |
| `api.cors.allowed-origins` | `API_CORS_ALLOWED_ORIGINS` | `http://localhost:5173` (comma separated) |

## Run and test

```bash
./mvnw spring-boot:run                       # needs the engine on :8001 for simulations
ENGINE_BASE_URL=http://engine:8001 ./mvnw spring-boot:run
./mvnw verify                                # unit, adapter (MockWebServer) and WebTestClient tests

docker build -t eenm/simulation-api .
docker run -p 8080:8080 -e ENGINE_BASE_URL=http://host.docker.internal:8001 eenm/simulation-api
```

## Code layout

```
com.meneghel.eenm.simulationapi
├── domain                    request and stream-event records, enums (no framework)
├── application               use cases, defaults, cross-field rules, stream policy
│   └── port                  SimulationEngine port and its failure types
├── infrastructure.engine     WebClient adapter: NDJSON line parsing, error mapping
├── web                       controllers, DTOs and mappers, Bean Validation, problem+json, CORS
└── config                    wiring of the use cases
```

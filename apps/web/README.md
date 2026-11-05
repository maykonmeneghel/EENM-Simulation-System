# EENM web (`apps/web`)

React + TypeScript + Vite front end of the EENM simulator. The user sets the electrical
stimulus applied directly to a pool of motoneurons and watches the resulting muscle force
being drawn **while the simulation streams in**.

The app talks **only** to the public Java API (`/api/v1/...`, port 8080) as specified in
[`docs/contracts.md`](../../docs/contracts.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173, proxying `/api` → `VITE_API_PROXY_TARGET` (default `http://localhost:8080`) |
| `npm run mock` | **Dev mock** of the API on :8080 — fake but plausible data, *not* the EENM model |
| `npm test` | Vitest (SSE parser, session reducer, controller, API client with streamed fetch, form validation, form component) |
| `npm run lint` | ESLint |
| `npm run build` | `tsc -b` (strict) + production build into `dist/` |

Develop without the backend:

```sh
npm install
npm run mock          # terminal 1
npm run dev           # terminal 2 → http://localhost:5173
```

Mock fault injection (set the *Semente* field): `502` → HTTP 502 problem+json,
`666` → `error` event mid-stream, `777` → stream ends without a terminal event.
Out-of-range values give a 400 problem+json with `errors`. `PORT` and `MOCK_CHUNK_DELAY_MS`
(default 60) tune it.

## Structure

```
src/
  domain/          contract types, defaults, client-side validation (no I/O, no React)
  application/     session state machine (reducer), SimulationController store,
                   SeriesBuffer (growable Float64Arrays), form model, muscle catalog
  infrastructure/  API client (fetch + ReadableStream), incremental SSE parser
  ui/              React components (form, progress, error banner, summary, uPlot charts)
```

- **Streaming**: `POST /api/v1/simulations` is read with `fetch` + `ReadableStream`
  (EventSource cannot POST) and fed to `SseParser`, which handles events split across
  network chunks, CR/LF/CRLF and multi-byte UTF-8 boundaries. *Parar* aborts the request via
  `AbortController`.
- **State**: `idle → running → completed | failed | aborted`. The reducer tracks lifecycle,
  progress and sample count; the bulky series live in `SeriesBuffer` and are handed to uPlot as
  zero-copy `subarray` views, so each chunk costs one `setData` (coalesced per animation frame)
  instead of re-creating the chart.
- **Errors**: 400 problem+json `errors[].field` paths are shown next to the matching input
  (unknown paths are listed under the form); 502/other HTTP errors, `error` events and
  truncated streams show in the error banner.
- `VITE_API_BASE_URL` (build time, optional) points the client at another origin; by default
  it calls same-origin `/api`.

## Docker

```sh
docker build -t eenm-web apps/web
docker run -p 8081:80 --network <compose-network> eenm-web
```

Static build served by nginx; `/api/` is proxied (buffering off, for SSE) to
`simulation-api:8080`, overridable with `-e API_UPSTREAM=host:port`.

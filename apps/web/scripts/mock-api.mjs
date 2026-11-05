#!/usr/bin/env node
/**
 * DEV MOCK of the public simulation API (docs/contracts.md §4) — NOT the real model.
 *
 * Serves GET /api/v1/muscles and POST /api/v1/simulations (SSE) with plausible fake data
 * (twitch summation per motor-unit type, synthetic MUAPs) so the web app can be developed
 * without the Java API / Python engine. Numbers are illustrative only.
 *
 *   npm run mock               # listens on :8080 (PORT env to change)
 *   MOCK_CHUNK_DELAY_MS=100    # delay between chunks (default 60)
 *
 * Fault injection via the request's `seed`:
 *   out-of-range values      → 400 problem+json with `errors`
 *   seed 502 → 502 problem+json before streaming (engine unreachable)
 *   seed 666 → `error` event (ENGINE_UNAVAILABLE) halfway through the stream
 *   seed 777 → stream ends halfway without `completed`/`error` (truncated stream)
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const CHUNK_DELAY_MS = Number(process.env.MOCK_CHUNK_DELAY_MS ?? 60);
const TARGET_CHUNKS = 40;

const MUSCLES = [
  { id: 'SOLEUS', label: 'Sóleo (mock)', poolSize: { S: 800, FR: 50, FF: 50 } },
  { id: 'GASTROCNEMIUS_MEDIAL', label: 'Gastrocnêmio medial (mock)', poolSize: { S: 300, FR: 150, FF: 150 } },
  { id: 'GASTROCNEMIUS_LATERAL', label: 'Gastrocnêmio lateral (mock)', poolSize: { S: 250, FR: 150, FF: 200 } },
  { id: 'TIBIALIS_ANTERIOR', label: 'Tibial anterior (mock)', poolSize: { S: 300, FR: 50, FF: 50 } },
];

const DEFAULTS = {
  stimulus: {
    durationMs: 1000, stepMs: 0.01, frequencyHz: 40, dutyCyclePercent: 20, amplitude: 100,
    waveform: 'MONOPHASIC', modulation: { target: 'AMPLITUDE', shape: 'STEP', peakTimeMs: null },
  },
  muscle: 'SOLEUS', unitsPerType: { S: 5, FR: 2, FF: 2 }, axonLengthPercent: 80,
  temperatureCelsius: 6.3, injectionSite: 'SOMA', somaGeometry: 'CYLINDRICAL',
  dendriteGeometry: 'CYLINDRICAL', seed: 0, outputStepMs: 0.1,
};

/** Deep-merge request onto defaults ("every field is optional"). */
function withDefaults(base, over) {
  if (over === undefined || over === null || typeof base !== 'object' || base === null) {
    return over === undefined ? base : over;
  }
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = withDefaults(base[k], over[k]);
  return out;
}

function validate(r) {
  const errors = [];
  const range = (field, v, min, max) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      errors.push({ field, message: `must be between ${min} and ${max}` });
  };
  const oneOf = (field, v, values) => {
    if (!values.includes(v)) errors.push({ field, message: `must be one of ${values.join(', ')}` });
  };
  const s = r.stimulus;
  range('stimulus.durationMs', s.durationMs, 10, 5000);
  range('stimulus.stepMs', s.stepMs, 0.005, 0.1);
  range('stimulus.frequencyHz', s.frequencyHz, 1, 200);
  range('stimulus.dutyCyclePercent', s.dutyCyclePercent, 1, 99);
  range('stimulus.amplitude', s.amplitude, 0, 500);
  oneOf('stimulus.waveform', s.waveform, ['MONOPHASIC', 'BIPHASIC']);
  oneOf('stimulus.modulation.target', s.modulation.target, ['AMPLITUDE', 'FREQUENCY', 'PULSE_WIDTH']);
  oneOf('stimulus.modulation.shape', s.modulation.shape, ['STEP', 'RAMP', 'TRIANGLE', 'SINUSOIDAL']);
  if (s.modulation.shape === 'TRIANGLE') {
    const p = s.modulation.peakTimeMs;
    if (typeof p !== 'number' || !(p > 0 && p < s.durationMs))
      errors.push({ field: 'stimulus.modulation.peakTimeMs', message: 'required, 0 < peakTimeMs < durationMs' });
  }
  const muscle = MUSCLES.find((m) => m.id === r.muscle);
  if (!muscle) oneOf('muscle', r.muscle, MUSCLES.map((m) => m.id));
  let sum = 0;
  for (const t of ['S', 'FR', 'FF']) {
    const v = r.unitsPerType[t];
    range(`unitsPerType.${t}`, v, 0, Math.min(50, muscle?.poolSize[t] ?? 50));
    if (!Number.isInteger(v)) errors.push({ field: `unitsPerType.${t}`, message: 'must be an integer' });
    sum += Number(v) || 0;
  }
  if (sum < 1) errors.push({ field: 'unitsPerType', message: 'at least one motor unit is required' });
  range('axonLengthPercent', r.axonLengthPercent, 1, 100);
  range('temperatureCelsius', r.temperatureCelsius, 0, 45);
  oneOf('injectionSite', r.injectionSite, ['SOMA', 'DENDRITE']);
  oneOf('somaGeometry', r.somaGeometry, ['CYLINDRICAL', 'SPHERICAL']);
  oneOf('dendriteGeometry', r.dendriteGeometry, ['CYLINDRICAL', 'SPHERICAL']);
  if (!Number.isInteger(r.seed) || r.seed < 0) errors.push({ field: 'seed', message: 'must be an integer >= 0' });
  const ratio = r.outputStepMs / s.stepMs;
  if (!(r.outputStepMs >= s.stepMs && r.outputStepMs <= 10 && Math.abs(ratio - Math.round(ratio)) < 1e-6))
    errors.push({ field: 'outputStepMs', message: 'must be >= stepMs, a multiple of it and <= 10' });
  return errors;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fake motor-unit types: recruitment threshold (current), twitch contraction time, peak force.
const TYPES = {
  S: { threshold: 30, tc: 100, peak: 0.15 },
  FR: { threshold: 60, tc: 50, peak: 0.5 },
  FF: { threshold: 90, tc: 30, peak: 1.0 },
};

/** Generator of [timeMs, stimulus, force{total,S,FR,FF}, emg] samples. */
function* simulate(r) {
  const s = r.stimulus;
  const T = s.durationMs;
  const dt = r.outputStepMs;
  const n = Math.floor(T / dt + 1e-9) + 1;
  const rand = mulberry32(r.seed + 1);
  const q10 = Math.pow(1.5, (r.temperatureCelsius - 6.3) / 10); // faster twitches when warmer
  const latency = 1 + r.axonLengthPercent * 0.04; // ms
  const injectionGain = r.injectionSite === 'DENDRITE' ? 0.7 : 1;
  const envelope = (t) => {
    switch (s.modulation.shape) {
      case 'RAMP': return t / T;
      case 'TRIANGLE': {
        const p = s.modulation.peakTimeMs;
        return t <= p ? t / p : (T - t) / (T - p);
      }
      case 'SINUSOIDAL': return 0.5 * (1 - Math.cos((2 * Math.PI * t) / T));
      default: return 1;
    }
  };

  const twitches = []; // { t0, type, weight }
  const muaps = []; // { t0, weight }
  let nextPulse = 0;
  let pulseStart = -Infinity;
  let pulseWidth = 0;
  let pulseAmp = 0;

  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const m = envelope(t);
    const amp = s.modulation.target === 'AMPLITUDE' ? s.amplitude * m : s.amplitude;
    const freq = s.modulation.target === 'FREQUENCY' ? Math.max(1, s.frequencyHz * m) : s.frequencyHz;
    const duty = s.modulation.target === 'PULSE_WIDTH' ? Math.max(1, s.dutyCyclePercent * m) : s.dutyCyclePercent;

    if (t >= nextPulse) {
      const period = 1000 / freq;
      pulseStart = t;
      pulseWidth = (period * duty) / 100;
      pulseAmp = amp;
      nextPulse = t + period;
      let recruited = 0;
      for (const [type, p] of Object.entries(TYPES)) {
        const units = r.unitsPerType[type];
        if (!units) continue;
        const fraction = Math.min(1, Math.max(0, (amp * injectionGain - p.threshold) / 40));
        if (fraction > 0) {
          twitches.push({ t0: t + latency, type, weight: fraction });
          recruited += fraction * units;
        }
      }
      if (recruited > 0) muaps.push({ t0: t + latency, weight: recruited / 10 });
    }

    let stim = 0;
    const inPulse = t - pulseStart;
    if (inPulse >= 0 && inPulse < pulseWidth) {
      stim = s.waveform === 'BIPHASIC' && inPulse >= pulseWidth / 2 ? -pulseAmp : pulseAmp;
    }

    const force = { S: 0, FR: 0, FF: 0 };
    for (let k = twitches.length - 1; k >= 0; k--) {
      const tw = twitches[k];
      const tc = TYPES[tw.type].tc / q10;
      const x = (t - tw.t0) / tc;
      if (x > 10) { twitches.splice(k, 1); continue; }
      if (x > 0) force[tw.type] += TYPES[tw.type].peak * tw.weight * x * Math.exp(1 - x);
    }
    // Mild saturation so tetanic fusion plateaus instead of growing linearly.
    for (const k of ['S', 'FR', 'FF']) force[k] = force[k] / (1 + 0.15 * force[k]);

    let emg = (rand() - 0.5) * 0.004;
    for (let k = muaps.length - 1; k >= 0; k--) {
      const mu = muaps[k];
      const x = (t - mu.t0) / 1.5;
      if (x > 8) { muaps.splice(k, 1); continue; }
      if (x > -4) emg += -mu.weight * x * Math.exp(-0.5 * x * x);
    }

    yield { t, stim, force, emg, n };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'X-Mock': 'true' });
  res.end(JSON.stringify(body));
}

function problem(res, status, title, detail, errors) {
  send(res, status, { type: 'about:blank', title, status, detail, ...(errors ? { errors } : {}) }, 'application/problem+json');
}

async function streamSimulation(req, res, r) {
  let closed = false;
  res.on('close', () => (closed = true));
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Mock': 'true',
  });
  const emit = (obj) => res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`);
  const t0 = Date.now();

  emit({
    type: 'started',
    simulationId: `mock-${randomUUID()}`,
    durationMs: r.stimulus.durationMs,
    outputStepMs: r.outputStepMs,
    motorUnits: r.unitsPerType,
    muscle: r.muscle,
  });

  const sim = simulate(r);
  let first = sim.next();
  const total = first.value.n;
  const chunkSize = Math.max(1, Math.ceil(total / TARGET_CHUNKS));
  let sent = 0;
  let peak = -Infinity, peakT = 0, sum = 0;

  while (!first.done && !closed) {
    const c = { timeMs: [], stimulus: [], force: { total: [], S: [], FR: [], FF: [] }, emg: [] };
    for (let k = 0; k < chunkSize && !first.done; k++, first = sim.next()) {
      const v = first.value;
      const ft = v.force.S + v.force.FR + v.force.FF;
      c.timeMs.push(round(v.t));
      c.stimulus.push(round(v.stim));
      c.force.total.push(round(ft));
      c.force.S.push(round(v.force.S));
      c.force.FR.push(round(v.force.FR));
      c.force.FF.push(round(v.force.FF));
      c.emg.push(round(v.emg));
      if (ft > peak) { peak = ft; peakT = v.t; }
      sum += ft;
      sent++;
    }
    emit({ type: 'chunk', progress: Math.min(1, sent / total), ...c });

    if (r.seed === 666 && sent >= total / 2) {
      emit({ type: 'error', message: 'MOCK: simulated engine failure', code: 'ENGINE_UNAVAILABLE' });
      return res.end();
    }
    // Clean end without a terminal event (a raw socket reset is not propagated by the Vite proxy).
    if (r.seed === 777 && sent >= total / 2) return res.end();
    await sleep(CHUNK_DELAY_MS);
  }
  if (closed) return;
  emit({
    type: 'completed',
    elapsedSeconds: (Date.now() - t0) / 1000,
    summary: { peakForce: round(peak), meanForce: round(sum / sent), timeToPeakMs: round(peakT) },
  });
  res.end();
}

const round = (x) => Math.round(x * 1e6) / 1e6;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  const url = new URL(req.url ?? '/', 'http://localhost');
  console.log(`[mock] ${req.method} ${url.pathname}`);

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/actuator/health') return send(res, 200, { status: 'UP', mock: true });
  if (req.method === 'GET' && url.pathname === '/api/v1/muscles') return send(res, 200, MUSCLES);
  if (req.method === 'POST' && url.pathname === '/api/v1/simulations') {
    let body;
    try { body = await readJson(req); } catch {
      return problem(res, 400, 'Bad Request', 'Malformed JSON body');
    }
    const r = withDefaults(DEFAULTS, body);
    const errors = validate(r);
    if (errors.length) return problem(res, 400, 'Bad Request', 'Validation failed', errors);
    if (r.seed === 502) return problem(res, 502, 'Bad Gateway', 'MOCK: simulation engine unreachable');
    return streamSimulation(req, res, r);
  }
  problem(res, 404, 'Not Found', `No route for ${req.method} ${url.pathname}`);
});

server.listen(PORT, () => {
  console.log('==============================================================');
  console.log(`  DEV MOCK API (fake data, NOT the EENM model) on :${PORT}`);
  console.log('  GET  /api/v1/muscles   POST /api/v1/simulations (SSE)');
  console.log('  seed 502 → HTTP 502 · seed 666 → error event · seed 777 → truncated');
  console.log('==============================================================');
});

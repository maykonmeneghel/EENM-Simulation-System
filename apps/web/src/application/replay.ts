/**
 * The 3D replay (docs/design/3d-view.md §5): the run's per-unit events turned into spikes travelling along each axon
 * and flashes where something happens. Pure; the scene only maps axon positions to 3D.
 *
 * Axon position `s`: 0 at the soma, `f` (electrode fraction) at the electrode, 1 at the muscle. Every spike starts and
 * ends at an event the engine logged; nothing is timed by the client except where a kind has no end event (a spike
 * still in flight when the run stops travels on at the unit's conduction speed). Collisions are drawn where the engine
 * resolves them (decision 4a): at the FES pulse, where the central spike is at that instant.
 */
import type { UnitAnatomy } from '../domain/simulation';
import { UNIT_EVENT_KIND as K } from '../domain/simulation';

export type SpikeKind = 'central' | 'fes' | 'antidromic';
export type FlashKind = 'fire' | 'blocked' | 'collision' | 'reset' | 'arrival' | 'soma';

export interface Spike {
  unit: number;
  kind: SpikeKind;
  t0: number;
  t1: number;
  s0: number;
  s1: number;
  /** Ends in a collision (drawn as a burst at its end). */
  annihilated: boolean;
}

export interface Flash {
  unit: number;
  t: number;
  s: number;
  kind: FlashKind;
}

export interface Replay {
  spikes: Spike[];
  flashes: Flash[];
  /** Times of the FES pulses that fired at least one axon (ms). */
  pulses: number[];
  /** Longest spike, to bound the search for the ones active at a time. */
  longestMs: number;
  durationMs: number;
}

export interface EventColumns {
  sample: ArrayLike<number>;
  unit: ArrayLike<number>;
  kind: ArrayLike<number>;
  origin: ArrayLike<number>;
}

/** Positions and times of the run's events. `electrodeFraction` null: the current went into the soma. */
export function buildReplay(
  events: EventColumns,
  units: UnitAnatomy,
  stepMs: number,
  electrodeFraction: number | null,
  durationMs: number,
): Replay {
  const n = events.sample.length;
  const f = electrodeFraction ?? 1;
  const toE = (u: number) => units.toElectrodeMs?.[u] ?? units.conductionMs[u]!;
  const toM = (u: number) => units.toMuscleMs?.[u] ?? 0;
  const whole = (u: number) => units.conductionMs[u]!;
  const key = (u: number, sample: number) => `${u}:${sample}`;

  // ends of central spikes (by unit and birth sample) and of antidromic spikes (by unit and soma-arrival sample)
  const centralEnd = new Map<string, { sample: number; kind: number }>();
  const antiEnd = new Map<string, { sample: number; kind: number }>();
  const electrodeCollision = new Set<string>(); // FES fire whose antidromic spike died at once (unit:sample)
  const somaCollision = new Set<string>(); // soma spike lost at once at the soma
  const arrivals = new Map<number, number[]>(); // unit → muscle arrival samples, ascending
  for (let i = 0; i < n; i++) {
    const u = events.unit[i]!;
    const s = events.sample[i]!;
    const o = events.origin[i]!;
    switch (events.kind[i]) {
      case K.CENTRAL_PASSED:
      case K.COLLISION:
      case K.CENTRAL_BLOCKED:
        centralEnd.set(key(u, o), { sample: s, kind: events.kind[i]! });
        if (events.kind[i] === K.COLLISION) electrodeCollision.add(key(u, s));
        break;
      case K.ANTIDROMIC_RESET:
      case K.SOMA_COLLISION:
        antiEnd.set(key(u, o), { sample: s, kind: events.kind[i]! });
        if (events.kind[i] === K.SOMA_COLLISION) somaCollision.add(key(u, s));
        break;
      case K.MUSCLE_ARRIVAL: {
        const list = arrivals.get(u) ?? [];
        list.push(s);
        arrivals.set(u, list);
        break;
      }
    }
  }
  for (const list of arrivals.values()) list.sort((a, b) => a - b);
  /** The first muscle arrival of unit `u` at or after `t` ms (what drives the twitch), or null. */
  const arrivalAfter = (u: number, t: number): number | null => {
    const list = arrivals.get(u);
    if (!list) return null;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]! * stepMs < t - 1e-9) lo = mid + 1;
      else hi = mid;
    }
    return lo < list.length ? list[lo]! * stepMs : null;
  };

  const spikes: Spike[] = [];
  const flashes: Flash[] = [];
  const pulses = new Set<number>();
  /** Toward the muscle from `s0`, ending at the arrival the force pipeline read (or at the conduction time). */
  const ortho = (u: number, kind: SpikeKind, t0: number, s0: number) => {
    const arrival = arrivalAfter(u, t0);
    const t1 = arrival ?? t0 + (s0 > 0 ? toM(u) : whole(u));
    spikes.push({ unit: u, kind, t0, t1, s0, s1: 1, annihilated: false });
  };
  // antidromic spikes exist only in the merge (it logs soma spikes or resets; FES-only runs model none)
  const merge = electrodeFraction !== null && units.toElectrodeMs !== null && hasSomaKinds(events);
  let sawSoma = false;
  for (let i = 0; i < n; i++) {
    const u = events.unit[i]!;
    const sample = events.sample[i]!;
    const t = sample * stepMs;
    switch (events.kind[i]) {
      case K.SOMA_SPIKE: {
        sawSoma = true;
        flashes.push({ unit: u, t, s: 0, kind: 'soma' });
        if (somaCollision.has(key(u, sample))) break; // met an antidromic spike at the soma: both lost
        if (electrodeFraction === null) {
          ortho(u, 'central', t, 0);
          break;
        }
        const end = centralEnd.get(key(u, sample));
        if (!end) {
          spikes.push({ unit: u, kind: 'central', t0: t, t1: t + toE(u), s0: 0, s1: f, annihilated: false });
          break;
        }
        const t1 = end.sample * stepMs;
        const reached = end.kind === K.COLLISION ? Math.min(f, (f * (t1 - t)) / toE(u)) : f;
        spikes.push({ unit: u, kind: 'central', t0: t, t1, s0: 0, s1: reached, annihilated: end.kind === K.COLLISION });
        if (end.kind === K.CENTRAL_PASSED) ortho(u, 'central', t1, f);
        if (end.kind === K.CENTRAL_BLOCKED) flashes.push({ unit: u, t: t1, s: f, kind: 'blocked' });
        if (end.kind === K.COLLISION) flashes.push({ unit: u, t: t1, s: reached, kind: 'collision' });
        break;
      }
      case K.FES_FIRE: {
        pulses.add(t);
        flashes.push({ unit: u, t, s: f, kind: 'fire' });
        ortho(u, 'fes', t, f);
        // the antidromic spike: none when it annihilated a central spike at once, or outside the merge
        if (!merge || electrodeCollision.has(key(u, sample))) break;
        const arrival = sample + Math.round(toE(u) / stepMs);
        const end = antiEnd.get(key(u, arrival));
        const t1 = end ? end.sample * stepMs : t + toE(u);
        const s1 = end && end.kind === K.SOMA_COLLISION ? Math.max(0, f * (1 - (t1 - t) / toE(u))) : 0;
        spikes.push({ unit: u, kind: 'antidromic', t0: t, t1, s0: f, s1, annihilated: end?.kind === K.SOMA_COLLISION });
        if (end?.kind === K.ANTIDROMIC_RESET) flashes.push({ unit: u, t: t1, s: 0, kind: 'reset' });
        if (end?.kind === K.SOMA_COLLISION) flashes.push({ unit: u, t: t1, s: s1, kind: 'collision' });
        break;
      }
      case K.FES_BLOCKED:
        flashes.push({ unit: u, t, s: f, kind: 'blocked' });
        break;
      case K.MUSCLE_ARRIVAL:
        flashes.push({ unit: u, t, s: 1, kind: 'arrival' });
        break;
    }
  }
  // the force pipeline alone (current into the soma, no drive): only arrivals; the spike is drawn back from them
  if (!sawSoma && electrodeFraction === null) {
    for (const [u, list] of arrivals) {
      for (const a of list) {
        const t1 = a * stepMs;
        spikes.push({ unit: u, kind: 'central', t0: t1 - whole(u), t1, s0: 0, s1: 1, annihilated: false });
      }
    }
  }
  spikes.sort((a, b) => a.t0 - b.t0);
  flashes.sort((a, b) => a.t - b.t);
  return {
    spikes,
    flashes,
    pulses: [...pulses].sort((a, b) => a - b),
    longestMs: spikes.reduce((m, s) => Math.max(m, s.t1 - s.t0), 0),
    durationMs,
  };
}

function hasSomaKinds(events: EventColumns): boolean {
  for (let i = 0; i < events.kind.length; i++) {
    const k = events.kind[i];
    if (k === K.SOMA_SPIKE || k === K.ANTIDROMIC_RESET || k === K.SOMA_COLLISION) return true;
  }
  return false;
}

/** Index of the first item whose `t0` (or `t`) is ≥ `t`. */
function lowerBound<T>(items: readonly T[], t: number, at: (x: T) => number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(items[mid]!) < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Spikes on their way at `t`, with their position now. */
export function activeSpikes(replay: Replay, t: number): { spike: Spike; s: number }[] {
  const out: { spike: Spike; s: number }[] = [];
  const end = lowerBound(replay.spikes, t + 1e-9, (x) => x.t0);
  for (let i = lowerBound(replay.spikes, t - replay.longestMs, (x) => x.t0); i < end; i++) {
    const sp = replay.spikes[i]!;
    if (t > sp.t1) continue;
    const span = sp.t1 - sp.t0;
    const s = span > 0 ? sp.s0 + ((sp.s1 - sp.s0) * (t - sp.t0)) / span : sp.s1;
    out.push({ spike: sp, s });
  }
  return out;
}

/** Flashes that happened in the last `windowMs` before `t` (newest last). */
export function recentFlashes(replay: Replay, t: number, windowMs: number): Flash[] {
  const from = lowerBound(replay.flashes, t - windowMs, (x) => x.t);
  const to = lowerBound(replay.flashes, t + 1e-9, (x) => x.t);
  return replay.flashes.slice(from, to);
}

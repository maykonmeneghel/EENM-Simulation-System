/**
 * Layout of the 3D step (docs/design/3d-view.md §3–4): where each structure goes, from the run's `started.units`
 * table and the forearm built by `scripts/anatomy/build-forearm.mjs`. Pure, so the mapping parameter → geometry is
 * tested without WebGL. Units: metres.
 *
 * Every placed thing carries a `Tag`: `model` (a run value), `atlas` (the meshes) or `illustrative` (a shape the
 * model does not have, needed to draw it).
 */
import forearm from '../domain/forearm.json';
import type { MotorUnitType, MuscleId, StartedEvent, UnitAnatomy } from '../domain/simulation';

export type Tag = 'model' | 'atlas' | 'illustrative';
export type PartId = 'fcr' | 'ecrl' | 'ecrb' | 'radius' | 'ulna' | 'humerus' | 'skin';
export type LevelId = 'L0' | 'L1' | 'L2' | 'L3';

export interface Section {
  x: number;
  /** Centre (y, z) and half-extents (y, z) of the muscle's cross-section at `x`. */
  centre: [number, number];
  halfExtent: [number, number];
}

export const FOREARM = forearm as unknown as {
  forearmLength: number;
  faces: Record<PartId, number>;
  sections: Record<'fcr' | 'ecrl' | 'ecrb', Section[]>;
};

/** Meshes of the stimulated muscle; the model's ECR is ECRL + ECRB together (`Muscle.EXTENSOR_CARPI_RADIALIS`). */
export const STIMULATED_PARTS: Partial<Record<MuscleId, readonly ('fcr' | 'ecrl' | 'ecrb')[]>> = {
  FLEXOR_CARPI_RADIALIS: ['fcr'],
  EXTENSOR_CARPI_RADIALIS: ['ecrl', 'ecrb'],
};

export function hasForearm(muscle: MuscleId): boolean {
  return STIMULATED_PARTS[muscle] !== undefined;
}

/** The zoom levels (§3) and the width of the scene each one frames. */
export const LEVELS: readonly { id: LevelId; viewSize: number }[] = [
  { id: 'L0', viewSize: 0.4 },
  { id: 'L1', viewSize: 0.05 },
  { id: 'L2', viewSize: 0.005 },
  { id: 'L3', viewSize: 0.0005 },
];

/** Hysteresis, in decades of view size: a level changes only when another is clearly nearer. */
const LEVEL_HYSTERESIS = 0.15;

/** The level whose view size is nearest (log scale) to `viewSize`, keeping `current` unless another is clearly nearer. */
export function levelFor(viewSize: number, current: LevelId): LevelId {
  const distance = (id: LevelId) => Math.abs(Math.log10(viewSize / LEVELS.find((l) => l.id === id)!.viewSize));
  let best = current;
  for (const l of LEVELS) if (distance(l.id) < distance(best)) best = l.id;
  return distance(best) + LEVEL_HYSTERESIS < distance(current) ? best : current;
}

/**
 * Motor point: where the motor nerve enters the muscle, from the elbow end of the forearm bones. FCR: midpoint of
 * the 3.5–6.9 cm at which its motor branches lie distal to the bi-epicondylar line (Hosapatna et al. 2020, abstract;
 * docs/research/wrist-muscles-literature.md FCR-7). ECR: no verified value; the same distance, tagged illustrative.
 */
export const MOTOR_POINT: Record<'FLEXOR_CARPI_RADIALIS' | 'EXTENSOR_CARPI_RADIALIS', { x: number; tag: Tag }> = {
  FLEXOR_CARPI_RADIALIS: { x: (0.035 + 0.069) / 2, tag: 'model' },
  EXTENSOR_CARPI_RADIALIS: { x: (0.035 + 0.069) / 2, tag: 'illustrative' },
};

/** Broken axis (§3, decision 2): the drawn axons leave the forearm here and the motoneurons sit past a drawn gap. */
export const AXIS_BREAK_X = -0.1;
export const SPINAL_X = -0.14;
/** Radius of the drawn axon bundle and of one drawn axon (no diameter in the model). */
export const BUNDLE_RADIUS = 0.0005;
export const AXON_RADIUS = 0.000005;
/** Spacing of the motoneurons in their drawn group (larger than the largest soma, 113 µm). */
export const MOTONEURON_SPACING = 0.0003;
/** Share of the cross-section the unit territories fill together (illustrative). */
const TERRITORY_FILL = 0.6;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface UnitLayout {
  index: number;
  type: MotorUnitType;
  poolIndex: number;
  weight: number;
  soma: { diameter: number; length: number; position: [number, number, number] };
  dendrite: { diameter: number; length: number };
  /** Lane of the unit's axon in the drawn bundle (y, z offset from the bundle axis). */
  lane: [number, number];
  /** Territory in the muscle's cross-section at the endplates: centre (y, z) and radius. */
  territory: { centre: [number, number]; radius: number };
  conductionMs: number;
  toElectrodeMs: number | null;
  toMuscleMs: number | null;
  axonRheobase: number;
}

export interface Layout {
  muscle: MuscleId;
  parts: readonly ('fcr' | 'ecrl' | 'ecrb')[];
  motoneuron: UnitAnatomy['motoneuron'];
  /** Axon length the run's delays imply: `axonLengthPercent` / 100 m (the arrival factor read as m/s). */
  axonLength: number;
  electrodeFraction: number | null;
  motorPoint: { x: number; tag: Tag };
  /** Where the bundle ends in the muscle: motor point + (1 − f) × axon length, kept inside the muscle. */
  endplateX: number;
  section: Section;
  /** Axon length not drawn because of the broken axis. */
  omittedLength: number;
  units: UnitLayout[];
}

/** The muscle's cross-section nearest to `x` (the first of the stimulated parts). */
export function sectionAt(part: 'fcr' | 'ecrl' | 'ecrb', x: number): Section {
  const sections = FOREARM.sections[part];
  let best = sections[0]!;
  for (const s of sections) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
  return best;
}

/** Sunflower points in the unit disc: even spread for any count, deterministic. */
function sunflower(count: number, k: number): [number, number] {
  const r = Math.sqrt((k + 0.5) / count);
  const a = k * GOLDEN_ANGLE;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** Null when the run has no unit table (older server) or the muscle is not in the forearm. */
export function buildLayout(run: StartedEvent, axonLengthPercent: number): Layout | null {
  const units = run.units;
  const parts = STIMULATED_PARTS[run.muscle];
  if (!units || !parts) return null;
  const n = units.type.length;
  const axonLength = axonLengthPercent / 100;
  const f = run.electrodeFraction ?? null;
  const motorPoint = MOTOR_POINT[run.muscle as keyof typeof MOTOR_POINT];
  const lastX = FOREARM.sections[parts[0]!].at(-1)!.x;
  const endplateX = Math.min(motorPoint.x + (1 - (f ?? 0.9)) * axonLength, lastX);
  const section = sectionAt(parts[0]!, endplateX);
  const ellipse = Math.PI * section.halfExtent[0] * section.halfExtent[1];
  const totalWeight = units.weight.reduce((a, b) => a + b, 0);
  // drawn soma → electrode path: spinal group → break → motor point
  const drawn = AXIS_BREAK_X - SPINAL_X + (motorPoint.x - AXIS_BREAK_X);
  const omittedLength = Math.max(0, (f ?? 1) * axonLength - drawn);
  const columns = Math.ceil(Math.sqrt(n));

  const out: UnitLayout[] = [];
  for (let k = 0; k < n; k++) {
    const [u, v] = sunflower(n, k);
    const share = units.weight[k]! / totalWeight;
    const d = units.somaDiameterUm[k]! * 1e-6;
    out.push({
      index: k,
      type: units.type[k]!,
      poolIndex: units.poolIndex[k]!,
      weight: units.weight[k]!,
      soma: {
        diameter: d,
        length: d,
        position: [SPINAL_X, ((k % columns) - (columns - 1) / 2) * MOTONEURON_SPACING, (Math.floor(k / columns) - (columns - 1) / 2) * MOTONEURON_SPACING],
      },
      dendrite: { diameter: units.dendriteDiameterUm[k]! * 1e-6, length: units.dendriteLengthMm[k]! * 1e-3 },
      lane: [u * BUNDLE_RADIUS, v * BUNDLE_RADIUS],
      territory: {
        centre: [section.centre[0] + u * section.halfExtent[0] * 0.8, section.centre[1] + v * section.halfExtent[1] * 0.8],
        radius: Math.sqrt((share * TERRITORY_FILL * ellipse) / Math.PI),
      },
      conductionMs: units.conductionMs[k]!,
      toElectrodeMs: units.toElectrodeMs?.[k] ?? null,
      toMuscleMs: units.toMuscleMs?.[k] ?? null,
      axonRheobase: units.axonRheobase[k]!,
    });
  }
  return {
    muscle: run.muscle,
    parts,
    motoneuron: units.motoneuron,
    axonLength,
    electrodeFraction: f,
    motorPoint,
    endplateX,
    section,
    omittedLength,
    units: out,
  };
}

// ---- Axon paths (the replay draws spikes on them) ----------------------------------------------------------------

/** Drawn axon from the soma to just past the motoneuron group, before the broken axis. */
export const GAP_START_DX = 0.008;
/** The drawn axon resumes this far before the axis break, past the gap. */
export const GAP_END_DX = 0.012;
const CURVE_SAMPLES = 63; // a multiple of the 3 curve segments: the motor point (control point 2) is a sample

type P3 = [number, number, number];

/** Control points of the nerve (from the axis break into the muscle at the motor point, then to the endplates). */
export function nerveControlPoints(layout: Layout, lane: [number, number] = [0, 0]): P3[] {
  const entry = sectionAt(layout.parts[0]!, layout.motorPoint.x);
  const end = layout.section;
  const p = (x: number, y: number, z: number): P3 => [x, y + lane[0], z + lane[1]];
  return [
    p(AXIS_BREAK_X, entry.centre[0] * 0.5, entry.centre[1] * 0.5),
    p((AXIS_BREAK_X + layout.motorPoint.x) / 2, entry.centre[0] * 0.8, entry.centre[1] * 0.8),
    p(layout.motorPoint.x, entry.centre[0], entry.centre[1]),
    p(end.x, end.centre[0], end.centre[1]),
  ];
}

/** Centripetal-free uniform Catmull–Rom through `points` (as three.js's default curve), sampled. */
function catmullRom(points: P3[], samples: number): P3[] {
  const out: P3[] = [];
  const n = points.length - 1;
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * n;
    const k = Math.min(n - 1, Math.floor(t));
    const u = t - k;
    const p0 = points[Math.max(0, k - 1)]!;
    const p1 = points[k]!;
    const p2 = points[k + 1]!;
    const p3 = points[Math.min(n, k + 2)]!;
    // the end tangents use mirrored neighbours, like three.js's CatmullRomCurve3 for open curves
    const a = k === 0 ? p1.map((v, j) => 2 * v - p2[j]!) : p0;
    const d = k + 2 > n ? p2.map((v, j) => 2 * v - p1[j]!) : p3;
    const u2 = u * u;
    const u3 = u2 * u;
    out.push(
      [0, 1, 2].map(
        (j) => 0.5 * (2 * p1[j]! + (-a[j]! + p2[j]!) * u + (2 * a[j]! - 5 * p1[j]! + 4 * p2[j]! - d[j]!) * u2 + (-a[j]! + 3 * p1[j]! - 3 * p2[j]! + d[j]!) * u3),
      ) as P3,
    );
  }
  return out;
}

/** The nerve's drawn curve, sampled: the scene draws its tubes through these points and the replay moves on them. */
export function nerveCurvePoints(layout: Layout, lane: [number, number] = [0, 0]): P3[] {
  return catmullRom(nerveControlPoints(layout, lane), CURVE_SAMPLES);
}

const dist = (a: P3, b: P3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

interface Polyline {
  points: P3[];
  /** Cumulative length at each point. */
  at: number[];
  length: number;
}

function polyline(points: P3[]): Polyline {
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1]! + dist(points[i - 1]!, points[i]!));
  return { points, at, length: at[at.length - 1]! };
}

function along(line: Polyline, fraction: number, out: P3): void {
  const target = Math.min(1, Math.max(0, fraction)) * line.length;
  let i = 1;
  while (i < line.points.length - 1 && line.at[i]! < target) i++;
  const a = line.points[i - 1]!;
  const b = line.points[i]!;
  const span = line.at[i]! - line.at[i - 1]!;
  const u = span > 0 ? (target - line.at[i - 1]!) / span : 0;
  for (let j = 0; j < 3; j++) out[j] = a[j]! + (b[j]! - a[j]!) * u;
}

/**
 * One unit's drawn axon, with the real axon position `s` (0 soma, f electrode, 1 muscle) mapped onto it:
 * `[0, sA]` soma → gap start, `(sA, sC)` the omitted length (not drawn), `[sC, sE]` gap end → electrode (motor point),
 * `[sE, 1]` electrode → endplate. Lengths are real where drawn, so a spike moves at its conduction speed on screen and
 * spends most of its trip in the gap.
 */
export interface AxonPath {
  soma: Polyline;
  proximal: Polyline;
  distal: Polyline;
  sA: number;
  sC: number;
  sE: number;
}

export function axonPath(layout: Layout, u: UnitLayout): AxonPath {
  const L = layout.axonLength;
  const somaStart: P3 = [u.soma.position[0] + u.soma.length / 2, u.soma.position[1], u.soma.position[2]];
  const control = nerveControlPoints(layout, u.lane);
  const curve = nerveCurvePoints(layout, u.lane);
  const split = Math.round((2 / 3) * CURVE_SAMPLES); // control point 2 (the motor point) of 4 → sample 2/3
  const first = control[0]!;
  const gapEnd: P3 = [AXIS_BREAK_X - GAP_END_DX, first[1], first[2]];
  const soma = polyline([somaStart, [SPINAL_X + GAP_START_DX, u.soma.position[1], u.soma.position[2]]]);
  const proximal = polyline([gapEnd, ...curve.slice(0, split + 1)]);
  const distal = polyline(curve.slice(split));
  const sE = layout.electrodeFraction ?? Math.max(0, 1 - distal.length / L);
  const sA = Math.min(soma.length / L, sE / 2);
  const sC = Math.max(sA, sE - proximal.length / L);
  return { soma, proximal, distal, sA, sC, sE };
}

/** The drawn point at axon position `s` into `out`; false while the spike is in the omitted length. */
export function pointOnAxon(path: AxonPath, s: number, out: P3): boolean {
  if (s <= path.sA) {
    along(path.soma, path.sA > 0 ? s / path.sA : 0, out);
    return true;
  }
  if (s < path.sC) return false;
  if (s <= path.sE) {
    along(path.proximal, path.sE > path.sC ? (s - path.sC) / (path.sE - path.sC) : 1, out);
    return true;
  }
  along(path.distal, (s - path.sE) / (1 - path.sE), out);
  return true;
}

// ---- Wrist (the hand turns with the joint angle the engine streams) ---------------------------------------------

/** Flexion–extension centre: the capitate's centroid (from the atlas); the axis is z, +θ flexes toward +y. */
export const WRIST_CENTRE = (FOREARM as unknown as { wrist: { centre: [number, number, number] } }).wrist.centre;
/** The skin and tendons bend over this stretch of the forearm axis, ending just past the wrist centre (illustrative). */
export const WRIST_BEND_FROM = -0.025;
export const WRIST_BEND_TO = 0.005;

/** How much of the wrist rotation a point at `x` follows: 0 on the forearm, 1 on the hand, smooth in between. */
export function wristWeight(x: number): number {
  const u = (x - (WRIST_CENTRE[0] + WRIST_BEND_FROM)) / (WRIST_BEND_TO - WRIST_BEND_FROM);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

/** `p` turned by `weight × angle` (rad) about the wrist axis, into `out` (x, y; z does not change). */
export function bendAtWrist(x: number, y: number, angle: number, weight: number, out: [number, number]): void {
  const a = angle * weight;
  const dx = x - WRIST_CENTRE[0];
  const dy = y - WRIST_CENTRE[1];
  const c = Math.cos(a);
  const s = Math.sin(a);
  out[0] = WRIST_CENTRE[0] + dx * c - dy * s;
  out[1] = WRIST_CENTRE[1] + dx * s + dy * c;
}

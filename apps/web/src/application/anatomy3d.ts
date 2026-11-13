/**
 * Layout of the 3D step (docs/design/3d-view.md §3–4, §10): where each structure goes, from the run's `started.units`
 * table and the region the stimulated muscle is in — the forearm (`scripts/anatomy/build-forearm.mjs`) or the lower
 * leg (`scripts/anatomy/build-leg.mjs`). Pure, so the mapping parameter → geometry is tested without WebGL. Units:
 * metres.
 *
 * Every placed thing carries a `Tag`: `model` (a run value), `atlas` (the meshes) or `illustrative` (a shape the
 * model does not have, needed to draw it).
 */
import forearm from '../domain/forearm.json';
import leg from '../domain/leg.json';
import type { MotorUnitType, MuscleId, StartedEvent, UnitAnatomy } from '../domain/simulation';

export type Tag = 'model' | 'atlas' | 'illustrative';
export type RegionId = 'forearm' | 'leg';
export type ForearmPartId = 'fcr' | 'ecrl' | 'ecrb' | 'radius' | 'ulna' | 'humerus' | 'skin';
export type LegPartId = 'sol' | 'gm' | 'gl' | 'ta' | 'tibia' | 'fibula' | 'femur' | 'patella' | 'skin';
export type PartId = ForearmPartId | LegPartId;
export type LevelId = 'L0' | 'L1' | 'L2' | 'L3';
type P3 = [number, number, number];

export interface Section {
  x: number;
  /** Centre (y, z) and half-extents (y, z) of the muscle's cross-section at `x`. */
  centre: [number, number];
  halfExtent: [number, number];
}

export const FOREARM = forearm as unknown as {
  forearmLength: number;
  faces: Record<ForearmPartId, number>;
  sections: Record<'fcr' | 'ecrl' | 'ecrb', Section[]>;
};

export const LEG = leg as unknown as {
  legLength: number;
  /** +1 when the lateral side (the fibula) is +z. */
  lateral: 1 | -1;
  /** x of the bony landmarks the literature measures from (the leg frame starts at the tibial plateau). */
  landmarks: { fibularHead: number; lateralMalleolus: number; calcanealTuberosity: number; sole: number };
  /** Illustrative nerve points: the tibial trunk behind the knee (y, z) and the fibular neck (x, y, z). */
  nerve: { popliteal: [number, number]; fibularNeck: P3 };
  faces: Record<LegPartId | 'footBones', number>;
  sections: Record<'sol' | 'gm' | 'gl' | 'ta', Section[]>;
};

/** Meshes of the stimulated muscle; the model's ECR is ECRL + ECRB together (`Muscle.EXTENSOR_CARPI_RADIALIS`). */
export const STIMULATED_PARTS: Record<MuscleId, readonly PartId[]> = {
  FLEXOR_CARPI_RADIALIS: ['fcr'],
  EXTENSOR_CARPI_RADIALIS: ['ecrl', 'ecrb'],
  SOLEUS: ['sol'],
  GASTROCNEMIUS_MEDIAL: ['gm'],
  GASTROCNEMIUS_LATERAL: ['gl'],
  TIBIALIS_ANTERIOR: ['ta'],
};

/** The region each muscle is drawn in. */
export const MUSCLE_REGION: Record<MuscleId, RegionId> = {
  FLEXOR_CARPI_RADIALIS: 'forearm',
  EXTENSOR_CARPI_RADIALIS: 'forearm',
  SOLEUS: 'leg',
  GASTROCNEMIUS_MEDIAL: 'leg',
  GASTROCNEMIUS_LATERAL: 'leg',
  TIBIALIS_ANTERIOR: 'leg',
};

/** The region the 3D step draws for a muscle, or null for a muscle it has no anatomy for. */
export function regionOf(muscle: MuscleId): RegionId | null {
  return MUSCLE_REGION[muscle] ?? null;
}

export function hasForearm(muscle: MuscleId): boolean {
  return regionOf(muscle) === 'forearm';
}

/** The 3D step has this muscle's anatomy (and so replays its runs). */
export function has3d(muscle: MuscleId): boolean {
  return regionOf(muscle) !== null;
}

/** What a region is drawn from: its long bones' length, the muscles' cross-sections, the atlas meshes drawn as bone. */
export interface Region {
  id: RegionId;
  /** Elbow → wrist end of radius + ulna; tibial plateau → midpoint of the malleoli. */
  length: number;
  sections: Record<string, Section[]>;
  bones: readonly string[];
  /** The region has a joint the engine moves (the wrist). The leg is static: there is no ankle model. */
  joint: boolean;
}

export const REGIONS: Record<RegionId, Region> = {
  forearm: { id: 'forearm', length: FOREARM.forearmLength, sections: FOREARM.sections, bones: ['radius', 'ulna', 'humerus', 'handBones'], joint: true },
  leg: { id: 'leg', length: LEG.legLength, sections: LEG.sections, bones: ['tibia', 'fibula', 'femur', 'patella', 'footBones'], joint: false },
};

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

export type MotorPointSource = 'HOSAPATNA_2020' | 'YI_2017' | 'YI_2023' | 'YI_2025' | null;

/**
 * Motor point: where the electrode sits over the muscle and the drawn nerve reaches it, as x from the proximal end of
 * the region's bones.
 *
 * - FCR: midpoint of the 3.5–6.9 cm at which its motor branches lie distal to the bi-epicondylar line (Hosapatna et
 *   al. 2020, abstract; docs/research/wrist-muscles-literature.md FCR-7). ECR: no verified value; the same distance,
 *   tagged illustrative.
 * - Leg (docs/design/3d-view.md §10.2, sources checked 2026-11-12): the zone of densest intramuscular nerve
 *   arborization, on the study's reference line. Medial gastrocnemius 7/10–8/10 and lateral 7.5/10–8.5/10 of the
 *   line from the calcaneal tuberosity (0) to the fibular head (1) (Yi et al. 2023, doi 10.3349/ymj.2023.0124);
 *   soleus zone 5 of 10 on the same line counted from the bottom, in its lateral and medial portions (Yi et al. 2025,
 *   doi 10.1038/s41598-025-07508-2); tibialis anterior 70–80 % of the line from the lateral malleolus to the fibular
 *   head (Yi et al. 2017, doi 10.1007/s00276-016-1698-6, abstract). Each is the midpoint of its range, placed on
 *   this atlas's landmarks.
 */
const { fibularHead, lateralMalleolus, calcanealTuberosity } = LEG.landmarks;
const onCalfLine = (share: number) => calcanealTuberosity + share * (fibularHead - calcanealTuberosity);
const onShinLine = (share: number) => lateralMalleolus + share * (fibularHead - lateralMalleolus);

export const MOTOR_POINT: Record<MuscleId, { x: number; tag: Tag; source: MotorPointSource }> = {
  FLEXOR_CARPI_RADIALIS: { x: (0.035 + 0.069) / 2, tag: 'model', source: 'HOSAPATNA_2020' },
  EXTENSOR_CARPI_RADIALIS: { x: (0.035 + 0.069) / 2, tag: 'illustrative', source: null },
  SOLEUS: { x: onCalfLine((0.4 + 0.5) / 2), tag: 'model', source: 'YI_2025' },
  GASTROCNEMIUS_MEDIAL: { x: onCalfLine((0.7 + 0.8) / 2), tag: 'model', source: 'YI_2023' },
  GASTROCNEMIUS_LATERAL: { x: onCalfLine((0.75 + 0.85) / 2), tag: 'model', source: 'YI_2023' },
  TIBIALIS_ANTERIOR: { x: onShinLine((0.7 + 0.8) / 2), tag: 'model', source: 'YI_2017' },
};

export type NerveId = 'tibial' | 'deepFibular';

/**
 * The leg's motor nerve (§10.3). The atlas has no leg nerves, so the path is drawn; only the level (x) of one point
 * per muscle is from the literature, the rest of the path is illustrative.
 *
 * - Gastrocnemii and soleus, tibial nerve: the branch leaves the trunk behind the knee 65 mm (medial
 *   gastrocnemius), 54 mm (lateral) and 47 mm (upper soleus) above the fibular head (Le Roux et al. 2026, 51 legs,
 *   abstract; doi 10.1097/PHM.0000000000003138).
 * - Tibialis anterior, deep fibular nerve: drawn round the fibular neck, it enters the muscle at 86.5–90.6 % of the
 *   line from the lateral malleolus to the fibular head (Yi et al. 2017, abstract); drawn at the midpoint.
 */
export const LEG_NERVE: Partial<Record<MuscleId, { nerve: NerveId; x: number; point: 'branch' | 'entry' }>> = {
  SOLEUS: { nerve: 'tibial', x: fibularHead - 0.047, point: 'branch' },
  GASTROCNEMIUS_MEDIAL: { nerve: 'tibial', x: fibularHead - 0.065, point: 'branch' },
  GASTROCNEMIUS_LATERAL: { nerve: 'tibial', x: fibularHead - 0.054, point: 'branch' },
  TIBIALIS_ANTERIOR: { nerve: 'deepFibular', x: onShinLine((0.865 + 0.906) / 2), point: 'entry' },
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

/**
 * The electrode pad drawn on the skin: the run's electrode (`started.electrode`, its chosen size and shape), else a
 * round 25 mm-diameter pad (4.9 cm², the active electrode of Baier et al. 2024) for runs from an older server.
 */
export interface Pad {
  shape: 'ROUND' | 'RECTANGLE';
  /** ROUND. */
  radiusM: number;
  /** RECTANGLE: along the limb (the electrode's length) and across it (its width). */
  lengthM: number;
  widthM: number;
  /** From the run (model) or the fallback (illustrative). */
  fromRun: boolean;
  /** G of the run's electrode; null for the fallback. */
  thresholdFactor: number | null;
  areaCm2: number;
}

/** Fallback pad radius (m): a round 25 mm-diameter pad, 4.9 cm² (Baier et al. 2024's active electrode). */
export const FALLBACK_PAD_RADIUS_M = 0.0125;

export function padOf(run: Pick<StartedEvent, 'electrode'>): Pad {
  const e = run.electrode;
  if (!e) {
    const r = FALLBACK_PAD_RADIUS_M;
    return { shape: 'ROUND', radiusM: r, lengthM: 2 * r, widthM: 2 * r, fromRun: false, thresholdFactor: null, areaCm2: Math.PI * (r * 100) ** 2 };
  }
  if (e.shape === 'ROUND' && e.diameterCm !== null) {
    const r = e.diameterCm / 200;
    return { shape: 'ROUND', radiusM: r, lengthM: 2 * r, widthM: 2 * r, fromRun: true, thresholdFactor: e.thresholdFactor, areaCm2: e.areaCm2 };
  }
  const length = (e.lengthCm ?? Math.sqrt(e.areaCm2)) / 100;
  const width = (e.widthCm ?? Math.sqrt(e.areaCm2)) / 100;
  return {
    shape: 'RECTANGLE',
    radiusM: Math.sqrt((length * width) / Math.PI),
    lengthM: length,
    widthM: width,
    fromRun: true,
    thresholdFactor: e.thresholdFactor,
    areaCm2: e.areaCm2,
  };
}

export interface Layout {
  muscle: MuscleId;
  /** The electrode pad (size and shape of the run's electrode). */
  pad: Pad;
  region: Region;
  parts: readonly PartId[];
  /** Cross-sections of the first stimulated part, every 1 cm. */
  sections: readonly Section[];
  motoneuron: UnitAnatomy['motoneuron'];
  /** Axon length the run's delays imply: `axonLengthPercent` / 100 m (the arrival factor read as m/s). */
  axonLength: number;
  electrodeFraction: number | null;
  motorPoint: { x: number; tag: Tag; source: MotorPointSource };
  /** The leg's nerve and the literature point on its path; null on the forearm. */
  nerve: { nerve: NerveId; x: number; point: 'branch' | 'entry' } | null;
  /** Control points of the nerve before the motor point, from the axis break (without a unit's lane). */
  approach: P3[];
  /** Where the bundle ends in the muscle: motor point + (1 − f) × axon length, kept inside the muscle. */
  endplateX: number;
  section: Section;
  /** Axon length not drawn because of the broken axis. */
  omittedLength: number;
  units: UnitLayout[];
}

/** The cross-section nearest to `x` among `sections` (a layout's: those of the first stimulated part). */
export function sectionAt(sections: readonly Section[], x: number): Section {
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

/**
 * Nerve control points before the motor point. Forearm: from the axis break halfway toward the muscle, then to it
 * (illustrative). Leg: the tibial trunk behind the knee down to the branch level (Le Roux 2026), or the common →
 * deep fibular nerve round the fibular neck to its entry into the tibialis anterior (Yi 2017); positions across the
 * leg illustrative.
 */
function approachOf(muscle: MuscleId, sections: readonly Section[], motorPointX: number): P3[] {
  const entry = sectionAt(sections, motorPointX);
  const nerve = LEG_NERVE[muscle];
  if (!nerve) {
    return [
      [AXIS_BREAK_X, entry.centre[0] * 0.5, entry.centre[1] * 0.5],
      [(AXIS_BREAK_X + motorPointX) / 2, entry.centre[0] * 0.8, entry.centre[1] * 0.8],
    ];
  }
  const [py, pz] = LEG.nerve.popliteal;
  if (nerve.nerve === 'tibial') return [[AXIS_BREAK_X, py, pz], [nerve.x, py, pz]];
  const into = sectionAt(sections, nerve.x);
  return [[AXIS_BREAK_X, py, pz], LEG.nerve.fibularNeck, [nerve.x, into.centre[0], into.centre[1]]];
}

/** Null when the run has no unit table (older server) or the 3D step has no anatomy for the muscle. */
export function buildLayout(run: StartedEvent, axonLengthPercent: number): Layout | null {
  const units = run.units;
  const regionId = regionOf(run.muscle);
  if (!units || !regionId) return null;
  const region = REGIONS[regionId];
  const parts = STIMULATED_PARTS[run.muscle];
  const sections = region.sections[parts[0]!]!;
  const n = units.type.length;
  const axonLength = axonLengthPercent / 100;
  const f = run.electrodeFraction ?? null;
  const motorPoint = MOTOR_POINT[run.muscle];
  const lastX = sections.at(-1)!.x;
  const endplateX = Math.min(motorPoint.x + (1 - (f ?? 0.9)) * axonLength, lastX);
  const section = sectionAt(sections, endplateX);
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
    pad: padOf(run),
    region,
    parts,
    sections,
    motoneuron: units.motoneuron,
    axonLength,
    electrodeFraction: f,
    motorPoint,
    nerve: LEG_NERVE[run.muscle] ?? null,
    approach: approachOf(run.muscle, sections, motorPoint.x),
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
/** Curve samples per segment between control points: the motor point (second to last) is always a sample. */
const SEGMENT_SAMPLES = 21;

/** Control points of the nerve (from the axis break into the muscle at the motor point, then to the endplates). */
export function nerveControlPoints(layout: Layout, lane: [number, number] = [0, 0]): P3[] {
  const entry = sectionAt(layout.sections, layout.motorPoint.x);
  const end = layout.section;
  const p = (x: number, y: number, z: number): P3 => [x, y + lane[0], z + lane[1]];
  return [
    ...layout.approach.map(([x, y, z]) => p(x, y, z)),
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
  const control = nerveControlPoints(layout, lane);
  return catmullRom(control, SEGMENT_SAMPLES * (control.length - 1));
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
  const split = SEGMENT_SAMPLES * (control.length - 2); // the motor point: the second-to-last control point
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

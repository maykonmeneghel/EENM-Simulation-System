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

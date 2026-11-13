import type { MuscleId, StartedEvent, UnitAnatomy } from '../domain/simulation';
import { AXIS_BREAK_X, FOREARM, LEVELS, MOTONEURON_SPACING, SPINAL_X, buildLayout, hasForearm, levelFor } from './anatomy3d';

function units(n: number): UnitAnatomy {
  const type = Array.from({ length: n }, (_, k) => (k < n - 2 ? 'S' : k < n - 1 ? 'FR' : 'FF') as 'S' | 'FR' | 'FF');
  return {
    motoneuron: 'BOOTH_1997',
    type,
    poolIndex: type.map((_, k) => k),
    somaDiameterUm: type.map((_, k) => 77.5 + k * 0.3),
    dendriteDiameterUm: type.map((_, k) => 41.5 + k * 0.4),
    dendriteLengthMm: type.map((_, k) => 5.5 + k * 0.04),
    conductionMs: type.map(() => 18),
    toElectrodeMs: type.map(() => 16.2),
    toMuscleMs: type.map(() => 1.8),
    weight: type.map((t) => (t === 'S' ? 8 : 25)),
    axonRheobase: type.map((_, k) => 30 + k),
  };
}

const run = (over: Partial<StartedEvent> = {}): StartedEvent => ({
  type: 'started',
  simulationId: 's',
  durationMs: 1000,
  outputStepMs: 0.1,
  motorUnits: { S: 10, FR: 1, FF: 1 },
  muscle: 'FLEXOR_CARPI_RADIALIS',
  maxForce: 1,
  electrodeFraction: 0.9,
  units: units(12),
  ...over,
});

describe('buildLayout', () => {
  it('draws each unit with the soma and dendrite of the run (phase 2 gate)', () => {
    const r = run();
    const layout = buildLayout(r, 80)!;
    expect(layout.units).toHaveLength(12);
    layout.units.forEach((u, k) => {
      expect(u.soma.diameter).toBeCloseTo(r.units!.somaDiameterUm[k]! * 1e-6, 12);
      expect(u.soma.length).toBe(u.soma.diameter); // a cylinder as long as it is wide
      expect(u.dendrite.diameter).toBeCloseTo(r.units!.dendriteDiameterUm[k]! * 1e-6, 12);
      expect(u.dendrite.length).toBeCloseTo(r.units!.dendriteLengthMm[k]! * 1e-3, 12);
      expect(u.type).toBe(r.units!.type[k]);
    });
  });

  it('puts the endplates (1 − f) of the axon past the motor point', () => {
    const layout = buildLayout(run(), 80)!;
    expect(layout.axonLength).toBeCloseTo(0.8);
    expect(layout.endplateX - layout.motorPoint.x).toBeCloseTo(0.1 * 0.8, 9);
  });

  it('writes the omitted length so that drawn + omitted = the soma → electrode axon', () => {
    const layout = buildLayout(run(), 80)!;
    const drawn = AXIS_BREAK_X - SPINAL_X + (layout.motorPoint.x - AXIS_BREAK_X);
    expect(drawn + layout.omittedLength).toBeCloseTo(0.9 * 0.8, 9);
    expect(layout.omittedLength).toBeGreaterThan(0.5); // the motoneurons are far from the forearm
  });

  it('gives each unit a territory inside the cross-section, area in proportion to the pool units it stands for', () => {
    const layout = buildLayout(run(), 80)!;
    const { centre, halfExtent } = layout.section;
    for (const u of layout.units) {
      const dy = (u.territory.centre[0] - centre[0]) / halfExtent[0];
      const dz = (u.territory.centre[1] - centre[1]) / halfExtent[1];
      expect(dy * dy + dz * dz).toBeLessThanOrEqual(1);
    }
    const s = layout.units[0]!;
    const ff = layout.units[11]!;
    expect((ff.territory.radius / s.territory.radius) ** 2).toBeCloseTo(25 / 8, 9);
  });

  it('keeps motoneurons apart by more than the largest soma', () => {
    const layout = buildLayout(run({ units: units(120) }), 80)!;
    expect(MOTONEURON_SPACING).toBeGreaterThan(113e-6);
    const seen = new Set(layout.units.map((u) => u.soma.position.join(',')));
    expect(seen.size).toBe(120);
  });

  it('draws ECR as ECRL + ECRB, a leg muscle in the leg, and has no layout for an older server', () => {
    expect(buildLayout(run({ muscle: 'EXTENSOR_CARPI_RADIALIS' }), 80)!.parts).toEqual(['ecrl', 'ecrb']);
    expect(buildLayout(run({ muscle: 'SOLEUS' }), 80)!.region.id).toBe('leg');
    expect(buildLayout(run({ units: undefined }), 80)).toBeNull();
    expect(buildLayout(run({ muscle: 'QUADRICEPS' as MuscleId }), 80)).toBeNull(); // a muscle without anatomy
    expect(hasForearm('TIBIALIS_ANTERIOR')).toBe(false);
    expect(hasForearm('FLEXOR_CARPI_RADIALIS')).toBe(true);
  });

  it('has no electrode on the axon when the current goes into the soma', () => {
    const r = run({ electrodeFraction: null, units: { ...units(12), toElectrodeMs: null, toMuscleMs: null } });
    const layout = buildLayout(r, 80)!;
    expect(layout.electrodeFraction).toBeNull();
    expect(layout.units[0]!.toElectrodeMs).toBeNull();
  });
});

describe('forearm meshes', () => {
  it('are at human scale: forearm bones ≈ 25 cm, FCR sections along most of it', () => {
    expect(FOREARM.forearmLength).toBeGreaterThan(0.22);
    expect(FOREARM.forearmLength).toBeLessThan(0.28);
    expect(FOREARM.sections.fcr.length).toBeGreaterThan(20);
  });
});

describe('levelFor', () => {
  it('picks the nearest level on a log scale', () => {
    expect(levelFor(0.4, 'L3')).toBe('L0');
    expect(levelFor(0.0005, 'L0')).toBe('L3');
    expect(levelFor(0.006, 'L0')).toBe('L2');
  });

  it('keeps the current level near the boundary (hysteresis)', () => {
    const boundary = Math.sqrt(LEVELS[0]!.viewSize * LEVELS[1]!.viewSize); // equidistant from L0 and L1
    expect(levelFor(boundary * 0.9, 'L0')).toBe('L0');
    expect(levelFor(boundary * 0.9, 'L1')).toBe('L1');
    expect(levelFor(boundary * 0.3, 'L0')).toBe('L1');
  });
});

describe('axon paths', () => {
  it('puts the soma at 0, the electrode at the motor point at f, the endplate at 1, and hides the omitted length', async () => {
    const { axonPath, pointOnAxon } = await import('./anatomy3d');
    const layout = buildLayout(run(), 80)!;
    const u = layout.units[3]!;
    const path = axonPath(layout, u);
    const p: [number, number, number] = [0, 0, 0];
    expect(pointOnAxon(path, 0, p)).toBe(true);
    expect(p[0]).toBeCloseTo(u.soma.position[0] + u.soma.length / 2, 9);
    expect(pointOnAxon(path, 0.9, p)).toBe(true);
    expect(p[0]).toBeCloseTo(layout.motorPoint.x, 6);
    expect(pointOnAxon(path, 1, p)).toBe(true);
    expect(p[0]).toBeCloseTo(layout.section.x, 6); // the drawn cross-section nearest to the endplates (1 cm stations)
    expect(pointOnAxon(path, 0.4, p)).toBe(false); // in the ≈ 0.5 m left out
    // drawn lengths are real: the drawn proximal stretch covers exactly its share of the axon
    expect((path.sE - path.sC) * layout.axonLength).toBeCloseTo(path.proximal.length, 9);
    expect(path.sA * layout.axonLength).toBeCloseTo(path.soma.length, 9);
  });
});

describe('wrist bend', () => {
  it('keeps the forearm still, turns the hand fully and blends in between', async () => {
    const { WRIST_CENTRE, wristWeight, bendAtWrist } = await import('./anatomy3d');
    const [cx, cy] = WRIST_CENTRE;
    expect(cx).toBeGreaterThan(FOREARM.forearmLength); // the capitate is past the end of the radius
    expect(cx - FOREARM.forearmLength).toBeLessThan(0.03);
    expect(wristWeight(0.1)).toBe(0);
    expect(wristWeight(cx + 0.05)).toBe(1);
    const mid = wristWeight(cx - 0.01);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // a fingertip 10 cm distal to the centre, flexed 90°, moves 10 cm toward the palm (+y)
    const out: [number, number] = [0, 0];
    bendAtWrist(cx + 0.1, cy, Math.PI / 2, 1, out);
    expect(out[0]).toBeCloseTo(cx, 9);
    expect(out[1]).toBeCloseTo(cy + 0.1, 9);
  });
});

describe('the leg (static: no ankle)', () => {
  const LEG_MUSCLES = ['SOLEUS', 'GASTROCNEMIUS_MEDIAL', 'GASTROCNEMIUS_LATERAL', 'TIBIALIS_ANTERIOR'] as const;

  it('has a region for every muscle of the app, and the form asks for the replay of exactly those', async () => {
    const { has3d, regionOf, REGIONS } = await import('./anatomy3d');
    const { MUSCLES } = await import('../domain/simulation');
    const { REPLAY_MUSCLES } = await import('./formModel');
    for (const m of MUSCLES) {
      expect(has3d(m)).toBe(true);
      expect(REPLAY_MUSCLES.has(m)).toBe(true);
    }
    expect(REPLAY_MUSCLES.size).toBe(MUSCLES.length);
    for (const m of LEG_MUSCLES) {
      expect(regionOf(m)).toBe('leg');
      expect(hasForearm(m)).toBe(false);
    }
    expect(REGIONS.leg.joint).toBe(false); // the wrist joint stays forearm-only
    expect(REGIONS.forearm.joint).toBe(true);
  });

  it('is at human scale, with the landmarks in anatomical order', async () => {
    const { LEG } = await import('./anatomy3d');
    const { fibularHead, lateralMalleolus, calcanealTuberosity, sole } = LEG.landmarks;
    expect(LEG.legLength).toBeGreaterThan(0.33);
    expect(LEG.legLength).toBeLessThan(0.45);
    expect(fibularHead).toBeGreaterThan(0); // just below the tibial plateau
    expect(fibularHead).toBeLessThan(0.03);
    expect(lateralMalleolus - fibularHead).toBeGreaterThan(0.3);
    expect(calcanealTuberosity).toBeGreaterThan(0.35);
    expect(sole).toBeGreaterThan(Math.max(lateralMalleolus, calcanealTuberosity));
    for (const id of ['sol', 'gm', 'gl', 'ta'] as const) expect(LEG.sections[id].length).toBeGreaterThan(20);
    // the gastrocnemius heads lie medial and lateral (lateral = the fibula's side)
    const side = (id: 'gm' | 'gl') => LEG.sections[id][10]!.centre[1] * LEG.lateral;
    expect(side('gl')).toBeGreaterThan(0);
    expect(side('gm')).toBeLessThan(0);
    // the calf behind (+y), the tibialis anterior in front
    expect(LEG.sections.sol[15]!.centre[0]).toBeGreaterThan(0);
    expect(LEG.sections.ta[15]!.centre[0]).toBeLessThan(0);
  });

  it('puts each motor point where its study puts it, on the atlas landmarks, inside the muscle', async () => {
    const { LEG, MOTOR_POINT } = await import('./anatomy3d');
    const { fibularHead: head, lateralMalleolus: malleolus, calcanealTuberosity: heel } = LEG.landmarks;
    expect(MOTOR_POINT.SOLEUS.x).toBeCloseTo(heel + 0.45 * (head - heel), 9); // Yi 2025, zone 5 of 10
    expect(MOTOR_POINT.GASTROCNEMIUS_MEDIAL.x).toBeCloseTo(heel + 0.75 * (head - heel), 9); // Yi 2023, 7/10–8/10
    expect(MOTOR_POINT.GASTROCNEMIUS_LATERAL.x).toBeCloseTo(heel + 0.8 * (head - heel), 9); // Yi 2023, 7.5/10–8.5/10
    expect(MOTOR_POINT.TIBIALIS_ANTERIOR.x).toBeCloseTo(malleolus + 0.75 * (head - malleolus), 9); // Yi 2017, 70–80 %
    for (const m of LEG_MUSCLES) {
      const layout = buildLayout(run({ muscle: m }), 80)!;
      expect(layout.motorPoint.tag).toBe('model');
      expect(layout.motorPoint.x).toBeGreaterThan(layout.sections[0]!.x);
      expect(layout.motorPoint.x).toBeLessThan(layout.sections.at(-1)!.x);
      expect(layout.endplateX).toBeGreaterThan(layout.motorPoint.x); // the endplates lie distal, toward the ankle
    }
  });

  it('draws the tibial nerve for the triceps surae and the deep fibular nerve for the tibialis anterior', async () => {
    const { LEG } = await import('./anatomy3d');
    const above = { SOLEUS: 0.047, GASTROCNEMIUS_MEDIAL: 0.065, GASTROCNEMIUS_LATERAL: 0.054 } as const; // Le Roux 2026
    for (const [m, mm] of Object.entries(above)) {
      const layout = buildLayout(run({ muscle: m as MuscleId }), 80)!;
      expect(layout.nerve).toMatchObject({ nerve: 'tibial', point: 'branch' });
      expect(layout.nerve!.x).toBeCloseTo(LEG.landmarks.fibularHead - mm, 12);
      expect(layout.approach).toHaveLength(2); // the trunk behind the knee, then the branch
      expect(layout.approach[1]![0]).toBeCloseTo(layout.nerve!.x, 12);
      expect(layout.nerve!.x).toBeGreaterThan(AXIS_BREAK_X);
      expect(layout.nerve!.x).toBeLessThan(layout.motorPoint.x);
    }
    const ta = buildLayout(run({ muscle: 'TIBIALIS_ANTERIOR' }), 80)!;
    expect(ta.nerve).toMatchObject({ nerve: 'deepFibular', point: 'entry' });
    expect(ta.approach).toHaveLength(3); // behind the knee, round the fibular neck, into the muscle
    expect(ta.nerve!.x).toBeLessThan(ta.motorPoint.x);
    expect(buildLayout(run(), 80)!.nerve).toBeNull(); // the forearm keeps its illustrative path
  });

  it('maps the axon onto the leg the same way: electrode at the motor point, endplate at 1', async () => {
    const { axonPath, pointOnAxon } = await import('./anatomy3d');
    for (const m of LEG_MUSCLES) {
      const layout = buildLayout(run({ muscle: m }), 80)!;
      const path = axonPath(layout, layout.units[2]!);
      const p: [number, number, number] = [0, 0, 0];
      expect(pointOnAxon(path, 0.9, p)).toBe(true);
      expect(p[0]).toBeCloseTo(layout.motorPoint.x, 6);
      expect(pointOnAxon(path, 1, p)).toBe(true);
      expect(p[0]).toBeCloseTo(layout.section.x, 6);
      expect((path.sE - path.sC) * layout.axonLength).toBeCloseTo(path.proximal.length, 9);
      expect(layout.omittedLength).toBeGreaterThan(0);
    }
  });
});

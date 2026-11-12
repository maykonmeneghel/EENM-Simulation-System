/**
 * The 3D scene (docs/design/3d-view.md §3–5, §10): atlas meshes of the region (forearm or lower leg), the run's units
 * drawn from the layout, and the replay of the run's per-unit events on them. Metres throughout; x along the limb
 * (toward the wrist / the ankle), y toward the palm / the calf.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { CameraControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { AxonPath, Layout, LevelId } from '../../application/anatomy3d';
import {
  AXIS_BREAK_X,
  AXON_RADIUS,
  BUNDLE_RADIUS,
  SPINAL_X,
  axonPath,
  bendAtWrist,
  wristWeight,
  levelFor,
  nerveCurvePoints,
  pointOnAxon,
  sectionAt,
} from '../../application/anatomy3d';
import type { Replay } from '../../application/replay';
import { activeSpikes, recentFlashes } from '../../application/replay';
import { FOREARM_URL, LEG_URL, REGION_URL, TAN_HALF_FOV, distanceFor, levelCamera } from './camera';
import { FLASH_COLORS, SPIKE_COLORS } from './replayStyle';

/** Electrode pad radius: not in the model (its recruitment is analytic), a common 5 × 5 cm-class pad, illustrative. */
const PAD_RADIUS = 0.0125;
const PAD_THICKNESS = 0.0015;
const SCRATCH = new THREE.Vector3();
const POINT: [number, number, number] = [0, 0, 0];
const MATRIX = new THREE.Matrix4();
const COLOR = new THREE.Color();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3();
const X_AXIS_CYLINDER = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const Z_AXIS_CYLINDER = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const FACING_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const MAX_SPIKES = 4096;
const MAX_FLASHES = 2048;
/** How long a flash stays on screen, in real seconds (its simulated length follows the replay speed). */
const FLASH_SECONDS = 0.35;
/** Radius of a drawn spike, in screen pixels (kept constant across zoom levels). */
const SPIKE_PIXELS = 3.5;

export interface TypeColors {
  S: string;
  FR: string;
  FF: string;
}

export interface ViewReadout {
  level: LevelId;
  /** Metres per pixel at the target, for the scale bar. */
  metresPerPixel: number;
}

/** The replay's time, owned by the view and advanced by the scene every frame. */
export interface ReplayClock {
  t: number;
  playing: boolean;
  /** Simulated ms per real ms. */
  speed: number;
  durationMs: number;
}

/** What the view can ask the camera to do. */
export interface SceneCommands {
  restore: () => void;
  focusUnit: (unit: number) => void;
}

interface SceneProps {
  layout: Layout;
  /** The level the zoom is at (reported by the scene itself): what is drawn. */
  level: LevelId;
  /** Where to fly; `n` increments on every request, so the same level can be asked twice. */
  fly: { level: LevelId; n: number };
  colors: TypeColors;
  selected: number | null;
  onSelect: (unit: number | null) => void;
  onReadout: (readout: ViewReadout) => void;
  replay: Replay | null;
  clock: MutableRefObject<ReplayClock>;
  /** Force at a time as a fraction of the healthy maximum, or null when unknown. */
  forceAt: (tMs: number) => number | null;
  /** Wrist angle at a time (°, + flexion), or null when the run has no joint. */
  angleAt: (tMs: number) => number | null;
  commands: MutableRefObject<SceneCommands | null>;
  /** Screen positions of the labels, written every frame for the view's overlay. */
  labels: MutableRefObject<LabelPositions>;
}

function curveOf(layout: Layout, lane: [number, number] = [0, 0]): THREE.CatmullRomCurve3 {
  // through the same samples the replay uses, so a spike stays on its drawn axon
  return new THREE.CatmullRomCurve3(nerveCurvePoints(layout, lane).map((p) => new THREE.Vector3(...p)));
}

interface AtlasMaterials {
  skin: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  stimulated: THREE.MeshStandardMaterial;
  other: THREE.MeshStandardMaterial;
}

function Atlas({ layout, level, clock, forceAt, angleAt }: {
  layout: Layout;
  level: LevelId;
  clock: RefObject<ReplayClock>;
  forceAt: SceneProps['forceAt'];
  angleAt: SceneProps['angleAt'];
}) {
  const gltf = useGLTF(REGION_URL[layout.region.id]);
  const clip = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), layout.endplateX), [layout.endplateX]);
  // L1 opens the stimulated muscle at the endplates (keeps the proximal part, the cut faces the camera)
  const opened = level === 'L1';
  // at the axon and motoneuron levels the camera is inside the arm: the atlas becomes a faint context
  const deep = level === 'L2' || level === 'L3';
  const materials = useMemo<AtlasMaterials>(() => {
    const m = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, ...opts });
    const faint = { transparent: true, opacity: 0.08, depthWrite: false };
    return {
      skin: m('#e8b796', deep ? { ...faint, opacity: 0 } : { transparent: true, opacity: 0.22, depthWrite: false }),
      bone: m('#efe6d2', deep ? faint : {}),
      stimulated: m('#c8463c', { emissive: '#ff2a00', emissiveIntensity: 0, ...(deep ? faint : { clippingPlanes: opened ? [clip] : [] }) }),
      other: m('#b9a39c', deep ? faint : { transparent: true, opacity: 0.55 }),
    };
  }, [opened, deep, clip]);
  const live = useRef(materials);
  // only the forearm has a joint: the leg is static (no ankle model), so none of its meshes move
  const bend = useMemo(() => (layout.region.joint ? restPose(gltf.scene) : { meshes: [], angle: Number.NaN }), [gltf, layout.region.joint]);
  useEffect(() => () => restoreRest(bend), [bend]);
  useEffect(() => {
    live.current = materials;
    paint(gltf.scene, layout.parts, layout.region.bones, materials);
  }, [gltf, layout.parts, layout.region.bones, materials]);
  useFrame(() => {
    // the muscle glows with the force at the replay's time (fraction of the healthy maximum)
    const t = clock.current?.t ?? 0;
    const f = forceAt(t);
    live.current.stimulated.emissiveIntensity = f === null ? 0 : Math.min(1, Math.max(0, f)) * 0.9;
    // the hand turns at the wrist with the joint angle the engine computed
    const deg = angleAt(t);
    applyWrist(bend, deg === null ? 0 : (deg * Math.PI) / 180);
  });
  return <primitive object={gltf.scene} />;
}

interface BentMesh {
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute;
  rest: Float32Array;
  restNormal: Float32Array;
  weight: Float32Array;
}

/** Rest pose of a bent mesh, kept on its geometry: useGLTF hands the same (already bent) scene to every mount. */
interface RestData {
  rest: Float32Array;
  restNormal: Float32Array;
  weight: Float32Array;
}
const REST_KEY = 'eenmWristRest';

/**
 * Rest positions and wrist weights of every mesh that crosses or lies past the wrist (the forearm bones do not).
 * They are read once from the unbent atlas and stored on the geometry, so a later mount (the scene is cached and may
 * still hold the last bend) starts from the true rest pose instead of the bent one.
 */
function restPose(scene: THREE.Object3D): { meshes: BentMesh[]; angle: number } {
  const meshes: BentMesh[] = [];
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.name === 'radius' || o.name === 'ulna' || o.name === 'humerus') return;
    const g = o.geometry as THREE.BufferGeometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const position = g.attributes.position as THREE.BufferAttribute;
    const normal = g.attributes.normal as THREE.BufferAttribute;
    let data = g.userData[REST_KEY] as RestData | null | undefined;
    if (data === undefined) {
      const weight = new Float32Array(position.count);
      let any = false;
      for (let i = 0; i < position.count; i++) {
        weight[i] = o.name === 'handBones' ? 1 : wristWeight(position.getX(i));
        any ||= weight[i]! > 0;
      }
      data = any ? { rest: Float32Array.from(position.array), restNormal: Float32Array.from(normal.array), weight } : null;
      storeRest(g, data);
    }
    if (data) meshes.push({ position, normal, ...data });
  });
  // NaN: the first applyWrist always writes the vertices, whatever pose the cached scene was left in
  return { meshes, angle: Number.NaN };
}

function storeRest(g: THREE.BufferGeometry, data: RestData | null): void {
  g.userData[REST_KEY] = data;
}

/** Back to the rest pose (on unmount: the cached scene must not keep the bend). */
function restoreRest(pose: { meshes: BentMesh[]; angle: number }): void {
  for (const m of pose.meshes) {
    (m.position.array as Float32Array).set(m.rest);
    (m.normal.array as Float32Array).set(m.restNormal);
    m.position.needsUpdate = true;
    m.normal.needsUpdate = true;
  }
  pose.angle = 0;
}

const BENT: [number, number] = [0, 0];

/** Moves the vertices to the wrist angle (rad); skipped when the angle has not changed. */
function applyWrist(pose: { meshes: BentMesh[]; angle: number }, angle: number): void {
  if (Math.abs(angle - pose.angle) < 1e-4) return; // false when pose.angle is NaN
  pose.angle = angle;
  for (const m of pose.meshes) {
    const p = m.position.array as Float32Array;
    const n = m.normal.array as Float32Array;
    for (let i = 0; i < m.weight.length; i++) {
      const w = m.weight[i]!;
      if (w === 0) continue;
      const j = 3 * i;
      bendAtWrist(m.rest[j]!, m.rest[j + 1]!, angle, w, BENT);
      p[j] = BENT[0];
      p[j + 1] = BENT[1];
      const a = angle * w; // normals turn by the same angle (about the origin: a direction)
      const c = Math.cos(a);
      const s = Math.sin(a);
      n[j] = m.restNormal[j]! * c - m.restNormal[j + 1]! * s;
      n[j + 1] = m.restNormal[j]! * s + m.restNormal[j + 1]! * c;
    }
    m.position.needsUpdate = true;
    m.normal.needsUpdate = true;
  }
}

/** Normals and materials of the atlas meshes (three.js objects are mutated outside React's render). */
function paint(scene: THREE.Object3D, parts: readonly string[], bones: readonly string[], materials: AtlasMaterials): void {
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    const id = o.name;
    o.material =
      id === 'skin'
        ? materials.skin
        : bones.includes(id)
          ? materials.bone
          : parts.includes(id)
            ? materials.stimulated
            : materials.other;
    o.renderOrder = id === 'skin' ? 2 : 0;
  });
}

/** Index of the first time ≥ t. */
function lowerBound(times: readonly number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Where the pad sits on the skin over the motor point: a ray from the muscle outward, stopped by the skin mesh. */
function useElectrodePlacement(layout: Layout): { point: THREE.Vector3; q: THREE.Quaternion; normal: THREE.Vector3 } | null {
  const gltf = useGLTF(REGION_URL[layout.region.id]);
  return useMemo(() => {
    const skin = gltf.scene.getObjectByName('skin');
    const s = sectionAt(layout.sections, layout.motorPoint.x);
    const origin = new THREE.Vector3(layout.motorPoint.x, s.centre[0], s.centre[1]);
    const outward = new THREE.Vector3(0, s.centre[0], s.centre[1]).normalize();
    if (!skin) return null;
    skin.updateWorldMatrix(true, true);
    const hit = new THREE.Raycaster(origin, outward, 0, 0.2).intersectObject(skin, true)[0];
    const point = hit?.point ?? origin.clone().addScaledVector(outward, 0.02);
    const normal = hit?.face?.normal.clone().transformDirection(hit.object.matrixWorld) ?? outward;
    if (normal.dot(outward) < 0) normal.negate();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    return { point: point.addScaledVector(normal, PAD_THICKNESS / 2), q, normal };
  }, [gltf, layout]);
}

function Electrode({ layout, replay, clock }: { layout: Layout; replay: Replay | null; clock: RefObject<ReplayClock> }) {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const placement = useElectrodePlacement(layout);
  useFrame(() => {
    // the pad lights up for a moment at each FES pulse that fired an axon
    const m = material.current;
    const c = clock.current;
    if (!m || !c || !replay) return;
    const window = FLASH_SECONDS * 1000 * c.speed;
    const i = lowerBound(replay.pulses, c.t - window);
    const last = i < replay.pulses.length && replay.pulses[i]! <= c.t ? replay.pulses[i]! : null;
    m.emissiveIntensity = last === null ? 0 : 1 - (c.t - last) / window;
  });
  if (!placement) return null;
  return (
    <group position={placement.point} quaternion={placement.q}>
      <mesh>
        <cylinderGeometry args={[PAD_RADIUS, PAD_RADIUS, PAD_THICKNESS, 48]} />
        <meshStandardMaterial ref={material} color="#3b4252" roughness={0.4} emissive="#ffe14d" emissiveIntensity={0} />
      </mesh>
    </group>
  );
}

function Nerve({ layout, showAxons, colors, selected, onSelect }: {
  layout: Layout;
  showAxons: boolean;
  colors: TypeColors;
  selected: number | null;
  onSelect: (unit: number) => void;
}) {
  const sheath = useMemo(() => new THREE.TubeGeometry(curveOf(layout), 128, BUNDLE_RADIUS * 3, 16, false), [layout]);
  const axons = useMemo(
    () => (showAxons ? layout.units.map((u) => new THREE.TubeGeometry(curveOf(layout, u.lane), 96, AXON_RADIUS, 6, false)) : []),
    [layout, showAxons],
  );
  return (
    <group>
      <mesh geometry={sheath}>
        <meshStandardMaterial color="#e9d27a" transparent opacity={showAxons ? 0.12 : 0.85} depthWrite={!showAxons} />
      </mesh>
      {axons.map((g, k) => (
        <mesh key={k} geometry={g} onClick={(e) => { e.stopPropagation(); onSelect(k); }}>
          <meshStandardMaterial
            color={selected === k ? '#ffffff' : colors[layout.units[k]!.type]}
            emissive={selected === k ? '#888888' : '#000000'}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Brightness of each unit now: 1 right after a flash of `kinds`, fading over the flash window. */
function unitGlow(replay: Replay | null, clock: ReplayClock | null, n: number, kinds: ReadonlySet<string>, out: Float32Array): void {
  out.fill(0);
  if (!replay || !clock) return;
  const window = FLASH_SECONDS * 1000 * clock.speed;
  for (const f of recentFlashes(replay, clock.t, window)) {
    if (!kinds.has(f.kind) || f.unit >= n) continue;
    out[f.unit] = Math.max(out[f.unit]!, 1 - (clock.t - f.t) / window);
  }
}

const ARRIVAL = new Set(['arrival']);
const SOMA_EVENTS = new Set(['soma', 'reset']);

/** One instanced disc per unit at the endplates; it brightens when the unit's spike reaches the muscle. */
function Territories({ layout, colors, selected, onSelect, replay, clock }: {
  layout: Layout;
  colors: TypeColors;
  selected: number | null;
  onSelect: (unit: number) => void;
  replay: Replay | null;
  clock: RefObject<ReplayClock>;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const glow = useMemo(() => new Float32Array(layout.units.length), [layout]);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const x = layout.section.x + 0.0002;
    for (const u of layout.units) {
      SCALE.setScalar(u.territory.radius);
      MATRIX.compose(SCRATCH.set(x, u.territory.centre[0], u.territory.centre[1]), FACING_X, SCALE);
      m.setMatrixAt(u.index, MATRIX);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [layout]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    unitGlow(replay, clock.current, layout.units.length, ARRIVAL, glow);
    for (const u of layout.units) {
      COLOR.set(selected === u.index ? '#ffffff' : colors[u.type]).multiplyScalar(selected === null || selected === u.index ? 0.45 + 0.55 * glow[u.index]! + (replay ? 0 : 0.4) : 0.2);
      m.setColorAt(u.index, COLOR);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, layout.units.length]}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.instanceId !== undefined) onSelect(e.instanceId); }}
    >
      <circleGeometry args={[1, 32]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

/** Somas (instanced cylinders as long as wide, along x) that flash when the motoneuron fires, and their dendrites. */
function Motoneurons({ layout, colors, selected, onSelect, replay, clock }: {
  layout: Layout;
  colors: TypeColors;
  selected: number | null;
  onSelect: (unit: number) => void;
  replay: Replay | null;
  clock: RefObject<ReplayClock>;
}) {
  const somas = useRef<THREE.InstancedMesh>(null);
  const dendrites = useRef<THREE.InstancedMesh>(null);
  const glow = useMemo(() => new Float32Array(layout.units.length), [layout]);
  useEffect(() => {
    const s = somas.current;
    const d = dendrites.current;
    if (!s || !d) return;
    for (const u of layout.units) {
      const [x, y, z] = u.soma.position;
      SCALE.set(u.soma.diameter / 2, u.soma.length, u.soma.diameter / 2);
      MATRIX.compose(SCRATCH.set(x, y, z), X_AXIS_CYLINDER, SCALE);
      s.setMatrixAt(u.index, MATRIX);
      // the equivalent dendrite cylinder, drawn toward −z (dorsal, illustrative direction)
      SCALE.set(u.dendrite.diameter / 2, u.dendrite.length, u.dendrite.diameter / 2);
      MATRIX.compose(SCRATCH.set(x, y, z - (u.soma.diameter / 2 + u.dendrite.length / 2)), Z_AXIS_CYLINDER, SCALE);
      d.setMatrixAt(u.index, MATRIX);
      COLOR.set(colors[u.type]);
      d.setColorAt(u.index, COLOR);
    }
    s.instanceMatrix.needsUpdate = true;
    d.instanceMatrix.needsUpdate = true;
    if (d.instanceColor) d.instanceColor.needsUpdate = true;
  }, [layout, colors]);
  useFrame(() => {
    const s = somas.current;
    if (!s) return;
    unitGlow(replay, clock.current, layout.units.length, SOMA_EVENTS, glow);
    for (const u of layout.units) {
      COLOR.set(selected === u.index ? '#ffffff' : colors[u.type]).lerp(SPIKE_WHITE, glow[u.index]! * 0.8);
      s.setColorAt(u.index, COLOR);
    }
    if (s.instanceColor) s.instanceColor.needsUpdate = true;
  });
  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) onSelect(e.instanceId);
  };
  return (
    <group>
      <instancedMesh ref={somas} args={[undefined, undefined, layout.units.length]} onClick={pick}>
        <cylinderGeometry args={[1, 1, 1, 24]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={dendrites} args={[undefined, undefined, layout.units.length]} onClick={pick}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
        <meshStandardMaterial transparent opacity={0.4} />
      </instancedMesh>
    </group>
  );
}

const SPIKE_WHITE = new THREE.Color('#ffffff');

/** Spikes travelling along the drawn axons, and flashes where the events happen; sized in screen pixels. */
function ReplayLayer({ layout, replay, clock, metresPerPixel }: {
  layout: Layout;
  replay: Replay;
  clock: MutableRefObject<ReplayClock>;
  metresPerPixel: RefObject<number>;
}) {
  const spikes = useRef<THREE.InstancedMesh>(null);
  const flashes = useRef<THREE.InstancedMesh>(null);
  const paths = useMemo<AxonPath[]>(() => layout.units.map((u) => axonPath(layout, u)), [layout]);
  const colors = useMemo(
    () => ({
      central: new THREE.Color(SPIKE_COLORS.central),
      fes: new THREE.Color(SPIKE_COLORS.fes),
      antidromic: new THREE.Color(SPIKE_COLORS.antidromic),
      ...Object.fromEntries(Object.entries(FLASH_COLORS).map(([k, v]) => [`flash:${k}`, new THREE.Color(v)])),
    }) as Record<string, THREE.Color>,
    [],
  );
  useFrame((_, delta) => {
    const c = clock.current;
    advance(c, delta);
    const r = (metresPerPixel.current ?? 1e-4) * SPIKE_PIXELS;
    const sp = spikes.current;
    if (sp) {
      let i = 0;
      for (const { spike, s } of activeSpikes(replay, c.t)) {
        if (i >= MAX_SPIKES) break;
        const path = paths[spike.unit];
        if (!path || !pointOnAxon(path, s, POINT)) continue;
        SCALE.setScalar(r);
        MATRIX.compose(SCRATCH.set(...POINT), QUAT, SCALE);
        sp.setMatrixAt(i, MATRIX);
        sp.setColorAt(i, colors[spike.kind]!);
        i++;
      }
      sp.count = i;
      sp.instanceMatrix.needsUpdate = true;
      if (sp.instanceColor) sp.instanceColor.needsUpdate = true;
    }
    const fl = flashes.current;
    if (fl) {
      const window = FLASH_SECONDS * 1000 * c.speed;
      let i = 0;
      for (const f of recentFlashes(replay, c.t, window)) {
        if (i >= MAX_FLASHES || f.kind === 'arrival' || f.kind === 'soma') continue; // shown on the territories/somas
        const path = paths[f.unit];
        if (!path || !pointOnAxon(path, f.s, POINT)) continue;
        const age = (c.t - f.t) / window;
        SCALE.setScalar(r * (1.5 + 3 * age));
        MATRIX.compose(SCRATCH.set(...POINT), QUAT, SCALE);
        fl.setMatrixAt(i, MATRIX);
        COLOR.copy(colors[`flash:${f.kind}`]!).multiplyScalar(1 - age); // additive: black is invisible
        fl.setColorAt(i, COLOR);
        i++;
      }
      fl.count = i;
      fl.instanceMatrix.needsUpdate = true;
      if (fl.instanceColor) fl.instanceColor.needsUpdate = true;
    }
  });
  return (
    <group>
      <instancedMesh ref={spikes} args={[undefined, undefined, MAX_SPIKES]} frustumCulled={false} renderOrder={5}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial toneMapped={false} depthTest={false} transparent />
      </instancedMesh>
      <instancedMesh ref={flashes} args={[undefined, undefined, MAX_FLASHES]} frustumCulled={false} renderOrder={4}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial toneMapped={false} depthTest={false} transparent blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </group>
  );
}

/**
 * The scene writes to state it shares with the view (the replay clock, the commands, the zoom); three.js state is
 * mutable by nature, and these writers keep that outside React's render values.
 */
function advance(c: ReplayClock, deltaSeconds: number): void {
  if (!c.playing) return;
  c.t += deltaSeconds * 1000 * c.speed;
  if (c.t > c.durationMs) c.t = 0; // loop
}

function store<T>(ref: MutableRefObject<T>, value: T): void {
  ref.current = value;
}

/** Labels of the scene, drawn by the view as plain DOM over the canvas (drei's <Html> breaks React's unmount). */
export type LabelId = 'electrode' | 'gap' | 'spinal';
export type LabelPositions = Record<LabelId, { x: number; y: number; on: boolean }>;

function LabelProjector({ layout, level, out }: { layout: Layout; level: LevelId; out: MutableRefObject<LabelPositions> }) {
  const placement = useElectrodePlacement(layout);
  const anchors = useMemo(() => {
    const electrode = placement ? placement.point.clone().addScaledVector(placement.normal, 0.008) : null;
    return {
      electrode: { at: electrode, on: level === 'L0' && layout.electrodeFraction !== null },
      gap: { at: new THREE.Vector3((AXIS_BREAK_X + SPINAL_X) / 2, 0, 0.012), on: level === 'L0' },
      // L0: below the group, clear of the gap label; L3: just above the somas (the group spans ≈ 3 mm)
      spinal: { at: new THREE.Vector3(SPINAL_X, 0, level === 'L3' ? 0.0022 : -0.012), on: level === 'L0' || level === 'L3' },
    };
  }, [placement, level, layout]);
  useFrame((state) => {
    const { width, height } = state.size;
    for (const id of ['electrode', 'gap', 'spinal'] as const) {
      const a = anchors[id];
      if (!a.at || !a.on) {
        place(out, id, 0, 0, false);
        continue;
      }
      SCRATCH.copy(a.at).project(state.camera);
      place(out, id, ((SCRATCH.x + 1) / 2) * width, ((1 - SCRATCH.y) / 2) * height, SCRATCH.z < 1 && Math.abs(SCRATCH.x) < 1.2 && Math.abs(SCRATCH.y) < 1.2);
    }
  });
  return null;
}

function place(out: MutableRefObject<LabelPositions>, id: LabelId, x: number, y: number, on: boolean): void {
  out.current[id] = { x, y, on };
}

/** The axons on both sides of the broken axis (none drawn across the gap), and the gap marker. */
function BrokenAxis({ layout, colors, showAxons }: { layout: Layout; colors: TypeColors; showAxons: boolean }) {
  const lines = useMemo(() => {
    const positions: number[] = [];
    const colorsArr: number[] = [];
    const c = new THREE.Color();
    for (const u of layout.units) {
      const path = axonPath(layout, u);
      const [a, b] = [path.soma.points[0]!, path.soma.points[path.soma.points.length - 1]!];
      const [g, n] = [path.proximal.points[0]!, path.proximal.points[1]!];
      positions.push(...a, ...b, ...g, ...n);
      c.set(colors[u.type]);
      for (let k = 0; k < 4; k++) colorsArr.push(c.r, c.g, c.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
    return geometry;
  }, [layout, colors]);
  return (
    <group>
      <lineSegments geometry={lines} visible={showAxons}>
        <lineBasicMaterial vertexColors transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

/** Keeps near/far proportional to the zoom (one scene spans 40 cm to 100 µm) and reports the level. */
function ZoomWatcher({ controls, onReadout, metresPerPixel }: {
  controls: RefObject<CameraControls | null>;
  onReadout: (r: ViewReadout) => void;
  metresPerPixel: MutableRefObject<number>;
}) {
  const size = useThree((s) => s.size);
  const level = useRef<LevelId>('L0');
  const last = useRef('');
  useFrame((state) => {
    const c = controls.current;
    if (!c) return;
    c.getTarget(SCRATCH);
    const d = state.camera.position.distanceTo(SCRATCH);
    const persp = state.camera as THREE.PerspectiveCamera;
    const near = d / 200;
    const far = d * 200;
    if (Math.abs(persp.near - near) / near > 0.05) {
      persp.near = near;
      persp.far = far;
      persp.updateProjectionMatrix();
    }
    const viewSize = 2 * d * TAN_HALF_FOV;
    level.current = levelFor(viewSize, level.current);
    store(metresPerPixel, viewSize / size.height);
    const key = `${level.current}:${metresPerPixel.current.toPrecision(2)}`;
    if (key !== last.current) {
      last.current = key;
      onReadout({ level: level.current, metresPerPixel: metresPerPixel.current });
    }
  });
  return null;
}

export function ForearmScene({ layout, level, fly, colors, selected, onSelect, onReadout, replay, clock, forceAt, angleAt, commands, labels }: SceneProps) {
  const controls = useRef<CameraControls | null>(null);
  const metresPerPixel = useRef(1e-4);
  const first = useRef(true);
  const flyTo = useRef((target: LevelId, animate: boolean) => {
    const c = controls.current;
    if (!c) return;
    const { position, target: at } = levelCamera(target, layout);
    void c.setLookAt(position.x, position.y, position.z, at.x, at.y, at.z, animate);
  });
  useEffect(() => {
    flyTo.current = (target: LevelId, animate: boolean) => {
      const c = controls.current;
      if (!c) return;
      const { position, target: at } = levelCamera(target, layout);
      void c.setLookAt(position.x, position.y, position.z, at.x, at.y, at.z, animate);
    };
  }, [layout]);
  useEffect(() => {
    flyTo.current(fly.level, !first.current);
    first.current = false;
  }, [fly, layout]);
  useEffect(() => {
    store(commands, {
      restore: () => flyTo.current(level, true),
      focusUnit: (unit: number) => {
        const c = controls.current;
        const u = layout.units[unit];
        if (!c || !u) return;
        const path = axonPath(layout, u);
        // the motoneuron at the motoneuron level, else where its axon meets the electrode
        const atSoma = level === 'L3';
        if (atSoma) SCRATCH.set(...u.soma.position);
        else {
          pointOnAxon(path, path.sE, POINT);
          SCRATCH.set(...POINT);
        }
        const size = atSoma ? 0.0005 : 0.003;
        const d = distanceFor(size);
        void c.setLookAt(SCRATCH.x + d * 0.3, SCRATCH.y + d * 0.6, SCRATCH.z + d * 0.75, SCRATCH.x, SCRATCH.y, SCRATCH.z, true);
      },
    });
    return () => store(commands, null);
  }, [commands, layout, level]);
  // double-click: orbit around the point under the cursor and move halfway to it
  const centre = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const c = controls.current;
    if (!c) return;
    void c.setOrbitPoint(e.point.x, e.point.y, e.point.z);
    void c.dollyTo(c.distance * 0.5, true);
  };
  const deep = level === 'L2' || level === 'L3';
  return (
    <>
      <color attach="background" args={['#14161a']} />
      <hemisphereLight args={['#ffffff', '#3a3a40', 1.1]} />
      <directionalLight position={[0.5, 1, 0.8]} intensity={1.4} />
      <CameraControls ref={controls} minDistance={distanceFor(0.0002)} maxDistance={distanceFor(1.2)} smoothTime={0.25} dollyToCursor />
      <ZoomWatcher controls={controls} onReadout={onReadout} metresPerPixel={metresPerPixel} />
      <LabelProjector layout={layout} level={level} out={labels} />
      <group onPointerMissed={() => onSelect(null)} onDoubleClick={centre}>
        <Atlas layout={layout} level={level} clock={clock} forceAt={forceAt} angleAt={angleAt} />
        {layout.electrodeFraction !== null ? <Electrode layout={layout} replay={replay} clock={clock} /> : null}
        <Nerve layout={layout} showAxons={deep} colors={colors} selected={selected} onSelect={onSelect} />
        {level === 'L1' ? <Territories layout={layout} colors={colors} selected={selected} onSelect={onSelect} replay={replay} clock={clock} /> : null}
        <BrokenAxis layout={layout} colors={colors} showAxons={deep} />
        <Motoneurons layout={layout} colors={colors} selected={selected} onSelect={onSelect} replay={replay} clock={clock} />
      </group>
      {replay ? <ReplayLayer layout={layout} replay={replay} clock={clock} metresPerPixel={metresPerPixel} /> : null}
    </>
  );
}

useGLTF.preload(FOREARM_URL);
useGLTF.preload(LEG_URL);

/**
 * The 3D scene (docs/design/3d-view.md §3): atlas meshes of the forearm, and the run's units drawn from the layout.
 * Metres throughout; x along the forearm toward the wrist, y toward the palm.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CameraControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { Layout, LevelId, UnitLayout } from '../../application/anatomy3d';
import { AXIS_BREAK_X, AXON_RADIUS, BUNDLE_RADIUS, FOREARM, SPINAL_X, levelFor, sectionAt } from '../../application/anatomy3d';
import { FOREARM_URL, TAN_HALF_FOV, distanceFor, levelCamera } from './camera';
import type { MotorUnitType } from '../../domain/simulation';
import { fmtNumber, tr } from '../../i18n/locale';

/** Electrode pad radius: not in the model (its recruitment is analytic), a common 5 × 5 cm-class pad, illustrative. */
const PAD_RADIUS = 0.0125;
const PAD_THICKNESS = 0.0015;
const SCRATCH = new THREE.Vector3();

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
}

/** Path of the nerve: from the axis break into the muscle at the motor point, then to the endplates. */
function nervePath(layout: Layout, lane: [number, number] = [0, 0]): THREE.CatmullRomCurve3 {
  const entry = sectionAt(layout.parts[0]!, layout.motorPoint.x);
  const end = layout.section;
  const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y + lane[0], z + lane[1]);
  return new THREE.CatmullRomCurve3([
    p(AXIS_BREAK_X, entry.centre[0] * 0.5, entry.centre[1] * 0.5),
    p((AXIS_BREAK_X + layout.motorPoint.x) / 2, entry.centre[0] * 0.8, entry.centre[1] * 0.8),
    p(layout.motorPoint.x, entry.centre[0], entry.centre[1]),
    p(end.x, end.centre[0], end.centre[1]),
  ]);
}

function Atlas({ layout, level }: { layout: Layout; level: LevelId }) {
  const gltf = useGLTF(FOREARM_URL);
  const clip = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), layout.endplateX), [layout.endplateX]);
  // L1 opens the stimulated muscle at the endplates (keeps the proximal part, the cut faces the camera)
  const opened = level === 'L1';
  // at the axon and motoneuron levels the camera is inside the arm: the atlas becomes a faint context
  const deep = level === 'L2' || level === 'L3';
  const materials = useMemo(() => {
    const m = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, ...opts });
    const faint = { transparent: true, opacity: 0.08, depthWrite: false };
    return {
      skin: m('#e8b796', deep ? { ...faint, opacity: 0 } : { transparent: true, opacity: 0.22, depthWrite: false }),
      bone: m('#efe6d2', deep ? faint : {}),
      stimulated: m('#c8463c', deep ? faint : { clippingPlanes: opened ? [clip] : [] }),
      other: m('#b9a39c', deep ? faint : { transparent: true, opacity: 0.55 }),
    };
  }, [opened, deep, clip]);
  useEffect(() => {
    paint(gltf.scene, layout.parts, materials);
  }, [gltf, layout.parts, materials]);
  return <primitive object={gltf.scene} />;
}

/** Normals and materials of the atlas meshes (three.js objects are mutated outside React's render). */
function paint(
  scene: THREE.Object3D,
  parts: readonly string[],
  materials: Record<'skin' | 'bone' | 'stimulated' | 'other', THREE.Material>,
): void {
  {
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.computeVertexNormals();
      const id = o.name as keyof typeof FOREARM.faces;
      o.material =
        id === 'skin'
          ? materials.skin
          : id === 'radius' || id === 'ulna' || id === 'humerus'
            ? materials.bone
            : parts.includes(id)
              ? materials.stimulated
              : materials.other;
      o.renderOrder = id === 'skin' ? 2 : 0;
    });
  }
}

/** The pad on the skin over the motor point: a ray from the muscle outward, stopped by the skin mesh. */
function Electrode({ layout, label }: { layout: Layout; label: boolean }) {
  const gltf = useGLTF(FOREARM_URL);
  const placement = useMemo(() => {
    const skin = gltf.scene.getObjectByName('skin');
    const s = sectionAt(layout.parts[0]!, layout.motorPoint.x);
    const origin = new THREE.Vector3(layout.motorPoint.x, s.centre[0], s.centre[1]);
    const outward = new THREE.Vector3(0, s.centre[0], s.centre[1]).normalize();
    if (!skin) return null;
    skin.updateWorldMatrix(true, true);
    const hit = new THREE.Raycaster(origin, outward, 0, 0.2).intersectObject(skin, true)[0];
    const point = hit?.point ?? origin.clone().addScaledVector(outward, 0.02);
    const normal = hit?.face?.normal.clone().transformDirection(hit.object.matrixWorld) ?? outward;
    if (normal.dot(outward) < 0) normal.negate();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    return { point: point.addScaledVector(normal, PAD_THICKNESS / 2), q };
  }, [gltf, layout]);
  if (!placement) return null;
  return (
    <group position={placement.point} quaternion={placement.q}>
      <mesh>
        <cylinderGeometry args={[PAD_RADIUS, PAD_RADIUS, PAD_THICKNESS, 48]} />
        <meshStandardMaterial color="#3b4252" roughness={0.4} />
      </mesh>
      <Html center position={[0, 0.006, 0]} className={label ? 'three-label' : 'three-label three-label--hidden'}>
        {tr({ 'pt-BR': 'Eletrodo', en: 'Electrode' })}
      </Html>
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
  const sheath = useMemo(() => new THREE.TubeGeometry(nervePath(layout), 128, BUNDLE_RADIUS * 3, 16, false), [layout]);
  const axons = useMemo(
    () => (showAxons ? layout.units.map((u) => new THREE.TubeGeometry(nervePath(layout, u.lane), 96, AXON_RADIUS, 6, false)) : []),
    [layout, showAxons],
  );
  return (
    <group>
      <mesh geometry={sheath}>
        <meshStandardMaterial color="#e9d27a" transparent opacity={showAxons ? 0.15 : 0.9} depthWrite={!showAxons} />
      </mesh>
      {axons.map((g, k) => (
        <mesh key={k} geometry={g} onClick={(e) => { e.stopPropagation(); onSelect(k); }}>
          <meshStandardMaterial color={selected === k ? '#ffffff' : colors[layout.units[k]!.type]} emissive={selected === k ? '#888888' : '#000000'} />
        </mesh>
      ))}
    </group>
  );
}

function Territories({ layout, colors, selected, onSelect }: {
  layout: Layout;
  colors: TypeColors;
  selected: number | null;
  onSelect: (unit: number) => void;
}) {
  const x = layout.section.x + 0.0002;
  return (
    <group>
      {layout.units.map((u) => (
        <mesh
          key={u.index}
          position={[x, u.territory.centre[0], u.territory.centre[1]]}
          rotation={[0, Math.PI / 2, 0]}
          onClick={(e) => { e.stopPropagation(); onSelect(u.index); }}
        >
          <circleGeometry args={[u.territory.radius, 32]} />
          <meshBasicMaterial color={colors[u.type]} transparent opacity={selected === null || selected === u.index ? 0.75 : 0.25} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Motoneuron({ unit, color, selected, onSelect }: {
  unit: UnitLayout;
  color: string;
  selected: boolean;
  onSelect: (unit: number) => void;
}) {
  const { soma, dendrite } = unit;
  return (
    <group position={soma.position} onClick={(e) => { e.stopPropagation(); onSelect(unit.index); }}>
      {/* soma: cylinder as long as wide, axis along x */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[soma.diameter / 2, soma.diameter / 2, soma.length, 24]} />
        <meshStandardMaterial color={color} emissive={selected ? '#666666' : '#000000'} />
      </mesh>
      {/* dendrite: one equivalent cylinder, drawn toward −z (dorsal, illustrative direction) */}
      <mesh position={[0, 0, -(soma.diameter / 2 + dendrite.length / 2)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[dendrite.diameter / 2, dendrite.diameter / 2, dendrite.length, 12]} />
        <meshStandardMaterial color={color} transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

function labelClass(shown: boolean, extra = ''): string {
  return ['three-label', extra, shown ? '' : 'three-label--hidden'].filter(Boolean).join(' ');
}

/** Axons from each soma to the axis break, and the gap marker with the omitted length. */
function BrokenAxis({ layout, colors, showAxons, level }: { layout: Layout; colors: TypeColors; showAxons: boolean; level: LevelId }) {
  const lines = useMemo(() => {
    const entry = sectionAt(layout.parts[0]!, layout.motorPoint.x);
    const positions: number[] = [];
    const colorsArr: number[] = [];
    const c = new THREE.Color();
    for (const u of layout.units) {
      const [x, y, z] = u.soma.position;
      positions.push(x + u.soma.length / 2, y, z, AXIS_BREAK_X - 0.012, entry.centre[0] * 0.5 + u.lane[0], entry.centre[1] * 0.5 + u.lane[1]);
      c.set(colors[u.type]);
      colorsArr.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
    return g;
  }, [layout, colors]);
  const omitted = fmtNumber(layout.omittedLength, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return (
    <group>
      {showAxons ? (
        <lineSegments geometry={lines}>
          <lineBasicMaterial vertexColors transparent opacity={0.5} />
        </lineSegments>
      ) : null}
      {/* drei's <Html> is kept mounted and hidden by class: unmounting it conditionally throws in React's commit */}
      <Html center position={[(AXIS_BREAK_X + SPINAL_X) / 2, 0, 0.012]} className={labelClass(level === 'L0', 'three-label--gap')}>
        {tr({ 'pt-BR': `≈ ${omitted} m de axônio omitidos`, en: `≈ ${omitted} m of axon left out` })}
      </Html>
      {/* L0: below the group, clear of the gap label; L3: just above the somas (the group spans ≈ 3 mm) */}
      <Html center position={[SPINAL_X, 0, level === 'L3' ? 0.0006 : -0.012]} className={labelClass(level === 'L0' || level === 'L3')}>
        {tr({ 'pt-BR': 'Motoneurônios (medula)', en: 'Motoneurons (spinal cord)' })}
      </Html>
    </group>
  );
}

/** Keeps near/far proportional to the zoom (one scene spans 40 cm to 100 µm) and reports the level. */
function ZoomWatcher({ controls, onReadout }: { controls: RefObject<CameraControls | null>; onReadout: (r: ViewReadout) => void }) {
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
    const metresPerPixel = viewSize / size.height;
    const key = `${level.current}:${metresPerPixel.toPrecision(2)}`;
    if (key !== last.current) {
      last.current = key;
      onReadout({ level: level.current, metresPerPixel });
    }
  });
  return null;
}

export function ForearmScene({ layout, level, fly, colors, selected, onSelect, onReadout }: SceneProps) {
  const controls = useRef<CameraControls | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const { position, target } = levelCamera(fly.level, layout);
    void c.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, !first.current);
    first.current = false;
  }, [fly, layout]);
  const deep = level === 'L2' || level === 'L3';
  return (
    <>
      <color attach="background" args={['#14161a']} />
      <hemisphereLight args={['#ffffff', '#3a3a40', 1.1]} />
      <directionalLight position={[0.5, 1, 0.8]} intensity={1.4} />
      <CameraControls ref={controls} minDistance={distanceFor(0.0002)} maxDistance={distanceFor(1.2)} smoothTime={0.25} />
      <ZoomWatcher controls={controls} onReadout={onReadout} />
      <group onPointerMissed={() => onSelect(null)}>
        <Atlas layout={layout} level={level} />
        {layout.electrodeFraction !== null ? <Electrode layout={layout} label={level === 'L0'} /> : null}
        <Nerve layout={layout} showAxons={deep} colors={colors} selected={selected} onSelect={onSelect} />
        {level === 'L1' ? <Territories layout={layout} colors={colors} selected={selected} onSelect={onSelect} /> : null}
        <BrokenAxis layout={layout} colors={colors} showAxons={deep} level={level} />
        {layout.units.map((u) => (
          <Motoneuron key={u.index} unit={u} color={colors[u.type as MotorUnitType]} selected={selected === u.index} onSelect={onSelect} />
        ))}
      </group>
    </>
  );
}

useGLTF.preload(FOREARM_URL);

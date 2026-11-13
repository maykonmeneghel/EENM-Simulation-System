import * as THREE from 'three';
import type { Layout, LevelId, RegionId } from '../../application/anatomy3d';
import { LEG, LEVELS, SPINAL_X, sectionAt } from '../../application/anatomy3d';

export const FOREARM_URL = `${import.meta.env.BASE_URL}anatomy/forearm.glb`;
export const LEG_URL = `${import.meta.env.BASE_URL}anatomy/leg.glb`;
export const REGION_URL: Record<RegionId, string> = { forearm: FOREARM_URL, leg: LEG_URL };
export const FOV_DEG = 40;
export const TAN_HALF_FOV = Math.tan(((FOV_DEG / 2) * Math.PI) / 180);

/**
 * The camera's up direction. The forearm lies across the screen (three.js's default up); the leg stands, with the
 * knee up (its x axis points toward the ankle).
 */
export const REGION_UP: Record<RegionId, [number, number, number]> = { forearm: [0, 1, 0], leg: [-1, 0, 0] };

/** Camera distance that frames `viewSize` metres across the height of the view. */
export function distanceFor(viewSize: number): number {
  return viewSize / 2 / TAN_HALF_FOV;
}

/** The leg level frames the motoneurons past the broken axis down to the sole (≈ 60 cm) with a margin. */
const LEG_VIEW = 0.7;

/** Where each level looks from and at. */
export function levelCamera(level: LevelId, layout: Layout): { position: THREE.Vector3; target: THREE.Vector3 } {
  const size = LEVELS.find((l) => l.id === level)!.viewSize;
  const d = distanceFor(size);
  const s = layout.section;
  const atMotorPoint = sectionAt(layout.sections, layout.motorPoint.x);
  const leg = layout.region.id === 'leg';
  const from = (t: THREE.Vector3, dir: THREE.Vector3, dist = d) => ({ target: t, position: t.clone().add(dir.normalize().multiplyScalar(dist)) });
  switch (level) {
    case 'L0': {
      if (leg) {
        // from the lateral side, a little in front: the calf and the shin both show
        const t = new THREE.Vector3((SPINAL_X - 0.02 + LEG.landmarks.sole) / 2, 0, 0);
        return from(t, new THREE.Vector3(0, -0.45, LEG.lateral), distanceFor(LEG_VIEW));
      }
      // from the radial side, a little palmar: wrist flexion and extension move the hand in the screen plane
      const t = new THREE.Vector3(layout.region.length / 2 + 0.02, 0.02, 0);
      return from(t, new THREE.Vector3(0.1, 0.45, 0.89));
    }
    case 'L1': {
      const t = new THREE.Vector3(s.x, s.centre[0], s.centre[1]);
      if (leg) {
        // the cut faces distal: look up at it from below and from the muscle's own side, so the tibia and fibula
        // stay behind it
        const out = new THREE.Vector2(s.centre[0], s.centre[1]).normalize();
        return from(t, new THREE.Vector3(0.75, 0.66 * out.x, 0.66 * out.y));
      }
      return from(t, new THREE.Vector3(1, 0.25, 0.2));
    }
    case 'L2': {
      const t = new THREE.Vector3(layout.motorPoint.x, atMotorPoint.centre[0], atMotorPoint.centre[1]);
      return from(t, new THREE.Vector3(0.15, 0.6, 0.8));
    }
    case 'L3': {
      const t = new THREE.Vector3(SPINAL_X, 0, 0);
      return from(t, new THREE.Vector3(0.3, 0.5, 0.8));
    }
  }
}

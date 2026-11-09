import * as THREE from 'three';
import type { Layout, LevelId } from '../../application/anatomy3d';
import { FOREARM, LEVELS, SPINAL_X, sectionAt } from '../../application/anatomy3d';

export const FOREARM_URL = `${import.meta.env.BASE_URL}anatomy/forearm.glb`;
export const FOV_DEG = 40;
export const TAN_HALF_FOV = Math.tan(((FOV_DEG / 2) * Math.PI) / 180);

/** Camera distance that frames `viewSize` metres across the height of the view. */
export function distanceFor(viewSize: number): number {
  return viewSize / 2 / TAN_HALF_FOV;
}

/** Where each level looks from and at. */
export function levelCamera(level: LevelId, layout: Layout): { position: THREE.Vector3; target: THREE.Vector3 } {
  const size = LEVELS.find((l) => l.id === level)!.viewSize;
  const d = distanceFor(size);
  const s = layout.section;
  const atMotorPoint = sectionAt(layout.parts[0]!, layout.motorPoint.x);
  switch (level) {
    case 'L0': {
      // from the radial side, a little palmar: wrist flexion and extension move the hand in the screen plane
      const t = new THREE.Vector3(FOREARM.forearmLength / 2 + 0.02, 0.02, 0);
      return { target: t, position: t.clone().add(new THREE.Vector3(0.1, 0.45, 0.89).normalize().multiplyScalar(d)) };
    }
    case 'L1': {
      const t = new THREE.Vector3(s.x, s.centre[0], s.centre[1]);
      return { target: t, position: t.clone().add(new THREE.Vector3(1, 0.25, 0.2).normalize().multiplyScalar(d)) };
    }
    case 'L2': {
      const t = new THREE.Vector3(layout.motorPoint.x, atMotorPoint.centre[0], atMotorPoint.centre[1]);
      return { target: t, position: t.clone().add(new THREE.Vector3(0.15, 0.6, 0.8).normalize().multiplyScalar(d)) };
    }
    case 'L3': {
      const t = new THREE.Vector3(SPINAL_X, 0, 0);
      return { target: t, position: t.clone().add(new THREE.Vector3(0.3, 0.5, 0.8).normalize().multiplyScalar(d)) };
    }
  }
}


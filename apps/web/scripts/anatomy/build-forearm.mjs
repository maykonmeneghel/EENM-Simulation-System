#!/usr/bin/env node
// Builds the forearm of the 3D view from BodyParts3D (docs/design/3d-view.md §2.3). Run by hand:
//
//   node scripts/anatomy/build-forearm.mjs [path/to/isa_BP3D_4.0_obj_99.zip]
//
// Without a path it downloads the zip (136 MB) into ~/.cache/eenm-anatomy. It checks the zip's SHA-256, extracts the
// seven parts, checks each part's size against the design doc (1 %), moves them into the forearm frame (metres, origin
// at the elbow end of the forearm bones, x toward the wrist, y toward the palm), crops the whole-body skin to the
// forearm and writes:
//   public/anatomy/forearm.glb       meshes, one node per part (name = part id)
//   src/domain/forearm.json        frame, lengths and muscle cross-sections, for the app and its tests
// Exits 1 on any check that fails.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FOLDER, ZIP_SHA256, ZIP_URL, bounds, checkSize, cross, crossSections, dot, failer, keep, mean, merge, norm, pinnedZip,
  readPart, scale, sub, unit, web, writeGlb,
} from './lib.mjs';


// Sizes measured on 2026-11-06 (docs/design/3d-view.md §2.2), mm, bounding box x × y × z of the raw file.
const PARTS = [
  { id: 'fcr', file: 'FJ1496', fma: 'FMA38460', name: 'Right flexor carpi radialis', size: [87.8, 65.5, 276.8] },
  { id: 'ecrl', file: 'FJ1490', fma: 'FMA38495', name: 'Right extensor carpi radialis longus', size: [57.8, 67.8, 322.5] },
  { id: 'ecrb', file: 'FJ1489', fma: 'FMA38498', name: 'Right extensor carpi radialis brevis', size: [44.3, 65.5, 302.7] },
  { id: 'radius', file: 'FJ3349', fma: 'FMA23464', name: 'Right radius', size: [59.7, 65.8, 229.2] },
  { id: 'ulna', file: 'FJ3391', fma: 'FMA23467', name: 'Right ulna', size: [50.3, 78.7, 247.3] },
  { id: 'humerus', file: 'FJ3368', fma: 'FMA23130', name: 'Right humerus', size: [100.8, 49.2, 307.3] },
  { id: 'skin', file: 'FJ2810', fma: 'FMA7163', name: 'Skin', size: [666.9, 292.0, 1719.5] },
];
// The 27 bones of the right hand (8 carpals, 5 metacarpals, 14 phalanges), merged into one mesh that rotates at the
// wrist. Their combined bounding box, measured on 2026-11-06, is checked like the sizes above.
const HAND_BONES = [
  ['FMA24435', 'FJ3383'], ['FMA24437', 'FJ3374'], ['FMA24439', 'FJ3390'], ['FMA24441', 'FJ3382'], ['FMA24443', 'FJ3388'],
  ['FMA23725', 'FJ3389'], ['FMA24446', 'FJ3361'], ['FMA24448', 'FJ3367'], ['FMA24464', 'FJ3350'], ['FMA24466', 'FJ3352'],
  ['FMA24468', 'FJ3354'], ['FMA24470', 'FJ3356'], ['FMA24472', 'FJ3358'], ['FMA24450', 'FJ3327'], ['FMA24451', 'FJ3322'],
  ['FMA24452', 'FJ3325'], ['FMA24453', 'FJ3326'], ['FMA24454', 'FJ3323'], ['FMA24455', 'FJ3303'], ['FMA24456', 'FJ3306'],
  ['FMA24457', 'FJ3292'], ['FMA24458', 'FJ3304'], ['FMA24459', 'FJ3198'], ['FMA24460', 'FJ3193'], ['FMA24461', 'FJ3196'],
  ['FMA24462', 'FJ3197'], ['FMA24463', 'FJ3194'],
];
const HAND_SIZE = [105.0, 84.9, 158.7];
/** The capitate: its centroid is the wrist's flexion–extension centre (the head of the capitate). */
const CAPITATE = 'FJ3361';
const END_SLAB_MM = 10; // the bones' ends: vertices within this distance of their top / bottom
const SKIN_PROXIMAL_MM = 60; // skin kept from 6 cm above the elbow end of the bones …
const SKIN_DISTAL_MM = 180; // … to past the fingertips (the hand is ≈ 16 cm long)
const SKIN_RADIUS_MM = 70; // and within this distance of the forearm axis (excludes the torso)
const HUMERUS_PROXIMAL_MM = 80; // the elbow end of the humerus only
const SECTION_STEP_MM = 10;
const SECTION_HALF_SLAB_MM = 4;

const fail = failer('build-forearm');

async function main() {
  const zip = await pinnedZip(fail);

  const raw = {};
  for (const part of PARTS) {
    const mesh = readPart(zip, part.file, part.fma, fail);
    checkSize(part.id, bounds(mesh.vertices).size, part.size, fail);
    raw[part.id] = mesh;
  }

  const handParts = HAND_BONES.map(([fma, file]) => ({ file, mesh: readPart(zip, file, fma, fail) }));
  const capitate = handParts.find((p) => p.file === CAPITATE).mesh.vertices;
  const hand = merge(handParts.map((p) => p.mesh));
  checkSize('hand bones', bounds(hand.vertices).size, HAND_SIZE, fail);
  raw.handBones = hand;

  // forearm frame from the bones' ends (z is up in BodyParts3D, the arm hangs down)
  const bones = [...raw.radius.vertices, ...raw.ulna.vertices];
  const top = Math.max(...bones.map((v) => v[2]));
  const bottom = Math.min(...bones.map((v) => v[2]));
  const elbow = mean(bones.filter((v) => v[2] > top - END_SLAB_MM));
  const wrist = mean(bones.filter((v) => v[2] < bottom + END_SLAB_MM));
  const ex = unit(sub(wrist, elbow));
  const palmar = sub(mean(raw.fcr.vertices), mean([...raw.ecrl.vertices, ...raw.ecrb.vertices])); // flexor side
  const ey = unit(sub(palmar, scale(ex, dot(palmar, ex))));
  const ez = cross(ex, ey);
  const toFrame = (v) => { const d = sub(v, elbow); return [dot(d, ex), dot(d, ey), dot(d, ez)]; };
  const lengthMm = norm(sub(wrist, elbow));

  const wristCentre = toFrame(mean(capitate));
  const framed = {};
  for (const [id, mesh] of Object.entries(raw)) framed[id] = { vertices: mesh.vertices.map(toFrame), faces: mesh.faces };

  framed.skin = keep(framed.skin, ([x, y, z]) =>
    x > -SKIN_PROXIMAL_MM && x < lengthMm + SKIN_DISTAL_MM && Math.hypot(y, z) < SKIN_RADIUS_MM, fail);
  framed.humerus = keep(framed.humerus, ([x]) => x > -HUMERUS_PROXIMAL_MM, fail);
  const parts = [...PARTS, { id: 'handBones', fma: 'FMA24435…FMA24463', name: 'Bones of the right hand (27)' }];

  // muscle cross-sections along the forearm axis: centre and half-extents (illustrative ellipse, §3 L1)
  const sections = {};
  for (const id of ['fcr', 'ecrl', 'ecrb']) sections[id] = crossSections(framed[id].vertices, SECTION_STEP_MM, SECTION_HALF_SLAB_MM);

  // glTF: positions in metres, welded and compacted
  const { glb, faceCounts } = await writeGlb({
    sceneName: 'forearm',
    parts,
    framed,
    adaptedBy: 'apps/web/scripts/anatomy/build-forearm.mjs (cropped, re-framed in metres)',
  });
  mkdirSync(join(web, 'public/anatomy'), { recursive: true });
  writeFileSync(join(web, 'public/anatomy/forearm.glb'), glb);

  const meta = {
    source: { dataset: 'BodyParts3D 4.0', zip: `${FOLDER}.zip`, sha256: ZIP_SHA256, url: ZIP_URL },
    units: 'metres',
    frame: 'origin at the elbow end of radius + ulna; x toward the wrist end; y toward the flexor (palmar) side; z = x × y',
    forearmLength: Math.round(lengthMm * 10) / 10000,
    /** Wrist flexion–extension centre (capitate centroid); the axis is z (x distal × y palmar): +θ is flexion. */
    wrist: { centre: wristCentre.map((v) => Math.round(v * 10) / 10000) },
    faces: faceCounts,
    sections,
  };
  writeFileSync(join(web, 'src/domain/forearm.json'), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`forearm ${meta.forearmLength} m; glb ${(glb.byteLength / 1e6).toFixed(2)} MB; faces ${JSON.stringify(faceCounts)}`);
}

await main();

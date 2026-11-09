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

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { weld } from '@gltf-transform/functions';

const ZIP_URL = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip';
const ZIP_SHA256 = '40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e';
const FOLDER = 'isa_BP3D_4.0_obj_99';

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
const TOLERANCE = 0.01;
const END_SLAB_MM = 10; // the bones' ends: vertices within this distance of their top / bottom
const SKIN_PROXIMAL_MM = 60; // skin kept from 6 cm above the elbow end of the bones …
const SKIN_DISTAL_MM = 180; // … to past the fingertips (the hand is ≈ 16 cm long)
const SKIN_RADIUS_MM = 70; // and within this distance of the forearm axis (excludes the torso)
const HUMERUS_PROXIMAL_MM = 80; // the elbow end of the humerus only
const SECTION_STEP_MM = 10;
const SECTION_HALF_SLAB_MM = 4;

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '../..');

function fail(message) {
  console.error(`build-forearm: ${message}`);
  process.exit(1);
}

async function zipPath() {
  const given = process.argv[2];
  if (given) return resolve(given);
  const cache = join(homedir(), '.cache', 'eenm-anatomy');
  mkdirSync(cache, { recursive: true });
  const target = join(cache, `${FOLDER}.zip`);
  if (!existsSync(target)) {
    console.log(`downloading ${ZIP_URL}`);
    const response = await fetch(ZIP_URL);
    if (!response.ok || !response.body) fail(`download failed: HTTP ${response.status}`);
    await pipeline(response.body, createWriteStream(target));
  }
  return target;
}

function parseObj(text) {
  const vertices = [];
  const faces = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/);
      vertices.push([Number(x), Number(y), Number(z)]);
    } else if (line.startsWith('f ')) {
      const idx = line.trim().split(/\s+/).slice(1).map((t) => Number(t.split('/')[0]) - 1);
      for (let k = 1; k + 1 < idx.length; k++) faces.push([idx[0], idx[k], idx[k + 1]]); // fan
    }
  }
  if (!vertices.length || !faces.length) fail('an OBJ part has no vertices or faces');
  return { vertices, faces };
}

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, s) => a.map((v) => v * s);
const norm = (a) => Math.hypot(...a);
const unit = (a) => scale(a, 1 / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mean = (points) => scale(points.reduce((s, p) => s.map((v, i) => v + p[i]), [0, 0, 0]), 1 / points.length);

function bounds(vertices) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const v of vertices) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i]); }
  return { lo, hi, size: hi.map((h, i) => h - lo[i]) };
}

async function main() {
  const zip = await zipPath();
  const digest = createHash('sha256').update(readFileSync(zip)).digest('hex');
  if (digest !== ZIP_SHA256) fail(`SHA-256 ${digest} differs from the pinned ${ZIP_SHA256}`);

  const raw = {};
  for (const part of PARTS) {
    const text = execFileSync('unzip', ['-p', zip, `${FOLDER}/${part.file}.obj`], { maxBuffer: 1 << 30 }).toString();
    if (!text.includes(`Concept ID : ${part.fma}`)) fail(`${part.file} is not ${part.fma}`);
    const mesh = parseObj(text);
    const { size } = bounds(mesh.vertices);
    size.forEach((s, i) => {
      if (Math.abs(s - part.size[i]) > TOLERANCE * part.size[i]) {
        fail(`${part.id}: size ${size.map((v) => v.toFixed(1)).join(' × ')} mm differs from the design doc's ${part.size.join(' × ')} mm by more than 1 %`);
      }
    });
    raw[part.id] = mesh;
  }

  const checkSize = (id, size, expected) => size.forEach((v, i) => {
    if (Math.abs(v - expected[i]) > TOLERANCE * expected[i]) {
      fail(`${id}: size ${size.map((x) => x.toFixed(1)).join(' × ')} mm differs from ${expected.join(' × ')} mm by more than 1 %`);
    }
  });
  const hand = { vertices: [], faces: [] };
  let capitate = null;
  for (const [fma, file] of HAND_BONES) {
    const text = execFileSync('unzip', ['-p', zip, `${FOLDER}/${file}.obj`], { maxBuffer: 1 << 30 }).toString();
    if (!text.includes(`Concept ID : ${fma}`)) fail(`${file} is not ${fma}`);
    const mesh = parseObj(text);
    if (file === CAPITATE) capitate = mesh.vertices;
    const offset = hand.vertices.length;
    hand.vertices.push(...mesh.vertices);
    for (const f of mesh.faces) hand.faces.push(f.map((i) => i + offset));
  }
  checkSize('hand bones', bounds(hand.vertices).size, HAND_SIZE);
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

  const keep = (mesh, inside) => {
    const faces = mesh.faces.filter((f) => f.every((i) => inside(mesh.vertices[i])));
    if (!faces.length) fail('a crop removed every face');
    return { vertices: mesh.vertices, faces };
  };
  framed.skin = keep(framed.skin, ([x, y, z]) =>
    x > -SKIN_PROXIMAL_MM && x < lengthMm + SKIN_DISTAL_MM && Math.hypot(y, z) < SKIN_RADIUS_MM);
  framed.humerus = keep(framed.humerus, ([x]) => x > -HUMERUS_PROXIMAL_MM);
  const parts = [...PARTS, { id: 'handBones', fma: 'FMA24435…FMA24463', name: 'Bones of the right hand (27)' }];

  // muscle cross-sections along the forearm axis: centre and half-extents (illustrative ellipse, §3 L1)
  const sections = {};
  for (const id of ['fcr', 'ecrl', 'ecrb']) {
    const { vertices } = framed[id];
    const xs = vertices.map((v) => v[0]);
    const from = Math.ceil(Math.min(...xs) / SECTION_STEP_MM) * SECTION_STEP_MM;
    const to = Math.max(...xs);
    sections[id] = [];
    for (let x = from; x <= to; x += SECTION_STEP_MM) {
      const slab = vertices.filter((v) => Math.abs(v[0] - x) <= SECTION_HALF_SLAB_MM);
      if (slab.length < 6) continue;
      const ys = slab.map((v) => v[1]);
      const zs = slab.map((v) => v[2]);
      const r = (a) => Math.round(a * 10) / 10000; // mm → m, 0.1 mm
      sections[id].push({
        x: r(x),
        centre: [r((Math.max(...ys) + Math.min(...ys)) / 2), r((Math.max(...zs) + Math.min(...zs)) / 2)],
        halfExtent: [r((Math.max(...ys) - Math.min(...ys)) / 2), r((Math.max(...zs) - Math.min(...zs)) / 2)],
      });
    }
  }

  // glTF: positions in metres, welded and compacted
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('forearm');
  const faceCounts = {};
  for (const part of parts) {
    const mesh = framed[part.id];
    const used = new Map();
    const positions = [];
    const indices = [];
    for (const f of mesh.faces) for (const i of f) {
      if (!used.has(i)) { used.set(i, used.size); positions.push(...mesh.vertices[i].map((v) => v / 1000)); }
      indices.push(used.get(i));
    }
    faceCounts[part.id] = indices.length / 3;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
    const node = doc.createNode(part.id).setMesh(doc.createMesh(part.id).addPrimitive(prim))
      .setExtras({ fma: part.fma, name: part.name, source: 'BodyParts3D 4.0' });
    scene.addChild(node);
  }
  await doc.transform(weld());
  doc.getRoot().getAsset().extras = {
    credit: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
    adaptedBy: 'apps/web/scripts/anatomy/build-forearm.mjs (cropped, re-framed in metres)',
  };
  const glb = await new NodeIO().writeBinary(doc);
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

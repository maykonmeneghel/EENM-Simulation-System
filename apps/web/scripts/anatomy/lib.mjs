// Shared steps of the anatomy asset scripts (build-forearm.mjs, build-leg.mjs; docs/design/3d-view.md §2.3): the
// pinned BodyParts3D archive, OBJ parsing, size checks, the region frame, cropping, cross-sections and the glTF writer.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

export const ZIP_URL = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip';
export const ZIP_SHA256 = '40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e';
export const FOLDER = 'isa_BP3D_4.0_obj_99';
export const TOLERANCE = 0.01;
export const CREDIT = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International';

const here = dirname(fileURLToPath(import.meta.url));
export const web = resolve(here, '../..');

export function failer(script) {
  return (message) => {
    console.error(`${script}: ${message}`);
    process.exit(1);
  };
}

/** The pinned archive: the path given on the command line, or a cached download; its SHA-256 is checked. */
export async function pinnedZip(fail) {
  let zip = process.argv[2] ? resolve(process.argv[2]) : null;
  if (!zip) {
    const cache = join(homedir(), '.cache', 'eenm-anatomy');
    mkdirSync(cache, { recursive: true });
    zip = join(cache, `${FOLDER}.zip`);
    if (!existsSync(zip)) {
      console.log(`downloading ${ZIP_URL}`);
      const response = await fetch(ZIP_URL);
      if (!response.ok || !response.body) fail(`download failed: HTTP ${response.status}`);
      await pipeline(response.body, createWriteStream(zip));
    }
  }
  const digest = createHash('sha256').update(readFileSync(zip)).digest('hex');
  if (digest !== ZIP_SHA256) fail(`SHA-256 ${digest} differs from the pinned ${ZIP_SHA256}`);
  return zip;
}

export function parseObj(text, fail) {
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

/** One part of the archive, after checking that the file is the FMA concept it should be. */
export function readPart(zip, file, fma, fail) {
  const text = execFileSync('unzip', ['-p', zip, `${FOLDER}/${file}.obj`], { maxBuffer: 1 << 30 }).toString();
  if (!text.includes(`Concept ID : ${fma}`)) fail(`${file} is not ${fma}`);
  return parseObj(text, fail);
}

export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const scale = (a, s) => a.map((v) => v * s);
export const norm = (a) => Math.hypot(...a);
export const unit = (a) => scale(a, 1 / norm(a));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const mean = (points) => scale(points.reduce((s, p) => s.map((v, i) => v + p[i]), [0, 0, 0]), 1 / points.length);

export function bounds(vertices) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const v of vertices) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i]); }
  return { lo, hi, size: hi.map((h, i) => h - lo[i]) };
}

/** Fails when a measured size differs from the design doc's by more than 1 % (the negative probe of §8 phase 1). */
export function checkSize(id, size, expected, fail) {
  size.forEach((v, i) => {
    if (Math.abs(v - expected[i]) > TOLERANCE * expected[i]) {
      fail(`${id}: size ${size.map((x) => x.toFixed(1)).join(' × ')} mm differs from the design doc's ${expected.join(' × ')} mm by more than 1 %`);
    }
  });
}

/** Several parts merged into one mesh (bones of the hand, of the foot). */
export function merge(meshes) {
  const out = { vertices: [], faces: [] };
  for (const mesh of meshes) {
    const offset = out.vertices.length;
    out.vertices.push(...mesh.vertices);
    for (const f of mesh.faces) out.faces.push(f.map((i) => i + offset));
  }
  return out;
}

/** Keeps the faces whose three vertices are inside (vertices stay; unused ones are dropped when written). */
export function keep(mesh, inside, fail) {
  const faces = mesh.faces.filter((f) => f.every((i) => inside(mesh.vertices[i])));
  if (!faces.length) fail('a crop removed every face');
  return { vertices: mesh.vertices, faces };
}

/** Muscle cross-sections along the region's axis (x): centre and half-extents, every 1 cm (illustrative ellipse). */
export function crossSections(vertices, stepMm = 10, halfSlabMm = 4) {
  const xs = vertices.map((v) => v[0]);
  const from = Math.ceil(Math.min(...xs) / stepMm) * stepMm;
  const to = Math.max(...xs);
  const out = [];
  for (let x = from; x <= to; x += stepMm) {
    const slab = vertices.filter((v) => Math.abs(v[0] - x) <= halfSlabMm);
    if (slab.length < 6) continue;
    const ys = slab.map((v) => v[1]);
    const zs = slab.map((v) => v[2]);
    const r = (a) => Math.round(a * 10) / 10000; // mm → m, 0.1 mm
    out.push({
      x: r(x),
      centre: [r((Math.max(...ys) + Math.min(...ys)) / 2), r((Math.max(...zs) + Math.min(...zs)) / 2)],
      halfExtent: [r((Math.max(...ys) - Math.min(...ys)) / 2), r((Math.max(...zs) - Math.min(...zs)) / 2)],
    });
  }
  return out;
}

/**
 * glTF of the framed parts: one node per part (name = part id), positions in metres, welded. `simplifyRatio` maps a
 * part id to the share of its faces to keep (meshoptimizer, bounded by `simplifyError`); parts not listed are kept as
 * they are. Returns the GLB bytes and the written face count of each part.
 */
export async function writeGlb({ sceneName, parts, framed, adaptedBy, simplifyRatio = {}, simplifyError = 0.001 }) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(sceneName);
  for (const part of parts) {
    const mesh = framed[part.id];
    const used = new Map();
    const positions = [];
    const indices = [];
    for (const f of mesh.faces) for (const i of f) {
      if (!used.has(i)) { used.set(i, used.size); positions.push(...mesh.vertices[i].map((v) => v / 1000)); }
      indices.push(used.get(i));
    }
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
    const node = doc.createNode(part.id).setMesh(doc.createMesh(part.id).addPrimitive(prim))
      .setExtras({ fma: part.fma, name: part.name, source: 'BodyParts3D 4.0' });
    scene.addChild(node);
  }
  await doc.transform(weld());
  const ratios = Object.entries(simplifyRatio);
  if (ratios.length) {
    await MeshoptSimplifier.ready;
    for (const [id, ratio] of ratios) {
      const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === id);
      if (!mesh) throw new Error(`no mesh ${id} to simplify`);
      for (const prim of mesh.listPrimitives()) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: simplifyError });
    }
  }
  const faceCounts = {};
  for (const m of doc.getRoot().listMeshes()) {
    faceCounts[m.getName()] = m.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  }
  doc.getRoot().getAsset().extras = { credit: CREDIT, adaptedBy };
  const glb = await new NodeIO().writeBinary(doc);
  return { glb, faceCounts };
}

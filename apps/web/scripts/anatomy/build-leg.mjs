#!/usr/bin/env node
// Builds the lower leg of the 3D view from BodyParts3D (docs/design/3d-view.md §10). Run by hand:
//
//   node scripts/anatomy/build-leg.mjs [path/to/isa_BP3D_4.0_obj_99.zip]
//
// Same pipeline as build-forearm.mjs (lib.mjs): the pinned zip, each part checked against its FMA id and against the
// size in the design doc (1 %), moved into the leg frame (metres, origin at the knee end of the tibia, x toward the
// ankle, y toward the calf), the whole-body skin cropped to the right leg, the skin and the foot bones decimated. Writes:
//   public/anatomy/leg.glb       meshes, one node per part (name = part id)
//   src/domain/leg.json          frame, landmarks, lengths and muscle cross-sections, for the app and its tests
// Exits 1 on any check that fails. The foot is static (no ankle joint): its bones are one mesh.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FOLDER, ZIP_SHA256, ZIP_URL, bounds, checkSize, cross, crossSections, dot, failer, keep, mean, merge, norm, pinnedZip,
  readPart, scale, sub, unit, web, writeGlb,
} from './lib.mjs';

// Sizes measured on 2026-11-12 (docs/design/3d-view.md §10.1), mm, bounding box x × y × z of the raw file.
const PARTS = [
  { id: 'sol', file: 'FJ1437', fma: 'FMA22558', name: 'Right soleus', size: [80.2, 58.9, 326.2] },
  { id: 'gm', file: 'FJ1397', fma: 'FMA45957', name: 'Medial head of right gastrocnemius', size: [52.5, 79.0, 309.3] },
  { id: 'gl', file: 'FJ1394', fma: 'FMA45960', name: 'Lateral head of right gastrocnemius', size: [55.8, 74.8, 290.5] },
  { id: 'ta', file: 'FJ1439', fma: 'FMA22544', name: 'Right tibialis anterior', size: [49.8, 76.8, 394.1] },
  { id: 'tibia', file: 'FJ3387', fma: 'FMA24477', name: 'Right tibia', size: [74.1, 62.8, 380.0] },
  { id: 'fibula', file: 'FJ3366', fma: 'FMA24480', name: 'Right fibula', size: [35.8, 29.7, 384.4] },
  { id: 'femur', file: 'FJ3365', fma: 'FMA24474', name: 'Right femur', size: [118.2, 62.7, 466.1] },
  { id: 'patella', file: 'FJ3381', fma: 'FMA24486', name: 'Right patella', size: [41.7, 21.7, 39.3] },
  { id: 'skin', file: 'FJ2810', fma: 'FMA7163', name: 'Skin', size: [666.9, 292.0, 1719.5] },
];
// The 26 bones of the right foot (7 tarsals, 5 metatarsals, 14 phalanges), merged into one static mesh; their combined
// bounding box, measured on 2026-11-12, is checked like the sizes above.
const FOOT_BONES = [
  ['FMA24497', 'FJ3360'], ['FMA24482', 'FJ3385'], ['FMA24500', 'FJ3308'], ['FMA24528', 'FJ3364'], ['FMA24523', 'FJ3370'],
  ['FMA24525', 'FJ3373'], ['FMA24521', 'FJ3377'], ['FMA24507', 'FJ3351'], ['FMA24509', 'FJ3353'], ['FMA24511', 'FJ3355'],
  ['FMA24513', 'FJ3357'], ['FMA24515', 'FJ3359'], ['FMA43253', 'FJ3310'], ['FMA32634', 'FJ3319'], ['FMA32636', 'FJ3320'],
  ['FMA32638', 'FJ3321'], ['FMA32640', 'FJ3324'], ['FMA32642', 'FJ3300'], ['FMA32644', 'FJ3301'], ['FMA32646', 'FJ3302'],
  ['FMA230986', 'FJ3305'], ['FMA32650', 'FJ3192'], ['FMA32652', 'FJ3189'], ['FMA32654', 'FJ3190'], ['FMA32656', 'FJ3191'],
  ['FMA32658', 'FJ3195'],
];
const FOOT_SIZE = [124.5, 212.0, 73.5];
/** The calcaneus: the superior margin of its tuberosity is the distal reference line of Yi et al. 2023 and 2025. */
const CALCANEUS = 'FJ3360';
const END_SLAB_MM = 10; // the bones' ends: vertices within this distance of their top / bottom
const SKIN_PROXIMAL_MM = 60; // skin kept from 6 cm above the knee end of the tibia …
const SOLE_MARGIN_MM = 10; // … to just past the sole
const FEMUR_PROXIMAL_MM = 80; // the knee end of the femur only
const TUBEROSITY_SLAB_MM = 10; // the calcaneal tuberosity: calcaneus vertices within this distance of its back
const FIBULAR_NECK_MM = 25; // the fibular neck, this far below the apex of the fibular head (illustrative)
const NECK_OFFSET_MM = 6; // the common fibular nerve winds this far outside the neck's centre (illustrative)
const POPLITEAL_SHARE = 0.55; // the tibial nerve trunk behind the knee: this share of the way to the back skin (illustrative)
const DECIMATE = { skin: 0.5, footBones: 0.4 }; // share of the faces kept (meshoptimizer): the skin and the static foot

const fail = failer('build-leg');

async function main() {
  const zip = await pinnedZip(fail);

  const raw = {};
  for (const part of PARTS) {
    const mesh = readPart(zip, part.file, part.fma, fail);
    checkSize(part.id, bounds(mesh.vertices).size, part.size, fail);
    raw[part.id] = mesh;
  }
  const footParts = FOOT_BONES.map(([fma, file]) => ({ file, mesh: readPart(zip, file, fma, fail) }));
  const calcaneus = footParts.find((p) => p.file === CALCANEUS).mesh.vertices;
  const foot = merge(footParts.map((p) => p.mesh));
  checkSize('foot bones', bounds(foot.vertices).size, FOOT_SIZE, fail);
  raw.footBones = foot;

  // leg frame (z is up in BodyParts3D, standing): origin at the top of the tibia (the plateau), x toward the midpoint
  // of the two malleoli (the ankle), y toward the calf (from the tibialis anterior to the triceps surae)
  const tibia = raw.tibia.vertices;
  const fibula = raw.fibula.vertices;
  const top = Math.max(...tibia.map((v) => v[2]));
  const knee = mean(tibia.filter((v) => v[2] > top - END_SLAB_MM));
  const endSlab = (vs) => { const low = Math.min(...vs.map((v) => v[2])); return mean(vs.filter((v) => v[2] < low + END_SLAB_MM)); };
  const ankle = scale(endSlab(tibia).map((v, i) => v + endSlab(fibula)[i]), 0.5);
  const ex = unit(sub(ankle, knee));
  const calf = sub(mean([...raw.sol.vertices, ...raw.gm.vertices, ...raw.gl.vertices]), mean(raw.ta.vertices));
  const ey = unit(sub(calf, scale(ex, dot(calf, ex))));
  const ez = cross(ex, ey);
  const toFrame = (v) => { const d = sub(v, knee); return [dot(d, ex), dot(d, ey), dot(d, ez)]; };
  const lengthMm = norm(sub(ankle, knee));

  const framed = {};
  for (const [id, mesh] of Object.entries(raw)) framed[id] = { vertices: mesh.vertices.map(toFrame), faces: mesh.faces };

  // landmarks of the literature's reference lines
  const fib = framed.fibula.vertices;
  const fibularHead = Math.min(...fib.map((v) => v[0]));
  const lateralMalleolus = Math.max(...fib.map((v) => v[0]));
  const calc = calcaneus.map(toFrame);
  const back = Math.max(...calc.map((v) => v[1]));
  const calcanealTuberosity = Math.min(...calc.filter((v) => v[1] > back - TUBEROSITY_SLAB_MM).map((v) => v[0]));
  const lateral = Math.sign(mean(fib)[2] - mean(framed.tibia.vertices)[2]); // the fibula is lateral: ±z
  const neckSlab = fib.filter((v) => Math.abs(v[0] - (fibularHead + FIBULAR_NECK_MM)) < 4);
  const neck = mean(neckSlab);
  const out = unit([0, neck[1], neck[2]]);
  const fibularNeck = [neck[0], neck[1] + out[1] * NECK_OFFSET_MM, neck[2] + out[2] * NECK_OFFSET_MM];
  const sole = Math.max(...framed.footBones.vertices.map((v) => v[0]));

  // skin: the right leg (body x < 0, the right side of BodyParts3D) from above the knee to the sole
  const rawSkin = raw.skin.vertices;
  framed.skin = keep(framed.skin, (v) => v[0] > -SKIN_PROXIMAL_MM && v[0] < sole + SOLE_MARGIN_MM, fail);
  framed.skin.faces = framed.skin.faces.filter((f) => f.every((i) => rawSkin[i][0] < 0));
  if (!framed.skin.faces.length) fail('the skin crop removed every face');
  const backSkin = framed.skin.faces.flat().map((i) => framed.skin.vertices[i]).filter((v) => Math.abs(v[0]) < 10);
  const popliteal = [POPLITEAL_SHARE * Math.max(...backSkin.map((v) => v[1])), 0];
  framed.femur = keep(framed.femur, ([x]) => x > -FEMUR_PROXIMAL_MM, fail);
  const parts = [...PARTS, { id: 'footBones', fma: 'FMA24497…FMA32658', name: 'Bones of the right foot (26)' }];

  const sections = {};
  for (const id of ['sol', 'gm', 'gl', 'ta']) sections[id] = crossSections(framed[id].vertices);

  const { glb, faceCounts } = await writeGlb({
    sceneName: 'leg',
    parts,
    framed,
    adaptedBy: 'apps/web/scripts/anatomy/build-leg.mjs (cropped, re-framed in metres, skin and foot bones decimated)',
    simplifyRatio: DECIMATE,
  });
  mkdirSync(join(web, 'public/anatomy'), { recursive: true });
  writeFileSync(join(web, 'public/anatomy/leg.glb'), glb);

  const m = (v) => Math.round(v * 10) / 10000; // mm → m, 0.1 mm
  const meta = {
    source: { dataset: 'BodyParts3D 4.0', zip: `${FOLDER}.zip`, sha256: ZIP_SHA256, url: ZIP_URL },
    units: 'metres',
    frame: 'origin at the knee end of the tibia (plateau); x toward the midpoint of the malleoli; y toward the calf (posterior); z = x × y',
    legLength: m(lengthMm),
    /** +1 when the lateral side (the fibula) is +z. */
    lateral,
    /** Distance along x of the landmarks the literature measures from. */
    landmarks: {
      fibularHead: m(fibularHead),
      lateralMalleolus: m(lateralMalleolus),
      calcanealTuberosity: m(calcanealTuberosity),
      sole: m(sole),
    },
    /** Illustrative nerve points (the atlas has no leg nerves): tibial trunk behind the knee (y, z); fibular neck (x, y, z). */
    nerve: { popliteal: popliteal.map(m), fibularNeck: fibularNeck.map(m) },
    faces: faceCounts,
    sections,
  };
  writeFileSync(join(web, 'src/domain/leg.json'), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`leg ${meta.legLength} m; glb ${(glb.byteLength / 1e6).toFixed(2)} MB; landmarks ${JSON.stringify(meta.landmarks)}; faces ${JSON.stringify(faceCounts)}`);
}

await main();

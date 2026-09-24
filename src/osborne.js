import { MeshBuilder, StandardMaterial, Color3, Vector3, TransformNode } from '@babylonjs/core';
import { plateMesh } from './geometry.js';
import { OSBORNE_PARTS, OSBORNE_W, OSBORNE_GROUND, pathToPolygon } from './osborne-shape.js';

const PLINTH_H = 0.3;
const PLATE_T = 0.14;

// A static Osborne bull: black steel silhouette on a steel frame, standing on a stone plinth.
// `y` is the fairway surface. Returns the meshes plus the plinth footprint as collision segments.
export function createOsborne(scene, { x, z, y, length = 3.9, facing = 1 }) {
  const root = new TransformNode('osborne', scene);
  root.position.set(x, y, z);
  const meshes = [];

  const steel = new StandardMaterial('osbSteel', scene);
  steel.diffuseColor = new Color3(0.03, 0.03, 0.035);
  steel.specularColor = new Color3(0.45, 0.45, 0.5);
  steel.specularPower = 60;
  steel.backFaceCulling = false;

  const frameMat = new StandardMaterial('osbFrame', scene);
  frameMat.diffuseColor = new Color3(0.16, 0.17, 0.19);
  frameMat.specularColor = new Color3(0.3, 0.3, 0.3);

  const stone = new StandardMaterial('osbStone', scene);
  stone.diffuseColor = new Color3(0.62, 0.6, 0.55);
  stone.specularColor = Color3.Black();
  const stoneTop = new StandardMaterial('osbStoneTop', scene);
  stoneTop.diffuseColor = new Color3(0.74, 0.72, 0.66);
  stoneTop.specularColor = Color3.Black();

  // Silhouette: design px -> metres, flipped so up is +y, centred on x, mirrored by `facing`.
  const s = length / OSBORNE_W;
  const polys = OSBORNE_PARTS.map((d) =>
    pathToPolygon(d, 40).map((p) => ({
      x: (p.x - OSBORNE_W / 2) * s * facing,
      y: (OSBORNE_GROUND - p.y) * s + PLINTH_H,
    }))
  );
  const bull = plateMesh('osborneBull', polys, PLATE_T, scene);
  bull.material = steel;
  bull.parent = root;
  meshes.push(bull);

  // Plinth
  const pw = length + 0.5;
  const pd = 0.7;
  const base = MeshBuilder.CreateBox('osbBase', { width: pw, height: PLINTH_H * 0.7, depth: pd }, scene);
  base.position.y = (PLINTH_H * 0.7) / 2;
  base.material = stone;
  const cap = MeshBuilder.CreateBox('osbCap', { width: pw - 0.16, height: PLINTH_H * 0.3, depth: pd - 0.16 }, scene);
  cap.position.y = PLINTH_H * 0.7 + (PLINTH_H * 0.3) / 2;
  cap.material = stoneTop;
  [base, cap].forEach((m) => {
    m.parent = root;
    m.receiveShadows = true;
    meshes.push(m);
  });

  // Steel frame behind the plate
  const tube = (a, b, d = 0.05) => {
    const va = new Vector3(...a);
    const vb = new Vector3(...b);
    const t = MeshBuilder.CreateTube('osbTube', { path: [va, vb], radius: d / 2, tessellation: 8 }, scene);
    t.material = frameMat;
    t.parent = root;
    meshes.push(t);
  };
  const zb = PLATE_T / 2 + 0.05;
  const top = PLINTH_H + 1.75;
  const beamY = PLINTH_H + 1.05;
  const hw = length * 0.32;
  for (const px of [-hw, 0, hw]) tube([px, PLINTH_H, zb], [px, beamY + 0.1, zb]);
  tube([-hw - 0.15, beamY, zb], [hw + 0.15, beamY, zb]);
  tube([-hw, PLINTH_H, zb], [0, beamY, zb], 0.035);
  tube([hw, PLINTH_H, zb], [0, beamY, zb], 0.035);
  tube([0, beamY, zb], [facing * length * 0.18, top, zb], 0.035);

  const hl = pw / 2;
  const hd = pd / 2;
  const corners = [
    [x - hl, z - hd],
    [x + hl, z - hd],
    [x + hl, z + hd],
    [x - hl, z + hd],
  ];
  const segs = corners.map((c, i) => {
    const n = corners[(i + 1) % 4];
    return [c[0], c[1], n[0], n[1]];
  });

  return { root, meshes, segs, rect: { x, z, hw: hl, hd } };
}

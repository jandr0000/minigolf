import { Mesh, MeshBuilder, TransformNode } from '@babylonjs/core';
import { flatMaterial } from './materials.js';

const TOWER_H = 5.4;
const BASE_H = 0.45;
const R_BOTTOM = 1.75;
const R_TOP = 1.15;
const AXLE_Y = 5.7;
const SAIL_LEN = 3.9;

// Radius of the tower at height y (it tapers from R_BOTTOM at the plinth to R_TOP under the cap).
const radiusAt = (y) => R_BOTTOM + (R_TOP - R_BOTTOM) * Math.min(1, Math.max(0, (y - BASE_H) / TOWER_H));

// A white tower windmill in the style of the one on Lytham Green: black cap, four lattice sails facing -z (the camera),
// small windows and a wooden door on the -z side whose leaves swing open (door.open(k), k in 0..1).
export function createWindmill(scene, { x, z, y = 0 }) {
  const M = {
    white: flatMaterial(scene, 'mill_white', '#f6f3ec', { spec: 0.08 }),
    black: flatMaterial(scene, 'mill_black', '#1b1a1c', { spec: 0.3 }),
    stone: flatMaterial(scene, 'mill_stone', '#8d7b67'),
    wood: flatMaterial(scene, 'mill_wood', '#7a4b26', { spec: 0.05 }),
    darkWood: flatMaterial(scene, 'mill_darkwood', '#3d2513'),
    glass: flatMaterial(scene, 'mill_glass', '#232a33', { spec: 0.4 }),
    inside: flatMaterial(scene, 'mill_inside', '#0b0908', { cull: false }),
    sail: flatMaterial(scene, 'mill_sail', '#fbfaf5', { spec: 0.05, cull: false }),
    frame: flatMaterial(scene, 'mill_frame', '#5a4630', { spec: 0.05 }),
  };
  const root = new TransformNode('windmill', scene);
  root.position.set(x, y, z);
  const meshes = [];
  // parent === null collects the mesh for merging (static tower parts); anything else stays a separate mesh
  const pending = new Map();
  const put = (mesh, material, parent, pos, rot) => {
    mesh.material = material;
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    if (parent) {
      mesh.parent = parent;
      meshes.push(mesh);
    } else {
      if (!pending.has(material)) pending.set(material, []);
      pending.get(material).push(mesh);
    }
    return mesh;
  };
  const flushStatics = () => {
    for (const [material, list] of pending) {
      const merged = Mesh.MergeMeshes(list, true, true);
      merged.material = material;
      merged.parent = root;
      merged.isPickable = false;
      merged.receiveShadows = true;
      meshes.push(merged);
    }
    pending.clear();
  };
  const cyl = (h, db, dt = db, tess = 32) => MeshBuilder.CreateCylinder('mill', { height: h, diameterBottom: db, diameterTop: dt, tessellation: tess }, scene);
  const box = (w, h, d) => MeshBuilder.CreateBox('mill', { width: w, height: h, depth: d }, scene);

  // plinth and tower
  put(cyl(BASE_H, R_BOTTOM * 2 + 0.4), M.stone, null, [0, BASE_H / 2, 0]);
  put(cyl(TOWER_H, R_BOTTOM * 2, R_TOP * 2), M.white, null, [0, BASE_H + TOWER_H / 2, 0]);
  put(MeshBuilder.CreateTorus('mill', { diameter: R_TOP * 2 + 0.12, thickness: 0.14, tessellation: 32 }, scene), M.black, null, [0, BASE_H + TOWER_H - 0.05, 0]);

  // windows (dark panes with a stone sill), none on the door side
  for (const [wy, phi] of [[2.6, 0.5], [2.6, Math.PI - 0.5], [3.9, 0.15], [3.9, Math.PI - 0.15], [3.9, Math.PI + 1.2], [3.9, Math.PI + 1.9], [2.6, Math.PI + 0.6]]) {
    const r = radiusAt(wy);
    const rot = [0, Math.PI / 2 - phi, 0];
    put(box(0.36, 0.55, 0.14), M.glass, null, [Math.cos(phi) * (r - 0.02), wy, Math.sin(phi) * (r - 0.02)], rot);
    put(box(0.5, 0.07, 0.22), M.stone, null, [Math.cos(phi) * (r + 0.03), wy - 0.32, Math.sin(phi) * (r + 0.03)], rot);
  }

  // black boat-shaped cap with a finial
  const cap = put(MeshBuilder.CreateSphere('mill', { diameter: 2.9, segments: 20 }, scene), M.black, null, [0, BASE_H + TOWER_H + 0.18, 0]);
  cap.scaling.set(1, 0.68, 1.12);
  put(cyl(0.5, 0.06, 0.06, 8), M.black, null, [0, BASE_H + TOWER_H + 1.0, 0]);
  put(MeshBuilder.CreateSphere('mill', { diameter: 0.16, segments: 8 }, scene), M.black, null, [0, BASE_H + TOWER_H + 1.28, 0]);

  flushStatics();

  // axle and the four lattice sails, turning around the axle facing the camera (-z)
  const hubZ = -1.85;
  const axle = put(cyl(1.4, 0.2, 0.2, 10), M.darkWood, root, [0, AXLE_Y, hubZ / 2 - 0.1], [Math.PI / 2, 0, 0]);
  axle.scaling.y = Math.abs(hubZ) / 1.4 + 0.15;
  const sails = new TransformNode('sails', scene);
  sails.parent = root;
  sails.position.set(0, AXLE_Y, hubZ);
  put(cyl(0.34, 0.5, 0.36, 12), M.black, sails, [0, 0, -0.12], [Math.PI / 2, 0, 0]);

  const parts = [];
  const sailPart = (w, h, cx, cy, ang) => {
    const b = box(w, h, 0.07);
    b.position.set(cx, cy, 0);
    b.rotation.z = ang;
    parts.push(b);
  };
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const d = [Math.cos(a), Math.sin(a)];
    const p = [-Math.sin(a), Math.cos(a)];
    const at = (r, off) => [d[0] * r + p[0] * off, d[1] * r + p[1] * off];
    // stock (frame wood) and the lattice: an outer rail plus cross slats
    const mid = at(SAIL_LEN / 2 + 0.05, 0);
    const stock = box(SAIL_LEN + 0.3, 0.13, 0.11);
    stock.position.set(mid[0], mid[1], -0.02);
    stock.rotation.z = a;
    stock.material = M.frame;
    stock.parent = sails;
    stock.isPickable = false;
    meshes.push(stock);
    const railC = at(0.5 + (SAIL_LEN - 0.5) / 2, 0.98);
    sailPart(SAIL_LEN - 0.5, 0.07, railC[0], railC[1], a);
    for (let s = 0; s < 9; s++) {
      const r = 0.7 + s * 0.375;
      const c = at(r, 0.5);
      sailPart(0.98, 0.05, c[0], c[1], a + Math.PI / 2);
    }
  }
  const lattice = Mesh.MergeMeshes(parts, true, false);
  lattice.material = M.sail;
  lattice.parent = sails;
  lattice.isPickable = false;
  meshes.push(lattice);

  // door on the -z side: frame, two leaves on hinges and a dark doorway behind
  const doorY = BASE_H;
  const doorZ = -radiusAt(doorY + 0.8) - 0.02;
  const door = new TransformNode('millDoor', scene);
  door.parent = root;
  door.position.set(0, doorY, doorZ);
  put(box(1.15, 1.6, 0.4), M.inside, door, [0, 0.8, 0.22]);
  put(box(0.16, 1.7, 0.2), M.stone, door, [-0.66, 0.85, 0]);
  put(box(0.16, 1.7, 0.2), M.stone, door, [0.66, 0.85, 0]);
  put(box(1.5, 0.18, 0.22), M.stone, door, [0, 1.76, 0]);
  const leaves = [-1, 1].map((s) => {
    const hinge = new TransformNode('millLeaf', scene);
    hinge.parent = door;
    hinge.position.set(s * 0.56, 0, -0.06);
    put(box(0.56, 1.55, 0.09), M.wood, hinge, [-s * 0.28, 0.78, 0]);
    for (const py of [0.3, 0.8, 1.3]) put(box(0.56, 0.06, 0.11), M.darkWood, hinge, [-s * 0.28, py, 0]);
    put(box(0.05, 0.16, 0.13), M.black, hinge, [-s * 0.5, 0.8, 0]);
    return { hinge, s };
  });
  const state = { k: 0 };
  const doorApi = {
    // 0 = shut, 1 = swung wide open
    open(k) {
      state.k = k;
      for (const l of leaves) l.hinge.rotation.y = -l.s * k * 1.75;
    },
    get k() {
      return state.k;
    },
    // ground point just outside the doorway
    pos: { x, z: z + doorZ - 0.5 },
  };
  doorApi.open(0);

  return {
    root,
    meshes,
    circles: [{ x, z, r: R_BOTTOM + 0.25, kind: 'stone' }],
    radius: R_BOTTOM + 0.25,
    door: doorApi,
    update(t, dt) {
      sails.rotation.z += dt * 0.55;
    },
  };
}

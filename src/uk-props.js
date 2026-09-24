import { Mesh, MeshBuilder, TransformNode, StandardMaterial, DynamicTexture, Color3 } from '@babylonjs/core';
import { flatMaterial, stoneMaterial } from './materials.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pineMats = new WeakMap();
function getPineMats(scene) {
  let m = pineMats.get(scene);
  if (m) return m;
  const trunk = flatMaterial(scene, 'pineTrunk', '#5a3d27');
  const leaf = new StandardMaterial('pineLeaf', scene);
  leaf.diffuseColor = Color3.White();
  leaf.specularColor = Color3.Black();
  m = { trunk, leaf };
  pineMats.set(scene, m);
  return m;
}

// A Scots pine: trunk plus stacked, slightly ragged cones. Foliage is one merged mesh with vertex colours.
export function createPine(scene, { x, z, height = 4, seed = 1 }) {
  const m = getPineMats(scene);
  const rand = rng(seed * 131);
  const root = new TransformNode('pine', scene);
  root.position.set(x, 0, z);
  root.rotation.y = rand() * 6.28;

  const trunk = MeshBuilder.CreateCylinder('pt', { height: height * 0.5, diameterBottom: 0.3, diameterTop: 0.16, tessellation: 7 }, scene);
  trunk.material = m.trunk;
  trunk.position.y = height * 0.25;
  trunk.parent = root;

  const cones = [];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1);
    const h = height * (0.38 - i * 0.04);
    const d = height * (0.62 - i * 0.13) * (0.9 + rand() * 0.2);
    const cone = MeshBuilder.CreateCylinder('pc', { height: h, diameterTop: 0, diameterBottom: d, tessellation: 9 }, scene);
    cone.position.y = height * (0.3 + i * 0.19);
    cone.rotation.y = rand() * 3;
    const n = cone.getTotalVertices();
    const col = new Float32Array(n * 4);
    const shade = 0.75 + (1 - k) * 0.1 + rand() * 0.12;
    for (let v = 0; v < n; v++) {
      col[v * 4] = 0.16 * shade;
      col[v * 4 + 1] = 0.5 * shade;
      col[v * 4 + 2] = 0.25 * shade;
      col[v * 4 + 3] = 1;
    }
    cone.setVerticesData('color', col);
    cones.push(cone);
  }
  const foliage = Mesh.MergeMeshes(cones, true, false);
  foliage.material = m.leaf;
  foliage.parent = root;
  for (const mesh of [trunk, foliage]) mesh.isPickable = false;

  const phase = rand() * 6;
  return {
    root,
    meshes: [trunk, foliage],
    update(t) {
      root.rotation.z = Math.sin(t * 0.8 + phase) * 0.012;
    },
  };
}

// A ring of standing stones with a few lintels and a central altar. `circles` are the collision shapes.
export function createStoneRing(scene, { x, z, y, radius = 3, count = 8, seed = 1 }) {
  const rand = rng(seed * 71);
  const mat = stoneMaterial(scene);
  const root = new TransformNode('stones', scene);
  const meshes = [];
  const circles = [];
  const add = (mesh, px, py, pz, rotY) => {
    mesh.material = mat;
    mesh.position.set(px, py, pz);
    mesh.rotation.y = rotY;
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    meshes.push(mesh);
    return mesh;
  };

  const stoneH = 2.1;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.2;
    const sx = x + Math.cos(a) * radius;
    const sz = z + Math.sin(a) * radius;
    const h = stoneH * (0.85 + rand() * 0.25);
    const w = 0.7 + rand() * 0.15;
    const box = MeshBuilder.CreateBox('stone', { width: w, height: h, depth: 0.52 }, scene);
    add(box, sx, y + h / 2, sz, -(a + Math.PI / 2) + (rand() - 0.5) * 0.12).rotation.z = (rand() - 0.5) * 0.06;
    circles.push({ x: sx, z: sz, r: 0.43, kind: 'stone' });
  }
  // lintels on alternate gaps
  const da = (Math.PI * 2) / count;
  for (let i = 0; i < count; i += 2) {
    const a = ((i + 0.5) / count) * Math.PI * 2 + 0.2;
    const r = radius * Math.cos(da / 2);
    const chord = 2 * radius * Math.sin(da / 2);
    const lintel = MeshBuilder.CreateBox('lintel', { width: chord + 0.7, height: 0.42, depth: 0.6 }, scene);
    add(lintel, x + Math.cos(a) * r, y + stoneH * 0.92 + 0.21, z + Math.sin(a) * r, -(a + Math.PI / 2));
  }
  // altar stone
  add(MeshBuilder.CreateBox('altar', { width: 1.9, height: 0.5, depth: 0.85 }, scene), x, y + 0.25, z, 0.45);
  circles.push({ x, z, r: 0.62, kind: 'stone' });

  return { root, meshes, circles };
}

// Dry-stone wall running along z. Returns its footprint as a rectangle and as collision segments.
export function createDryWall(scene, { x, z1, z2, y, thick = 0.55, height = 0.8, seed = 1 }) {
  const rand = rng(seed * 53);
  const mat = stoneMaterial(scene);
  const root = new TransformNode('dryWall', scene);
  const meshes = [];
  const zc = (z1 + z2) / 2;
  const len = Math.abs(z2 - z1);
  const parts = [];
  const body = MeshBuilder.CreateBox('wallBody', { width: thick, height, depth: len }, scene);
  body.position.set(x, y + height / 2, zc);
  parts.push(body);
  const caps = Math.floor(len / 0.55);
  for (let i = 0; i < caps; i++) {
    const s = 0.28 + rand() * 0.16;
    const cap = MeshBuilder.CreateBox('wallCap', { width: thick + 0.08, height: s, depth: 0.5 + rand() * 0.1 }, scene);
    cap.position.set(x, y + height + s / 2 - 0.04, Math.min(z1, z2) + 0.3 + i * 0.55 + rand() * 0.1);
    cap.rotation.y = (rand() - 0.5) * 0.1;
    parts.push(cap);
  }
  const wall = Mesh.MergeMeshes(parts, true, false);
  wall.material = mat;
  wall.parent = root;
  meshes.push(wall);
  meshes.forEach((m) => {
    m.isPickable = false;
    m.receiveShadows = true;
  });
  const hw = thick / 2;
  const lo = Math.min(z1, z2);
  const hi = Math.max(z1, z2);
  const c = [
    [x - hw, lo],
    [x + hw, lo],
    [x + hw, hi],
    [x - hw, hi],
  ];
  const segs = c.map((p, i) => {
    const q = c[(i + 1) % 4];
    return [p[0], p[1], q[0], q[1]];
  });
  return { root, meshes, segs, rect: { x, z: zc, hw, hd: len / 2 } };
}

// Helipad with a painted H, edge lights that chase, and a windsock.
export function createHelipad(scene, { x, z, y = 0, radius = 3.2 }) {
  const root = new TransformNode('helipad', scene);
  root.position.set(x, y, z);
  const concrete = flatMaterial(scene, 'padConcrete', '#8b9096', { spec: 0.08 });
  const H = 0.16;
  const base = MeshBuilder.CreateCylinder('padBase', { height: H, diameter: radius * 2 + 0.5, tessellation: 40 }, scene);
  base.position.y = H / 2;
  base.material = concrete;
  base.parent = root;

  const S = 512;
  const tex = new DynamicTexture('padTex', { width: S, height: S }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = '#5f656c';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 3, 3);
  }
  ctx.strokeStyle = '#ffc400';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f4f4f0';
  ctx.font = 'bold 300px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', S / 2, S / 2 + 14);
  tex.update();
  const topMat = new StandardMaterial('padTop', scene);
  topMat.diffuseTexture = tex;
  topMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const top = MeshBuilder.CreateDisc('padTop', { radius, tessellation: 48 }, scene);
  top.rotation.x = Math.PI / 2;
  top.position.y = H + 0.004;
  top.material = topMat;
  top.parent = root;
  top.receiveShadows = true;

  const lampOn = flatMaterial(scene, 'padLampOn', '#ffb020', { emissive: '#ffb020' });
  lampOn.disableLighting = true;
  const lampOff = flatMaterial(scene, 'padLampOff', '#5a4a2a');
  const lamps = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const lamp = MeshBuilder.CreateSphere('padLamp', { diameter: 0.2, segments: 6 }, scene);
    lamp.position.set(Math.cos(a) * (radius + 0.12), H + 0.06, Math.sin(a) * (radius + 0.12));
    lamp.material = lampOff;
    lamp.parent = root;
    lamps.push(lamp);
  }

  const pole = MeshBuilder.CreateCylinder('sockPole', { height: 3.4, diameter: 0.08, tessellation: 6 }, scene);
  pole.position.set(radius + 1.6, 1.7, -radius * 0.6);
  pole.material = flatMaterial(scene, 'sockPoleMat', '#d8d8d8', { spec: 0.3 });
  pole.parent = root;
  const sockPivot = new TransformNode('sockPivot', scene);
  sockPivot.parent = root;
  sockPivot.position.set(radius + 1.6, 3.3, -radius * 0.6);
  const sockMat = flatMaterial(scene, 'sockMat', '#ff7a1a', { cull: false });
  const sock = MeshBuilder.CreateCylinder('sock', { height: 1.3, diameterTop: 0.16, diameterBottom: 0.5, tessellation: 12, cap: Mesh.NO_CAP }, scene);
  sock.rotation.z = Math.PI / 2;
  sock.position.x = 0.65;
  sock.material = sockMat;
  sock.parent = sockPivot;
  [base, top, pole, sock, ...lamps].forEach((m) => (m.isPickable = false));

  return {
    root,
    x,
    z,
    top: y + H,
    radius,
    casters: [pole, sock],
    update(t) {
      const on = Math.floor(t * 6) % 12;
      lamps.forEach((l, i) => (l.material = i === on || i === (on + 6) % 12 ? lampOn : lampOff));
      sockPivot.rotation.y = -0.35 + Math.sin(t * 0.9) * 0.18;
      sock.rotation.y = Math.sin(t * 3) * 0.05;
    },
  };
}

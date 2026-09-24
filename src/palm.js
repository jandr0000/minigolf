import {
  Mesh,
  MeshBuilder,
  VertexData,
  Vector3,
  Quaternion,
  StandardMaterial,
  Color3,
  TransformNode,
} from '@babylonjs/core';

let mats = null;
function getMats(scene) {
  if (mats && mats.scene === scene) return mats;
  const trunk = new StandardMaterial('palmTrunk', scene);
  trunk.diffuseColor = Color3.White();
  trunk.specularColor = Color3.Black();
  const leaf = new StandardMaterial('palmLeaf', scene);
  leaf.diffuseColor = Color3.White();
  leaf.specularColor = new Color3(0.08, 0.1, 0.08);
  leaf.backFaceCulling = false;
  leaf.twoSidedLighting = true;
  const nut = new StandardMaterial('palmNut', scene);
  nut.diffuseColor = new Color3(0.36, 0.22, 0.1);
  nut.specularColor = new Color3(0.12, 0.1, 0.08);
  mats = { scene, trunk, leaf, nut };
  return mats;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function paint(mesh, r, g, b) {
  const count = mesh.getTotalVertices();
  const c = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    c[i * 4] = r;
    c[i * 4 + 1] = g;
    c[i * 4 + 2] = b;
    c[i * 4 + 3] = 1;
  }
  mesh.setVerticesData('color', c);
}

function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return p0
    .scale(u * u * u)
    .add(p1.scale(3 * u * u * t))
    .add(p2.scale(3 * u * t * t))
    .add(p3.scale(t * t * t));
}

function buildTrunk(scene, m, height, lean) {
  const p0 = new Vector3(0, 0, 0);
  const p1 = new Vector3(lean.x * 0.05, height * 0.4, lean.z * 0.05);
  const p2 = new Vector3(lean.x * 0.55, height * 0.78, lean.z * 0.55);
  const p3 = new Vector3(lean.x, height, lean.z);
  const rings = 18;
  const parts = [];
  const pts = [];
  for (let i = 0; i <= rings; i++) pts.push(bezier(p0, p1, p2, p3, i / rings));
  const radius = (t) => 0.115 * (1 - 0.42 * t) + 0.09 * Math.exp(-t * 14);
  const up = Vector3.Up();
  for (let i = 0; i < rings; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dir = b.subtract(a);
    const len = dir.length();
    const ta = i / rings;
    const tb = (i + 1) / rings;
    const seg = MeshBuilder.CreateCylinder(
      'trunkSeg',
      { height: len * 1.02, diameterBottom: radius(ta) * 1.85, diameterTop: radius(tb) * 2.2, tessellation: 10 },
      scene
    );
    seg.position = a.add(b).scale(0.5);
    seg.rotationQuaternion = Quaternion.FromUnitVectorsToRef(up, dir.normalize(), new Quaternion());
    const k = i % 2 ? 0.86 : 1.0;
    paint(seg, 0.55 * k, 0.4 * k, 0.27 * k);
    parts.push(seg);
  }
  const merged = Mesh.MergeMeshes(parts, true, true);
  merged.material = m.trunk;
  return { mesh: merged, top: p3 };
}

function buildFronds(scene, m, seed, size) {
  const rand = rng(seed);
  const positions = [];
  const colors = [];
  const indices = [];

  const vert = (p, c) => {
    positions.push(p.x, p.y, p.z);
    colors.push(c[0], c[1], c[2], 1);
    return positions.length / 3 - 1;
  };

  const fronds = 15;
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const young = f % 3 === 0;
    const L = size * (young ? 0.75 : 1.0) * (0.85 + rand() * 0.3);
    const rise = L * (young ? 1.0 : 0.55 + rand() * 0.25);
    const drop = L * (young ? 0.5 : 0.7 + rand() * 0.2);
    const d = new Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const perp = new Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
    const tone = 0.85 + rand() * 0.3;
    const n = 16;
    const R = (t) => d.scale(L * t).add(new Vector3(0, rise * t - drop * t * t, 0));
    const r = [];
    for (let j = 0; j <= n; j++) r.push(R(j / n));

    // midrib
    for (let j = 0; j < n; j++) {
      const w = perp.scale(0.012);
      const a = vert(r[j].subtract(w), [0.25 * tone, 0.32 * tone, 0.12 * tone]);
      const b = vert(r[j].add(w), [0.25 * tone, 0.32 * tone, 0.12 * tone]);
      const c = vert(r[j + 1].subtract(w), [0.25 * tone, 0.32 * tone, 0.12 * tone]);
      const e = vert(r[j + 1].add(w), [0.25 * tone, 0.32 * tone, 0.12 * tone]);
      indices.push(a, b, c, b, e, c);
    }

    // leaflets
    for (let j = 2; j < n; j++) {
      const t = j / n;
      const tang = r[j + 1].subtract(r[j - 1]).normalize();
      const len = size * 0.46 * Math.pow(Math.sin(Math.PI * (0.18 + 0.78 * t)), 0.7) * (0.85 + rand() * 0.3);
      const droop = 0.35 + t * 0.55 + (young ? -0.25 : 0);
      for (const s of [-1, 1]) {
        const side = perp.scale(s * Math.cos(droop)).add(new Vector3(0, -Math.sin(droop), 0));
        const tip = r[j].add(side.scale(len)).add(tang.scale(len * 0.55));
        const dark = [0.09 * tone, 0.34 * tone, 0.1 * tone];
        const light = [0.34 * tone, 0.66 * tone, 0.17 * tone];
        const a = vert(r[j], dark);
        const b = vert(r[j + 1], dark);
        const c = vert(tip, light);
        if (s > 0) indices.push(a, b, c);
        else indices.push(a, c, b);
      }
    }
  }

  const mesh = new Mesh('palmFronds', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.colors = colors;
  vd.indices = indices;
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  vd.applyToMesh(mesh);
  mesh.material = m.leaf;
  return mesh;
}

export function createPalm(scene, { x = 0, z = 0, height = 3.2, lean = [0.5, 0.5], seed = 1, scale = 1 } = {}) {
  const m = getMats(scene);
  const root = new TransformNode('palm', scene);
  root.position.set(x, 0, z);
  root.scaling.setAll(scale);

  const lv = new Vector3(lean[0], 0, lean[1]);
  const { mesh: trunk, top } = buildTrunk(scene, m, height, lv);
  trunk.parent = root;

  const crown = new TransformNode('palmCrown', scene);
  crown.parent = root;
  crown.position.copyFrom(top);

  const fronds = buildFronds(scene, m, seed, height * 0.62);
  fronds.parent = crown;
  fronds.position.y = 0.05;

  const nutParts = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + seed;
    const nut = MeshBuilder.CreateSphere('nut', { diameter: 0.26, segments: 8 }, scene);
    nut.position.set(Math.cos(a) * 0.17, -0.13, Math.sin(a) * 0.17);
    nutParts.push(nut);
  }
  const nutMesh = Mesh.MergeMeshes(nutParts, true, false);
  nutMesh.material = m.nut;
  nutMesh.parent = crown;
  nutMesh.isPickable = false;
  const nuts = [nutMesh];

  const phase = seed * 1.7;
  return {
    root,
    meshes: [trunk, fronds, ...nuts],
    update(t) {
      crown.rotation.x = Math.sin(t * 0.9 + phase) * 0.025;
      crown.rotation.z = Math.sin(t * 0.7 + phase * 1.3) * 0.03;
    },
  };
}

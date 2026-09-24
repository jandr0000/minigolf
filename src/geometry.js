import { Mesh, VertexData, Vector2, PolygonMeshBuilder } from '@babylonjs/core';
import earcut from 'earcut';

// All 2D polygons are arrays of {x, z}, counter-clockwise when seen from above (+y looking down).

export function catmullRomClosed(ctrl, samples = 8) {
  const n = ctrl.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  return out;
}

// Corner cutting: turns a rough {x, z} polygon into a smooth coastline without overshoot.
export function chaikin(pts, iterations = 2) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      out.push({ x: 0.75 * a.x + 0.25 * b.x, z: 0.75 * a.z + 0.25 * b.z }, { x: 0.25 * a.x + 0.75 * b.x, z: 0.25 * a.z + 0.75 * b.z });
    }
    p = out;
  }
  return p;
}

// Merges static meshes into one mesh per material (baking their world transforms) and parents the results.
// Used for scenery so a whole forest costs a couple of draw calls instead of hundreds.
export function mergeByMaterial(meshes, parent) {
  const groups = new Map();
  for (const m of meshes) {
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(m);
  }
  const out = [];
  for (const [material, list] of groups) {
    const merged = Mesh.MergeMeshes(list, true, true);
    if (!merged) continue;
    merged.material = material;
    merged.parent = parent;
    merged.isPickable = false;
    out.push(merged);
  }
  return out;
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

export function ensureCCW(pts) {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts;
}

export function circlePolygon(cx, cz, r, n = 32) {
  return ellipsePolygon(cx, cz, r, r, n, 0);
}

export function ellipsePolygon(cx, cz, rx, rz, n = 64, wobble = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (0.6 * Math.sin(3 * a + 1.0) + 0.4 * Math.sin(5 * a + 2.3));
    pts.push({ x: cx + Math.cos(a) * rx * k, z: cz + Math.sin(a) * rz * k });
  }
  return pts;
}

export function roundedRectOutline(cx, cz, w, h, r, samples = 6) {
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const ctrl = [];
  const corners = [
    [hw, -hh, -Math.PI / 2],
    [hw, hh, 0],
    [-hw, hh, Math.PI / 2],
    [-hw, -hh, Math.PI],
  ];
  for (const [ox, oz, a0] of corners) {
    for (let i = 0; i <= samples; i++) {
      const a = a0 + (i / samples) * (Math.PI / 2);
      ctrl.push({ x: cx + ox + Math.cos(a) * r, z: cz + oz + Math.sin(a) * r });
    }
  }
  return ctrl;
}

export function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function edgeNormals(pts) {
  // outward normals per edge for a CCW polygon
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    let dx = q.x - p.x;
    let dz = q.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    out.push({ x: dz, z: -dx });
  }
  return out;
}

function miterOffsets(pts) {
  const n = pts.length;
  const en = edgeNormals(pts);
  return pts.map((_, i) => {
    const a = en[(i - 1 + n) % n];
    const b = en[i];
    let mx = a.x + b.x;
    let mz = a.z + b.z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const s = 1 / Math.max(0.5, mx * b.x + mz * b.z);
    return { x: mx * s, z: mz * s, nx: mx, nz: mz };
  });
}

export function offsetPolygon(pts, d) {
  const m = miterOffsets(pts);
  return pts.map((p, i) => ({ x: p.x + m[i].x * d, z: p.z + m[i].z * d }));
}

export function segmentsOf(pts) {
  const segs = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    segs.push([p.x, p.z, q.x, q.z]);
  }
  return segs;
}

export function polygonMesh(name, pts, holes, scene, depth = 0) {
  const b = new PolygonMeshBuilder(name, pts.map((p) => new Vector2(p.x, p.z)), scene, earcut);
  for (const h of holes) b.addHole(h.map((p) => new Vector2(p.x, p.z)));
  return b.build(false, depth);
}

// A rectangular-section band that follows a closed outline, growing outward from it.
// The face on the polygon boundary is the "inner" face. Used for bumper walls and pond lips.
export function bandMesh(name, pts, { width, height, y, color }, scene) {
  const n = pts.length;
  const m = miterOffsets(pts);
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const shade = [1.0, 0.8, 0.62];

  const addStrip = (fn, nrm, sh) => {
    const base = positions.length / 3;
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const [a, b] = fn(pts[k], m[k]);
      const nn = nrm(m[k]);
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      normals.push(nn[0], nn[1], nn[2], nn[0], nn[1], nn[2]);
      for (let c = 0; c < 2; c++) colors.push(color[0] * sh, color[1] * sh, color[2] * sh, 1);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };

  const top = y + height;
  addStrip((p, o) => [[p.x, top, p.z], [p.x + o.x * width, top, p.z + o.z * width]], () => [0, 1, 0], shade[0]);
  addStrip((p) => [[p.x, y, p.z], [p.x, top, p.z]], (o) => [-o.nx, 0, -o.nz], shade[1]);
  addStrip((p, o) => [[p.x + o.x * width, top, p.z + o.z * width], [p.x + o.x * width, y, p.z + o.z * width]], (o) => [o.nx, 0, o.nz], shade[2]);

  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  return mesh;
}

// Flat plate (thin extrusion) from polygons in the x/y plane, centred on z = 0. Polygons: arrays of {x, y}.
export function plateMesh(name, polys, thickness, scene) {
  const positions = [];
  const normals = [];
  const indices = [];
  const h = thickness / 2;
  for (let poly of polys) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      area += p.x * q.y - q.x * p.y;
    }
    if (area < 0) poly = poly.slice().reverse();
    const flat = [];
    poly.forEach((p) => flat.push(p.x, p.y));
    const tri = earcut(flat);
    const n = poly.length;
    let base = positions.length / 3;
    for (const p of poly) positions.push(p.x, p.y, h), normals.push(0, 0, 1);
    for (let i = 0; i < tri.length; i += 3) indices.push(base + tri[i], base + tri[i + 1], base + tri[i + 2]);
    base = positions.length / 3;
    for (const p of poly) positions.push(p.x, p.y, -h), normals.push(0, 0, -1);
    for (let i = 0; i < tri.length; i += 3) indices.push(base + tri[i], base + tri[i + 2], base + tri[i + 1]);
    for (let i = 0; i < n; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % n];
      let nx = q.y - p.y;
      let ny = -(q.x - p.x);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const b = positions.length / 3;
      positions.push(p.x, p.y, h, q.x, q.y, h, q.x, q.y, -h, p.x, p.y, -h);
      for (let k = 0; k < 4; k++) normals.push(nx, ny, 0);
      indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  return mesh;
}

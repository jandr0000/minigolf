import { Mesh, MeshBuilder, StandardMaterial, Color3, Vector3, TransformNode } from '@babylonjs/core';

const mats = new WeakMap();
function getMats(scene) {
  let m = mats.get(scene);
  if (m) return m;
  const mk = (name, hex, spec = 0.08) => {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = Color3.FromHexString(hex);
    mat.specularColor = new Color3(spec, spec, spec);
    return mat;
  };
  m = {
    coats: { black: mk('bullBlack', '#1e1a1a', 0.18), brown: mk('bullBrown', '#5b2f1c', 0.14) },
    horn: mk('bullHorn', '#efe4c6', 0.3),
    hoof: mk('bullHoof', '#120e0d', 0.1),
    muzzle: mk('bullMuzzle', '#6d5148', 0.1),
    wool: mk('sheepWool', '#f4f0e6', 0.04),
    sheepFace: mk('sheepFace', '#2b2624', 0.1),
  };
  mats.set(scene, m);
  return m;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// A small grazing bull. `world` supplies: walkable(x, z), others() and ball().
// Collision is exposed as two moving circles (`circles`) for the ball physics.
export function createBull(scene, world, { x, z, y, coat = 'black', seed = 1, heading = 0, species = 'bull' }) {
  const sheep = species === 'sheep';
  const m = getMats(scene);
  const rand = rng(seed * 977);
  const root = new TransformNode('bull', scene);
  root.position.set(x, y, z);
  const body = new TransformNode('bullBody', scene);
  body.parent = root;
  const meshes = [];

  const part = (mesh, parent, mat, pos, scale) => {
    mesh.parent = parent;
    mesh.material = mat;
    mesh.position.set(...pos);
    if (scale) mesh.scaling.set(...scale);
    meshes.push(mesh);
    return mesh;
  };
  const sphere = (d = 1, seg = 12) => MeshBuilder.CreateSphere('bs', { diameter: d, segments: seg }, scene);
  const coatMat = m.coats[coat];

  const neck = new TransformNode('bullNeck', scene);
  neck.parent = body;
  if (!sheep) {
    part(sphere(1, 16), body, coatMat, [0, 0.5, 0], [1.05, 0.5, 0.48]);
    part(sphere(1, 12), body, coatMat, [0.26, 0.7, 0], [0.44, 0.32, 0.4]);
    part(sphere(1, 10), body, coatMat, [-0.3, 0.52, 0], [0.5, 0.42, 0.42]);

    neck.position.set(0.4, 0.62, 0);
    part(sphere(1, 12), neck, coatMat, [0.2, -0.02, 0], [0.46, 0.34, 0.34]);
    part(sphere(1, 12), neck, coatMat, [0.5, -0.06, 0], [0.34, 0.27, 0.25]);
    part(sphere(1, 10), neck, m.muzzle, [0.67, -0.11, 0], [0.16, 0.14, 0.17]);
    for (const s of [-1, 1]) {
      part(sphere(1, 8), neck, coatMat, [0.44, 0.07, s * 0.17], [0.12, 0.05, 0.15]).rotation.x = -s * 0.5;
      const path = [
        new Vector3(0, 0, 0),
        new Vector3(0.0, 0.07, s * 0.07),
        new Vector3(0.04, 0.15, s * 0.11),
        new Vector3(0.1, 0.22, s * 0.1),
      ];
      const horn = MeshBuilder.CreateTube('bh', { path, radiusFunction: (i) => 0.032 - i * 0.008, tessellation: 8 }, scene);
      part(horn, neck, m.horn, [0.46, 0.13, s * 0.09]);
    }
  } else {
    // woolly body built from overlapping puffs, dark face and legs
    const wool = [];
    const core = sphere(1, 14);
    core.position.set(0, 0.5, 0);
    core.scaling.set(0.95, 0.6, 0.58);
    wool.push(core);
    for (const [px, py, pz] of [
      [0.3, 0.72, 0.13], [0.3, 0.72, -0.13], [0.0, 0.8, 0.1], [0.0, 0.8, -0.1],
      [-0.3, 0.72, 0.12], [-0.3, 0.72, -0.12], [0.05, 0.52, 0.3], [0.05, 0.52, -0.3],
      [-0.32, 0.5, 0.24], [-0.32, 0.5, -0.24], [0.33, 0.52, 0.22], [0.33, 0.52, -0.22],
    ]) {
      const puff = sphere(0.42, 8);
      puff.position.set(px, py, pz);
      wool.push(puff);
    }
    part(Mesh.MergeMeshes(wool, true, false), body, m.wool, [0, 0, 0]);

    neck.position.set(0.42, 0.6, 0);
    part(sphere(1, 10), neck, m.wool, [0.1, 0.0, 0], [0.34, 0.3, 0.32]);
    part(sphere(1, 12), neck, m.sheepFace, [0.3, -0.04, 0], [0.34, 0.24, 0.2]);
    part(sphere(1, 8), neck, m.wool, [0.2, 0.1, 0], [0.22, 0.14, 0.2]);
    for (const s of [-1, 1]) part(sphere(1, 8), neck, m.sheepFace, [0.22, 0.02, s * 0.15], [0.16, 0.05, 0.13]).rotation.x = -s * 0.6;
  }

  // legs
  const legs = [];
  [
    [0.36, 0.16],
    [-0.36, -0.16],
    [0.36, -0.16],
    [-0.36, 0.16],
  ].forEach(([lx, lz]) => {
    const pivot = new TransformNode('leg', scene);
    pivot.parent = body;
    pivot.position.set(lx, 0.32, lz);
    part(MeshBuilder.CreateCylinder('l', { height: 0.3, diameter: sheep ? 0.07 : 0.09, tessellation: 8 }, scene), pivot, sheep ? m.sheepFace : coatMat, [0, -0.15, 0]);
    part(MeshBuilder.CreateCylinder('h', { height: 0.07, diameter: 0.105, tessellation: 8 }, scene), pivot, m.hoof, [0, -0.3, 0]);
    legs.push(pivot);
  });

  // tail
  const tail = new TransformNode('tail', scene);
  tail.parent = body;
  tail.position.set(-0.52, 0.58, 0);
  if (sheep) part(sphere(0.2, 8), tail, m.wool, [-0.03, -0.06, 0]);
  else {
    part(MeshBuilder.CreateCylinder('t', { height: 0.32, diameter: 0.035, tessellation: 6 }, scene), tail, coatMat, [-0.02, -0.16, 0]);
    part(sphere(0.09, 6), tail, m.hoof, [-0.03, -0.34, 0]);
  }

  if (sheep) root.scaling.setAll(0.82);

  const b = {
    x,
    z,
    h: heading,
    speed: 0,
    state: 'graze',
    timer: 1 + rand() * 3,
    target: null,
    phase: rand() * 6,
    pitch: -0.9,
    pitchGoal: -0.9,
    hop: 0,
    root,
    meshes,
    circles: [],
  };

  const OFFS = [0.32, -0.3];
  b.circles = OFFS.map((o) => ({
    x,
    z,
    r: sheep ? 0.29 : 0.33,
    species,
    vx: 0,
    vz: 0,
    off: o,
    kind: 'bull',
    onHit: () => startle(),
  }));

  function startle() {
    if (b.state === 'startle') return;
    b.state = 'startle';
    b.timer = 0.9;
    b.speed = 0;
    b.hop = 1;
  }

  function clearPath(ax, az, tx, tz) {
    const d = Math.hypot(tx - ax, tz - az);
    const n = Math.max(2, Math.ceil(d / 0.35));
    const ball = world.ball();
    for (let i = 1; i <= n; i++) {
      const px = ax + ((tx - ax) * i) / n;
      const pz = az + ((tz - az) * i) / n;
      if (!world.walkable(px, pz)) return false;
      if (ball && Math.hypot(px - ball.x, pz - ball.z) < 1.0) return false;
      for (const o of world.others()) {
        if (o !== b && Math.hypot(px - o.x, pz - o.z) < 1.5) return false;
      }
    }
    return true;
  }

  function pickTarget() {
    for (let k = 0; k < 30; k++) {
      const a = rand() * Math.PI * 2;
      const d = 1.6 + rand() * 4.2;
      const tx = b.x + Math.cos(a) * d;
      const tz = b.z + Math.sin(a) * d;
      if (world.walkable(tx, tz) && clearPath(b.x, b.z, tx, tz)) return { x: tx, z: tz };
    }
    return null;
  }

  b.update = (dt, t) => {
    switch (b.state) {
      case 'graze':
        b.pitchGoal = -0.95 + Math.sin(t * 6 + b.phase) * 0.05;
        b.speed = 0;
        b.timer -= dt;
        if (b.timer <= 0) {
          b.target = pickTarget();
          if (b.target) b.state = 'turn';
          else b.timer = 1.5;
        }
        break;
      case 'turn': {
        b.pitchGoal = -0.1;
        const want = Math.atan2(b.target.z - b.z, b.target.x - b.x);
        const diff = wrap(want - b.h);
        b.h += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
        if (Math.abs(diff) < 0.12) b.state = 'walk';
        break;
      }
      case 'walk': {
        b.pitchGoal = -0.15;
        const dx = b.target.x - b.x;
        const dz = b.target.z - b.z;
        const d = Math.hypot(dx, dz);
        b.h += Math.max(-1.2 * dt, Math.min(1.2 * dt, wrap(Math.atan2(dz, dx) - b.h)));
        const step = Math.min(d, 0.55 * dt);
        const nx = b.x + Math.cos(b.h) * step;
        const nz = b.z + Math.sin(b.h) * step;
        if (d < 0.12 || !clearPath(b.x, b.z, nx, nz)) {
          b.state = 'graze';
          b.timer = 3 + rand() * 5;
          b.speed = 0;
        } else {
          b.x = nx;
          b.z = nz;
          b.speed = 0.55;
        }
        break;
      }
      case 'startle':
        b.pitchGoal = 0.3;
        b.speed = 0;
        b.timer -= dt;
        if (b.timer <= 0) {
          b.state = 'graze';
          b.timer = 1 + rand() * 2;
        }
        break;
    }

    b.pitch += (b.pitchGoal - b.pitch) * Math.min(1, dt * 4);
    neck.rotation.z = b.pitch;
    b.phase += b.speed * dt * 7.5;
    const amp = Math.min(1, b.speed / 0.5) * 0.5;
    legs.forEach((l, i) => (l.rotation.z = Math.sin(b.phase + (i < 2 ? 0 : Math.PI)) * amp));
    tail.rotation.z = 0.15 + Math.sin(t * 3 + b.phase * 0.3 + seed) * 0.22;
    b.hop = Math.max(0, b.hop - dt * 2.4);
    body.position.y = Math.abs(Math.sin(b.phase * 2)) * 0.015 * (b.speed > 0 ? 1 : 0) + Math.sin(b.hop * Math.PI) * 0.09;
    root.position.x = b.x;
    root.position.z = b.z;
    root.rotation.y = -b.h;

    const vx = Math.cos(b.h) * b.speed;
    const vz = Math.sin(b.h) * b.speed;
    for (const c of b.circles) {
      c.x = b.x + Math.cos(b.h) * c.off;
      c.z = b.z + Math.sin(b.h) * c.off;
      c.vx = vx;
      c.vz = vz;
    }
  };

  return b;
}

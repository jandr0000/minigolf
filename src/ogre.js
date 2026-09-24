import { MeshBuilder, TransformNode, Color3 } from '@babylonjs/core';
import { flatMaterial } from './materials.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// A big green ogre with a spiked club, about 3 units tall. Faces +x locally; `heading` is the world angle of that
// direction. The fight code drives it through plain properties: walk (0..1), armTarget (radians, 0 = arm hanging,
// -2.7 = club overhead, +0.9 = slammed forward), roar (0..1), dead (0..1), hurtT and heading.
export function createOgre(scene) {
  const mat = (n, hex, spec = 0) => flatMaterial(scene, 'ogre_' + n, hex, { spec });
  const M = {
    skin: mat('skin', '#72a04c', 0.06),
    dark: mat('dark', '#557a37', 0.04),
    cloth: mat('cloth', '#7d5a34'),
    club: mat('club', '#8b5a2b', 0.05),
    clubDark: mat('clubDark', '#4d3018'),
    tusk: mat('tusk', '#f2ead0', 0.2),
    eye: flatMaterial(scene, 'ogre_eye', '#ffd84a', { emissive: '#7a6510' }),
    pupil: mat('pupil', '#111111'),
    mouth: mat('mouth', '#3a1616'),
    spike: mat('spike', '#c9ced3', 0.4),
  };
  const root = new TransformNode('ogre', scene);
  const body = new TransformNode('ogreBody', scene);
  body.parent = root;
  const meshes = [];
  const add = (mesh, material, parent, pos, scale, rot) => {
    mesh.material = material;
    mesh.parent = parent;
    mesh.position.set(...pos);
    if (scale) mesh.scaling.set(...scale);
    if (rot) mesh.rotation.set(...rot);
    mesh.isPickable = false;
    meshes.push(mesh);
    return mesh;
  };
  const sphere = (d, seg = 12) => MeshBuilder.CreateSphere('o', { diameter: d, segments: seg }, scene);
  const cyl = (h, db, dt = db, tess = 12) => MeshBuilder.CreateCylinder('o', { height: h, diameterBottom: db, diameterTop: dt, tessellation: tess }, scene);
  const box = (w, h, d) => MeshBuilder.CreateBox('o', { width: w, height: h, depth: d }, scene);

  // torso, belly, loincloth
  add(sphere(1.5, 16), M.skin, body, [0, 1.9, 0], [1, 1.1, 0.95]);
  add(sphere(1.25, 14), M.skin, body, [0.14, 1.42, 0]);
  add(cyl(0.55, 1.25, 0.95, 16), M.cloth, body, [0.02, 1.1, 0]);
  add(box(0.08, 0.5, 1.0), M.clubDark, body, [0.55, 1.05, 0]);

  // head with brow, eyes, nose, jaw, tusks and ears
  const head = new TransformNode('ogreHead', scene);
  head.parent = body;
  head.position.set(0.16, 2.72, 0);
  add(sphere(0.9, 14), M.skin, head, [0, 0, 0], [1, 0.95, 1]);
  add(box(0.22, 0.12, 0.72), M.dark, head, [0.36, 0.17, 0]);
  for (const s of [-1, 1]) {
    add(sphere(0.2, 8), M.eye, head, [0.4, 0.07, s * 0.2]);
    add(sphere(0.09, 8), M.pupil, head, [0.5, 0.06, s * 0.2]);
    add(cyl(0.3, 0.12, 0.01, 6), M.tusk, head, [0.42, -0.3, s * 0.2]);
    add(cyl(0.34, 0.16, 0.02, 6), M.skin, head, [0.05, 0.12, s * 0.52], null, [s * 1.35, 0, 0]);
  }
  add(sphere(0.26, 10), M.dark, head, [0.5, -0.06, 0]);
  add(box(0.5, 0.2, 0.62), M.skin, head, [0.32, -0.32, 0]);
  add(box(0.06, 0.1, 0.44), M.mouth, head, [0.6, -0.24, 0]);

  // legs: pivot at the hip
  const legs = [-1, 1].map((s) => {
    const pivot = new TransformNode('ogreLeg', scene);
    pivot.parent = body;
    pivot.position.set(0, 1.05, s * 0.38);
    add(cyl(0.95, 0.52, 0.46), M.skin, pivot, [0, -0.48, 0]);
    add(box(0.68, 0.2, 0.52), M.dark, pivot, [0.14, -1.02, 0]);
    return pivot;
  });

  // arms: +z is the club arm
  const arm = (s) => {
    const pivot = new TransformNode('ogreArm', scene);
    pivot.parent = body;
    pivot.position.set(0, 2.4, s * 0.88);
    add(cyl(0.95, 0.4, 0.34), M.skin, pivot, [0, -0.46, 0]);
    add(sphere(0.52, 10), M.skin, pivot, [0, -0.98, 0]);
    return pivot;
  };
  const armR = arm(1);
  const armL = arm(-1);

  // spiked club held in the right fist, pointing forward and up
  const club = new TransformNode('ogreClub', scene);
  club.parent = armR;
  club.position.set(0.05, -0.98, 0);
  club.rotation.z = -1.15;
  add(cyl(1.7, 0.13, 0.46, 10), M.club, club, [0, 0.62, 0]);
  add(sphere(0.5, 8), M.clubDark, club, [0, 1.42, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(cyl(0.22, 0.09, 0.01, 6), M.spike, club, [Math.cos(a) * 0.26, 1.1 + (i % 2) * 0.3, Math.sin(a) * 0.26], null, [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]);
  }

  const o = {
    root,
    meshes,
    heading: 0,
    walk: 0,
    armTarget: 0,
    armRate: 8,
    roar: 0,
    dead: 0,
    hurtT: 0,
    phase: 0,
    setEnabled(on) {
      root.setEnabled(on);
    },
    reset() {
      o.walk = 0;
      o.armTarget = 0;
      o.roar = 0;
      o.dead = 0;
      o.hurtT = 0;
      armR.rotation.z = 0;
      armL.rotation.z = 0;
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
      root.scaling.setAll(1);
    },
    update(dt, t) {
      root.rotation.y = -o.heading;
      o.phase += dt * (3 + o.walk * 5);
      const s = Math.sin(o.phase);
      legs[0].rotation.z = s * 0.6 * o.walk;
      legs[1].rotation.z = -s * 0.6 * o.walk;
      const breathe = Math.sin(t * 2.2) * 0.02;
      body.position.y = Math.abs(s) * 0.09 * o.walk - o.dead * 0.1;

      const k = Math.min(1, dt * o.armRate);
      const target = o.roar > 0 ? -2.3 * o.roar : o.armTarget;
      armR.rotation.z += (target - armR.rotation.z) * k;
      const leftT = o.roar > 0 ? -2.3 * o.roar : -s * 0.5 * o.walk + breathe * 4;
      armL.rotation.z += (leftT - armL.rotation.z) * Math.min(1, dt * 8);
      body.rotation.z = o.dead * 1.55 + o.roar * 0.22 + (o.armTarget < -1 ? 0.12 : 0) * (1 - o.dead);
      body.rotation.y = 0;

      o.hurtT = Math.max(0, o.hurtT - dt);
      const f = o.hurtT / 0.25;
      M.skin.emissiveColor = new Color3(0.7 * f, 0.08 * f, 0.05 * f);
      M.dark.emissiveColor = new Color3(0.5 * f, 0.05 * f, 0.03 * f);
    },
  };
  root.setEnabled(false);
  return o;
}

export const angleTo = (from, to) => Math.atan2(to.z - from.z, to.x - from.x);
export const turnToward = (cur, want, maxStep) => cur + Math.max(-maxStep, Math.min(maxStep, wrap(want - cur)));

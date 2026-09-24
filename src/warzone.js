import { Mesh, MeshBuilder, TransformNode, Vector3, Quaternion } from '@babylonjs/core';
import { FAIRWAY_TOP as FT } from './holes.js';
import { flatMaterial } from './materials.js';
import { createHelicopter } from './helicopter.js';
import { pointInPolygon, offsetPolygon } from './geometry.js';
import { KID_SEATED_SCALE } from './kid.js';

// Difficulty only changes the bombing run: how often bombs drop, how long the red warning lasts,
// how fast the gunship slides between targets, how fast bombs fall and how many can be in the air.
export const DIFFICULTY = {
  easy: { label: 'Easy', first: 3.6, interval: [6, 8.5], warn: 2.6, slide: 3.4, gravity: 8, maxBombs: 1, lean: 0.35 },
  medium: { label: 'Medium', first: 2.5, interval: [3.4, 5.2], warn: 1.5, slide: 5.5, gravity: 12, maxBombs: 2, lean: 0.65 },
  hard: { label: 'Hard', first: 1.4, interval: [1.6, 2.7], warn: 0.85, slide: 8.6, gravity: 19, maxBombs: 3, lean: 0.85 },
};
const CRUISE_Y = 15;
const CRATER_R = 0.62;
const MAX_CRATERS = 6;
const HATCH_HW = 1.95;
const HATCH_HD = 1.95;
const ENEMY_HP = 100;
const ALLY_HP = 100;
const PLAYER_DMG = 2.2;
const BULLET_DMG = 4.5;
const MISSILE_DMG = 14;
const X_RANGE = 11.5;
const Y_MIN = 1.5;
const Y_MAX = 9;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function quatFromTo(from, to) {
  const d = Vector3.Dot(from, to);
  if (d < -0.9999) return Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  const c = Vector3.Cross(from, to);
  return new Quaternion(c.x, c.y, c.z, 1 + d).normalize();
}

function steer(o, tx, ty, dt, k, vmax, acc = 4) {
  let vx = (tx - o.x) * k;
  let vy = (ty - o.y) * k;
  const l = Math.hypot(vx, vy);
  if (l > vmax) {
    vx *= vmax / l;
    vy *= vmax / l;
  }
  const a = Math.min(1, acc * dt);
  o.vx += (vx - o.vx) * a;
  o.vy += (vy - o.vy) * a;
  o.x += o.vx * dt;
  o.y += o.vy * dt;
}

// Everything special about the helicopter hole: the enemy gunship that bombs the fairway while you putt,
// the trap door and friendly helicopter that appear once the ball drops, and the dogfight that follows.
// Phases: idle -> arrive -> patrol -> intro -> fight -> won | lost
export function createWarzone(scene, hole, { fx, sfx, hud, onBlast, onShake, onMessage, onEnd }) {
  const ox = hole.center.x;
  const oz = hole.center.z;
  const [hx, hz] = hole.def.warzone.hatch;
  const hatchX = ox + hx;
  const hatchZ = oz + hz;
  const planeZ = oz;
  const inset = offsetPolygon(hole.outline, -1.0);

  const lit = (name, hex, o = {}) => {
    const m = flatMaterial(scene, name, hex, { emissive: hex, ...o });
    m.disableLighting = true;
    return m;
  };
  const mats = {
    scorch: flatMaterial(scene, 'wzScorch', '#14110e', { alpha: 0.82, cull: false }),
    rubble: flatMaterial(scene, 'wzRubble', '#5b4e41'),
    bomb: flatMaterial(scene, 'wzBomb', '#24272c', { spec: 0.5 }),
    fin: flatMaterial(scene, 'wzFin', '#6b7078', { spec: 0.3 }),
    red: flatMaterial(scene, 'wzRed', '#d7263d', { spec: 0.3 }),
    frame: flatMaterial(scene, 'wzFrame', '#3a4046', { spec: 0.4 }),
    pit: flatMaterial(scene, 'wzPit', '#07080a'),
    leaf: flatMaterial(scene, 'wzLeaf', '#38902f'),
    leafUnder: flatMaterial(scene, 'wzLeafUnder', '#6c747b', { spec: 0.3 }),
    amber: lit('wzAmber', '#ffb020'),
    beam: lit('wzBeam', '#ffd45a', { alpha: 0.15, cull: false }),
    warn: lit('wzWarn', '#ff3b30', { alpha: 0.6, cull: false }),
    warnFill: lit('wzWarnFill', '#ff3b30', { alpha: 0.2, cull: false }),
    tracerA: lit('wzTracerA', '#fff2a8'),
    tracerE: lit('wzTracerE', '#ff5a3c'),
    missile: flatMaterial(scene, 'wzMissile', '#c9ced3', { spec: 0.5 }),
    flame: lit('wzFlame', '#ff9a2a'),
  };
  mats.scorch.zOffset = -2;

  // ---------- helicopters ----------
  const enemy = createHelicopter(scene, { livery: 'enemy', scale: 1.25 });
  const ally = createHelicopter(scene, { livery: 'ally', scale: 1.1 });
  enemy.setEnabled(false);
  ally.setEnabled(false);
  const casters = [...enemy.casters, ...ally.casters];

  const E = { x: 0, y: 0, vx: 0, vy: 0, hp: ENEMY_HP, side: 1, sideT: 0, fireT: 0, burst: 0, burstT: 0, missT: 0, dead: false };
  const A = { x: 0, y: 0, vx: 0, vy: 0, hp: ALLY_HP, cool: 0, dead: false };
  const input = { ax: 0, ay: 0, fire: false, tx: null, ty: null };

  let phase = 'idle';
  let level = 'medium';
  let cfg = DIFFICULTY.medium;
  let transit = null;
  let clock = 0;
  let endT = 0;
  let bombTimer = 0;
  let hitSfxT = 0;
  let pending = null;
  const bombs = [];
  const craters = [];
  const shots = [];
  const freeShots = { a: [], e: [] };
  const missiles = [];

  // ---------- trap door ----------
  const hatch = new TransformNode('hatch', scene);
  hatch.position.set(hatchX, FT, hatchZ);
  const mk = (mesh, mat, parent, pos) => {
    mesh.material = mat;
    mesh.parent = parent;
    mesh.position.set(...pos);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    return mesh;
  };
  const box = (w, h, d) => MeshBuilder.CreateBox('wz', { width: w, height: h, depth: d }, scene);
  const sphere = (d, seg = 10) => MeshBuilder.CreateSphere('wz', { diameter: d, segments: seg }, scene);

  for (const s of [-1, 1]) {
    mk(box(HATCH_HW * 2 + 0.5, 0.05, 0.22), mats.frame, hatch, [0, 0.02, s * (HATCH_HD + 0.11)]);
    mk(box(0.22, 0.05, HATCH_HD * 2), mats.frame, hatch, [s * (HATCH_HW + 0.11), 0.02, 0]);
  }
  const pit = MeshBuilder.CreateGround('wzPit', { width: HATCH_HW * 2, height: HATCH_HD * 2 }, scene);
  mk(pit, mats.pit, hatch, [0, 0.012, 0]);

  const lamps = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lamp = mk(sphere(0.16), mats.amber, hatch, [sx * (HATCH_HW + 0.11), 0.09, sz * (HATCH_HD + 0.11)]);
      lamps.push(lamp);
    }
  }

  const leaves = [-1, 1].map((side) => {
    const pivot = new TransformNode('wzLeaf', scene);
    pivot.parent = hatch;
    pivot.position.set(side * HATCH_HW, 0.012, 0);
    mk(box(HATCH_HW, 0.03, HATCH_HD * 2), mats.leaf, pivot, [-side * HATCH_HW * 0.5, 0.015, 0]);
    mk(box(HATCH_HW - 0.12, 0.02, HATCH_HD * 2 - 0.12), mats.leafUnder, pivot, [-side * HATCH_HW * 0.5, -0.005, 0]);
    mk(box(0.05, 0.034, HATCH_HD * 2), mats.frame, pivot, [-side * (HATCH_HW - 0.025), 0.015, 0]);
    return { pivot, side };
  });

  const beam = MeshBuilder.CreateCylinder('wzBeam', { height: 3.4, diameterTop: 3.4, diameterBottom: 3.8, tessellation: 24, cap: Mesh.NO_CAP }, scene);
  mk(beam, mats.beam, hatch, [0, 1.7, 0]);
  beam.receiveShadows = false;
  beam.setEnabled(false);

  function setHatch(k, t) {
    const a = easeOut(k) * 1.75;
    for (const l of leaves) l.pivot.rotation.z = -l.side * a;
    beam.setEnabled(k > 0.05);
    beam.visibility = Math.min(1, k * 1.3) * (0.75 + 0.25 * Math.sin(t * 9));
    for (const [i, l] of lamps.entries()) l.setEnabled(k > 0.01 && Math.sin(t * 8 + i * 1.6) > -0.2);
  }
  setHatch(0, 0);

  // ---------- bomb craters ----------
  const scorchProto = MeshBuilder.CreateDisc('wzScorch', { radius: 1.15, tessellation: 24 }, scene);
  scorchProto.rotation.x = Math.PI / 2;
  scorchProto.material = mats.scorch;
  scorchProto.bakeCurrentTransformIntoVertices();
  scorchProto.isVisible = false;
  scorchProto.isPickable = false;

  const rubbleParts = [];
  const dome = sphere(1, 12);
  dome.scaling.set(1.08, 0.44, 1.08);
  dome.position.y = 0.02;
  dome.material = mats.rubble;
  rubbleParts.push(dome);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = MeshBuilder.CreateIcoSphere('wz', { radius: rand(0.1, 0.19), subdivisions: 1, flat: true }, scene);
    r.position.set(Math.cos(a) * rand(0.38, 0.58), rand(0.0, 0.12), Math.sin(a) * rand(0.38, 0.58));
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    rubbleParts.push(r);
  }
  // one draw call per crater: the dome and rocks share the rubble material
  const rubbleProto = Mesh.MergeMeshes(rubbleParts, true, false);
  rubbleProto.material = mats.rubble;
  rubbleProto.isVisible = false;
  rubbleProto.isPickable = false;

  function addCrater(x, z) {
    const scorch = scorchProto.createInstance('scorch');
    scorch.position.set(x, FT + 0.014, z);
    scorch.rotation.y = rand(0, 6.28);
    const s = rand(1.0, 1.25);
    scorch.scaling.set(s, 1, s);
    scorch.isPickable = false;
    const rub = rubbleProto.createInstance('rubble');
    rub.position.set(x, FT + 0.02, z);
    rub.rotation.y = rand(0, 6.28);
    rub.scaling.setAll(0.05);
    rub.isPickable = false;
    const c = { x, z, r: CRATER_R, kind: 'crater', scorch, rub, s, age: 0, smoke: 3.2, smokeT: 0, dying: false };
    craters.push(c);
    hole.circles.push(c);
    if (craters.length > MAX_CRATERS) removeCrater(craters.find((q) => !q.dying));
  }

  function removeCrater(c) {
    if (!c || c.dying) return;
    c.dying = true;
    c.dieT = 0;
    const i = hole.circles.indexOf(c);
    if (i >= 0) hole.circles.splice(i, 1);
  }

  function updateCraters(dt) {
    for (let i = craters.length - 1; i >= 0; i--) {
      const c = craters[i];
      c.age += dt;
      if (c.dying) {
        c.dieT += dt;
        const k = Math.max(0, 1 - c.dieT / 0.5);
        c.rub.scaling.setAll(k);
        c.scorch.scaling.set(c.s * k, 1, c.s * k);
        if (k <= 0) {
          c.rub.dispose();
          c.scorch.dispose();
          craters.splice(i, 1);
        }
        continue;
      }
      // pop up with a little overshoot
      const k = Math.min(1, c.age / 0.3);
      c.rub.scaling.setAll(easeOut(k) * (1 + Math.sin(k * Math.PI) * 0.18));
      if (c.smoke > 0) {
        c.smoke -= dt;
        c.smokeT -= dt;
        if (c.smokeT <= 0) {
          c.smokeT = 0.5;
          fx.puff(c.x, FT + 0.3, c.z, 2);
        }
      }
    }
  }

  // ---------- bombs ----------
  function makeMarker(x, z) {
    const node = new TransformNode('wzMarker', scene);
    node.position.set(x, FT + 0.03, z);
    const ring = MeshBuilder.CreateTorus('wz', { diameter: 2.3, thickness: 0.09, tessellation: 40 }, scene);
    ring.material = mats.warn;
    ring.parent = node;
    const fill = MeshBuilder.CreateDisc('wz', { radius: 1.15, tessellation: 32 }, scene);
    fill.rotation.x = Math.PI / 2;
    fill.position.y = -0.005;
    fill.material = mats.warnFill;
    fill.parent = node;
    for (const a of [0, Math.PI / 2]) {
      const bar = box(1.5, 0.02, 0.07);
      bar.rotation.y = a;
      bar.material = mats.warn;
      bar.parent = node;
    }
    node.getChildMeshes().forEach((m) => (m.isPickable = false));
    return node;
  }

  function makeBomb() {
    const node = new TransformNode('wzBomb', scene);
    const body = sphere(1, 12);
    body.scaling.set(0.17, 0.42, 0.17);
    body.material = mats.bomb;
    body.parent = node;
    const band = MeshBuilder.CreateTorus('wz', { diameter: 0.17, thickness: 0.035, tessellation: 16 }, scene);
    band.position.y = 0.04;
    band.material = mats.red;
    band.parent = node;
    for (const r of [0, Math.PI / 2]) {
      const fin = box(0.26, 0.14, 0.02);
      fin.rotation.y = r;
      fin.position.y = 0.26;
      fin.material = mats.fin;
      fin.parent = node;
    }
    node.scaling.setAll(1.6);
    node.getChildMeshes().forEach((m) => (m.isPickable = false));
    return node;
  }

  function pickTarget(ball) {
    const valid = (x, z) => {
      if (!pointInPolygon(x, z, inset)) return false;
      if (Math.hypot(x - hole.cup.x, z - hole.cup.z) < 1.7) return false;
      if (Math.hypot(x - hole.tee.x, z - hole.tee.z) < 2.4) return false;
      if (Math.hypot(x - hatchX, z - hatchZ) < 3.3) return false;
      if (ball && Math.hypot(x - ball.x, z - ball.z) < 0.9) return false;
      return craters.every((c) => c.dying || Math.hypot(x - c.x, z - c.z) > 1.5);
    };
    for (let i = 0; i < 30; i++) {
      let x;
      let z;
      if (ball && Math.random() < cfg.lean) {
        // lean on the line between the ball and the cup, where it hurts most
        const k = rand(0.2, 0.9);
        x = ball.x + (hole.cup.x - ball.x) * k + rand(-0.7, 0.7);
        z = ball.z + (hole.cup.z - ball.z) * k + rand(-1.6, 1.6);
      } else {
        x = ox + rand(-11, 11);
        z = oz + rand(-3.2, 3.2);
      }
      if (valid(x, z)) return { x, z };
    }
    return null;
  }

  function planBomb(ball) {
    const t = pickTarget(ball);
    if (!t) return;
    pending = { tx: t.x, tz: t.z, t: 0, marker: makeMarker(t.x, t.z) };
    sfx.alarm();
  }

  function dropBomb(p) {
    const b = enemy.belly();
    const T = Math.sqrt((2 * Math.max(1, b.y - (FT + 0.15))) / cfg.gravity);
    bombs.push({
      node: makeBomb(),
      marker: p.marker,
      x0: b.x,
      y0: b.y,
      z0: b.z,
      vx: (p.tx - b.x) / T,
      vz: (p.tz - b.z) / T,
      T,
      t: 0,
      tx: p.tx,
      tz: p.tz,
    });
    sfx.whistle();
  }

  function disposeBomb(b) {
    b.node.dispose();
    b.marker.dispose();
  }

  function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.t += dt;
      const t = Math.min(b.t, b.T);
      const y = b.y0 - 0.5 * cfg.gravity * t * t;
      b.node.position.set(b.x0 + b.vx * t, y, b.z0 + b.vz * t);
      b.node.rotationQuaternion = quatFromTo(new Vector3(0, -1, 0), new Vector3(b.vx, -cfg.gravity * t, b.vz).normalize());
      const pulse = 0.5 + 0.5 * Math.sin(b.t * 24);
      b.marker.scaling.setAll(1 - 0.15 * (b.t / b.T) + pulse * 0.06);
      if (b.t >= b.T) {
        bombs.splice(i, 1);
        disposeBomb(b);
        fx.explosion(b.tx, FT + 0.25, b.tz, 1);
        sfx.boom(1);
        onShake(0.32);
        addCrater(b.tx, b.tz);
        onBlast(b.tx, b.tz);
      }
    }
  }

  // ---------- projectiles ----------
  const tracerProto = {
    a: box(0.6, 0.07, 0.07),
    e: box(0.5, 0.09, 0.09),
  };
  tracerProto.a.material = mats.tracerA;
  tracerProto.e.material = mats.tracerE;
  for (const m of Object.values(tracerProto)) {
    m.isVisible = false;
    m.isPickable = false;
  }

  function spawnShot(kind, pos, vx, vy, dmg) {
    const mesh = freeShots[kind].pop() ?? tracerProto[kind].createInstance('tracer');
    mesh.setEnabled(true);
    const s = { kind, mesh, x: pos.x, y: pos.y, vx, vy, life: kind === 'a' ? 0.8 : 2.2, dmg };
    shots.push(s);
    return s;
  }

  function killShot(i) {
    const s = shots[i];
    s.mesh.setEnabled(false);
    freeShots[s.kind].push(s.mesh);
    shots.splice(i, 1);
  }

  function makeMissile() {
    const node = new TransformNode('wzMissile', scene);
    const body = MeshBuilder.CreateCylinder('wz', { height: 0.7, diameter: 0.15, tessellation: 10 }, scene);
    body.rotation.z = Math.PI / 2;
    body.material = mats.missile;
    body.parent = node;
    const tip = MeshBuilder.CreateCylinder('wz', { height: 0.2, diameterTop: 0.01, diameterBottom: 0.15, tessellation: 10 }, scene);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.45;
    tip.material = mats.red;
    tip.parent = node;
    for (const r of [0, Math.PI / 2]) {
      const fin = box(0.16, 0.34, 0.02);
      fin.rotation.x = r;
      fin.position.x = -0.28;
      fin.material = mats.fin;
      fin.parent = node;
    }
    const flame = sphere(0.3, 8);
    flame.scaling.set(1.8, 0.6, 0.6);
    flame.position.x = -0.55;
    flame.material = mats.flame;
    flame.parent = node;
    node.scaling.setAll(1.4);
    node.getChildMeshes().forEach((m) => (m.isPickable = false));
    return { node, flame };
  }

  function launchMissile() {
    const m = makeMissile();
    const p = enemy.muzzle();
    const heading = Math.atan2(A.y - p.y, A.x - p.x);
    missiles.push({ ...m, x: p.x, y: p.y - 0.4, heading, speed: 3.5, hp: 3, life: 6 });
    sfx.missile();
  }

  function missileBlast(m, i, size = 0.8) {
    fx.explosion(m.x, m.y, planeZ, size);
    sfx.boom(0.6);
    m.node.dispose();
    missiles.splice(i, 1);
  }

  // ---------- helicopter state ----------
  let rotorVol = -1;
  let rotorRate = 1;
  function setRotor(vol, rate = 1) {
    if (Math.abs(vol - rotorVol) < 0.004 && Math.abs(rate - rotorRate) < 0.004) return;
    rotorVol = vol;
    rotorRate = rate;
    sfx.rotor(vol, rate);
  }

  function syncHelis(t, dt) {
    enemy.root.position.set(E.x, E.y, planeZ + 0.7);
    enemy.update(dt, t, E.vx);
    ally.root.position.set(A.x, A.y, A.z ?? planeZ - 0.7);
    ally.update(dt, t, A.vx);
  }

  function faceToward(heli, o, tx, dead = 0.7) {
    if (Math.abs(tx - o.x) > dead) heli.facing = Math.sign(tx - o.x);
  }

  function crash(heli, o) {
    heli.crashing = true;
    heli.spin = (Math.random() < 0.5 ? -1 : 1) * rand(5, 7);
    heli.setHealth(0);
    o.dead = true;
    o.vy = 1.5;
    o.vx += rand(-1, 1);
    fx.explosion(o.x, o.y, planeZ, 0.9);
    sfx.boom(0.7);
    onShake(0.4);
  }

  function updateCrash(heli, o, dt, groundY) {
    if (o.landed) return;
    o.vy -= 9 * dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    heli.spool = Math.max(0.3, heli.spool - dt * 0.2);
    if (o.y <= groundY) {
      o.y = groundY;
      o.landed = true;
      heli.setEnabled(false);
      fx.explosion(o.x, FT + 0.3, planeZ, 2.2);
      sfx.boom(1.8);
      onShake(0.9);
    }
  }

  function hurtAlly(dmg, x, y) {
    if (phase !== 'fight') return;
    A.hp = Math.max(0, A.hp - dmg);
    ally.hurt();
    ally.setHealth(A.hp / ALLY_HP);
    hud.setAlly(A.hp / ALLY_HP);
    fx.sparks(x, y, planeZ - 0.7, 10);
    sfx.hurt();
    onShake(0.14);
    if (A.hp <= 0 && !A.dead) {
      crash(ally, A);
      phase = 'lost';
      endT = 0;
    }
  }

  function hurtEnemy(dmg, x, y) {
    if (phase !== 'fight') return;
    E.hp = Math.max(0, E.hp - dmg);
    enemy.hurt();
    enemy.setHealth(E.hp / ENEMY_HP);
    hud.setEnemy(E.hp / ENEMY_HP);
    fx.sparks(x, y, planeZ + 0.7, 6);
    if (hitSfxT <= 0) {
      sfx.hit();
      hitSfxT = 0.07;
    }
    if (E.hp <= 0 && !E.dead) {
      crash(enemy, E);
      phase = 'won';
      endT = 0;
      sfx.victory();
    }
  }

  // ---------- fight ----------
  function enemyShoot() {
    const from = enemy.muzzle();
    const speed = 11.5;
    const lead = Math.hypot(A.x - from.x, A.y - from.y) / speed;
    const tx = A.x + A.vx * lead * 0.7 + rand(-0.4, 0.4);
    const ty = A.y + A.vy * lead * 0.7 + rand(-0.5, 0.5);
    const d = Math.hypot(tx - from.x, ty - from.y) || 1;
    spawnShot('e', from, ((tx - from.x) / d) * speed, ((ty - from.y) / d) * speed, BULLET_DMG);
    enemy.fireFlash();
    sfx.enemyGun();
  }

  function updateAlly(dt, canFire) {
    let ax = input.ax;
    let ay = input.ay;
    if (input.tx !== null) {
      ax = clamp((input.tx - A.x) * 0.9, -1, 1);
      ay = clamp((input.ty - A.y) * 0.9, -1, 1);
    }
    const a = Math.min(1, dt * 7);
    A.vx += (ax * 9 - A.vx) * a;
    A.vy += (ay * 7 - A.vy) * a;
    A.x += A.vx * dt;
    A.y += A.vy * dt;
    const cx = clamp(A.x, ox - X_RANGE, ox + X_RANGE);
    const cy = clamp(A.y, Y_MIN, Y_MAX);
    if (cx !== A.x) A.vx = 0;
    if (cy !== A.y) A.vy = 0;
    A.x = cx;
    A.y = cy;
    faceToward(ally, A, E.x);

    A.cool -= dt;
    if (canFire && input.fire && A.cool <= 0) {
      A.cool = 0.11;
      const m = ally.muzzle();
      spawnShot('a', m, ally.facing * 32, rand(-0.5, 0.5), PLAYER_DMG);
      ally.fireFlash();
      A.shotCount = (A.shotCount || 0) + 1;
      if (A.shotCount % 2 === 0) sfx.gun();
    }
  }

  function updateEnemyFight(dt, t) {
    E.sideT -= dt;
    if (E.sideT <= 0) {
      E.side = Math.random() < 0.5 ? -1 : 1;
      E.sideT = rand(3, 5.5);
    }
    let gx = clamp(A.x + E.side * 7.5, ox - 11, ox + 11);
    if (Math.abs(gx - A.x) < 4) gx = clamp(A.x - E.side * 7.5, ox - 11, ox + 11);
    const gy = 6.2 + Math.sin(t * 0.9) * 1.9 + (A.y - 5) * 0.25;
    const rage = 1 - E.hp / ENEMY_HP;
    steer(E, gx, gy, dt, 1.1, 4.6 + rage * 1.6);
    faceToward(enemy, E, A.x, 0.5);

    if (phase !== 'fight') return;
    E.fireT -= dt;
    if (E.fireT <= 0 && E.burst <= 0) {
      E.burst = rage > 0.5 ? 4 : 3;
      E.burstT = 0;
      E.fireT = (1.5 + Math.random() * 0.8) * (1 - rage * 0.4);
    }
    if (E.burst > 0) {
      E.burstT -= dt;
      if (E.burstT <= 0) {
        enemyShoot();
        E.burst--;
        E.burstT = 0.17;
      }
    }
    E.missT -= dt;
    if (E.missT <= 0 && missiles.length === 0) {
      launchMissile();
      E.missT = 5.5 - rage * 2;
    }
  }

  function updateShots(dt) {
    hitSfxT -= dt;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      s.mesh.position.set(s.x, s.y, planeZ);
      s.mesh.rotation.z = Math.atan2(s.vy, s.vx);
      let dead = s.life <= 0 || s.y < FT + 0.1 || Math.abs(s.x - ox) > 30;
      if (!dead && s.kind === 'a') {
        for (let j = missiles.length - 1; j >= 0; j--) {
          const m = missiles[j];
          if (Math.hypot(m.x - s.x, m.y - s.y) < 0.6) {
            fx.sparks(s.x, s.y, planeZ, 5);
            dead = true;
            if (--m.hp <= 0) missileBlast(m, j);
            break;
          }
        }
        if (!dead && !E.dead && enemy.contains(s.x, s.y, 0.1)) {
          dead = true;
          hurtEnemy(s.dmg, s.x, s.y);
        }
      } else if (!dead && s.kind === 'e' && !A.dead && ally.contains(s.x, s.y, 0.12)) {
        dead = true;
        hurtAlly(s.dmg, s.x, s.y);
      }
      if (dead) killShot(i);
    }
  }

  function updateMissiles(dt, t) {
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.life -= dt;
      m.speed = Math.min(8, m.speed + 3 * dt);
      if (!A.dead) {
        const want = Math.atan2(A.y - m.y, A.x - m.x);
        let diff = want - m.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        m.heading += clamp(diff, -1.7 * dt, 1.7 * dt);
      }
      m.x += Math.cos(m.heading) * m.speed * dt;
      m.y += Math.sin(m.heading) * m.speed * dt;
      m.node.position.set(m.x, m.y, planeZ);
      m.node.rotation.z = m.heading;
      m.flame.scaling.x = 1.6 + Math.sin(t * 60) * 0.5;
      if (Math.random() < 0.5) fx.puff(m.x - Math.cos(m.heading) * 0.7, m.y - Math.sin(m.heading) * 0.7, planeZ, 1);
      if (!A.dead && ally.contains(m.x, m.y, 0.2)) {
        const x = m.x;
        const y = m.y;
        missileBlast(m, i, 1);
        hurtAlly(MISSILE_DMG, x, y);
      } else if (m.life <= 0 || m.y < FT + 0.3) {
        missileBlast(m, i);
      }
    }
  }

  // ---------- public flow ----------
  function clearAll() {
    for (const c of craters) {
      const i = hole.circles.indexOf(c);
      if (i >= 0) hole.circles.splice(i, 1);
      c.rub.dispose();
      c.scorch.dispose();
    }
    craters.length = 0;
    bombs.splice(0).forEach(disposeBomb);
    if (pending) pending.marker.dispose();
    pending = null;
    for (let i = shots.length - 1; i >= 0; i--) killShot(i);
    missiles.splice(0).forEach((m) => m.node.dispose());
  }

  function reset() {
    clearAll();
    phase = 'idle';
    transit = null;
    A.z = planeZ - 0.7;
    enemy.setEnabled(false);
    ally.setEnabled(false);
    enemy.reset();
    ally.reset();
    setHatch(0, 0);
    hud.show(false);
    setRotor(0);
    input.ax = input.ay = 0;
    input.fire = false;
    input.tx = input.ty = null;
  }

  function begin(lv = 'medium') {
    reset();
    level = DIFFICULTY[lv] ? lv : 'medium';
    cfg = DIFFICULTY[level];
    phase = 'arrive';
    clock = 0;
    Object.assign(E, { x: ox - 46, y: 13.5, vx: 0, vy: 0, hp: ENEMY_HP, dead: false, landed: false, side: 1, sideT: 2, fireT: 1.5, burst: 0, missT: 5 });
    enemy.setEnabled(true);
    enemy.spool = 1;
    enemy.setHealth(1);
    bombTimer = cfg.first;
    syncHelis(0, 0);
  }

  function startBattle() {
    if (phase !== 'arrive' && phase !== 'patrol') return;
    clearAll();
    phase = 'intro';
    clock = 0;
    Object.assign(A, { x: hatchX, y: FT - 1.7, z: planeZ - 0.7, vx: 0, vy: 0, hp: ALLY_HP, cool: 0, dead: false, landed: false });
    ally.reset();
    ally.facing = 1;
    ally.spool = 0;
    ally.setHealth(1);
    E.fireT = 1.4;
    E.burst = 0;
    E.missT = 4;
    hud.setEnemy(1);
    hud.setAlly(1);
    hud.show(true);
    sfx.hatch();
    onMessage('Trap door opening...', 2200);
  }

  function update(dt, t, { ball, canBomb }) {
    if (phase === 'idle') return;
    if (phase === 'done' || phase === 'parked') return syncHelis(t, dt);
    if (phase === 'transit') {
      updateTransit(dt, t);
      return syncHelis(t, dt);
    }
    clock += dt;
    updateBombs(dt);
    updateCraters(dt);

    if (phase === 'arrive' || phase === 'patrol') {
      // hover over the fairway; while a bomb is planned, slide over its target
      const gx = pending ? clamp(pending.tx, ox - 11, ox + 11) : ox + Math.sin(t * 0.35) * 7;
      const gy = 5.7 + Math.sin(t * 0.9) * 0.4;
      steer(E, gx, gy, dt, phase === 'arrive' ? 0.6 : 1.4, phase === 'arrive' ? 10 : cfg.slide);
      if (Math.abs(E.vx) > 0.6) enemy.facing = Math.sign(E.vx);
      if (phase === 'arrive' && Math.hypot(E.x - (ox + Math.sin(t * 0.35) * 7), E.y - 5.7) < 2) phase = 'patrol';
      if (phase === 'patrol') {
        if (pending) {
          pending.t += dt;
          const pulse = 0.5 + 0.5 * Math.sin(pending.t * (8 + pending.t * 6));
          pending.marker.scaling.setAll(0.95 + pulse * 0.1);
          if (pending.t >= cfg.warn && (Math.abs(E.x - pending.tx) < 1.8 || pending.t > cfg.warn * 2 + 0.6)) {
            dropBomb(pending);
            pending = null;
            bombTimer = rand(cfg.interval[0], cfg.interval[1]);
          }
        } else if (canBomb && bombs.length < cfg.maxBombs) {
          bombTimer -= dt;
          if (bombTimer <= 0) planBomb(ball);
        }
      }
      setRotor(0.07, 1);
    } else if (phase === 'intro') {
      const open = clamp((clock - 0.1) / 1.5, 0, 1);
      setHatch(open, t);
      if (clock > 0.7 && !ally.root.isEnabled()) {
        ally.setEnabled(true);
        fxPuffs();
      }
      ally.spool = clamp((clock - 1.2) / 1.4, 0, 1);
      A.y = FT - 1.7 + easeInOut(clamp((clock - 1.5) / 1.9, 0, 1)) * (3.6 + 1.7);
      A.x = hatchX;
      A.vy = clock > 1.5 ? 3 : 0;
      steer(E, ox + 7.5, 6.6, dt, 1.2, 5);
      faceToward(enemy, E, hatchX);
      faceToward(ally, A, E.x);
      setRotor(0.05 + 0.13 * ally.spool, 1 + ally.spool * 0.2);
      if (clock >= 3.5) {
        phase = 'fight';
        A.vy = 0;
        onMessage('Shoot it down!  SPACE to fire', 3000);
        sfx.alarm();
      }
    } else {
      // fight / won / lost
      setHatch(1, t);
      const fighting = phase === 'fight';
      if (!A.dead) updateAlly(dt, fighting);
      else updateCrash(ally, A, dt, FT + 0.75 * 1.1);
      if (!E.dead) updateEnemyFight(dt, t);
      else updateCrash(enemy, E, dt, FT + 0.75 * 1.25);
      updateShots(dt);
      updateMissiles(dt, t);
      setRotor(phase === 'fight' ? 0.16 : 0.08, 1.15);

      if (phase === 'won' || phase === 'lost') {
        const down = phase === 'won' ? E : A;
        if (down.landed) endT += dt;
        if (endT > 1.8) {
          const win = phase === 'won';
          phase = 'done';
          setRotor(0);
          onEnd(win);
        }
      }
    }
    syncHelis(t, dt);
  }

  // ---------- victory flight: pick up the kid, fly to the helipad, drop him off ----------
  const sine = (k) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k, 0, 1));
  const SKID_H = 0.83; // helicopter root height above the ground when standing on its skids
  const DOOR = { dx: 0.75, dz: -1.35 }; // where the kid climbs in, relative to the helicopter (near side)

  // Returns false if the helicopter is not ready to leave (the fight must have been won first).
  // route: { pickup: {x, z, top} | null, kid, pad: {x, z, top}, kidSpot: {x, z}, onLanded }
  function depart(route) {
    if (phase !== 'done' || A.dead) return false;
    const { pickup, pad, kid } = route;
    const legs = [];
    let cur = { x: A.x, y: A.y, z: A.z };
    const hover = (s) => ({ x: s.x, y: s.top + 6.5, z: s.z });
    const ground = (s) => ({ x: s.x, y: s.top + SKID_H, z: s.z });
    const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const move = (name, to, dur, o = {}) => {
      legs.push({ name, to, dur, ...o });
      cur = to;
    };

    if (pickup) {
      move('approach', hover(pickup), Math.max(3.2, dist(cur, hover(pickup)) / 14), { rotor: [0.15, 1.15], closeHatch: true });
      move('land', ground(pickup), 3.2, { rotor: [0.15, 1.1], dust: pickup, dustFrom: 0.3, landK: (k) => k });
      legs.push(boardLeg(kid));
      cur = ground(pickup);
      move('lift', { x: pickup.x + 6, y: CRUISE_Y, z: pickup.z }, 2.6, { rotor: [0.16, 1.15], dust: pickup, dustUntil: 0.6, landK: (k) => 1 - k });
    } else {
      move('lift', { x: cur.x + 6, y: CRUISE_Y, z: cur.z }, 2.4, { rotor: [0.16, 1.1], closeHatch: true });
    }
    const padHover = hover(pad);
    move('cruise', padHover, Math.max(6, dist(cur, padHover) / 26), { rotor: [0.15, 1.2], yMode: 'cruise', landK: () => 0 });
    move('land', ground(pad), 3.8, { rotor: [0.15, 1.1], dust: pad, dustFrom: 0.35, landK: (k) => k });
    legs.push({
      name: 'spool',
      dur: 2.4,
      hold: true,
      landK: () => 1,
      tick: (k) => {
        ally.spool = 1 - k;
        setRotor(0.15 * (1 - k), 1.1 - 0.5 * k);
      },
    });
    if (kid) legs.push(deplaneLeg(kid, route.kidSpot));

    transit = { legs, i: 0, t: 0, landK: 0, focusDx: 0, onLanded: route.onLanded };
    phase = 'transit';
    ally.facing = 1;
    ally.spool = 1;
    return true;
  }

  // The kid walks to the door, hops into the cabin and the helicopter waits until he is settled.
  function boardLeg(kid) {
    const st = { stage: 'walk', k: 0, from: null, doneAt: 0 };
    return {
      name: 'board',
      hold: true,
      rotor: [0.11, 1.05],
      landK: () => 1,
      focusDx: -5,
      onStart: () => {
        st.stage = 'walk';
        st.k = 0;
        st.doneAt = 0;
      },
      tick: (k, dt) => {
        const door = { x: A.x + DOOR.dx, z: A.z + DOOR.dz };
        if (st.stage === 'walk') {
          if (kid.walkStep(door.x, door.z, 2.2, dt)) {
            st.stage = 'hop';
            st.k = 0;
            st.from = kid.position.clone();
          }
        } else if (st.stage === 'hop') {
          st.k += dt / 0.7;
          const seat = ally.cabin.getAbsolutePosition();
          kid.hop(st.from, seat, st.k);
          if (st.k >= 1) {
            kid.sit(ally.cabin);
            fx.puff(seat.x, seat.y, seat.z, 2);
            st.stage = 'seated';
          }
        } else {
          st.doneAt += dt;
        }
      },
      until: () => st.stage === 'seated' && st.doneAt > 0.8,
    };
  }

  // At the helipad the kid hops out, walks a few steps and waves.
  function deplaneLeg(kid, spot) {
    const st = { stage: 'hop', k: 0, from: null, to: null, doneAt: 0 };
    return {
      name: 'deplane',
      hold: true,
      rotor: [0, 1],
      landK: () => 1,
      focusDx: -3,
      onStart: () => {
        const seat = ally.cabin.getAbsolutePosition().clone();
        kid.unseat(seat.x, seat.y, seat.z);
        st.stage = 'hop';
        st.k = 0;
        st.doneAt = 0;
        st.from = seat;
        st.to = { x: A.x + DOOR.dx, y: A.y - SKID_H, z: A.z + DOOR.dz };
      },
      tick: (k, dt) => {
        if (st.stage === 'hop') {
          st.k += dt / 0.7;
          kid.hop(st.from, st.to, st.k, 0.9, KID_SEATED_SCALE, 1);
          if (st.k >= 1) st.stage = 'walk';
        } else if (st.stage === 'walk') {
          if (kid.walkStep(spot.x, spot.z, 2.2, dt)) {
            kid.faceCamera();
            st.stage = 'wave';
          }
        } else {
          st.doneAt += dt;
        }
      },
      until: () => st.stage === 'wave' && st.doneAt > 1.2,
    };
  }

  function updateTransit(dt, t) {
    const T = transit;
    const L = T.legs[T.i];
    if (!L.from) {
      L.from = { x: A.x, y: A.y, z: A.z };
      T.t = 0;
      if (L.onStart) L.onStart();
    }
    T.t += dt;
    const px = A.x;
    const py = A.y;
    const k = L.dur ? clamp(T.t / L.dur, 0, 1) : 0;
    if (L.rotor) setRotor(L.rotor[0], L.rotor[1]);
    if (L.landK) T.landK = L.landK(k);
    T.focusDx = L.focusDx ?? 0;
    if (L.closeHatch) setHatch(clamp(1 - T.t / 1.8, 0, 1), t);

    if (!L.hold) {
      const e = sine(k);
      A.x = L.from.x + (L.to.x - L.from.x) * e;
      A.z = L.from.z + (L.to.z - L.from.z) * e;
      A.y = L.yMode === 'cruise' ? CRUISE_Y + (L.to.y - CRUISE_Y) * k * k * k + Math.sin(t * 1.3) * 0.25 : L.from.y + (L.to.y - L.from.y) * e;
      if (L.dust && k >= (L.dustFrom ?? 0) && k <= (L.dustUntil ?? 1)) {
        T.dust = (T.dust ?? 0) - dt;
        if (T.dust <= 0) {
          T.dust = 0.18;
          fx.puff(L.dust.x + rand(-1.8, 1.8), L.dust.top + 0.3, L.dust.z + rand(-1.8, 1.8), 3);
        }
      }
    }
    if (L.tick) L.tick(k, dt, t);

    if (L.until ? L.until() : T.t >= L.dur) {
      T.i++;
      if (T.i >= T.legs.length) {
        phase = 'parked';
        A.vx = 0;
        setRotor(0);
        const done = T.onLanded;
        transit = null;
        if (done) done();
        return;
      }
    }
    if (dt > 0) A.vx = clamp((A.x - px) / dt, -40, 40);
    A.vy = dt > 0 ? (A.y - py) / dt : 0;
  }

  function fxPuffs() {
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) fx.puff(hatchX + sx * HATCH_HW * 0.8, FT + 0.2, hatchZ + sz * HATCH_HD * 0.8, 3);
  }

  return {
    input,
    casters,
    hatchNode: hatch,
    get phase() {
      return phase;
    },
    get busy() {
      return phase === 'intro' || phase === 'fight' || phase === 'won' || phase === 'lost' || phase === 'transit';
    },
    get level() {
      return level;
    },
    // where the camera should look while the helicopter flies, and how far into a landing it is (0..1)
    get allyPos() {
      return { x: A.x + (transit ? transit.focusDx : 0), y: A.y, z: A.z ?? planeZ - 0.7 };
    },
    get landK() {
      return transit ? transit.landK : phase === 'parked' ? 1 : 0;
    },
    // debugging aid: destroys the gunship at once so the win flow can be tried without playing the fight
    winNow() {
      if (phase === 'fight') hurtEnemy(ENEMY_HP, E.x, E.y);
    },
    planeZ,
    begin,
    depart,
    startBattle,
    reset,
    update,
  };
}

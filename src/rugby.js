import { Mesh, MeshBuilder, TransformNode, StandardMaterial, Color3, VertexBuffer, DynamicTexture, Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { offsetPolygon, pointInPolygon, bandMesh, mergeByMaterial } from './geometry.js';
import { flatMaterial } from './materials.js';

// The two sides on the rugby hole: kit colours for the players and scarf colours for their fans.
export const TEAMS = {
  saints: { name: 'The Saints', shirt: '#1d3f8f', hoop: '#f4f4f0', shorts: '#f4f4f0', socks: '#1d3f8f', fans: ['#1d3f8f', '#f4f4f0', '#3d6fd1', '#1d3f8f', '#f4f4f0'] },
  leopards: { name: 'The Leopards', shirt: '#f2a51a', hoop: '#1b1b1b', shorts: '#1b1b1b', socks: '#f2a51a', fans: ['#f2a51a', '#1b1b1b', '#f7c948', '#f2a51a', '#c98a12'] },
};

const SKINS = ['#f0c39a', '#d9a47c', '#a8714f', '#7a4b33', '#f5d2b3'];
const HAIR = ['#2a1c14', '#5b3a22', '#1a1412', '#c8a060', '#7a3b1c'];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turnToward = (h, want, max) => h + Math.max(-max, Math.min(max, wrap(want - h)));

// One white material for every player: the kit colours are vertex colours, so a player is five meshes
// (body, two legs, two arms) whatever his team.
const kitMats = new WeakMap();
function kitMaterial(scene) {
  let m = kitMats.get(scene);
  if (!m) {
    m = new StandardMaterial('rugbyKit', scene);
    m.diffuseColor = Color3.White();
    m.specularColor = new Color3(0.06, 0.06, 0.06);
    kitMats.set(scene, m);
  }
  return m;
}

function paint(mesh, hex) {
  const c = Color3.FromHexString(hex);
  const n = mesh.getTotalVertices();
  const cols = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b, 1], i * 4);
  mesh.setVerticesData(VertexBuffer.ColorKind, cols);
  return mesh;
}

// A rugby player who runs across the pitch between the touchlines, keeping to his `lane` (world x),
// catches his breath, and runs back. `world` is the same object bulls get: walkable(x, z), others(), ball(), center.
// Collision is one moving circle (`kind: 'bull'`, so the ball bounces off him like off a bull).
export function createRugbyPlayer(scene, world, { x, z, y, team = 'saints', lane = x, seed = 1, heading = 0, carrier = false }) {
  const kit = TEAMS[team];
  const rand = rng(seed * 7919 + 13);
  const skin = SKINS[Math.floor(rand() * SKINS.length)];
  const hair = HAIR[Math.floor(rand() * HAIR.length)];
  const mat = kitMaterial(scene);

  const root = new TransformNode('player', scene);
  root.position.set(x, y, z);
  const body = new TransformNode('playerBody', scene);
  body.parent = root;
  const meshes = [];

  const piece = (mesh, hex, pos, scale, rot) => {
    paint(mesh, hex);
    mesh.position.set(...pos);
    if (scale) mesh.scaling.set(...scale);
    if (rot) mesh.rotation.set(...rot);
    return mesh;
  };
  const group = (parts, parent) => {
    const m = Mesh.MergeMeshes(parts, true, true);
    m.parent = parent;
    m.material = mat;
    m.isPickable = false;
    meshes.push(m);
    return m;
  };
  const cyl = (h, d, t = 10) => MeshBuilder.CreateCylinder('rp', { height: h, diameter: d, tessellation: t }, scene);
  const sph = (d, s = 10) => MeshBuilder.CreateSphere('rp', { diameter: d, segments: s }, scene);
  const box = (w, h, d) => MeshBuilder.CreateBox('rp', { width: w, height: h, depth: d }, scene);

  // torso with a hoop across the chest, shorts, neck, head and hair (and the ball, for the carrier)
  const torso = [
    piece(MeshBuilder.CreateCapsule('rp', { radius: 0.24, height: 0.68, tessellation: 12, subdivisions: 2 }, scene), kit.shirt, [0, 1.2, 0], [0.9, 1, 1.12]),
    piece(cyl(0.11, 0.5, 16), kit.hoop, [0, 1.22, 0], [0.9, 1, 1.12]),
    piece(cyl(0.26, 0.46, 14), kit.shorts, [0, 0.9, 0], [0.9, 1, 1.1]),
    piece(cyl(0.12, 0.13, 8), skin, [0, 1.52, 0]),
    piece(sph(0.3, 12), skin, [0.01, 1.66, 0]),
    piece(sph(0.32, 10), hair, [-0.02, 1.72, 0], [1, 0.62, 1]),
  ];
  if (carrier) torso.push(piece(sph(1, 12), '#8a4b22', [0.2, 1.08, 0.27], [0.3, 0.19, 0.19], [0, 0, 0.3]));
  group(torso, body);

  // legs and arms pivot at the hip and shoulder
  const legs = [-1, 1].map((s) => {
    const pivot = new TransformNode('playerLeg', scene);
    pivot.parent = body;
    pivot.position.set(0, 0.86, s * 0.12);
    group([piece(cyl(0.34, 0.15), skin, [0, -0.2, 0]), piece(cyl(0.3, 0.14), kit.socks, [0, -0.5, 0]), piece(box(0.26, 0.09, 0.13), '#15151a', [0.05, -0.8, 0])], pivot);
    return pivot;
  });
  const arms = [-1, 1].map((s) => {
    const pivot = new TransformNode('playerArm', scene);
    pivot.parent = body;
    pivot.position.set(0, 1.43, s * 0.3);
    group([piece(cyl(0.2, 0.15), kit.shirt, [0, -0.08, 0]), piece(cyl(0.32, 0.11), skin, [0, -0.32, 0]), piece(sph(0.12, 8), skin, [0, -0.5, 0])], pivot);
    return pivot;
  });

  const p = {
    x,
    z,
    h: heading,
    speed: 0,
    want: 0,
    state: 'wait',
    timer: 0.3 + rand() * 1.8,
    target: null,
    phase: rand() * 6,
    root,
    meshes,
    circles: [],
  };
  const circle = { x, z, r: 0.3, vx: 0, vz: 0, kind: 'bull', species: 'player', onHit: () => knock() };
  p.circles.push(circle);

  function knock() {
    if (p.state === 'stagger') return;
    p.state = 'stagger';
    p.timer = 0.7;
    p.speed *= 0.2;
  }

  // Keeps clear of the walls and posts (walkable), a ball lying on the grass and the other players.
  function clearPath(ax, az, tx, tz) {
    const d = Math.hypot(tx - ax, tz - az);
    const n = Math.max(2, Math.ceil(d / 0.35));
    const ball = world.ball();
    for (let i = 1; i <= n; i++) {
      const px = ax + ((tx - ax) * i) / n;
      const pz = az + ((tz - az) * i) / n;
      if (!world.walkable(px, pz)) return false;
      if (ball && Math.hypot(px - ball.x, pz - ball.z) < 0.9) return false;
      for (const o of world.others()) {
        if (o !== p && Math.hypot(px - o.x, pz - o.z) < 0.95) return false;
      }
    }
    return true;
  }

  // Across to the other half of the pitch, near the touchline, staying in his lane.
  function pickTarget() {
    const side = p.z > world.center.z ? -1 : 1;
    for (let k = 0; k < 24; k++) {
      const tx = lane + (rand() - 0.5) * 2.4;
      const tz = world.center.z + side * (1.4 + rand() * 2.8);
      if (world.walkable(tx, tz) && clearPath(p.x, p.z, tx, tz)) return { x: tx, z: tz };
    }
    for (let k = 0; k < 12; k++) {
      const a = rand() * Math.PI * 2;
      const tx = p.x + Math.cos(a) * (1 + rand() * 1.5);
      const tz = p.z + Math.sin(a) * (1 + rand() * 1.5);
      if (world.walkable(tx, tz) && clearPath(p.x, p.z, tx, tz)) return { x: tx, z: tz };
    }
    return null;
  }

  p.update = (dt, t) => {
    const px = p.x;
    const pz = p.z;
    switch (p.state) {
      case 'wait': {
        p.want = 0;
        p.timer -= dt;
        const ball = world.ball();
        if (ball) p.h = turnToward(p.h, Math.atan2(ball.z - p.z, ball.x - p.x), 2 * dt);
        if (p.timer <= 0) {
          p.target = pickTarget();
          if (p.target) {
            p.state = 'run';
            p.want = 1.4 + rand() * 1.0;
          } else p.timer = 0.6;
        }
        break;
      }
      case 'run': {
        const dx = p.target.x - p.x;
        const dz = p.target.z - p.z;
        const d = Math.hypot(dx, dz);
        // he moves straight at the target (checked clear when picked) and the body turns to follow
        p.h = turnToward(p.h, Math.atan2(dz, dx), 8 * dt);
        p.speed += (p.want - p.speed) * Math.min(1, dt * 3);
        const step = Math.min(d, p.speed * dt);
        const ux = dx / (d || 1);
        const uz = dz / (d || 1);
        const nx = p.x + ux * step;
        const nz = p.z + uz * step;
        if (d < 0.15) {
          p.state = 'wait';
          p.timer = 1.0 + rand() * 2.0;
        } else if (!clearPath(p.x, p.z, nx + ux * 0.3, nz + uz * 0.3)) {
          p.state = 'wait';
          p.timer = 0.4 + rand() * 0.6;
        } else {
          p.x = nx;
          p.z = nz;
        }
        break;
      }
      case 'stagger':
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'wait';
          p.timer = 0.5;
        }
        break;
    }
    if (p.state !== 'run') p.speed *= Math.exp(-8 * dt);

    // running cycle: legs and arms swing opposite, leaning into the run; the carrier keeps the ball tucked in
    const run = Math.min(1, p.speed / 2);
    p.phase += dt * (3 + p.speed * 4.5);
    const s = Math.sin(p.phase);
    legs[0].rotation.z = s * 0.9 * run;
    legs[1].rotation.z = -s * 0.9 * run;
    arms[0].rotation.z = -s * 0.8 * run;
    arms[1].rotation.z = carrier ? 0.55 : s * 0.8 * run;
    arms[0].rotation.x = -0.12;
    arms[1].rotation.x = 0.12;
    body.rotation.z = p.state === 'stagger' ? 0.3 * (p.timer / 0.7) : -0.22 * run;
    body.position.y = Math.abs(s) * 0.07 * run + (run < 0.1 ? Math.abs(Math.sin(t * 2.4 + seed)) * 0.012 : 0);
    root.position.x = p.x;
    root.position.z = p.z;
    root.rotation.y = -p.h;

    circle.x = p.x;
    circle.z = p.z;
    circle.vx = dt > 0 ? (p.x - px) / dt : 0;
    circle.vz = dt > 0 ? (p.z - pz) / dt : 0;
  };

  return p;
}

// Scoreboard face: the two team names over a zero-zero score.
function scoreboardMaterial(scene, home, away) {
  const W = 1024;
  const H = 240;
  const tex = new DynamicTexture('scoreTex', { width: W, height: H }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = '#0d1118';
  ctx.fillRect(0, 0, W, H);
  const team = (t, x0, fg) => {
    ctx.fillStyle = t.shirt;
    ctx.fillRect(x0, 18, 440, 118);
    ctx.fillStyle = fg;
    ctx.font = 'bold 64px "Trebuchet MS", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.name.toUpperCase(), x0 + 220, 80, 410);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 76px "Courier New", monospace';
    ctx.fillText('0', x0 + 220, 186);
  };
  team(TEAMS[home], 24, '#ffffff');
  team(TEAMS[away], W - 464, '#111111');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 60px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('v', W / 2, 80);
  ctx.fillStyle = '#9aa3b2';
  ctx.font = 'bold 30px "Trebuchet MS", sans-serif';
  ctx.fillText('KICK-OFF', W / 2, 186);
  tex.update();
  tex.anisotropicFilteringLevel = 4;
  const mat = new StandardMaterial('scoreMat', scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.disableLighting = true;
  mat.specularColor = Color3.Black();
  return mat;
}

// The rugby stadium around a pitch outline: white lines, H posts on the try lines, stands full of fans
// (home fans on the tee half, away fans on the cup half) doing a Mexican wave, floodlights and a scoreboard.
// Returns meshes to parent under the hole, shadow casters, static collision circles for the posts, blocker
// rectangles for the players' walkable test, and update(t) for the wave.
export function createStadium(scene, { outline, ox, oz, top, slabTop, wallW, wallMat, home = 'saints', away = 'leopards', tryX = 10.6, postHalf = 1.5, tiers = 3 }) {
  const meshes = [];
  const casters = [];
  const circles = [];
  const blockers = [];
  const maxX = Math.max(...outline.map((p) => p.x - ox));
  const maxZ = Math.max(...outline.map((p) => p.z - oz));

  // ---- stands and the back wall with a red band ----
  const tw = 0.78;
  const riser = (i) => 0.5 + 0.55 * (i + 1);
  for (let i = 0; i < tiers; i++) {
    const stand = bandMesh('rStand' + i, offsetPolygon(outline, wallW + i * tw), { width: tw, height: riser(i), y: slabTop, color: i % 2 ? [0.62, 0.66, 0.74] : [0.74, 0.77, 0.84] }, scene);
    stand.material = wallMat;
    stand.receiveShadows = true;
    meshes.push(stand);
    casters.push(stand);
  }
  const back = offsetPolygon(outline, wallW + tiers * tw);
  const backH = riser(tiers - 1) + 0.7;
  const backWall = bandMesh('rBack', back, { width: 0.4, height: backH, y: slabTop, color: [0.36, 0.38, 0.44] }, scene);
  const stripe = bandMesh('rStripe', offsetPolygon(back, -0.02), { width: 0.44, height: 0.22, y: slabTop + backH - 0.42, color: [0.78, 0.1, 0.16] }, scene);
  for (const m of [backWall, stripe]) {
    m.material = wallMat;
    m.receiveShadows = true;
    meshes.push(m);
    casters.push(m);
  }
  const outerR = wallW + tiers * tw + 0.4;

  // ---- pitch markings: touch-in-goal line all round, try lines, 22s, halfway, dashed 10 m and 5 m lines ----
  const inner = offsetPolygon(outline, -0.3);
  const inside = (lx, lz) => pointInPolygon(ox + lx, oz + lz, inner);
  const span = (lx) => {
    let e = 0;
    while (e < 20 && inside(lx, e + 0.05)) e += 0.05;
    return e;
  };
  const lineMat = flatMaterial(scene, 'rLine', '#f5f5f0', { emissive: '#303030' });
  const W = 0.08;
  const bars = [];
  const bar = (lx, lz, wx, wz) => {
    const b = MeshBuilder.CreateBox('rl', { width: wx, height: 0.008, depth: wz }, scene);
    b.position.set(ox + lx, top + 0.004, oz + lz);
    bars.push(b);
  };
  const lineAcross = (lx, dash = 0) => {
    const e = span(lx);
    if (!dash) return bar(lx, 0, W, 2 * e);
    for (let zc = -e + dash / 2; zc + dash / 2 <= e; zc += dash * 1.9) bar(lx, zc, W, dash);
  };
  for (const s of [-1, 1]) {
    lineAcross(s * tryX);
    lineAcross(s * tryX * 0.5);
    lineAcross(s * tryX * 0.22, 0.4);
  }
  lineAcross(0);
  for (const s of [-1, 1]) {
    const lz = s * (maxZ - 1.1);
    for (let lx = -tryX + 0.3; lx < tryX - 0.3; lx += 0.76) if (inside(lx, lz)) bar(lx, lz, 0.4, W);
  }
  bar(0, 0, 0.2, 0.2);
  const lines = Mesh.MergeMeshes(bars, true, true);
  lines.material = lineMat;
  lines.isPickable = false;
  meshes.push(lines);
  const touch = bandMesh('rTouch', offsetPolygon(outline, -0.34), { width: 0.07, height: 0.008, y: top, color: [0.96, 0.96, 0.93] }, scene);
  touch.material = wallMat;
  meshes.push(touch);

  // ---- H posts on both try lines, padded in the team colours; the uprights are solid for the ball ----
  const postMat = flatMaterial(scene, 'rPost', '#f7f7f4', { spec: 0.3 });
  const padMats = { [home]: flatMaterial(scene, 'rPadH', TEAMS[home].shirt), [away]: flatMaterial(scene, 'rPadA', TEAMS[away].shirt) };
  const postParts = [];
  for (const [sx, team] of [[-1, home], [1, away]]) {
    const px = ox + sx * tryX;
    for (const s of [-1, 1]) {
      const pz = oz + s * postHalf;
      const up = MeshBuilder.CreateCylinder('rpost', { height: 3.1, diameter: 0.09, tessellation: 8 }, scene);
      up.position.set(px, top + 1.55, pz);
      up.material = postMat;
      const pad = MeshBuilder.CreateCylinder('rpad', { height: 0.55, diameter: 0.34, tessellation: 14 }, scene);
      pad.position.set(px, top + 0.275, pz);
      pad.material = padMats[team];
      postParts.push(up, pad);
      circles.push({ x: px, z: pz, r: 0.17, vx: 0, vz: 0, kind: 'post' });
      blockers.push({ x: px, z: pz, hw: 0.2, hd: 0.2 });
    }
    const crossbar = MeshBuilder.CreateCylinder('rbar', { height: postHalf * 2, diameter: 0.08, tessellation: 8 }, scene);
    crossbar.rotation.x = Math.PI / 2;
    crossbar.position.set(px, top + 0.95, oz);
    crossbar.material = postMat;
    postParts.push(crossbar);
  }
  const posts = mergeByMaterial(postParts);
  meshes.push(...posts);
  casters.push(...posts);

  // ---- floodlights on the four corners, lamps tilted down at the pitch ----
  const mastMat = flatMaterial(scene, 'rMast', '#9aa0a8', { spec: 0.2 });
  const lampMat = flatMaterial(scene, 'rLamp', '#fffbe6', { emissive: '#fff1c2' });
  const lightParts = [];
  const lampHeads = [];
  const mastH = 5.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const mx = ox + sx * (maxX + 1.4);
      const mz = oz + sz * (maxZ + 1.4);
      const mast = MeshBuilder.CreateCylinder('rmast', { height: mastH, diameter: 0.16, tessellation: 8 }, scene);
      mast.position.set(mx, slabTop + mastH / 2, mz);
      mast.material = mastMat;
      const head = new TransformNode('rhead', scene);
      head.position.set(mx, slabTop + mastH, mz);
      head.rotation.set(0.45, Math.atan2(-sx, -sz), 0);
      const frame = MeshBuilder.CreateBox('rframe', { width: 1.2, height: 0.72, depth: 0.12 }, scene);
      frame.parent = head;
      frame.material = mastMat;
      const lamp = MeshBuilder.CreateBox('rlamp', { width: 1.04, height: 0.56, depth: 0.04 }, scene);
      lamp.parent = head;
      lamp.position.z = 0.07;
      lamp.material = lampMat;
      lightParts.push(mast, frame, lamp);
      head.computeWorldMatrix(true);
      lampHeads.push(head);
    }
  }
  const lights = mergeByMaterial(lightParts);
  lampHeads.forEach((h) => h.dispose());
  meshes.push(...lights);
  casters.push(lights[0]);

  // ---- scoreboard above the far stand, facing the camera ----
  const bw = 6.4;
  const bh = 1.5;
  const boardZ = oz + maxZ + outerR + 0.3;
  const boardY = slabTop + backH + 0.35;
  const boardParts = [];
  for (const s of [-1, 1]) {
    const leg = MeshBuilder.CreateCylinder('rleg', { height: boardY - slabTop, diameter: 0.18, tessellation: 8 }, scene);
    leg.position.set(ox + s * 2.4, slabTop + (boardY - slabTop) / 2, boardZ + 0.05);
    leg.material = mastMat;
    boardParts.push(leg);
  }
  const boardBack = MeshBuilder.CreateBox('rboard', { width: bw + 0.24, height: bh + 0.24, depth: 0.16 }, scene);
  boardBack.position.set(ox, boardY + bh / 2, boardZ);
  boardBack.material = flatMaterial(scene, 'rBoard', '#20242c');
  boardParts.push(boardBack);
  const board = mergeByMaterial(boardParts);
  meshes.push(...board);
  casters.push(...board);
  const face = MeshBuilder.CreatePlane('rscore', { width: bw, height: bh }, scene);
  face.position.set(ox, boardY + bh / 2, boardZ - 0.09);
  face.material = scoreboardMaterial(scene, home, away);
  face.isPickable = false;
  meshes.push(face);

  // ---- the crowd: one box and one head per seat, thin instances coloured by the team they support ----
  let seed = 53;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const skins = [[0.94, 0.76, 0.6], [0.8, 0.6, 0.45], [0.62, 0.44, 0.32], [0.98, 0.84, 0.7], [0.45, 0.3, 0.22]];
  const hex = (h) => Color3.FromHexString(h);
  const spots = [];
  for (let i = 0; i < tiers; i++) {
    const poly = offsetPolygon(outline, wallW + i * tw + tw * 0.5);
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k];
      const b = poly[(k + 1) % poly.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.round(len / 0.46));
      for (let j = 0; j < n; j++) {
        if (rnd() < 0.08) continue;
        const f = (j + 0.5) / n;
        const x = a.x + (b.x - a.x) * f;
        const z = a.z + (b.z - a.z) * f;
        const fan = (x < ox) !== rnd() < 0.12 ? home : away;
        spots.push({
          x,
          y: slabTop + riser(i),
          z,
          face: Math.atan2(oz - z, ox - x),
          u: Math.atan2((z - oz) / maxZ, (x - ox) / maxX) / (Math.PI * 2) + 0.5,
          c: hex(TEAMS[fan].fans[Math.floor(rnd() * TEAMS[fan].fans.length)]),
        });
      }
    }
  }
  const crowdMat = new StandardMaterial('rCrowd', scene);
  crowdMat.diffuseColor = Color3.White();
  crowdMat.specularColor = Color3.Black();
  const bodies = MeshBuilder.CreateBox('rCrowdBody', { width: 0.24, height: 0.34, depth: 0.26 }, scene);
  const heads = MeshBuilder.CreateSphere('rCrowdHead', { diameter: 0.19, segments: 6 }, scene);
  for (const m of [bodies, heads]) {
    m.material = crowdMat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
  }
  const mBody = new Float32Array(spots.length * 16);
  const mHead = new Float32Array(spots.length * 16);
  const cBody = new Float32Array(spots.length * 4);
  const cHead = new Float32Array(spots.length * 4);
  const yBody = new Float32Array(spots.length);
  const yHead = new Float32Array(spots.length);
  spots.forEach((s, i) => {
    const q = Quaternion.RotationAxis(new Vector3(0, 1, 0), -s.face);
    yBody[i] = s.y + 0.17;
    yHead[i] = s.y + 0.43;
    Matrix.Compose(new Vector3(1, 1 + rnd() * 0.15, 1), q, new Vector3(s.x, yBody[i], s.z)).copyToArray(mBody, i * 16);
    Matrix.Compose(new Vector3(1, 1, 1), q, new Vector3(s.x, yHead[i], s.z)).copyToArray(mHead, i * 16);
    const sk = skins[Math.floor(rnd() * skins.length)];
    cBody.set([s.c.r, s.c.g, s.c.b, 1], i * 4);
    cHead.set([sk[0], sk[1], sk[2], 1], i * 4);
  });
  bodies.thinInstanceSetBuffer('matrix', mBody, 16, false);
  bodies.thinInstanceSetBuffer('color', cBody, 4);
  heads.thinInstanceSetBuffer('matrix', mHead, 16, false);
  heads.thinInstanceSetBuffer('color', cHead, 4);
  meshes.push(bodies, heads);

  // a Mexican wave goes round the ground: each fan stands up as it passes
  let lastWave = -1;
  function update(t) {
    const wave = (t * 0.075) % 1;
    if (Math.abs(wave - lastWave) < 0.0015) return;
    lastWave = wave;
    for (let i = 0; i < spots.length; i++) {
      let d = spots[i].u - wave;
      d -= Math.round(d);
      const k = Math.max(0, 1 - Math.abs(d) / 0.04);
      const lift = k * k * (3 - 2 * k) * 0.22;
      mBody[i * 16 + 13] = yBody[i] + lift;
      mHead[i * 16 + 13] = yHead[i] + lift;
    }
    bodies.thinInstanceBufferUpdated('matrix');
    heads.thinInstanceBufferUpdated('matrix');
  }

  return { meshes, casters, circles, blockers, update };
}

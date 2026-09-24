import { MeshBuilder, TransformNode, Vector3 } from '@babylonjs/core';
import { FAIRWAY_TOP as FT } from './holes.js';
import { flatMaterial } from './materials.js';
import { pointInPolygon, offsetPolygon } from './geometry.js';
import { SWING_HIT_AT } from './kid.js';
import { angleTo, turnToward } from './ogre.js';

const KID_HP = 100;
const OGRE_HP = 190;
const KID_SPEED = 4.3;
const KID_R = 0.34;
const OGRE_R = 0.95;
const HELPER_SPEED = 3.9;
const KID_DMG = 7;
const HELPER_DMG = 3.6;
const SWING_CD = 0.52;
const SWING_TIME = 0.34; // must match the swing animation length in kid.js
const REACH = 1.5; // from the kid to the surface of the ogre
const SLAM_R = 1.6;
const SLAM_DMG = 18;
const CHARGE_DMG = 15;
// the victory cinematic (seconds): cheering at the camera, looking back at the mill, hugging
const CHEER_T = 3.4;
const LOOK_T = 2.6;
const HUG_T = 3.6;
const HUG_GAP = 0.52; // close enough for the arms to wrap round
const HUG_REACH_K = 1.35; // Hector's arms go round Tate's waist
const HUG_REACH_H = 1.1; // Tate, a head taller, reaches down over Hector's shoulders

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The ogre boss fight on the windmill hole: after the ball drops, the mill door opens and an ogre steps out.
// You steer the kid (arrows / WASD / pointer) and swing his golf club (space); a second kid helps by himself.
// Phases: idle -> intro -> fight -> dying -> gather -> cheer -> look -> hug -> done | lost
// From `gather` on it is a cinematic: onCinema() asks main.js for the 'cinema' camera, which follows `shot`.
export function createBrawl(scene, hole, { kid, helper, ogre, fx, sfx, hud, onShake, onMessage, onEnd, onCinema }) {
  const mill = hole.windmill;
  const cx = hole.center.x;
  const cz = hole.center.z;
  const [kx, kz] = hole.def.brawl?.kidSpot ?? [-3.5, -7.6];
  const [hx, hz] = hole.def.brawl?.helperSpot ?? [-14.6, 1.4];
  const kidSpot = { x: cx + kx, z: cz + kz };
  const helperSpot = { x: cx + hx, z: cz + hz };
  const insetKid = offsetPolygon(hole.outline, -0.6);
  const insetOgre = offsetPolygon(hole.outline, -1.25);
  const WR = mill.radius;
  const W = { x: mill.circles[0].x, z: mill.circles[0].z };

  const input = { ax: 0, az: 0, attack: false, tx: null, tz: null };
  const K = { x: 0, z: 0, hp: KID_HP, face: -Math.PI / 2, inv: 0, cd: 0, sw: 0, hit: false, kbx: 0, kbz: 0, r: KID_R, down: 0 };
  const H = { x: 0, z: 0, state: 'wait', t: 0, cd: 1, stun: 0, throwIn: -1, orbit: 1, r: KID_R, hop: null, kbx: 0, kbz: 0 };
  const G = { x: 0, z: 0, hp: OGRE_HP, state: 'hidden', t: 0, cd: 1.5, chargeCd: 5, target: null, retarget: 0, kbx: 0, kbz: 0, slam: null, dir: null, hit: false, r: OGRE_R, vuln: 1 };

  let phase = 'idle';
  let clock = 0;
  let endT = 0;
  let hugT = 0;
  let cineT = 0;
  let cinematic = false;

  // ---- victory cinematic: where the kids line up (in front of the mill door, Hector on the left) and the camera ----
  const podium = { x: W.x - 0.2, z: W.z - WR - 3.0 };
  const spotK = { x: podium.x - 0.62, z: podium.z };
  const spotH = { x: podium.x + 0.62, z: podium.z };
  // the camera goal main.js reads in 'cinema' mode; halfW is how much must fit across the screen
  const shot = { target: new Vector3(), yaw: Math.PI, pitch: 0.24, dist: 4.4, halfW: 1.15 };
  const goal = { x: 0, y: 0, z: 0, yaw: Math.PI, pitch: 0.24, dist: 4.4 };
  function aim(x, y, z, yaw, pitch, dist) {
    Object.assign(goal, { x, y, z, yaw, pitch, dist });
  }
  function followShot(dt, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-2.4 * dt);
    shot.target.x += (goal.x - shot.target.x) * k;
    shot.target.y += (goal.y - shot.target.y) * k;
    shot.target.z += (goal.z - shot.target.z) * k;
    shot.yaw += (goal.yaw - shot.yaw) * k;
    shot.pitch += (goal.pitch - shot.pitch) * k;
    shot.dist += (goal.dist - shot.dist) * k;
  }
  // walks a kid to a spot, going round the mill instead of through it; true once there
  function walkTo(ch, spot, dt) {
    const p = ch.position;
    const dx = spot.x - p.x;
    const dz = spot.z - p.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = clamp(((W.x - p.x) * dx + (W.z - p.z) * dz) / l2, 0, 1);
    let tx = spot.x;
    let tz = spot.z;
    if (Math.hypot(p.x + dx * t - W.x, p.z + dz * t - W.z) < WR + 0.45) {
      tx = W.x + (Math.sign(p.x - W.x) || 1) * (WR + 1.0);
      tz = W.z - 0.3;
    }
    return ch.walkStep(tx, tz, 2.6, dt) && tx === spot.x;
  }
  // turns both kids smoothly toward a heading
  function turnKids(h, dt) {
    kid.heading = turnToward(kid.heading, h, 7 * dt);
    helper.heading = turnToward(helper.heading, h, 7 * dt);
  }

  // ---- warning markers (slam circle, charge lane) ----
  const lit = (name, hex, alpha) => {
    const m = flatMaterial(scene, name, hex, { emissive: hex, alpha });
    m.disableLighting = true;
    m.backFaceCulling = false;
    return m;
  };
  const warn = lit('brWarn', '#ff3b30', 0.7);
  const warnFill = lit('brWarnFill', '#ff3b30', 0.22);
  const slamMarker = new TransformNode('brSlam', scene);
  const ring = MeshBuilder.CreateTorus('br', { diameter: SLAM_R * 2, thickness: 0.09, tessellation: 40 }, scene);
  ring.material = warn;
  ring.parent = slamMarker;
  const disc = MeshBuilder.CreateDisc('br', { radius: SLAM_R, tessellation: 32 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = -0.004;
  disc.material = warnFill;
  disc.parent = slamMarker;
  slamMarker.setEnabled(false);
  const lane = MeshBuilder.CreateBox('brLane', { width: 1, height: 0.02, depth: 1.3 }, scene);
  lane.material = warnFill;
  lane.setEnabled(false);
  for (const m of [ring, disc, lane]) m.isPickable = false;

  // ---- helper's stones ----
  const stoneMat = flatMaterial(scene, 'brStone', '#8a8a86');
  const stones = [];
  function throwStone() {
    const mesh = MeshBuilder.CreateSphere('brStoneM', { diameter: 0.22, segments: 6 }, scene);
    mesh.material = stoneMat;
    mesh.isPickable = false;
    stones.push({ mesh, t: 0, T: 0.55, from: { x: H.x, y: FT + 1.0, z: H.z }, to: { x: G.x, y: FT + 1.6, z: G.z } });
  }
  function updateStones(dt) {
    for (let i = stones.length - 1; i >= 0; i--) {
      const s = stones[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.T);
      s.mesh.position.set(lerp(s.from.x, s.to.x, k), lerp(s.from.y, s.to.y, k) + Math.sin(k * Math.PI) * 1.2, lerp(s.from.z, s.to.z, k));
      if (k >= 1) {
        s.mesh.dispose();
        stones.splice(i, 1);
        if (G.hp > 0 && (G.state !== 'hidden')) hitOgre(HELPER_DMG, H);
      }
    }
  }

  // ---- geometry helpers ----
  // Tries to move an entity; keeps it inside the fairway and out of the mill. Returns false if something blocked it.
  function move(e, dx, dz, poly) {
    let ok = true;
    const nx = e.x + dx;
    if (pointInPolygon(nx, e.z, poly)) e.x = nx;
    else if (dx !== 0) ok = false;
    const nz = e.z + dz;
    if (pointInPolygon(e.x, nz, poly)) e.z = nz;
    else if (dz !== 0) ok = false;
    const dw = Math.hypot(e.x - W.x, e.z - W.z);
    const min = WR + e.r;
    if (dw < min) {
      e.x = W.x + ((e.x - W.x) / (dw || 1)) * min;
      e.z = W.z + ((e.z - W.z) / (dw || 1)) * min;
      ok = false;
    }
    return ok;
  }
  function separate(a, b) {
    const d = dist(a, b);
    const min = a.r + b.r;
    if (d < min && d > 1e-4) {
      const push = (min - d) / 2;
      const ux = (a.x - b.x) / d;
      const uz = (a.z - b.z) / d;
      a.x += ux * push;
      a.z += uz * push;
      b.x -= ux * push;
      b.z -= uz * push;
    }
  }

  // ---- damage ----
  function hitOgre(dmg, from) {
    if (G.hp <= 0 || G.state === 'hidden' || G.state === 'emerge') return;
    const d = dmg * G.vuln;
    G.hp = Math.max(0, G.hp - d);
    ogre.hurtT = 0.25;
    fx.sparks(G.x, FT + 1.7, G.z, 8);
    sfx.hit();
    hud.setEnemy(G.hp / OGRE_HP);
    if (G.state === 'chase') {
      const a = Math.atan2(G.z - from.z, G.x - from.x);
      G.kbx = Math.cos(a) * 1.6;
      G.kbz = Math.sin(a) * 1.6;
    }
    if (G.hp <= 0) killOgre();
  }

  function hurtKid(dmg, from, knock = 3) {
    if (K.inv > 0 || phase !== 'fight') return;
    K.hp = Math.max(0, K.hp - dmg);
    K.inv = 0.9;
    kid.hurt();
    sfx.hurt();
    onShake(0.22);
    hud.setAlly(K.hp / KID_HP);
    const a = Math.atan2(K.z - from.z, K.x - from.x);
    K.kbx = Math.cos(a) * knock;
    K.kbz = Math.sin(a) * knock;
    if (K.hp <= 0) {
      phase = 'lost';
      endT = 0;
      ogre.armTarget = -2.7;
      sfx.roar();
    }
  }

  function stunHelper(from) {
    if (H.stun > 0 || H.state.startsWith('hug')) return;
    H.stun = 1.1;
    helper.hurt();
    const a = Math.atan2(H.z - from.z, H.x - from.x);
    H.kbx = Math.cos(a) * 3;
    H.kbz = Math.sin(a) * 3;
  }

  function killOgre() {
    G.state = 'dead';
    G.t = 0;
    phase = 'dying';
    endT = 0;
    slamMarker.setEnabled(false);
    lane.setEnabled(false);
    sfx.boom(1.4);
    sfx.victory();
    onShake(0.7);
    fx.explosion(G.x, FT + 1.2, G.z, 1.3);
    hud.setEnemy(0);
  }

  // ---- ogre brain ----
  function pickTarget() {
    const helperIn = H.state === 'fight' || H.state === 'stunned';
    G.target = helperIn && Math.random() < 0.35 ? H : K;
    G.retarget = rand(1.2, 2.2);
  }

  function updateOgre(dt, t) {
    const rage = 1 - G.hp / OGRE_HP;
    G.t += dt;
    G.vuln = G.state === 'recover' ? 1.6 : G.state === 'stun' ? 2 : 1;
    const speed = 1.9 + rage * 1.0;
    let walk = 0;

    if (G.kbx || G.kbz) {
      move(G, G.kbx * dt, G.kbz * dt, insetOgre);
      const decay = Math.exp(-7 * dt);
      G.kbx *= decay;
      G.kbz *= decay;
      if (Math.abs(G.kbx) + Math.abs(G.kbz) < 0.05) G.kbx = G.kbz = 0;
    }

    switch (G.state) {
      case 'emerge': {
        const k = clamp(G.t / 1.7, 0, 1);
        G.x = lerp(G.from.x, G.to.x, k);
        G.z = lerp(G.from.z, G.to.z, k);
        ogre.root.scaling.setAll(lerp(0.55, 1, clamp(k * 2, 0, 1)));
        walk = 0.8;
        if (k >= 1) {
          G.state = 'roar';
          G.t = 0;
          ogre.root.scaling.setAll(1);
          sfx.roar();
          onShake(0.35);
          onMessage('An ogre! SPACE to swing your club', 3200);
        }
        break;
      }
      case 'roar':
        ogre.roar = Math.sin(clamp(G.t / 1.2, 0, 1) * Math.PI);
        if (G.t >= 1.2) {
          ogre.roar = 0;
          G.state = 'chase';
          G.t = 0;
          pickTarget();
        }
        break;
      case 'chase': {
        G.retarget -= dt;
        if (!G.target || G.retarget <= 0) pickTarget();
        const tgt = G.target;
        ogre.heading = turnToward(ogre.heading, angleTo(G, tgt), 3.2 * dt);
        const d = dist(G, tgt);
        G.cd -= dt;
        G.chargeCd -= dt;
        if (d > 2.4) {
          move(G, Math.cos(ogre.heading) * speed * dt, Math.sin(ogre.heading) * speed * dt, insetOgre);
          walk = 1;
        }
        ogre.armTarget = 0;
        if (d < 3.1 && G.cd <= 0) {
          const reach = Math.min(d, 2.7);
          G.slam = { x: G.x + Math.cos(ogre.heading) * reach, z: G.z + Math.sin(ogre.heading) * reach };
          G.state = 'windup';
          G.t = 0;
          slamMarker.position.set(G.slam.x, FT + 0.03, G.slam.z);
          slamMarker.setEnabled(true);
          sfx.alarm();
        } else if (G.chargeCd <= 0 && d > 4.2 && d < 9) {
          const a = angleTo(G, tgt);
          G.dir = { x: Math.cos(a), z: Math.sin(a) };
          G.state = 'cwind';
          G.t = 0;
          ogre.heading = a;
          sfx.alarm();
        }
        break;
      }
      case 'windup': {
        ogre.armTarget = -2.7;
        ogre.armRate = 7;
        ogre.heading = turnToward(ogre.heading, angleTo(G, G.slam), 5 * dt);
        const pulse = 0.5 + 0.5 * Math.sin(G.t * 22);
        slamMarker.scaling.setAll(0.94 + pulse * 0.08);
        if (G.t >= 0.85) {
          G.state = 'slam';
          G.t = 0;
          ogre.armTarget = 0.9;
          ogre.armRate = 30;
          slamMarker.setEnabled(false);
          sfx.thud();
          onShake(0.5);
          fx.puff(G.slam.x, FT + 0.3, G.slam.z, 8);
          for (const e of [K, H]) {
            if (Math.hypot(e.x - G.slam.x, e.z - G.slam.z) < SLAM_R + e.r) (e === K ? hurtKid(SLAM_DMG, G.slam, 4.5) : stunHelper(G.slam));
          }
        }
        break;
      }
      case 'slam':
        if (G.t >= 0.3) {
          G.state = 'recover';
          G.t = 0;
          G.cd = 1.5 - rage * 0.6;
        }
        break;
      case 'recover':
        ogre.armRate = 3;
        ogre.armTarget = 0.5;
        if (G.t >= 0.85) {
          ogre.armRate = 8;
          G.state = 'chase';
          G.t = 0;
        }
        break;
      case 'cwind': {
        ogre.armTarget = -0.7;
        lane.setEnabled(true);
        lane.scaling.x = 8;
        lane.position.set(G.x + G.dir.x * 4, FT + 0.03, G.z + G.dir.z * 4);
        lane.rotation.y = -Math.atan2(G.dir.z, G.dir.x);
        if (G.t >= 0.9) {
          G.state = 'charge';
          G.t = 0;
          G.hit = false;
          lane.setEnabled(false);
          sfx.roar();
        }
        break;
      }
      case 'charge': {
        walk = 1;
        const step = 9.5 * dt;
        const ok = move(G, G.dir.x * step, G.dir.z * step, insetOgre);
        for (const e of [K, H]) {
          if (!G.hit && e === K && dist(G, e) < OGRE_R + e.r + 0.15) {
            G.hit = true;
            hurtKid(CHARGE_DMG, G, 6);
          } else if (e === H && dist(G, e) < OGRE_R + e.r + 0.15) stunHelper(G);
        }
        if (!ok) {
          G.state = 'stun';
          G.t = 0;
          G.hp = Math.max(0, G.hp - 6);
          hud.setEnemy(G.hp / OGRE_HP);
          ogre.hurtT = 0.25;
          onShake(0.6);
          sfx.thud();
          fx.puff(G.x, FT + 0.5, G.z, 8);
          G.chargeCd = rand(6, 8);
          if (G.hp <= 0) killOgre();
        } else if (G.t >= 0.6) {
          G.state = 'recover';
          G.t = 0;
          G.chargeCd = rand(6, 8);
        }
        break;
      }
      case 'stun':
        ogre.armTarget = 0.6;
        ogre.armRate = 3;
        if (G.t >= 1.5) {
          ogre.armRate = 8;
          G.state = 'chase';
          G.t = 0;
        }
        break;
      default:
        break;
    }
    ogre.walk += (walk - ogre.walk) * Math.min(1, dt * 8);
  }

  // ---- kid (player) ----
  function updateKid(dt, controllable) {
    K.inv = Math.max(0, K.inv - dt);
    K.cd = Math.max(0, K.cd - dt);
    let dx = 0;
    let dz = 0;
    if (controllable) {
      dx = input.ax;
      dz = input.az;
      if (!dx && !dz && input.tx !== null) {
        const px = input.tx - K.x;
        const pz = input.tz - K.z;
        const d = Math.hypot(px, pz);
        if (d > 0.35) {
          dx = px / d;
          dz = pz / d;
        }
      }
    }
    const l = Math.hypot(dx, dz);
    K.sw = Math.max(0, K.sw - dt);
    const swinging = K.sw > 0;
    const speed = KID_SPEED * (swinging ? 0.45 : 1);
    if (l > 0) {
      dx /= l;
      dz /= l;
      move(K, dx * speed * dt, dz * speed * dt, insetKid);
      if (!swinging) K.face = turnToward(K.face, Math.atan2(dz, dx), 14 * dt);
      kid.mode = 'walk';
    } else {
      kid.mode = 'idle';
    }
    if (K.kbx || K.kbz) {
      move(K, K.kbx * dt, K.kbz * dt, insetKid);
      const decay = Math.exp(-9 * dt);
      K.kbx *= decay;
      K.kbz *= decay;
    }

    if (controllable && input.attack && K.cd <= 0) {
      kid.swing();
      K.cd = SWING_CD;
      K.sw = SWING_TIME;
      K.hit = true;
      sfx.swing();
      if (G.hp > 0 && G.state !== 'hidden' && dist(K, G) < 6) K.face = angleTo(K, G);
    }
    if (K.hit && K.sw <= SWING_TIME * (1 - SWING_HIT_AT)) {
      K.hit = false;
      const d = dist(K, G);
      const inFront = Math.abs(wrap(angleTo(K, G) - K.face)) < 1.25;
      if (G.hp > 0 && d < OGRE_R + REACH && inFront) hitOgre(KID_DMG, K);
    }
    if (G.state !== 'hidden' && G.state !== 'dead') separate(K, G);
  }

  // ---- helper kid (autonomous) ----
  function updateHelper(dt, t) {
    H.t += dt;
    H.stun = Math.max(0, H.stun - dt);
    if (H.kbx || H.kbz) {
      move(H, H.kbx * dt, H.kbz * dt, insetKid);
      const decay = Math.exp(-9 * dt);
      H.kbx *= decay;
      H.kbz *= decay;
    }
    switch (H.state) {
      case 'wait':
        helper.faceToward(cx, cz);
        helper.idle();
        break;
      case 'run': {
        const entry = { x: cx + hx + 1.0, z: cz + 0.9 };
        if (helper.walkStep(entry.x, entry.z, 4.8, dt)) {
          H.state = 'hop';
          H.t = 0;
          H.hop = { from: helper.position.clone(), to: { x: cx - 10.2, y: FT, z: cz + 0.4 } };
        }
        H.x = helper.position.x;
        H.z = helper.position.z;
        break;
      }
      case 'hop': {
        const k = H.t / 0.9;
        helper.hop(H.hop.from, H.hop.to, k, 1.1, 1, 1);
        helper.faceToward(H.hop.to.x, H.hop.to.z);
        if (k >= 1) {
          H.state = 'fight';
          H.t = 0;
          H.x = H.hop.to.x;
          H.z = H.hop.to.z;
          helper.place(H.x, FT, H.z);
          helper.setCombat(true);
        }
        H.x = helperPos().x;
        H.z = helperPos().z;
        break;
      }
      case 'fight':
      case 'stunned': {
        if (H.stun > 0) {
          H.state = 'stunned';
          helper.mode = 'idle';
          break;
        }
        H.state = 'fight';
        if (G.hp <= 0 || G.state === 'hidden') break;
        // keep a throwing distance, drifting around the ogre, and step out of red warning areas
        H.orbit = Math.sin(t * 0.25) > 0 ? 1 : -1;
        const ang = angleTo(G, H) + H.orbit * 0.5 * dt * 2;
        let want = { x: G.x + Math.cos(ang) * 4.6, z: G.z + Math.sin(ang) * 4.6 };
        if (G.slam && slamMarker.isEnabled() && Math.hypot(H.x - G.slam.x, H.z - G.slam.z) < SLAM_R + 1.3) {
          const a = Math.atan2(H.z - G.slam.z, H.x - G.slam.x);
          want = { x: G.slam.x + Math.cos(a) * (SLAM_R + 2.2), z: G.slam.z + Math.sin(a) * (SLAM_R + 2.2) };
        }
        if (G.state === 'cwind' && G.dir) {
          const rel = { x: H.x - G.x, z: H.z - G.z };
          const along = rel.x * G.dir.x + rel.z * G.dir.z;
          const side = rel.x * -G.dir.z + rel.z * G.dir.x;
          if (along > 0 && Math.abs(side) < 1.7) want = { x: H.x + -G.dir.z * Math.sign(side || 1) * 2.4, z: H.z + G.dir.x * Math.sign(side || 1) * 2.4 };
        }
        const dx = want.x - H.x;
        const dz = want.z - H.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          move(H, (dx / d) * HELPER_SPEED * dt, (dz / d) * HELPER_SPEED * dt, insetKid);
          helper.mode = 'walk';
        } else helper.mode = 'idle';
        helper.heading = turnToward(helper.heading, angleTo(H, G), 8 * dt);
        H.cd -= dt;
        if (H.throwIn >= 0) {
          H.throwIn -= dt;
          if (H.throwIn < 0 && G.hp > 0) throwStone();
        }
        if (H.cd <= 0 && dist(H, G) < 7) {
          H.cd = rand(1.3, 1.9);
          helper.swing();
          H.throwIn = 0.13;
          sfx.swing();
        }
        if (G.state !== 'hidden' && G.state !== 'dead') separate(H, G);
        separate(H, K);
        break;
      }
      default:
        break;
    }
    if (H.state === 'fight' || H.state === 'stunned') helper.place(H.x, FT, H.z);
  }
  const helperPos = () => helper.position;

  // ---- lifecycle ----
  function stage() {
    phase = 'idle';
    cinematic = false;
    clock = 0;
    Object.assign(K, { x: kidSpot.x, z: kidSpot.z, hp: KID_HP, face: Math.PI / 2, inv: 0, cd: 0, sw: 0, hit: false, kbx: 0, kbz: 0 });
    Object.assign(H, { x: helperSpot.x, z: helperSpot.z, state: 'wait', t: 0, cd: 1, stun: 0, throwIn: -1, kbx: 0, kbz: 0 });
    Object.assign(G, { hp: OGRE_HP, state: 'hidden', t: 0, cd: 1.5, chargeCd: 5, target: null, kbx: 0, kbz: 0, slam: null, dir: null, hit: false, vuln: 1 });
    input.ax = input.az = 0;
    input.attack = false;
    input.tx = input.tz = null;
    mill.door.open(0);
    ogre.reset();
    ogre.setEnabled(false);
    slamMarker.setEnabled(false);
    lane.setEnabled(false);
    for (const s of stones.splice(0)) s.mesh.dispose();

    kid.root.parent = null;
    kid.reset();
    kid.setScale(1);
    kid.place(K.x, 0, K.z);
    kid.setHeading(Math.PI / 2);
    kid.idle();
    helper.root.parent = null;
    helper.reset();
    helper.setScale(1);
    helper.place(H.x, 0, H.z);
    helper.faceToward(cx, cz);
    helper.idle();
  }

  function start() {
    if (phase !== 'idle') return;
    phase = 'intro';
    clock = 0;
    kid.setCombat(true);
    hud.setEnemy(1);
    hud.setAlly(1);
    hud.show(true);
    sfx.hatch();
    onMessage('The windmill door creaks open...', 2200);
  }

  function reset() {
    phase = 'idle';
    cinematic = false;
    hud.show(false);
    ogre.setEnabled(false);
    slamMarker.setEnabled(false);
    lane.setEnabled(false);
    for (const s of stones.splice(0)) s.mesh.dispose();
    kid.setCombat(false);
    kid.setHug(false);
    helper.setCombat(false);
    helper.setHug(false);
  }

  function update(dt, t) {
    if (phase === 'idle') {
      helper.faceToward(cx, cz);
      return;
    }
    clock += dt;
    ogre.update(dt, t);
    updateStones(dt);

    if (phase === 'intro') {
      const doorK = clamp((clock - 0.2) / 1.5, 0, 1);
      mill.door.open(doorK);
      // the kid hops over the wall into the fairway
      const kk = (clock - 0.3) / 0.9;
      const inside = { x: cx - 3.0, y: FT, z: cz - 3.0 };
      if (kk < 1) {
        if (kk > 0) kid.hop({ x: kidSpot.x, y: 0, z: kidSpot.z }, inside, kk, 1.1, 1, 1);
        kid.faceToward(W.x, W.z);
      } else if (K.x === kidSpot.x && K.z === kidSpot.z) {
        K.x = inside.x;
        K.z = inside.z;
        kid.place(K.x, FT, K.z);
        K.face = angleTo(K, W);
        kid.setHeading(K.face);
      }
      if (clock >= 1.8 && G.state === 'hidden') {
        const d = mill.door.pos;
        G.state = 'emerge';
        G.t = 0;
        G.from = { x: d.x, z: d.z + 1.15 };
        G.to = { x: d.x, z: d.z - 1.9 };
        G.x = G.from.x;
        G.z = G.from.z;
        ogre.heading = -Math.PI / 2;
        ogre.reset();
        ogre.setEnabled(true);
        sfx.thud();
        onShake(0.25);
      }
      if (G.state !== 'hidden') updateOgre(dt, t);
      if (clock >= 3.2 && H.state === 'wait') H.state = 'run';
      if (clock > 1.4 && K.x !== kidSpot.x) updateKid(dt, G.state === 'chase' || G.state === 'roar' || G.state === 'emerge');
      updateHelper(dt, t);
      if (G.state === 'chase') {
        phase = 'fight';
        onMessage('Beat the ogre!', 2000);
      }
    } else if (phase === 'fight') {
      updateOgre(dt, t);
      updateKid(dt, true);
      updateHelper(dt, t);
    } else if (phase === 'dying') {
      endT += dt;
      ogre.dead = clamp(endT / 1.3, 0, 1);
      ogre.walk = 0;
      ogre.roar = 0;
      ogre.armTarget = 0;
      updateKid(dt, false);
      updateHelper(dt, t);
      if (endT > 2.2) {
        ogre.setEnabled(false);
        fx.puff(G.x, FT + 0.6, G.z, 8);
        hud.show(false);
        // the cinematic starts: both kids walk over to the podium in front of the mill
        phase = 'gather';
        cineT = 0;
        H.state = 'cine';
        kid.setCombat(false);
        helper.setCombat(false);
        aim(podium.x, FT + 0.95, podium.z, Math.PI, 0.24, 4.4);
        followShot(0, true);
        cinematic = true;
        onCinema();
        onMessage('Hector and Tate beat the ogre!', 2200);
      }
    } else if (phase === 'gather') {
      cineT += dt;
      const kIn = walkTo(kid, spotK, dt);
      const hIn = walkTo(helper, spotH, dt);
      if ((kIn && hIn) || cineT > 4) {
        kid.place(spotK.x, FT, spotK.z);
        helper.place(spotH.x, FT, spotH.z);
        kid.idle();
        helper.idle();
        phase = 'cheer';
        cineT = 0;
      }
    } else if (phase === 'cheer') {
      // facing the camera, names on their shirts in full view; the camera pushes in slowly
      cineT += dt;
      turnKids(-Math.PI / 2, dt);
      if (cineT > 0.35 && cineT - dt <= 0.35) {
        kid.setPose('cheer');
        helper.setPose('cheer');
        sfx.hug();
        fx.confetti(podium.x, FT + 2.6, podium.z);
      }
      aim(podium.x, FT + 1.1, podium.z, Math.PI + Math.sin(cineT * 0.6) * 0.12, 0.2, 4.2 - cineT * 0.12);
      if (cineT > CHEER_T) {
        kid.setPose('point');
        helper.setPose('point');
        phase = 'look';
        cineT = 0;
      }
    } else if (phase === 'look') {
      // they turn round and point at the door the ogre came out of: the names on their backs
      cineT += dt;
      turnKids(Math.PI / 2, dt);
      aim(podium.x, FT + 1.35, podium.z + 0.6, Math.PI, 0.3, 4.6);
      if (cineT > LOOK_T) {
        kid.setPose(null);
        helper.setPose(null);
        phase = 'hug';
        hugT = 0;
        H.state = 'hugWalk';
        K.x = kid.position.x;
        K.z = kid.position.z;
        H.x = helper.position.x;
        H.z = helper.position.z;
      }
    } else if (phase === 'hug') {
      hugT += dt;
      aim(podium.x, FT + 1.05, podium.z, Math.PI - 0.35 + hugT * 0.1, 0.22, 3.6);
      const mid = { x: (K.x + H.x) / 2, z: (K.z + H.z) / 2 };
      const gap = dist(K, H);
      if (H.state === 'hugWalk') {
        const sp = 2.6;
        const tk = { x: mid.x + ((K.x - H.x) / (gap || 1)) * (HUG_GAP / 2), z: mid.z + ((K.z - H.z) / (gap || 1)) * (HUG_GAP / 2) };
        const th = { x: mid.x - ((K.x - H.x) / (gap || 1)) * (HUG_GAP / 2), z: mid.z - ((K.z - H.z) / (gap || 1)) * (HUG_GAP / 2) };
        kid.mode = 'walk';
        helper.mode = 'walk';
        kid.walkStep(tk.x, tk.z, sp, dt);
        helper.walkStep(th.x, th.z, sp, dt);
        K.x = kid.position.x;
        K.z = kid.position.z;
        H.x = helper.position.x;
        H.z = helper.position.z;
        if (dist(K, H) < HUG_GAP + 0.06) {
          H.state = 'hugging';
          hugT = 0;
          kid.faceToward(H.x, H.z);
          helper.faceToward(K.x, K.z);
          kid.setHug(true, HUG_REACH_K);
          helper.setHug(true, HUG_REACH_H);
          sfx.hug();
          fx.confetti(mid.x, FT + 1.4, mid.z);
        }
      } else {
        if (hugT > HUG_T) {
          phase = 'done';
          onEnd(true);
        }
      }
      helper.place(helper.position.x, FT, helper.position.z);
      kid.place(kid.position.x, FT, kid.position.z);
    } else if (phase === 'lost') {
      endT += dt;
      K.down = clamp(endT / 0.8, 0, 1);
      kid.setDown(K.down);
      updateOgre(dt, t);
      updateHelper(dt, t);
      if (endT > 2.4) {
        phase = 'done';
        onEnd(false);
      }
    }

    if (cinematic) followShot(dt);

    // put the characters where the simulation says they are
    if (phase === 'fight' || phase === 'dying' || phase === 'lost' || (phase === 'intro' && clock > 1.3 && K.x !== kidSpot.x)) {
      kid.place(K.x, FT, K.z);
      kid.setHeading(K.face);
    }
    if (G.state !== 'hidden') {
      ogre.root.position.set(G.x, FT, G.z);
    }
    if (phase === 'lost' || phase === 'fight' || phase === 'intro') hud.setAlly(K.hp / KID_HP);
  }

  return {
    input,
    casters: [...kid.meshes, ...helper.meshes, ...ogre.meshes],
    get phase() {
      return phase;
    },
    stage,
    start,
    reset,
    update,
    shot,
    debug: { K, H, G },
    // debugging aid: knocks the ogre down at once so the win flow can be tried
    winNow() {
      if (phase === 'fight') hitOgre(1e6, K);
    },
  };
}

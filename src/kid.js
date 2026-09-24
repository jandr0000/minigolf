import { Mesh, MeshBuilder, TransformNode, Color3, StandardMaterial, DynamicTexture } from '@babylonjs/core';
import { flatMaterial } from './materials.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, k) => a + (b - a) * k;
export const KID_SEATED_SCALE = 0.34;
export const SWING_HIT_AT = 0.45; // progress (0..1) at which a swing connects

const easeOut = (k) => 1 - Math.pow(1 - k, 2);

// White block letters with a dark outline on a transparent canvas, for printing a name on a shirt.
function nameMaterial(scene, id, text) {
  const W = 512;
  const H = 200;
  const tex = new DynamicTexture('name_' + id, { width: W, height: H }, scene, true);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, W, H);
  let size = 150;
  ctx.font = `bold ${size}px "Trebuchet MS", "Arial Black", sans-serif`;
  const w = ctx.measureText(text).width;
  if (w > W * 0.72) {
    size = Math.floor((size * W * 0.72) / w);
    ctx.font = `bold ${size}px "Trebuchet MS", "Arial Black", sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(20,20,30,0.75)';
  ctx.strokeText(text, W / 2, H / 2 + 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, W / 2, H / 2 + 6);
  tex.update();
  tex.hasAlpha = true;
  // the decal is a cylinder arc whose u runs the opposite way to the reading direction
  tex.uScale = -1;
  tex.uOffset = 1;
  const mat = new StandardMaterial('nameMat_' + id, scene);
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.emissiveColor = new Color3(0.55, 0.55, 0.55);
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = true;
  return mat;
}

// A kid with a backpack and a golf club for fighting, with his name printed on the shirt (`label`). Faces +x
// locally; `heading` is the world angle of that direction (atan2(dz, dx)).
// Modes: 'idle' (waving), 'walk', 'seated' (riding in the helicopter, only the head shows).
// Combat: setCombat(true) shows the club; swing(), hurt(), setHug(), setDown() drive the poses. setPose('cheer')
// jumps with both arms up, setPose('point') points ahead, setPose(null) goes back to the mode's animation.
// `height` scales the kid up (a taller kid is also a little broader).
export function createKid(scene, opts = {}) {
  const { name = 'kid', label = '', hair = '#5b3a22', shirt = '#d7263d', shorts = '#1f4e9a', weapon = true, height = 1 } = opts;
  const mat = (n, hex, spec = 0) => flatMaterial(scene, `${name}_${n}`, hex, { spec });
  const M = {
    skin: mat('skin', '#f0c39a', 0.05),
    shirt: mat('shirt', shirt, 0.05),
    shorts: mat('shorts', shorts),
    shoe: mat('shoe', '#f4f4f0', 0.1),
    dark: mat('dark', '#1a1412'),
    hair: mat('hair', hair, 0.08),
    pack: mat('pack', '#ff8a1a'),
    steel: mat('steel', '#c9ced3', 0.5),
    grip: mat('grip', '#2a2f36'),
  };

  const root = new TransformNode(name, scene);
  const grow = new TransformNode(name + 'Grow', scene);
  grow.parent = root;
  const broad = 1 + (height - 1) * 0.45;
  grow.scaling.set(broad, height, broad);
  const body = new TransformNode(name + 'Body', scene);
  body.parent = grow;
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
  const sphere = (d, seg = 10) => MeshBuilder.CreateSphere('k', { diameter: d, segments: seg }, scene);
  const cyl = (h, d, tess = 10) => MeshBuilder.CreateCylinder('k', { height: h, diameter: d, tessellation: tess }, scene);
  const box = (w, h, dd) => MeshBuilder.CreateBox('k', { width: w, height: h, depth: dd }, scene);

  // torso, shorts, head, hair, face, backpack
  add(MeshBuilder.CreateCapsule('k', { radius: 0.2, height: 0.62, tessellation: 12, subdivisions: 2 }, scene), M.shirt, body, [0, 0.8, 0]);
  add(cyl(0.2, 0.42), M.shorts, body, [0, 0.52, 0]);
  add(sphere(0.44, 14), M.skin, body, [0, 1.26, 0]);
  add(sphere(0.47, 12), M.hair, body, [-0.03, 1.36, 0], [1, 0.62, 1.02]);
  add(sphere(0.3, 10), M.hair, body, [-0.16, 1.22, 0], [0.75, 1, 1.15]);
  add(sphere(0.3, 10), M.hair, body, [0.13, 1.41, 0], [0.6, 0.5, 1.15]);
  for (const s of [-1, 1]) add(sphere(0.06, 8), M.dark, body, [0.19, 1.26, s * 0.1]);
  add(sphere(0.07, 8), M.skin, body, [0.22, 1.2, 0]);
  add(box(0.13, 0.28, 0.3), M.pack, body, [-0.21, 0.64, 0]);

  // the name on the shirt: a curved decal across the back (just above the backpack) and a smaller one on the chest
  if (label) {
    const nm = nameMaterial(scene, name, label.toUpperCase());
    const decal = (arc, h, y, rotY) => {
      const d = MeshBuilder.CreateCylinder('kname', { height: h, diameter: 0.418, arc, tessellation: 28, cap: Mesh.NO_CAP }, scene);
      add(d, nm, body, [0, y, 0], null, [0, rotY, 0]);
      return d;
    };
    // without NAME_TURN the text lands about 27 degrees off the middle of the back and of the chest; the turn was
    // measured on screen so both names read centred
    const NAME_TURN = -0.15 * Math.PI;
    decal(0.34, 0.17, 0.84, 0.34 * Math.PI + Math.PI / 2 + NAME_TURN);
    decal(0.3, 0.13, 0.94, 0.3 * Math.PI + Math.PI * 1.5 + NAME_TURN);
  }

  // legs: pivot at the hip so they can swing
  const legs = [-1, 1].map((s) => {
    const pivot = new TransformNode(name + 'Leg', scene);
    pivot.parent = body;
    pivot.position.set(0, 0.46, s * 0.1);
    add(cyl(0.4, 0.13), M.skin, pivot, [0, -0.2, 0]);
    add(sphere(0.2, 8), M.shoe, pivot, [0.04, -0.42, 0], [1.3, 0.6, 0.9]);
    return pivot;
  });

  // arms: +z side waves / swings the club
  const arm = (s) => {
    const pivot = new TransformNode(name + 'Arm', scene);
    pivot.parent = body;
    pivot.position.set(0, 0.98, s * 0.24);
    add(cyl(0.2, 0.11), M.shirt, pivot, [0, -0.1, 0]);
    add(cyl(0.22, 0.09), M.skin, pivot, [0, -0.3, 0]);
    add(sphere(0.1, 8), M.skin, pivot, [0, -0.42, 0]);
    return pivot;
  };
  const waveArm = arm(1);
  const holdArm = arm(-1);
  holdArm.rotation.x = 0.1;

  // golf club in the swinging hand
  const club = new TransformNode(name + 'Club', scene);
  club.parent = waveArm;
  club.position.set(0.02, -0.42, 0);
  add(cyl(0.7, 0.035, 6), M.steel, club, [0, -0.18, 0]);
  add(cyl(0.22, 0.05, 6), M.grip, club, [0, 0.1, 0]);
  add(box(0.26, 0.08, 0.08), M.steel, club, [0.1, -0.54, 0]);
  club.setEnabled(false);

  let combat = false;
  let hug = false;
  let hugReach = 1.5;
  let pose = null;
  const beat = name.length * 0.9; // so two kids cheering don't jump in step

  const kid = {
    root,
    meshes,
    mode: 'idle',
    heading: -Math.PI / 2,
    phase: 0,
    seated: false,
    swingP: 0,
    hurtT: 0,
    down: 0,
    get position() {
      return root.position;
    },
    place(x, y, z) {
      root.position.set(x, y, z);
    },
    setHeading(h) {
      kid.heading = h;
    },
    faceCamera() {
      kid.heading = -Math.PI / 2;
    },
    faceToward(x, z) {
      kid.heading = Math.atan2(z - root.position.z, x - root.position.x);
    },
    // Moves toward (tx, tz) on the ground; returns true once there.
    walkStep(tx, tz, speed, dt) {
      const dx = tx - root.position.x;
      const dz = tz - root.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        kid.mode = 'idle';
        return true;
      }
      kid.heading += Math.max(-9 * dt, Math.min(9 * dt, wrap(Math.atan2(dz, dx) - kid.heading)));
      const step = Math.min(d, speed * dt);
      root.position.x += (dx / d) * step;
      root.position.z += (dz / d) * step;
      kid.mode = 'walk';
      return false;
    },
    idle() {
      kid.mode = 'idle';
    },
    // Arc from one world position to another while scaling.
    hop(from, to, k, height = 0.9, s0 = 1, s1 = KID_SEATED_SCALE) {
      const e = Math.min(1, Math.max(0, k));
      root.position.set(lerp(from.x, to.x, e), lerp(from.y, to.y, e) + Math.sin(e * Math.PI) * height, lerp(from.z, to.z, e));
      root.scaling.setAll(lerp(s0, s1, e));
    },
    // Rides in the helicopter cabin: parented and small.
    sit(cabin) {
      root.parent = cabin;
      root.position.set(0, 0.02, 0);
      root.rotation.set(0, 0, 0);
      root.scaling.setAll(KID_SEATED_SCALE);
      kid.mode = 'seated';
      kid.seated = true;
    },
    // Steps out at a world position (scaled down; the caller hops him back to full size).
    unseat(x, y, z) {
      root.parent = null;
      root.position.set(x, y, z);
      root.scaling.setAll(KID_SEATED_SCALE);
      kid.mode = 'idle';
      kid.seated = false;
    },
    setScale(s) {
      root.scaling.setAll(s);
    },
    // Back to the plain waving pose (after a fight).
    reset() {
      combat = false;
      hug = false;
      pose = null;
      kid.swingP = 0;
      kid.hurtT = 0;
      kid.down = 0;
      club.setEnabled(false);
      holdArm.rotation.x = 0.1;
      holdArm.rotation.z = 0;
      waveArm.rotation.z = 0;
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
    },

    // ---- combat ----
    setCombat(on) {
      combat = on;
      hug = false;
      pose = null;
      club.setEnabled(on && weapon);
    },
    // Starts a club swing; false if one is already under way.
    swing() {
      if (kid.swingP > 0) return false;
      kid.swingP = 0.001;
      return true;
    },
    hurt() {
      kid.hurtT = 0.4;
    },
    // `reach` is the arm angle: 1.5 holds them level, less reaches down (a taller kid hugging a shorter one)
    setHug(on, reach = 1.5) {
      hug = on;
      pose = null;
      hugReach = reach;
      club.setEnabled(false);
    },
    // 'cheer': jumps with both arms (and the club, if he has one) in the air; 'point': points ahead; null: none.
    setPose(p) {
      pose = p;
      hug = false;
      club.setEnabled(p === 'cheer' && weapon);
    },
    // 0..1: falls over forwards, worn out
    setDown(k) {
      kid.down = k;
    },

    update(dt, t) {
      if (kid.seated) {
        body.rotation.z = Math.sin(t * 2) * 0.03;
        waveArm.rotation.x = -2.4 + Math.sin(t * 9) * 0.4;
        return;
      }
      root.rotation.y = -kid.heading;

      // hurt flash
      kid.hurtT = Math.max(0, kid.hurtT - dt);
      const f = kid.hurtT / 0.4;
      M.shirt.emissiveColor = new Color3(0.8 * f, 0.05 * f, 0.05 * f);
      M.shorts.emissiveColor = new Color3(0.6 * f, 0.05 * f, 0.05 * f);

      if (kid.swingP > 0) {
        kid.swingP += dt / 0.34;
        if (kid.swingP >= 1) kid.swingP = 0;
      }

      // only the hug turns the arms inward
      waveArm.rotation.y = 0;
      holdArm.rotation.y = 0;

      if (pose === 'cheer') {
        const k = t * 7 + beat;
        waveArm.rotation.x = -2.7 + Math.sin(k) * 0.25;
        holdArm.rotation.x = 2.7 - Math.sin(k + 1.2) * 0.25;
        waveArm.rotation.z = 0;
        holdArm.rotation.z = 0;
        body.position.y = Math.abs(Math.sin(t * 4.5 + beat)) * 0.22;
        body.rotation.set(0, 0, 0);
        for (const l of legs) l.rotation.z += (0 - l.rotation.z) * Math.min(1, dt * 10);
        return;
      }

      if (pose === 'point') {
        waveArm.rotation.x = 0;
        waveArm.rotation.z = 2.25 + Math.sin(t * 3 + beat) * 0.06;
        holdArm.rotation.x = 0.1;
        holdArm.rotation.z = 0;
        body.position.y = Math.abs(Math.sin(t * 3 + beat)) * 0.02;
        body.rotation.set(0, 0, 0);
        for (const l of legs) l.rotation.z += (0 - l.rotation.z) * Math.min(1, dt * 10);
        return;
      }

      if (hug) {
        waveArm.rotation.x = 0;
        holdArm.rotation.x = 0;
        waveArm.rotation.z = hugReach + Math.sin(t * 6) * 0.05;
        holdArm.rotation.z = hugReach - Math.sin(t * 6) * 0.05;
        waveArm.rotation.y = 0.4;
        holdArm.rotation.y = -0.4;
        body.position.y = Math.abs(Math.sin(t * 5)) * 0.05;
        body.rotation.z = Math.sin(t * 3) * 0.04;
        for (const l of legs) l.rotation.z += (0 - l.rotation.z) * Math.min(1, dt * 10);
        return;
      }

      if (kid.mode === 'walk') {
        kid.phase += dt * 9;
        const s = Math.sin(kid.phase);
        legs[0].rotation.z = s * 0.7;
        legs[1].rotation.z = -s * 0.7;
        if (!combat) waveArm.rotation.x = s * 0.6;
        body.position.y = Math.abs(Math.sin(kid.phase)) * 0.035;
        body.rotation.z = 0;
      } else {
        legs[0].rotation.z += (0 - legs[0].rotation.z) * Math.min(1, dt * 10);
        legs[1].rotation.z += (0 - legs[1].rotation.z) * Math.min(1, dt * 10);
        if (!combat) waveArm.rotation.x = -2.4 + Math.sin(t * 9) * 0.4;
        body.position.y = Math.abs(Math.sin(t * 3)) * 0.03;
        body.rotation.z = Math.sin(t * 1.5) * 0.03;
      }

      if (combat) {
        waveArm.rotation.x = 0;
        holdArm.rotation.z = kid.mode === 'walk' ? -Math.sin(kid.phase) * 0.5 : 0;
        const p = kid.swingP;
        let a = -0.5;
        if (p > 0) {
          if (p < 0.25) a = lerp(-0.5, -1.9, easeOut(p / 0.25));
          else if (p < 0.6) a = lerp(-1.9, 1.5, easeOut((p - 0.25) / 0.35));
          else a = lerp(1.5, -0.5, (p - 0.6) / 0.4);
          body.rotation.y = Math.sin(Math.min(1, p) * Math.PI) * 0.35;
        } else {
          body.rotation.y = 0;
        }
        waveArm.rotation.z = a;
        body.rotation.z = -kid.down * 1.4 + (kid.mode === 'walk' ? -0.08 : 0);
        if (kid.down > 0) body.position.y = -kid.down * 0.35;
      }
    },
  };
  return kid;
}

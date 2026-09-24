import { MeshBuilder, Mesh, StandardMaterial, DynamicTexture, TransformNode, ParticleSystem, Color3, Color4, Vector3 } from '@babylonjs/core';
import { flatMaterial, flagMaterial, softDotTexture } from './materials.js';

const PALETTES = {
  enemy: { hull: '#2f363e', under: '#1b2025', dark: '#15181c', metal: '#7a828a', accent: '#d7263d', trim: '#f0a500', blade: '#0f1215' },
  ally: { hull: '#eeece6', under: '#b9bec4', dark: '#33393f', metal: '#8f979e', accent: '#c60b1e', trim: '#ffc400', blade: '#23262b' },
};

// Fuselage skin painted on a stretched sphere: `v` is height, so horizontal bands run along the whole body.
function skinMaterial(scene, livery, p) {
  const W = 512;
  const H = 256;
  const tex = new DynamicTexture('heliSkin_' + livery, { width: W, height: H }, scene, true);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.hull);
  g.addColorStop(0.62, p.hull);
  g.addColorStop(1, p.under);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (livery === 'ally') {
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, H * 0.36, W, H * 0.28);
    ctx.fillStyle = p.trim;
    ctx.fillRect(0, H * 0.43, W, H * 0.14);
  } else {
    ctx.fillStyle = p.accent;
    ctx.fillRect(0, H * 0.47, W, H * 0.045);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, H * 0.53, W, H * 0.012);
  }

  // panel lines, access hatches and rivets
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 16; i++) {
    const x = (i / 16) * W + (i % 3) * 3;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.12);
    ctx.lineTo(x, H * 0.88);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, H * 0.3);
  ctx.lineTo(W, H * 0.3);
  ctx.moveTo(0, H * 0.72);
  ctx.lineTo(W, H * 0.72);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (const u of [0.22, 0.28, 0.72, 0.79]) ctx.fillRect(u * W, H * 0.16, 34, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < 90; i++) ctx.fillRect(((i * 37) % W) + 2, H * (0.2 + ((i * 13) % 9) * 0.07), 2, 2);
  tex.update();

  const m = new StandardMaterial('heliSkinMat_' + livery, scene);
  m.diffuseTexture = tex;
  m.specularColor = new Color3(0.32, 0.32, 0.32);
  m.specularPower = 40;
  return m;
}

// A gunship: tandem canopy, stub wings with rocket pods, chin gun, four-blade rotor and tail rotor.
// Local frame: +x is the nose, +y up. All rigid parts are merged per material to keep draw calls low.
export function createHelicopter(scene, { livery = 'enemy', scale = 1 } = {}) {
  const p = PALETTES[livery];
  const ally = livery === 'ally';
  const mat = (name, hex, o) => flatMaterial(scene, `heli_${livery}_${name}`, hex, o);
  const M = {
    skin: skinMaterial(scene, livery, p),
    hull: mat('hull', p.hull, { spec: 0.3 }),
    under: mat('under', p.under, { spec: 0.2 }),
    dark: mat('dark', p.dark, { spec: 0.25 }),
    metal: mat('metal', p.metal, { spec: 0.55 }),
    accent: mat('accent', p.accent, { spec: 0.35 }),
    trim: mat('trim', p.trim, { spec: 0.3 }),
    blade: mat('blade', p.blade, { spec: 0.3, cull: false }),
    glass: mat('glass', '#7fb6c8', { spec: 0.95, alpha: 0.4, cull: false, emissive: '#0a1a22' }),
    blur: mat('blur', '#e8f2f6', { alpha: 0.13, cull: false, emissive: '#dfeef4' }),
  };
  const lamp = (name, hex) => {
    const m = mat(name, hex, { emissive: hex });
    m.disableLighting = true;
    return m;
  };
  M.beacon = lamp('beacon', '#ff2a2a');
  M.navL = lamp('navL', '#ff3b3b');
  M.navR = lamp('navR', '#3bff6a');
  M.search = lamp('search', '#fff3c4');
  M.flash = lamp('flash', '#ffe08a');

  const root = new TransformNode('heli_' + livery, scene);
  root.scaling.setAll(scale);
  const flip = new TransformNode('heliFlip', scene);
  flip.parent = root;
  const bank = new TransformNode('heliBank', scene);
  bank.parent = flip;
  const tilt = new TransformNode('heliTilt', scene);
  tilt.parent = bank;

  const rotorNode = new TransformNode('heliRotor', scene);
  rotorNode.parent = tilt;
  rotorNode.position.set(-0.05, 0.74, 0);
  const tailNode = new TransformNode('heliTailRotor', scene);
  tailNode.parent = tilt;
  tailNode.position.set(-3.14, 0.42, 0.13);

  const groups = { hull: new Map(), rotor: new Map(), tail: new Map() };
  const add = (group, material, mesh, pos, rot, scl) => {
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    if (scl) mesh.scaling.set(...scl);
    const list = groups[group].get(material) ?? [];
    list.push(mesh);
    groups[group].set(material, list);
    return mesh;
  };
  const sphere = (d = 1, seg = 14) => MeshBuilder.CreateSphere('h', { diameter: d, segments: seg }, scene);
  const box = (w, h, d) => MeshBuilder.CreateBox('h', { width: w, height: h, depth: d }, scene);
  const cyl = (h, d, dt = d, tess = 14) => MeshBuilder.CreateCylinder('h', { height: h, diameterBottom: d, diameterTop: dt, tessellation: tess }, scene);
  const torus = (d, t) => MeshBuilder.CreateTorus('h', { diameter: d, thickness: t, tessellation: 24 }, scene);
  const disc = (r) => MeshBuilder.CreateDisc('h', { radius: r, tessellation: 24 }, scene);
  const PI = Math.PI;
  const H = 'hull';

  // --- fuselage ---
  add(H, M.skin, sphere(1, 24), [0.05, 0, 0], null, [2.5, 0.68, 0.56]);
  add(H, M.hull, sphere(1, 16), [1.02, -0.06, 0], null, [0.9, 0.5, 0.46]);
  add(H, M.under, sphere(1, 14), [0.1, -0.24, 0], null, [1.7, 0.3, 0.44]);
  add(H, M.under, sphere(1, 14), [-0.48, 0.37, 0], null, [1.3, 0.36, 0.42]);
  add(H, M.hull, sphere(1, 12), [-1.15, 0.08, 0], null, [0.95, 0.4, 0.36]);

  // canopy interior: seats and helmets show through the glass
  add(H, M.dark, box(0.34, 0.26, 0.3), [0.55, 0.12, 0], null);
  add(H, M.dark, box(0.34, 0.3, 0.3), [0.02, 0.26, 0], null);
  add(H, M.dark, sphere(0.2, 10), [0.68, 0.26, 0]);
  add(H, M.dark, sphere(0.2, 10), [0.14, 0.42, 0]);
  add(H, M.accent, box(0.5, 0.03, 0.02), [0.7, 0.4, 0.15], [0, 0, -0.35]);
  add(H, M.accent, box(0.5, 0.03, 0.02), [0.7, 0.4, -0.15], [0, 0, -0.35]);

  // engine: intakes, exhaust
  add(H, M.dark, sphere(1, 10), [0.0, 0.43, 0.25], null, [0.36, 0.24, 0.17]);
  add(H, M.dark, sphere(1, 10), [0.0, 0.43, -0.25], null, [0.36, 0.24, 0.17]);
  add(H, M.dark, cyl(0.34, 0.3, 0.24), [-1.22, 0.38, 0], [0, 0, PI / 2]);
  add(H, M.metal, torus(0.3, 0.035), [-1.4, 0.38, 0], [0, 0, PI / 2]);

  // mast and rotor head
  add(H, M.metal, cyl(0.34, 0.11), [-0.05, 0.56, 0]);

  // tail boom, fin, stabiliser
  add(H, M.hull, cyl(2.05, 0.34, 0.14, 16), [-2.17, 0.12, 0], [0, 0, PI / 2]);
  add(H, M.hull, sphere(0.15, 8), [-3.2, 0.12, 0]);
  add(H, M.hull, box(0.58, 0.78, 0.05), [-3.0, 0.5, 0], [0, 0, 0.3]);
  add(H, M.under, box(0.44, 0.04, 1.15), [-2.9, 0.16, 0]);
  add(H, M.accent, torus(0.3, 0.032), [-1.9, 0.12, 0], [0, 0, PI / 2]);
  add(H, ally ? M.trim : M.accent, torus(0.27, 0.032), [-2.14, 0.12, 0], [0, 0, PI / 2]);
  add(H, M.accent, torus(0.24, 0.032), [-2.38, 0.12, 0], [0, 0, PI / 2]);
  add(H, M.dark, box(0.3, 0.06, 0.07), [-3.09, 0.9, 0], [0, 0, 0.3]);

  // stub wings, rocket pods, missiles
  add(H, M.under, box(0.55, 0.045, 1.72), [0.05, -0.04, 0]);
  for (const s of [-1, 1]) {
    add(H, M.dark, cyl(0.72, 0.17), [0.15, -0.17, s * 0.5], [0, 0, PI / 2]);
    add(H, M.accent, cyl(0.16, 0.17, 0.01), [0.59, -0.17, s * 0.5], [0, 0, -PI / 2]);
    add(H, M.metal, cyl(0.8, 0.075), [0.1, -0.13, s * 0.82], [0, 0, PI / 2]);
    add(H, ally ? M.trim : M.accent, cyl(0.2, 0.075, 0.01), [0.6, -0.13, s * 0.82], [0, 0, -PI / 2]);
    add(H, M.dark, box(0.14, 0.14, 0.02), [-0.2, -0.13, s * 0.82]);
    add(H, M.dark, box(0.2, 0.12, 0.05), [0.1, -0.08, s * 0.5]);
    // wing-tip lights housing
    add(H, M.dark, sphere(0.1, 8), [0.05, -0.04, s * 0.88]);
  }

  // chin gun
  add(H, M.dark, sphere(0.3, 12), [1.26, -0.3, 0]);
  add(H, M.metal, cyl(0.6, 0.05), [1.6, -0.31, 0], [0, 0, PI / 2]);
  add(H, M.dark, cyl(0.1, 0.09), [1.93, -0.31, 0], [0, 0, PI / 2]);

  // landing skids
  for (const s of [-1, 1]) {
    add(H, M.metal, cyl(1.7, 0.06), [-0.05, -0.66, s * 0.46], [0, 0, PI / 2]);
    add(H, M.metal, cyl(0.28, 0.06), [0.9, -0.6, s * 0.46], [0, 0, -0.97]);
    for (const x of [0.5, -0.45]) add(H, M.metal, cyl(0.46, 0.05), [x, -0.45, s * 0.33], [-s * 0.6, 0, 0]);
  }
  for (const x of [0.5, -0.45]) add(H, M.metal, cyl(0.9, 0.045), [x, -0.64, 0], [PI / 2, 0, 0]);

  // fin emblem
  if (ally) {
    for (const s of [-1, 1]) {
      const flag = MeshBuilder.CreatePlane('heliFlag', { width: 0.44, height: 0.29 }, scene);
      flag.material = flagMaterial(scene, '', 'spain');
      flag.parent = tilt;
      flag.position.set(-3.0, 0.5, s * 0.034);
      flag.rotation.set(0, s > 0 ? PI : 0, 0.3);
    }
  } else {
    for (const s of [-1, 1]) {
      add(H, M.accent, disc(0.18), [-3.0, 0.48, s * 0.031], [0, s > 0 ? PI : 0, 0]);
      add(H, M.dark, disc(0.11), [-3.0, 0.48, s * 0.033], [0, s > 0 ? PI : 0, 0]);
      add(H, M.accent, disc(0.05), [-3.0, 0.48, s * 0.035], [0, s > 0 ? PI : 0, 0]);
    }
  }

  // --- main rotor: two full-length blades = four blades ---
  const R = 'rotor';
  add(R, M.dark, cyl(0.1, 0.22), [0, 0, 0]);
  add(R, M.metal, cyl(0.06, 0.12), [0, 0.08, 0]);
  for (const a of [0, PI / 2]) {
    add(R, M.blade, box(3.7, 0.024, 0.17), [0, 0.03, 0], [0, a, 0]);
    for (const s of [-1, 1]) {
      const c = Math.cos(a) * s * 1.72;
      const z = -Math.sin(a) * s * 1.72;
      add(R, M.trim, box(0.3, 0.028, 0.172), [c, 0.03, z], [0, a, 0]);
    }
  }
  const blur = MeshBuilder.CreateDisc('heliBlur', { radius: 1.84, tessellation: 48 }, scene);
  blur.material = M.blur;
  blur.rotation.x = PI / 2;
  blur.position.y = 0.03;
  blur.parent = rotorNode;
  blur.isPickable = false;

  // --- tail rotor ---
  for (const a of [0, PI / 2]) add('tail', M.blade, box(0.05, 0.64, 0.03), [0, 0, 0], [0, 0, a]);
  add('tail', M.metal, cyl(0.08, 0.1), [0, 0, 0], [PI / 2, 0, 0]);
  const tailBlur = MeshBuilder.CreateDisc('heliTailBlur', { radius: 0.34, tessellation: 24 }, scene);
  tailBlur.material = M.blur;
  tailBlur.parent = tailNode;
  tailBlur.isPickable = false;

  // glass canopy
  add(H, M.glass, sphere(1, 16), [0.74, 0.2, 0], null, [0.78, 0.44, 0.4]);
  add(H, M.glass, sphere(1, 16), [0.18, 0.3, 0], null, [0.86, 0.5, 0.42]);

  // merge every group by material
  const parts = { hull: tilt, rotor: rotorNode, tail: tailNode };
  const casters = [];
  for (const [name, map] of Object.entries(groups)) {
    for (const [material, meshes] of map) {
      const merged = Mesh.MergeMeshes(meshes, true, false);
      merged.material = material;
      merged.parent = parts[name];
      merged.isPickable = false;
      if (material !== M.glass && name !== 'tail') casters.push(merged);
    }
  }

  // lights
  const glow = (m, d, pos, parent = tilt) => {
    const s = sphere(d, 8);
    s.material = m;
    s.parent = parent;
    s.position.set(...pos);
    s.isPickable = false;
    return s;
  };
  glow(M.beacon, 0.1, [-3.13, 0.92, 0]);
  glow(M.navL, 0.08, [0.05, -0.04, 0.9]);
  glow(M.navR, 0.08, [0.05, -0.04, -0.9]);
  glow(M.search, 0.11, [1.0, -0.33, 0]);
  const muzzleFlash = glow(M.flash, 0.42, [2.05, -0.31, 0]);
  muzzleFlash.setEnabled(false);

  const muzzleNode = new TransformNode('heliMuzzle', scene);
  muzzleNode.parent = tilt;
  muzzleNode.position.set(2.0, -0.31, 0);
  const cabinNode = new TransformNode('heliCabin', scene);
  cabinNode.parent = tilt;
  cabinNode.position.set(0.62, 0.18, 0);
  const bellyNode = new TransformNode('heliBelly', scene);
  bellyNode.parent = tilt;
  bellyNode.position.set(0.1, -0.5, 0);

  // burning-smoke trail, used once the helicopter is damaged
  const src = MeshBuilder.CreateBox('heliSmokeSrc', { size: 0.02 }, scene);
  src.isVisible = false;
  src.isPickable = false;
  src.parent = tilt;
  src.position.set(-0.6, 0.45, 0);
  const trail = new ParticleSystem('heliTrail', 160, scene);
  trail.particleTexture = softDotTexture(scene);
  trail.emitter = src;
  trail.minEmitBox = new Vector3(-0.2, 0, -0.1);
  trail.maxEmitBox = new Vector3(0.2, 0, 0.1);
  trail.addColorGradient(0, new Color4(1, 0.6, 0.15, 0.9));
  trail.addColorGradient(0.2, new Color4(0.25, 0.22, 0.2, 0.8));
  trail.addColorGradient(1, new Color4(0.5, 0.5, 0.5, 0));
  trail.minSize = 0.35 * scale;
  trail.maxSize = 0.8 * scale;
  trail.minLifeTime = 0.6;
  trail.maxLifeTime = 1.3;
  trail.direction1 = new Vector3(-0.6, 1.2, -0.4);
  trail.direction2 = new Vector3(0.6, 2.2, 0.4);
  trail.gravity = new Vector3(0, 0.6, 0);
  trail.emitRate = 0;
  trail.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  trail.start();

  const phase = Math.random() * 6;
  const skinBase = M.skin.emissiveColor.clone();
  const h = {
    root,
    cabin: cabinNode,
    casters,
    facing: 1,
    spool: 0,
    crashing: false,
    spin: 0,
    flashT: 0,
    muzzleT: 0,
    // elliptical hit area around the fuselage, in world units
    hitRx: 1.75 * scale,
    hitRy: 0.78 * scale,
    hitOffset: -0.45 * scale,
    setEnabled(on) {
      root.setEnabled(on);
      if (!on) trail.emitRate = 0;
    },
    setHealth(frac) {
      trail.emitRate = frac > 0.55 ? 0 : frac > 0.3 ? 16 : 42;
    },
    hurt() {
      h.flashT = 0.14;
    },
    fireFlash() {
      h.muzzleT = 0.05;
    },
    contains(x, y, pad = 0) {
      const dx = (x - (root.position.x + h.hitOffset * h.facing)) / (h.hitRx + pad);
      const dy = (y - root.position.y) / (h.hitRy + pad);
      return dx * dx + dy * dy <= 1;
    },
    muzzle() {
      muzzleNode.computeWorldMatrix(true);
      return muzzleNode.getAbsolutePosition().clone();
    },
    belly() {
      bellyNode.computeWorldMatrix(true);
      return bellyNode.getAbsolutePosition().clone();
    },
    reset() {
      h.facing = 1;
      h.spool = 0;
      h.crashing = false;
      h.spin = 0;
      h.flashT = 0;
      h.muzzleT = 0;
      flip.rotation.y = 0;
      tilt.rotation.z = 0;
      trail.emitRate = 0;
      muzzleFlash.setEnabled(false);
    },
    update(dt, t, vx = 0) {
      const s = h.spool;
      rotorNode.rotation.y += dt * 26 * s;
      tailNode.rotation.z += dt * 46 * s;
      M.blur.alpha = 0.16 * Math.min(1, s * 1.4);
      blur.setEnabled(s > 0.05);
      tailBlur.setEnabled(s > 0.05);

      if (h.crashing) {
        flip.rotation.y += h.spin * dt;
        tilt.rotation.z += (-0.7 - tilt.rotation.z) * Math.min(1, dt * 2);
        bank.rotation.x += (0.5 - bank.rotation.x) * Math.min(1, dt * 1.5);
      } else {
        const target = h.facing < 0 ? Math.PI : 0;
        flip.rotation.y += (target - flip.rotation.y) * Math.min(1, dt * 6);
        const lean = Math.max(-0.26, Math.min(0.26, vx * h.facing * 0.03));
        tilt.rotation.z += (-lean - tilt.rotation.z) * Math.min(1, dt * 5);
        bank.rotation.x = Math.sin(t * 1.7 + phase) * 0.025;
        tilt.position.y = Math.sin(t * 2.3 + phase) * 0.035;
      }

      h.flashT = Math.max(0, h.flashT - dt);
      const f = h.flashT / 0.14;
      M.skin.emissiveColor.set(skinBase.r + f * 0.7, skinBase.g + f * 0.06, skinBase.b + f * 0.06);
      M.hull.emissiveColor.set(f * 0.6, f * 0.05, f * 0.05);

      h.muzzleT = Math.max(0, h.muzzleT - dt);
      muzzleFlash.setEnabled(h.muzzleT > 0);
      const blink = Math.sin(t * 6 + phase) > 0.55 ? 1 : 0.08;
      M.beacon.emissiveColor.set(blink, blink * 0.16, blink * 0.16);
    },
    dispose() {
      trail.dispose();
      root.dispose();
    },
  };
  return h;
}

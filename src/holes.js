import {
  Mesh,
  MeshBuilder,
  TransformNode,
  Vector3,
  VertexData,
  Color3,
  StandardMaterial,
  Matrix,
  Quaternion,
} from '@babylonjs/core';
import {
  catmullRomClosed,
  ensureCCW,
  circlePolygon,
  ellipsePolygon,
  roundedRectOutline,
  offsetPolygon,
  polygonMesh,
  bandMesh,
  segmentsOf,
  pointInPolygon,
  mergeByMaterial,
} from './geometry.js';
import { grassMaterial, sandGroundMaterial, flatMaterial, flagMaterial, waterMaterial } from './materials.js';
import { createPalm } from './palm.js';
import { createOsborne } from './osborne.js';
import { createBull } from './bull.js';
import { createPine, createStoneRing, createDryWall } from './uk-props.js';
import { createWindmill } from './windmill.js';
import { createStadium, createRugbyPlayer } from './rugby.js';
import { ukWorld } from './uk-shape.js';
import { CUP_R } from './physics.js';

export const FAIRWAY_TOP = 0.4;
const SLAB_TOP = FAIRWAY_TOP - 0.03;
const WALL_W = 0.36;
const WALL_H = 0.32;
const WATER_Y = 0.2;

const at = (lon, lat) => {
  const p = ukWorld(lon, lat);
  return [p.x, p.z];
};

// Local coordinates: x runs tee -> green, z is across the fairway. `origin` moves it into the world.
export const HOLE_DEFS = [
  {
    id: 1,
    par: 3,
    playable: true,
    origin: [-8, -17],
    region: 'Andalucía',
    outline: [
      [-12.8, 0.0], [-12.3, -1.6], [-10.8, -2.5], [-8.5, -2.9], [-6.0, -3.6], [-3.5, -4.7],
      [-0.5, -5.2], [3.0, -5.2], [6.0, -5.4], [9.0, -5.4], [11.5, -4.4], [12.8, -2.2],
      [13.0, 0.4], [12.6, 2.6], [11.0, 4.4], [8.5, 5.4], [6.0, 5.2], [3.0, 5.0],
      [0.0, 5.0], [-3.0, 4.6], [-5.5, 3.6], [-8.0, 3.0], [-10.5, 2.6], [-12.2, 1.6],
    ],
    tee: [-10.4, 0],
    cup: [9.2, 0.2],
    ponds: [{ cx: 0.0, cz: -0.8, rx: 3.2, rz: 3.3, wobble: 0.07 }],
    palms: [
      { x: -2.6, z: 7.0, height: 3.5, lean: [0.55, -1.35], seed: 3 },
      { x: 15.2, z: 5.6, height: 2.8, lean: [-0.3, -0.5], seed: 11 },
      { x: -14.6, z: 4.4, height: 2.6, lean: [0.3, -0.4], seed: 5 },
    ],
  },
  {
    id: 2,
    par: 3,
    playable: true,
    origin: [-10, 4],
    region: 'Plaza de Toros',
    // a bullring: round sand arena, red barrier, tiered stands with spectators, the Osborne bull and two bulls
    outlinePoly: () => ellipsePolygon(0, 0, 8.6, 8.6, 72, 0),
    surface: 'sand',
    arena: { tiers: 3 },
    extent: 3.6,
    tee: [-6.9, 0],
    cup: [6.6, 0.9],
    ponds: [],
    palms: [],
    wallColor: [0.72, 0.12, 0.16],
    osborne: { x: -0.6, z: 0, length: 5.0, facing: -1 },
    bulls: [
      { x: -3.4, z: 4.2, coat: 'black', seed: 3, heading: 0.5 },
      { x: 3.4, z: -4.4, coat: 'brown', seed: 8, heading: 3.4 },
    ],
  },
  {
    id: 3,
    par: 3,
    playable: true,
    origin: [12, 17.5],
    region: 'Aragón',
    outlinePoly: () => roundedRectOutline(0, 0, 26, 9, 3.5),
    tee: [-11, 0],
    cup: [10, 0],
    ponds: [],
    palms: [],
    wallColor: [0.36, 0.4, 0.34],
    // enemy gunship bombs the fairway; sinking the ball opens `hatch` (local x, z) for the friendly helicopter
    warzone: { hatch: [1.5, 0] },
  },

  // ---- the United Kingdom island: holes 4-6, played after the helicopter flies you there ----
  {
    id: 4,
    par: 3,
    island: 2,
    region: 'Scotland',
    playable: true,
    origin: at(-4.1, 56.95),
    outline: [
      [-11.6, 0.0], [-11.2, -1.7], [-9.6, -2.8], [-7.0, -3.6], [-4.5, -4.9], [-1.5, -5.3],
      [2.0, -5.3], [5.0, -5.1], [8.0, -4.9], [10.2, -3.7], [11.4, -1.6], [11.6, 0.4],
      [11.0, 2.5], [9.2, 4.2], [6.5, 5.1], [3.5, 5.3], [0.5, 5.3], [-2.5, 5.0],
      [-5.0, 4.6], [-7.6, 3.6], [-9.8, 2.8], [-11.2, 1.6],
    ],
    tee: [-9.6, 0],
    cup: [8.6, 0.3],
    // two lochs force an S-shaped route
    ponds: [
      { cx: -3.4, cz: 1.5, rx: 2.3, rz: 3.1, wobble: 0.07 },
      { cx: 3.6, cz: -1.5, rx: 2.3, rz: 3.1, wobble: 0.07 },
    ],
    wallColor: [0.05, 0.26, 0.6],
    flagStyle: 'uk',
    pines: [
      { x: -9, z: 8, h: 4.6 }, { x: -4.5, z: 8.7, h: 3.8 }, { x: 2, z: 8.3, h: 4.3 }, { x: 8, z: 8.7, h: 4.7 },
      { x: -7, z: -8.7, h: 4.2 }, { x: 0, z: -8.5, h: 3.6 }, { x: 7, z: -8.3, h: 4.4 }, { x: 14, z: 2, h: 4.1 },
    ],
  },
  {
    // A rugby stadium in Wales: The Saints (home, tee end) v The Leopards (away, cup end).
    id: 5,
    par: 3,
    island: 2,
    region: 'Rugby Stadium',
    playable: true,
    // the stands reach 3.4 beyond the pitch: placed to clear Cardigan Bay, hole 6 and the windmill hole
    origin: at(-2.0, 52.5),
    outlinePoly: () => roundedRectOutline(0, 0, 24, 10.4, 3.6),
    tee: [-10, 0],
    cup: [9, -0.4],
    ponds: [],
    wallColor: [0.93, 0.93, 0.9],
    flagStyle: 'uk',
    stadium: { home: 'saints', away: 'leopards', tryX: 10.6, postHalf: 1.5, tiers: 3 },
    extent: 3.4,
    // six players, three a side, each running across the pitch in his own lane (x); the carrier has the ball
    players: [
      { team: 'saints', x: -6.6, z: 2.6, seed: 1 },
      { team: 'leopards', x: -3.9, z: -2.4, seed: 2 },
      { team: 'saints', x: -1.3, z: 3.0, seed: 3, carrier: true },
      { team: 'leopards', x: 1.3, z: -3.1, seed: 4 },
      { team: 'saints', x: 3.9, z: 2.2, seed: 5 },
      { team: 'leopards', x: 6.6, z: -2.6, seed: 6 },
    ],
  },
  {
    id: 6,
    par: 3,
    island: 2,
    region: 'England',
    playable: true,
    origin: at(-1.0, 51.35),
    outlinePoly: () => roundedRectOutline(0, 0, 24, 10.6, 3.8),
    tee: [-10.2, 0],
    cup: [9.4, 0.6],
    ponds: [],
    wallColor: [0.78, 0.1, 0.14],
    flagStyle: 'uk',
    stones: { x: 0.4, z: 0, radius: 3.1, count: 8, seed: 3 },
    pines: [{ x: -8, z: 8.3, h: 3.8 }, { x: -1, z: 8.6, h: 3.4 }, { x: 7, z: 8.4, h: 4 }, { x: 9, z: -8.4, h: 3.6 }, { x: -3, z: -8.5, h: 3.5 }],
  },
  {
    // The Lytham windmill hole. The mill stands on the fairway; sinking the ball opens its door for the ogre.
    id: 7,
    par: 3,
    island: 2,
    region: 'Lytham St Annes',
    playable: true,
    origin: at(-1.5, 53.75),
    outlinePoly: () => roundedRectOutline(0, 0, 22, 10.4, 3.6),
    tee: [-9.2, 0],
    cup: [8.0, 1.6],
    ponds: [],
    wallColor: [0.75, 0.1, 0.15],
    flagStyle: 'uk',
    windmill: { x: 1.4, z: 2.2 },
    // where the two kids wait outside the fairway before the fight (local coordinates)
    brawl: { kidSpot: [-4.6, -6.7], helperSpot: [-13.3, 2.0] },
    // hole camera framing that also takes in the tall windmill
    frame: { halfD: 9.9, dz: 2.1 },
    pines: [{ x: -8, z: 8.4, h: 3.6 }, { x: 6, z: 8.8, h: 4 }, { x: 10, z: -8.6, h: 3.4 }],
  },
];

const shared = new WeakMap();
function getShared(scene) {
  let s = shared.get(scene);
  if (s) return s;
  s = {
    slab: flatMaterial(scene, 'slab', '#c8b88f'),
    wall: (() => {
      const m = new StandardMaterial('wall', scene);
      m.diffuseColor = Color3.White();
      m.specularColor = new Color3(0.1, 0.08, 0.05);
      m.backFaceCulling = false;
      return m;
    })(),
    lip: flatMaterial(scene, 'lip', '#d9cfae'),
    bed: flatMaterial(scene, 'bed', '#3e7f8f'),
    cupIn: flatMaterial(scene, 'cupIn', '#1b1b1f', { cull: false }),
    rim: flatMaterial(scene, 'rim', '#f2f2f2', { spec: 0.6 }),
    mat: flatMaterial(scene, 'teeMat', '#2f8f4a'),
    pole: flatMaterial(scene, 'pole', '#f6f6f6', { spec: 0.3 }),
    markerA: flatMaterial(scene, 'markerA', '#e63946', { spec: 0.4 }),
    markerB: flatMaterial(scene, 'markerB', '#f4c430', { spec: 0.4 }),
  };
  shared.set(scene, s);
  return s;
}

function buildFlag(scene, label, pos, sh, style) {
  const H = 2.3;
  const pole = MeshBuilder.CreateCylinder('pole', { height: H, diameter: 0.06, tessellation: 8 }, scene);
  pole.position.set(pos.x, FAIRWAY_TOP + H / 2, pos.z);
  pole.material = sh.pole;

  const W = 0.95;
  const Hf = 0.6;
  const nx = 8;
  const positions = new Float32Array((nx + 1) * 2 * 3);
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= nx; i++) {
    uvs.push(i / nx, 1, i / nx, 0);
    if (i < nx) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const flag = new Mesh('flag', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.normals = new Array((nx + 1) * 6).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0));
  vd.applyToMesh(flag, true);
  flag.material = flagMaterial(scene, label, style);
  flag.position.set(pos.x, FAIRWAY_TOP + H, pos.z);

  const update = (t) => {
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx) * W;
      const wave = Math.sin(t * 4.2 - x * 5) * 0.07 * (x / W);
      const droop = -0.03 * (x / W) * (x / W);
      positions.set([x, droop, wave, x, droop - Hf, wave], i * 6);
    }
    flag.updateVerticesData('position', positions);
  };
  update(0);
  return { pole, flag, update };
}

// Bullring surroundings: stepped stands behind the barrier, a white arcaded facade with a red band, and spectators.
function buildArena(scene, outline, def, sh, meshes, casters) {
  const tiers = def.arena.tiers ?? 3;
  const tw = 0.85;
  const riser = (i) => 0.55 + 0.6 * (i + 1);
  for (let i = 0; i < tiers; i++) {
    const stand = bandMesh('stand' + i, offsetPolygon(outline, WALL_W + i * tw), { width: tw, height: riser(i), y: SLAB_TOP, color: i % 2 ? [0.82, 0.74, 0.6] : [0.92, 0.87, 0.76] }, scene);
    stand.material = sh.wall;
    stand.receiveShadows = true;
    meshes.push(stand);
    casters.push(stand);
  }
  const fw = 0.55;
  const facadeBase = offsetPolygon(outline, WALL_W + tiers * tw);
  const fh = riser(tiers - 1) + 1.0;
  const facade = bandMesh('facade', facadeBase, { width: fw, height: fh, y: SLAB_TOP, color: [0.95, 0.93, 0.88] }, scene);
  const band = bandMesh('facadeBand', offsetPolygon(facadeBase, -0.03), { width: fw + 0.09, height: 0.34, y: SLAB_TOP + fh - 0.5, color: [0.72, 0.12, 0.16] }, scene);
  for (const m of [facade, band]) {
    m.material = sh.wall;
    m.receiveShadows = true;
    meshes.push(m);
    casters.push(m);
  }

  // arches along the outside of the facade, and spectators on the tiers
  const cx = def.origin[0];
  const cz = def.origin[1];
  const R = Math.hypot(outline[0].x - cx, outline[0].z - cz);
  const arch = MeshBuilder.CreateBox('arch', { width: 0.75, height: 1.5, depth: 0.06 }, scene);
  arch.material = flatMaterial(scene, 'arch', '#4a352b');
  arch.isVisible = false;
  const rf = R + WALL_W + tiers * tw + fw + 0.03;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + 0.05;
    const inst = arch.createInstance('archI');
    inst.position.set(cx + Math.cos(a) * rf, SLAB_TOP + 0.85, cz + Math.sin(a) * rf);
    inst.rotation.y = -(a + Math.PI / 2);
    inst.isPickable = false;
    meshes.push(inst);
  }
  meshes.push(arch);

  const crowdMat = new StandardMaterial('crowd', scene);
  crowdMat.diffuseColor = Color3.White();
  crowdMat.specularColor = Color3.Black();
  const palette = [[0.85, 0.15, 0.2], [1, 0.8, 0.1], [0.95, 0.95, 0.9], [0.2, 0.35, 0.75], [0.15, 0.55, 0.35], [0.9, 0.5, 0.15]];
  const skins = [[0.94, 0.76, 0.6], [0.8, 0.6, 0.45], [0.62, 0.44, 0.32], [0.98, 0.84, 0.7]];
  let seed = 41;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const spots = [];
  for (let i = 0; i < tiers; i++) {
    const r = R + WALL_W + i * tw + tw * 0.5;
    const n = Math.floor((Math.PI * 2 * r) / 0.5);
    for (let j = 0; j < n; j++) {
      if (rnd() < 0.1) continue;
      const a = (j / n) * Math.PI * 2 + rnd() * 0.05;
      spots.push({ x: cx + Math.cos(a) * r, y: SLAB_TOP + riser(i), z: cz + Math.sin(a) * r, a });
    }
  }
  const bodies = MeshBuilder.CreateBox('crowdBody', { width: 0.26, height: 0.34, depth: 0.22 }, scene);
  const heads = MeshBuilder.CreateSphere('crowdHead', { diameter: 0.19, segments: 6 }, scene);
  for (const m of [bodies, heads]) {
    m.material = crowdMat;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
  }
  const mBody = new Float32Array(spots.length * 16);
  const mHead = new Float32Array(spots.length * 16);
  const cBody = new Float32Array(spots.length * 4);
  const cHead = new Float32Array(spots.length * 4);
  spots.forEach((s, i) => {
    const q = Quaternion.RotationAxis(new Vector3(0, 1, 0), -(s.a + Math.PI / 2));
    Matrix.Compose(new Vector3(1, 1 + rnd() * 0.15, 1), q, new Vector3(s.x, s.y + 0.17, s.z)).copyToArray(mBody, i * 16);
    Matrix.Compose(new Vector3(1, 1, 1), q, new Vector3(s.x, s.y + 0.43, s.z)).copyToArray(mHead, i * 16);
    const c = palette[Math.floor(rnd() * palette.length)];
    const sk = skins[Math.floor(rnd() * skins.length)];
    cBody.set([c[0], c[1], c[2], 1], i * 4);
    cHead.set([sk[0], sk[1], sk[2], 1], i * 4);
  });
  bodies.thinInstanceSetBuffer('matrix', mBody, 16);
  bodies.thinInstanceSetBuffer('color', cBody, 4);
  heads.thinInstanceSetBuffer('matrix', mHead, 16);
  heads.thinInstanceSetBuffer('color', cHead, 4);
  meshes.push(bodies, heads);
}

export function buildHole(scene, def, env) {
  const sh = getShared(scene);
  const [ox, oz] = def.origin;
  const local = def.outline ? catmullRomClosed(def.outline, 8) : def.outlinePoly();
  const outline = ensureCCW(local).map((p) => ({ x: p.x + ox, z: p.z + oz }));

  const root = new TransformNode('hole' + def.id, scene);
  const casters = [];
  const meshes = [];

  const ponds = def.ponds.map((p) =>
    ensureCCW(ellipsePolygon(p.cx + ox, p.cz + oz, p.rx, p.rz, 72, p.wobble))
  );
  const cup = { x: def.cup[0] + ox, z: def.cup[1] + oz };
  const tee = { x: def.tee[0] + ox, z: def.tee[1] + oz };
  const cupPoly = circlePolygon(cup.x, cup.z, CUP_R, 28);
  const holes = [...ponds, cupPoly];

  // Body of the course
  const xs = outline.map((p) => p.x);
  const zs = outline.map((p) => p.z);
  const w = Math.max(...xs) - Math.min(...xs);
  const d = Math.max(...zs) - Math.min(...zs);

  const slab = polygonMesh('slab' + def.id, offsetPolygon(outline, WALL_W), holes, scene, SLAB_TOP);
  slab.position.y = SLAB_TOP;
  slab.material = sh.slab;
  slab.receiveShadows = false;
  meshes.push(slab);
  casters.push(slab);

  const grass = polygonMesh('grass' + def.id, outline, holes, scene, FAIRWAY_TOP - SLAB_TOP);
  grass.position.y = FAIRWAY_TOP;
  grass.material = def.surface === 'sand' ? sandGroundMaterial(scene, w / 2, def.id * 13) : grassMaterial(scene, w, d, def.id * 13);
  grass.receiveShadows = true;
  meshes.push(grass);

  // Bumper walls
  const wall = bandMesh('wall' + def.id, outline, { width: WALL_W, height: WALL_H, y: SLAB_TOP, color: def.wallColor || [0.62, 0.4, 0.22] }, scene);
  wall.material = sh.wall;
  wall.receiveShadows = true;
  meshes.push(wall);
  casters.push(wall);

  if (def.arena) buildArena(scene, outline, def, sh, meshes, casters);

  // Ponds
  const waterMats = [];
  ponds.forEach((poly, i) => {
    const bed = polygonMesh(`bed${def.id}_${i}`, poly, [], scene, 0);
    bed.position.y = 0.02;
    bed.material = sh.bed;
    meshes.push(bed);

    const water = polygonMesh(`water${def.id}_${i}`, poly, [], scene, 0);
    water.position.y = WATER_Y;
    const wm = waterMaterial(scene, { shallow: [0.28, 0.82, 0.86], deep: [0.06, 0.42, 0.62], alpha: 0.78, scale: 2.2 });
    water.material = wm;
    waterMats.push(wm);
    meshes.push(water);

    const lip = bandMesh(`lip${def.id}_${i}`, poly, { width: 0.16, height: 0.05, y: FAIRWAY_TOP - 0.005, color: [0.86, 0.82, 0.68] }, scene);
    lip.material = sh.wall;
    meshes.push(lip);
  });

  // Cup
  const liner = MeshBuilder.CreateCylinder('cupLiner', { height: FAIRWAY_TOP - 0.02, diameter: CUP_R * 2 - 0.03, tessellation: 28, cap: Mesh.NO_CAP, sideOrientation: Mesh.BACKSIDE }, scene);
  liner.position.set(cup.x, (FAIRWAY_TOP + 0.02) / 2, cup.z);
  liner.material = sh.cupIn;
  const bottom = MeshBuilder.CreateDisc('cupBottom', { radius: CUP_R, tessellation: 28 }, scene);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.set(cup.x, 0.03, cup.z);
  bottom.material = sh.cupIn;
  const rim = MeshBuilder.CreateTorus('cupRim', { diameter: CUP_R * 2 + 0.06, thickness: 0.07, tessellation: 32 }, scene);
  rim.position.set(cup.x, FAIRWAY_TOP + 0.005, cup.z);
  rim.material = sh.rim;
  meshes.push(liner, bottom, rim);

  // Tee mat and markers
  const mat = MeshBuilder.CreateBox('teeMat', { width: 2.0, height: 0.03, depth: 1.3 }, scene);
  mat.position.set(tee.x, FAIRWAY_TOP + 0.012, tee.z);
  mat.material = sh.mat;
  mat.receiveShadows = true;
  meshes.push(mat);
  [-1, 1].forEach((s, i) => {
    const m = MeshBuilder.CreateSphere('marker', { diameter: 0.22, segments: 10 }, scene);
    m.position.set(tee.x - 1.15, FAIRWAY_TOP + 0.11, tee.z + s * 0.75);
    m.material = i ? sh.markerA : sh.markerB;
    meshes.push(m);
    casters.push(m);
  });

  // Flag (pole stands on the back rim of the cup)
  const flag = buildFlag(scene, def.id, { x: cup.x, z: cup.z + CUP_R + 0.1 }, sh, def.flagStyle || 'spain');
  meshes.push(flag.pole, flag.flag);
  casters.push(flag.pole, flag.flag);

  // Palms
  const palms = (def.palms || []).map((p) => {
    const palm = createPalm(scene, { ...p, x: p.x + ox, z: p.z + oz });
    casters.push(...palm.meshes);
    return palm;
  });

  // the trees around the hole are static: merged into a couple of meshes that still cast shadows
  const pines = (def.pines || []).map((p, i) => createPine(scene, { x: p.x + ox, z: p.z + oz, height: p.h, seed: def.id * 10 + i }));
  const pineTrees = pines.length ? mergeByMaterial(pines.flatMap((p) => p.meshes), root) : [];
  pines.forEach((p) => p.root.dispose());
  pines.length = 0;
  casters.push(...pineTrees);

  // Obstacles
  const extraSegs = [];
  const circles = [];
  const blockers = [];
  let osb = null;
  if (def.osborne) {
    const o = def.osborne;
    osb = createOsborne(scene, { ...o, x: o.x + ox, z: o.z + oz, y: FAIRWAY_TOP });
    casters.push(...osb.meshes);
    extraSegs.push(...osb.segs);
    osb.meshes.forEach((m) => (m.receiveShadows = m !== osb.meshes[0]));
    blockers.push(osb.rect);
  }
  (def.dryWalls || []).forEach((w, i) => {
    const wall = createDryWall(scene, { x: w.x + ox, z1: w.z1 + oz, z2: w.z2 + oz, y: FAIRWAY_TOP, seed: def.id * 7 + i });
    casters.push(...wall.meshes);
    extraSegs.push(...wall.segs);
    blockers.push(wall.rect);
    meshes.push(wall.root);
  });
  if (def.stones) {
    const s = def.stones;
    const ring = createStoneRing(scene, { ...s, x: s.x + ox, z: s.z + oz, y: FAIRWAY_TOP });
    casters.push(...ring.meshes);
    circles.push(...ring.circles);
    meshes.push(ring.root);
  }
  let stadium = null;
  if (def.stadium) {
    stadium = createStadium(scene, { ...def.stadium, outline, ox, oz, top: FAIRWAY_TOP, slabTop: SLAB_TOP, wallW: WALL_W, wallMat: sh.wall });
    meshes.push(...stadium.meshes);
    casters.push(...stadium.casters);
    circles.push(...stadium.circles);
    blockers.push(...stadium.blockers);
  }
  let windmill = null;
  if (def.windmill) {
    windmill = createWindmill(scene, { x: def.windmill.x + ox, z: def.windmill.z + oz, y: FAIRWAY_TOP });
    casters.push(...windmill.meshes);
    circles.push(...windmill.circles);
    meshes.push(windmill.root);
  }

  let self = null;
  const inset = offsetPolygon(outline, -1.0);
  const bulls = [];
  const world = {
    walkable: (px, pz) =>
      pointInPolygon(px, pz, inset) &&
      !blockers.some((r) => Math.abs(px - r.x) < r.hw + 1.1 && Math.abs(pz - r.z) < r.hd + 1.1) &&
      Math.hypot(px - cup.x, pz - cup.z) > 1.7 &&
      Math.hypot(px - tee.x, pz - tee.z) > 2.3,
    others: () => bulls,
    ball: () => (env.ball && self ? env.ball(self) : null),
    center: { x: ox, z: oz },
  };
  (def.bulls || []).forEach((b) => {
    const bull = createBull(scene, world, { ...b, x: b.x + ox, z: b.z + oz, y: FAIRWAY_TOP });
    bulls.push(bull);
    casters.push(...bull.meshes);
    circles.push(...bull.circles);
  });

  (def.sheep || []).forEach((s) => {
    const sheep = createBull(scene, world, { ...s, species: 'sheep', x: s.x + ox, z: s.z + oz, y: FAIRWAY_TOP });
    bulls.push(sheep);
    casters.push(...sheep.meshes);
    circles.push(...sheep.circles);
  });

  // rugby players share the bulls' list, so they dodge each other and are updated and hidden the same way
  (def.players || []).forEach((p) => {
    const player = createRugbyPlayer(scene, world, { ...p, x: p.x + ox, z: p.z + oz, lane: p.x + ox, y: FAIRWAY_TOP, heading: p.z > 0 ? -Math.PI / 2 : Math.PI / 2 });
    bulls.push(player);
    casters.push(...player.meshes);
    circles.push(...player.circles);
  });

  meshes.forEach((m) => (m.parent = m.parent || root));

  // decorative casters (trees, animals) are skipped in the overview shadow pass; standalone roots are toggled with the island
  const decor = new Set([...palms, ...pines].flatMap((p) => p.meshes).concat(bulls.flatMap((b) => b.meshes), pineTrees));
  const nodes = [osb && osb.root, ...bulls.map((b) => b.root), ...palms.map((p) => p.root), ...pines.map((p) => p.root)].filter(Boolean);

  const result = {
    def,
    id: def.id,
    par: def.par,
    playable: def.playable,
    island: def.island || 1,
    region: def.region || '',
    extent: def.extent || 0,
    tee,
    cup,
    outline,
    ponds,
    segs: [...segmentsOf(outline), ...extraSegs],
    circles,
    bulls,
    windmill,
    center: { x: ox, z: oz },
    size: { w, d },
    root,
    casters,
    overviewCasters: casters.filter((m) => !decor.has(m)),
    nodes,
    palms,
    pines,
    flag,
    waterMats,
    update(t, dt) {
      flag.update(t);
      palms.forEach((p) => p.update(t));
      pines.forEach((p) => p.update(t));
      bulls.forEach((b) => b.update(dt, t));
      if (windmill) windmill.update(t, dt);
      if (stadium) stadium.update(t);
    },
  };
  self = result;
  return result;
}

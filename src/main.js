import {
  Engine,
  Scene,
  FreeCamera,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  MeshBuilder,
  TransformNode,
  Vector2,
  Vector3,
  Matrix,
  Quaternion,
  Color3,
  Color4,
  StandardMaterial,
} from '@babylonjs/core';
import { SKY, ballMaterial, waterMaterial } from './materials.js';
import { HOLE_DEFS, buildHole, FAIRWAY_TOP } from './holes.js';
import { createEffects } from './effects.js';
import { createWarzone, DIFFICULTY } from './warzone.js';
import { createUkIsland } from './uk-island.js';
import { createSpainIsland } from './spain-island.js';
import { createKid } from './kid.js';
import { createOgre } from './ogre.js';
import { createBrawl } from './brawl.js';
import { BALL_R, stepBall, launch, speedOf } from './physics.js';
import { pointInPolygon } from './geometry.js';
import { unlockAudio, sfx } from './audio.js';

const FOV = 0.8;
const YAW = Math.PI;
const MAX_PULL = 6;
const DEAD_ZONE = 0.35;

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const engine = new Engine(canvas, false, { stencil: false, antialias: false, powerPreference: 'high-performance' });
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new Scene(engine);
scene.clearColor = new Color4(SKY.r, SKY.g, SKY.b, 1);
scene.fogMode = Scene.FOGMODE_LINEAR;
scene.fogColor = SKY;
scene.fogStart = 120;
scene.fogEnd = 340;

const camera = new FreeCamera('cam', new Vector3(0, 40, -40), scene);
camera.fov = FOV;
camera.minZ = 0.5;
camera.maxZ = 700;
camera.inputs.clear();

// ---------- lights & shadows ----------
const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
hemi.intensity = 0.62;
hemi.diffuse = new Color3(1, 1, 1);
hemi.groundColor = new Color3(0.55, 0.62, 0.5);
const sun = new DirectionalLight('sun', new Vector3(-0.45, -0.8, 0.35), scene);
sun.intensity = 1.05;
sun.diffuse = new Color3(1, 0.97, 0.9);
sun.position = new Vector3(40, 60, -30);
const shadows = new ShadowGenerator(1024, sun);
shadows.usePercentageCloserFiltering = true;
shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
shadows.bias = 0.0008;
shadows.normalBias = 0.012;
shadows.setDarkness(0.3);
const shadowList = shadows.getShadowMap().renderList;

// ---------- world ----------
const waterMats = [];

const ocean = MeshBuilder.CreateGround('ocean', { width: 1000, height: 1000 }, scene);
ocean.position.y = -0.75;
const oceanMat = waterMaterial(scene, { shallow: [0.2, 0.74, 0.8], deep: [0.03, 0.32, 0.56], alpha: 1, scale: 0.32, fogRange: [110, 330] });
ocean.material = oceanMat;
waterMats.push(oceanMat);


const holes = HOLE_DEFS.map((d) => buildHole(scene, d, { ball: (h) => (h === hole ? ball : null) }));
const hole1 = holes[0];
const warHole = holes.find((h) => h.def.warzone);
const brawlHole = holes.find((h) => h.def.windmill);
let hole = hole1;
const uk = createUkIsland(scene, { holes: holes.filter((h) => h.island === 2) });

const spain = createSpainIsland(scene, { holes: holes.filter((h) => h.island === 1) });
const islands = { 1: spain, 2: uk };

// the kid waits in the middle of Spain until the helicopter takes him to the United Kingdom
const KID_KEY = 'minigolf.kid';
const LETTER_URL = import.meta.env.BASE_URL + 'letter.pdf'; // BASE_URL keeps it working under a sub-path (GitHub Pages)
const kid = createKid(scene, { label: 'Hector' });
function placeKid(at) {
  const s = (at === 'uk' ? uk : spain).kidSpot;
  kid.root.parent = null;
  kid.reset();
  kid.place(s.x, 0, s.z);
  kid.setScale(1);
  kid.faceCamera();
  kid.idle();
}

// the windmill hole: a second kid who helps out on his own (Tate, a head taller than Hector), and the ogre
const helper = createKid(scene, { name: 'helper', label: 'Tate', hair: '#e6c15a', shirt: '#2a9d5c', shorts: '#e9c46a', weapon: false, height: 1.22 });
const ogre = createOgre(scene);
helper.place(0, -50, 0);

// ---------- ball ----------
const ballMesh = MeshBuilder.CreateSphere('ball', { diameter: BALL_R * 2, segments: 24 }, scene);
ballMesh.material = ballMaterial(scene);
ballMesh.rotationQuaternion = Quaternion.Identity();
const ball = { x: 0, z: 0, vx: 0, vz: 0, bump: 0 };
let ballLift = 0;
let ballScale = 1;

// ---------- aim visuals ----------
const aimRoot = new TransformNode('aim', scene);
const aimMat = new StandardMaterial('aimMat', scene);
aimMat.disableLighting = true;
aimMat.emissiveColor = new Color3(0.4, 0.9, 0.4);
aimMat.backFaceCulling = false;
const aimDots = [];
for (let i = 0; i < 16; i++) {
  const d = MeshBuilder.CreateDisc('dot', { radius: 0.09, tessellation: 12 }, scene);
  d.rotation.x = Math.PI / 2;
  d.parent = aimRoot;
  d.material = aimMat;
  d.isPickable = false;
  aimDots.push(d);
}
const aimHead = MeshBuilder.CreateDisc('head', { radius: 0.34, tessellation: 3 }, scene);
aimHead.rotation.x = Math.PI / 2;
aimHead.parent = aimRoot;
aimHead.material = aimMat;
aimHead.isPickable = false;
aimRoot.setEnabled(false);

const fx = createEffects(scene);

// ---------- post-processing ----------
const pipeline = new DefaultRenderingPipeline('pipe', false, scene, [camera]);
pipeline.samples = 1;
pipeline.fxaaEnabled = true;
pipeline.imageProcessingEnabled = true;
pipeline.imageProcessing.toneMappingEnabled = true;
pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
pipeline.imageProcessing.exposure = 1.15;
pipeline.imageProcessing.contrast = 1.12;

// ---------- camera views ----------
function fit(halfW, halfD, pitch, aspect) {
  const th = Math.tan(FOV / 2);
  const dv = halfD * (Math.sin(pitch) / th + Math.cos(pitch));
  const dh = halfW / (th * aspect) + halfD * Math.cos(pitch);
  return Math.max(dv, dh) * 1.06;
}

function viewFor(mode, t) {
  const aspect = engine.getAspectRatio(camera);
  if (mode === 'hole') {
    const pitch = 0.9;
    return {
      target: new Vector3(hole.center.x + 0.4, 0.3, hole.center.z + 1.1 + (hole.def.frame ? hole.def.frame.dz : 0)),
      pitch,
      yaw: YAW,
      dist: fit(
        hole.size.w / 2 + 0.8 + (hole.extent || 0) * 0.5,
        hole.def.frame ? hole.def.frame.halfD : Math.max(6.3, hole.size.d / 2 + 1 + (hole.extent || 0) * 0.4),
        pitch,
        aspect
      ),
    };
  }
  if (mode === 'battle') {
    // side-on view of the helicopter hole so the fight in the air stays in frame
    const th = Math.tan(FOV / 2);
    return {
      target: new Vector3(hole.center.x, 4.6, hole.center.z),
      pitch: 0.34,
      yaw: YAW,
      dist: Math.max(6.4 / th, 15.4 / (th * aspect)) * 1.03,
    };
  }
  if (mode === 'cinema') {
    // the ogre-fight victory scene: brawl.js moves the shot, this only widens it enough for narrow screens
    const s = brawl.shot;
    return { target: s.target.clone(), pitch: s.pitch, yaw: s.yaw, dist: Math.max(s.dist, (s.halfW / (Math.tan(FOV / 2) * aspect)) * 1.1) };
  }
  if (mode === 'follow') {
    // trails the friendly helicopter on its flight to the helipad, dropping lower as it lands
    const land = warzone.landK;
    return { target: followT.clone(), pitch: 0.3 + land * 0.5, yaw: YAW + (1 - land) * 0.3 + land * 0.8, dist: 17 - land * 5 };
  }
  const isl = islands[game.island];
  const pitch = game.island === 2 ? 1.15 : 1.0;
  return {
    target: new Vector3(isl.center.x, 0, isl.center.z),
    pitch,
    yaw: game.island === 2 ? YAW : YAW + Math.sin(t * 0.18) * 0.05,
    dist: fit(isl.halfW + 4, isl.halfD + 4, pitch, aspect),
  };
}

const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const lerp = (a, b, k) => a + (b - a) * k;

const followT = new Vector3();
let camMode = 'overview';
let shake = 0;
let tween = null;
let camNow = null;

function applyView(v) {
  const cp = Math.cos(v.pitch);
  camera.position.set(
    v.target.x + Math.sin(v.yaw) * cp * v.dist,
    v.target.y + Math.sin(v.pitch) * v.dist,
    v.target.z + Math.cos(v.yaw) * cp * v.dist
  );
  if (shake > 0.002) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    camera.position.z += (Math.random() - 0.5) * shake;
  }
  const fogStart = Math.max(120, v.dist * 1.25);
  scene.fogStart = fogStart;
  scene.fogEnd = fogStart + 220;
  oceanMat.setVector2('fogRange', new Vector2(fogStart, fogStart + 220));
  camera.setTarget(v.target);
  camNow = v;
}

function flyTo(mode, dur = 2.4) {
  crossing = islandAt(camNow.target.x) !== islandAt(viewFor(mode, 0).target.x);
  tween = { from: camNow, mode, t: 0, dur };
  camMode = mode;
  setShadowMode(mode);
}

function updateCamera(dt, t) {
  if (camMode === 'follow') {
    const p = warzone.allyPos;
    const k = Math.min(1, dt * 3.5);
    followT.x += (p.x + 2.5 - followT.x) * k;
    followT.y += (p.y - 0.5 - followT.y) * k;
    followT.z += (p.z - followT.z) * k;
  }
  const goal = viewFor(camMode, t);
  if (!tween) return applyView(goal);
  tween.t += dt;
  const k = easeInOut(Math.min(1, tween.t / tween.dur));
  const f = tween.from;
  applyView({
    target: Vector3.Lerp(f.target, goal.target, k),
    pitch: lerp(f.pitch, goal.pitch, k),
    yaw: lerp(f.yaw, goal.yaw, k),
    dist: lerp(f.dist, goal.dist, k) + Math.sin(k * Math.PI) * 6,
  });
  if (tween.t >= tween.dur) {
    tween = null;
    crossing = false;
  }
}

// Only the island being looked at is enabled (both while flying between them): disabled nodes cost nothing per frame.
const islandAt = (x) => (x > 100 ? 2 : 1);
let crossing = false;
let visKey = '';
function setIslandEnabled(n, on) {
  const nodes = n === 1 ? [spain.root, warzone.hatchNode] : [uk.root];
  for (const h of holes) if (h.island === n) nodes.push(h.root, ...h.nodes);
  for (const node of nodes) node.setEnabled(on);
}
function syncVisibility() {
  const key = camMode === 'follow' || crossing ? '12' : String(game.island);
  if (key === visKey) return;
  visKey = key;
  setIslandEnabled(1, key.includes('1'));
  setIslandEnabled(2, key.includes('2'));
}

function setShadowMode(mode) {
  shadowList.length = 0;
  if (mode === 'hole' || mode === 'battle' || mode === 'cinema') {
    shadowList.push(...hole.casters, ballMesh);
    if (hole === warHole) shadowList.push(...warzone.casters);
    if (hole === brawlHole) shadowList.push(...brawl.casters);
  } else if (mode === 'follow') {
    shadowList.push(...warzone.casters, ...kid.meshes);
  } else {
    // overview: only the structures cast shadows (the trees and animals are too small to matter from here)
    holes.filter((h) => h.island === game.island).forEach((h) => shadowList.push(...h.overviewCasters));
    shadowList.push(ballMesh);
    if ((game.kidAt === 'uk' ? 2 : 1) === game.island) shadowList.push(...kid.meshes);
    if (game.island === 2 && warzone.phase === 'parked') shadowList.push(...warzone.casters);
  }
}

// ---------- HUD ----------
const hudEl = $('hud');
const toastEl = $('toast');
let toastTimer = 0;
function toast(msg, ms = 1600) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

const labelsEl = $('labels');
const labels = holes.map((h) => {
  const el = document.createElement('div');
  el.className = 'label ' + (h.playable ? 'playable' : 'soon');
  const region = h.region ? `${h.region} &middot; ` : '';
  el.innerHTML = h.playable ? `Hole ${h.id}<small>${region}Par ${h.par} &middot; play</small>` : `Hole ${h.id}<small>${region}coming soon</small>`;
  if (h.playable) el.addEventListener('click', () => startHole(h));
  labelsEl.appendChild(el);
  return { el, hole: h, world: new Vector3(h.center.x, h.island === 2 ? 4 : 2.6, h.center.z) };
});

function updateLabels() {
  const w = engine.getRenderWidth();
  const hgt = engine.getRenderHeight();
  const sx = canvas.clientWidth / w;
  const sy = canvas.clientHeight / hgt;
  const vp = camera.viewport.toGlobal(w, hgt);
  for (const l of labels) {
    l.el.style.display = l.hole.island === game.island ? '' : 'none';
    const p = Vector3.Project(l.world, Matrix.Identity(), scene.getTransformMatrix(), vp);
    l.el.style.left = p.x * sx + 'px';
    l.el.style.top = p.y * sy + 'px';
  }
}

// ---------- game state ----------
const UK_KEY = 'minigolf.uk';
const ISLANDS = {
  1: { name: 'Spain', first: 1, sub: '3 holes &middot; sink the ball, avoid the water &mdash; and the bombs' },
  2: { name: 'United Kingdom', first: 4, sub: 'holes 4-7 &middot; lochs, rugby and standing stones' },
};
const game = {
  state: 'overview', // overview | flying | aiming | dragging | rolling | sinking | holing | battle | brawl | letter | transit | complete
  island: 1,
  level: 'medium',
  ukUnlocked: (() => {
    try {
      return localStorage.getItem(UK_KEY) === '1';
    } catch {
      return false;
    }
  })(),
  kidAt: (() => {
    try {
      return localStorage.getItem(KID_KEY) === 'uk' ? 'uk' : 'spain';
    } catch {
      return 'spain';
    }
  })(),
  strokes: 0,
  timer: 0,
  sink: null,
  drag: null,
};

// ---------- helicopter hole ----------
const battleHud = {
  show: (on) => {
    $('battleHud').classList.toggle('hidden', !on);
    $('fireBtn').classList.toggle('hidden', !on);
  },
  setEnemy: (f) => setLife('enemyFill', f),
  setAlly: (f) => setLife('allyFill', f),
  setLabels: (enemy, ally, keysText, fireText) => {
    $('enemyLbl').textContent = enemy;
    $('allyLbl').textContent = ally;
    $('keysHint').innerHTML = keysText;
    $('fireBtn').textContent = fireText;
  },
};
function setLife(id, f) {
  const el = $(id);
  el.style.width = Math.max(0, f) * 100 + '%';
  el.classList.toggle('low', f < 0.3);
}

const warzone = createWarzone(scene, warHole, {
  fx,
  sfx,
  hud: battleHud,
  onBlast: blast,
  onShake: (m) => (shake = Math.max(shake, m)),
  onMessage: toast,
  onEnd: endBattle,
});

const brawl = createBrawl(scene, brawlHole, {
  kid,
  helper,
  ogre,
  fx,
  sfx,
  hud: battleHud,
  onShake: (m) => (shake = Math.max(shake, m)),
  onMessage: toast,
  onEnd: endBrawl,
  onCinema: () => flyTo('cinema', 2.2),
});
let brawlStaged = false;

// A bomb blast shoves a ball that is close by.
function blast(x, z) {
  if (game.state !== 'aiming' && game.state !== 'dragging' && game.state !== 'rolling') return;
  const R = 2.4;
  const dx = ball.x - x;
  const dz = ball.z - z;
  const d = Math.hypot(dx, dz);
  if (d > R) return;
  if (game.state === 'dragging') endDrag(true);
  const push = 1.2 + 3 * (1 - d / R);
  ball.vx += (dx / (d || 1)) * push;
  ball.vz += (dz / (d || 1)) * push;
  game.state = 'rolling';
}

function startBattle() {
  game.state = 'battle';
  document.activeElement?.blur();
  flyTo('battle', 2);
  warzone.startBattle();
}

function startBrawl() {
  game.state = 'brawl';
  document.activeElement?.blur();
  battleHud.setLabels('Ogre', 'Your kid', 'Move <b>arrows / WASD</b> or drag &middot; Swing <b>SPACE</b>', 'Swing');
  brawl.start();
}

function endBrawl(win) {
  battleHud.show(false);
  keys.clear();
  if (win) showLetter();
  else failBattle('Squashed!', 'The ogre won &middot; restart the hole');
}

// After the hug: the letter from Hector, a PDF loaded from public/letter.pdf.
function showLetter() {
  game.state = 'letter';
  $('letterFrame').src = LETTER_URL + '#toolbar=0&navpanes=0&view=FitH';
  $('letterLink').href = LETTER_URL;
  $('letter').classList.remove('hidden');
}

function hideLetter() {
  $('letter').classList.add('hidden');
  $('letterFrame').src = 'about:blank';
}

// Puts the kids back where the overview expects them once the windmill hole is left.
function unstageBrawl() {
  if (!brawlStaged) return;
  brawlStaged = false;
  brawl.reset();
  helper.place(0, -50, 0);
  placeKid(game.kidAt);
}

function endBattle(win) {
  battleHud.show(false);
  keys.clear();
  if (win) {
    unlockUk();
    finishHole('enemy gunship destroyed');
  }
  else failBattle();
}

function ballToTee() {
  ball.x = hole.tee.x;
  ball.z = hole.tee.z;
  ball.vx = ball.vz = 0;
  ballLift = 0;
  ballScale = 1;
  ballMesh.setEnabled(true);
  syncBall();
}

function syncBall() {
  ballMesh.position.set(ball.x, FAIRWAY_TOP + BALL_R * ballScale + ballLift, ball.z);
  ballMesh.scaling.setAll(ballScale);
}

function setStrokes(n) {
  game.strokes = n;
  $('hudStrokes').textContent = n;
}

function unlockUk() {
  game.ukUnlocked = true;
  try {
    localStorage.setItem(UK_KEY, '1');
  } catch {
    // progress just isn't remembered
  }
  setTitle();
}

function firstHoleOf(island) {
  return holes.find((h) => h.id === ISLANDS[island].first);
}

function setTitle() {
  const isl = ISLANDS[game.island];
  $('titleEyebrow').textContent = isl.name;
  $('titleSub').innerHTML = isl.sub;
  $('start').textContent = `Play Hole ${isl.first}`;
  $('islandBtn').textContent = `Go to ${ISLANDS[3 - game.island].name}`;
  $('islandBtn').classList.toggle('hidden', !game.ukUnlocked);
}

function switchIsland() {
  if (game.state !== 'overview') return;
  game.island = 3 - game.island;
  hole = firstHoleOf(game.island);
  ballToTee();
  setTitle();
  flyTo('overview', 3.4);
}

// Hole 3 asks for a difficulty first: it sets how fast the gunship bombs while you putt.
function showDifficulty(h) {
  document.querySelectorAll('.level').forEach((b) => b.classList.toggle('current', b.dataset.level === game.level));
  $('title').classList.add('hidden');
  $('result').classList.add('hidden');
  $('difficulty').classList.remove('hidden');
  return h;
}

function hideDifficulty() {
  $('difficulty').classList.add('hidden');
  if (game.state === 'overview') $('title').classList.remove('hidden');
  if (game.state === 'complete') $('result').classList.remove('hidden');
}

function startHole(h, level) {
  if (!h.playable || (game.state !== 'overview' && game.state !== 'complete')) return;
  if (h === warHole && !level) return showDifficulty(h);
  unlockAudio();
  hole = h;
  game.island = h.island;
  if (h === warHole || warzone.phase !== 'parked') warzone.reset();
  if (h === brawlHole) {
    brawl.stage();
    brawlStaged = true;
    battleHud.setLabels('Ogre', 'Your kid', 'Move <b>arrows / WASD</b> or drag &middot; Swing <b>SPACE</b>', 'Swing');
  } else unstageBrawl();
  $('title').classList.add('hidden');
  $('result').classList.add('hidden');
  $('difficulty').classList.add('hidden');
  hudEl.classList.remove('hidden');
  $('hudHole').textContent = h.id;
  $('hudPar').textContent = h.par;
  $('hudLevelRow').classList.toggle('hidden', h !== warHole);
  labelsEl.classList.add('off');
  setStrokes(0);
  ballToTee();
  game.state = 'flying';
  flyTo('hole', 2.6);
  if (h === warHole) {
    game.level = level;
    $('hudLevel').textContent = DIFFICULTY[level].label;
    warzone.begin(level);
  }
  setTimeout(() => {
    if (game.state === 'flying') {
      game.state = 'aiming';
      toast('Drag back and release to putt', 2400);
    }
  }, 2500);
}

function toOverview() {
  game.state = 'overview';
  if (warzone.phase !== 'parked') warzone.reset();
  unstageBrawl();
  hideLetter();
  keys.clear();
  hudEl.classList.add('hidden');
  $('result').classList.add('hidden');
  $('difficulty').classList.add('hidden');
  $('power').classList.add('hidden');
  aimRoot.setEnabled(false);
  $('title').classList.remove('hidden');
  labelsEl.classList.remove('off');
  game.island = hole.island;
  hole = firstHoleOf(game.island);
  setTitle();
  ballToTee();
  flyTo('overview', 2.2);
}

// After beating the gunship the friendly helicopter collects the kid waiting in Spain (if he is still there),
// flies to the helipad in the United Kingdom and drops him off.
function startTransit(next) {
  if (game.state !== 'complete' || !next) return;
  $('result').classList.add('hidden');
  const pickup = game.kidAt === 'spain' ? { x: spain.landSpot.x, z: spain.landSpot.z, top: 0 } : null;
  const route = {
    pickup,
    kid: pickup ? kid : null,
    pad: { x: uk.helipad.x, z: uk.helipad.z, top: uk.helipad.top },
    kidSpot: uk.kidSpot,
    onLanded: arriveUk,
  };
  if (!warzone.depart(route)) {
    game.state = 'overview';
    return arriveUk();
  }
  game.state = 'transit';
  hudEl.classList.add('hidden');
  const p = warzone.allyPos;
  followT.set(p.x + 2.5, p.y - 0.5, p.z);
  flyTo('follow', 1.6);
  toast(pickup ? 'Off to pick up the kid...' : `Off to the ${ISLANDS[next.island].name}...`, 3200);
}

function arriveUk() {
  unlockUk();
  game.kidAt = 'uk';
  try {
    localStorage.setItem(KID_KEY, 'uk');
  } catch {
    // progress just isn't remembered
  }
  placeKid('uk');
  game.state = 'overview';
  game.island = 2;
  hole = firstHoleOf(2);
  ballToTee();
  setTitle();
  $('title').classList.remove('hidden');
  labelsEl.classList.remove('off');
  sfx.victory();
  toast('Welcome to the United Kingdom!', 2800);
  flyTo('overview', 3.2);
}

function scoreName(strokes, par) {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  if (d <= -2) return 'Eagle!';
  if (d === -1) return 'Birdie!';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double bogey';
  return `${strokes} strokes`;
}

function finishHole(note = '') {
  game.state = 'complete';
  $('resultEyebrow').textContent = `Hole ${hole.id} complete`;
  $('resultTitle').textContent = scoreName(game.strokes, hole.par);
  $('resultSub').innerHTML = `${game.strokes} ${game.strokes === 1 ? 'stroke' : 'strokes'} &middot; par ${hole.par}` + (note ? ` &middot; ${note}` : '');
  $('replayBtn').textContent = 'Play again';
  const next = holes.find((h) => h.id === hole.id + 1 && h.playable);
  $('nextBtn').classList.toggle('hidden', !next);
  $('nextBtn').textContent = next && next.island !== hole.island ? `Fly to the ${ISLANDS[next.island].name}` : 'Next hole';
  $('replayBtn').classList.toggle('ghost', !!next);
  $('result').classList.remove('hidden');
}

function failBattle(title = 'Chopper down!', sub = 'The enemy helicopter won &middot; restart the hole') {
  game.state = 'complete';
  $('resultEyebrow').textContent = `Hole ${hole.id} failed`;
  $('resultTitle').textContent = title;
  $('resultSub').innerHTML = sub;
  $('nextBtn').classList.add('hidden');
  $('replayBtn').textContent = 'Restart hole';
  $('replayBtn').classList.remove('ghost');
  $('result').classList.remove('hidden');
}

// ---------- input ----------
function pointerToGround(ev, y) {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) * engine.getRenderWidth()) / rect.width;
  const yy = ((ev.clientY - rect.top) * engine.getRenderHeight()) / rect.height;
  const ray = scene.createPickingRay(x, yy, Matrix.Identity(), camera);
  if (ray.direction.y >= -1e-4) return null;
  const t = (y - ray.origin.y) / ray.direction.y;
  return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
}

function updateAim(cur) {
  const d = game.drag;
  const dx = d.start.x - cur.x;
  const dz = d.start.z - cur.z;
  const pull = Math.hypot(dx, dz);
  const power = Math.min(1, Math.max(0, (pull - DEAD_ZONE) / (MAX_PULL - DEAD_ZONE)));
  d.dir = { x: dx / (pull || 1), z: dz / (pull || 1) };
  d.power = power;

  const fill = $('powerFill');
  fill.style.width = power * 100 + '%';
  const hue = 120 - power * 120;
  fill.style.background = `hsl(${hue} 75% 50%)`;
  aimMat.emissiveColor = Color3.FromHSV(hue, 0.65, 1);

  aimRoot.setEnabled(power > 0);
  aimRoot.position.set(ball.x, FAIRWAY_TOP + 0.04, ball.z);
  aimRoot.rotation.y = Math.atan2(-d.dir.z, d.dir.x);
  const len = 1.0 + power * 8;
  aimDots.forEach((dot, i) => {
    const s = 0.7 + i * 0.55;
    dot.position.x = s;
    dot.setEnabled(s < len);
    dot.scaling.setAll(1 - (s / len) * 0.4);
  });
  aimHead.position.x = len + 0.3;
  aimHead.scaling.setAll(0.7 + power * 0.5);
}

function endDrag(cancel) {
  const d = game.drag;
  game.drag = null;
  aimRoot.setEnabled(false);
  $('power').classList.add('hidden');
  if (!d || cancel || d.power < 0.04) {
    if (game.state === 'dragging') game.state = 'aiming';
    return;
  }
  setStrokes(game.strokes + 1);
  launch(ball, d.dir.x, d.dir.z, d.power);
  sfx.putt(d.power);
  game.state = 'rolling';
}

const keys = new Set();
let fireHeld = false;
let steering = false;

function pointerToPlaneZ(ev, z) {
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) * engine.getRenderWidth()) / rect.width;
  const yy = ((ev.clientY - rect.top) * engine.getRenderHeight()) / rect.height;
  const ray = scene.createPickingRay(x, yy, Matrix.Identity(), camera);
  if (Math.abs(ray.direction.z) < 1e-4) return null;
  const t = (z - ray.origin.z) / ray.direction.z;
  return t > 0 ? { x: ray.origin.x + ray.direction.x * t, y: ray.origin.y + ray.direction.y * t } : null;
}

function steerTo(ev) {
  if (game.state === 'brawl') {
    const g = pointerToGround(ev, FAIRWAY_TOP);
    if (g) {
      brawl.input.tx = g.x;
      brawl.input.tz = g.z;
    }
    return;
  }
  const p = pointerToPlaneZ(ev, warzone.planeZ - 0.7);
  if (!p) return;
  warzone.input.tx = p.x;
  warzone.input.ty = p.y;
}

canvas.addEventListener('pointerdown', (ev) => {
  unlockAudio();
  if (game.state === 'battle' || game.state === 'brawl') {
    if (ev.button !== 0) return;
    canvas.setPointerCapture(ev.pointerId);
    steering = true;
    steerTo(ev);
    return;
  }
  if (ev.button !== 0 || game.state !== 'aiming') return;
  const p = pointerToGround(ev, FAIRWAY_TOP + BALL_R);
  if (!p) return;
  canvas.setPointerCapture(ev.pointerId);
  game.state = 'dragging';
  game.drag = { start: p, dir: { x: 1, z: 0 }, power: 0 };
  $('power').classList.remove('hidden');
  updateAim(p);
});
canvas.addEventListener('pointermove', (ev) => {
  if (steering) return steerTo(ev);
  if (game.state !== 'dragging') return;
  const p = pointerToGround(ev, FAIRWAY_TOP + BALL_R);
  if (p) updateAim(p);
});
function stopSteering() {
  steering = false;
  warzone.input.tx = warzone.input.ty = null;
  brawl.input.tx = brawl.input.tz = null;
}
canvas.addEventListener('pointerup', (ev) => {
  if (steering) stopSteering();
  if (game.state === 'dragging' && ev.button === 0) endDrag(false);
});
canvas.addEventListener('pointercancel', () => {
  if (steering) stopSteering();
  if (game.state === 'dragging') endDrag(true);
});
canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (game.state === 'dragging') endDrag(true);
});
const BATTLE_KEYS = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && game.state === 'dragging') endDrag(true);
  if ((game.state === 'battle' || game.state === 'brawl') && BATTLE_KEYS.has(ev.code)) ev.preventDefault();
  keys.add(ev.code);
});
window.addEventListener('keyup', (ev) => {
  if ((game.state === 'battle' || game.state === 'brawl') && BATTLE_KEYS.has(ev.code)) ev.preventDefault();
  keys.delete(ev.code);
});
window.addEventListener('blur', () => {
  keys.clear();
  fireHeld = false;
});

const fireBtn = $('fireBtn');
fireBtn.addEventListener('pointerdown', (ev) => {
  ev.stopPropagation();
  fireHeld = true;
  unlockAudio();
});
for (const type of ['pointerup', 'pointerleave', 'pointercancel']) fireBtn.addEventListener(type, () => (fireHeld = false));

function feedBattleInput() {
  const i = warzone.input;
  const down = (a, b) => keys.has(a) || keys.has(b);
  i.ax = (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0);
  i.ay = (down('ArrowUp', 'KeyW') ? 1 : 0) - (down('ArrowDown', 'KeyS') ? 1 : 0);
  i.fire = keys.has('Space') || fireHeld;
}

function feedBrawlInput() {
  const i = brawl.input;
  const down = (a, b) => keys.has(a) || keys.has(b);
  i.ax = (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0);
  i.az = (down('ArrowUp', 'KeyW') ? 1 : 0) - (down('ArrowDown', 'KeyS') ? 1 : 0);
  i.attack = keys.has('Space') || fireHeld;
}

$('letterBtn').addEventListener('click', () => {
  hideLetter();
  finishHole('ogre defeated');
});
$('start').addEventListener('click', () => startHole(firstHoleOf(game.island)));
$('islandBtn').addEventListener('click', switchIsland);
document.querySelectorAll('.level').forEach((b) =>
  b.addEventListener('click', () => {
    const h = warHole;
    $('difficulty').classList.add('hidden');
    startHole(h, b.dataset.level);
  })
);
$('levelBack').addEventListener('click', hideDifficulty);
$('overviewBtn').addEventListener('click', toOverview);
$('nextBtn').addEventListener('click', () => {
  const next = holes.find((h) => h.id === hole.id + 1 && h.playable);
  if (!next) return;
  if (next.island !== hole.island) startTransit(next);
  else startHole(next);
});
$('courseBtn').addEventListener('click', toOverview);
$('replayBtn').addEventListener('click', () => {
  if (hole === warHole || hole === brawlHole) return startHole(hole);
  $('result').classList.add('hidden');
  setStrokes(0);
  ballToTee();
  game.state = 'aiming';
});

// ---------- simulation ----------
let lastMoo = 0;
function rollBall(dt) {
  const px = ball.x;
  const pz = ball.z;
  ball.bump = 0;
  ball.bumpBull = 0;
  const ev = stepBall(ball, hole, dt);
  if (ball.bump > 1.2) sfx.bump(ball.bump);
  if (ball.bumpBull > 0.4 && performance.now() - lastMoo > 1200) {
    lastMoo = performance.now();
    if (ball.bumpSpecies === 'player') sfx.oof();
    else if (ball.bumpSpecies === 'sheep') sfx.baa();
    else sfx.moo();
  }

  const mx = ball.x - px;
  const mz = ball.z - pz;
  const dist = Math.hypot(mx, mz);
  if (dist > 1e-6) {
    const dq = Quaternion.RotationAxis(new Vector3(mz, 0, -mx).normalize(), dist / BALL_R);
    ballMesh.rotationQuaternion = dq.multiply(ballMesh.rotationQuaternion);
  }

  if (!pointInPolygon(ball.x, ball.z, hole.outline)) {
    ball.x = px;
    ball.z = pz;
    ball.vx = ball.vz = 0;
  }

  if (ev === 'water') {
    game.state = 'sinking';
    game.timer = 0;
    sfx.splash();
    fx.splash(ball.x, 0.22, ball.z);
    setStrokes(game.strokes + 1);
    toast('Splash! +1 stroke', 1700);
    game.sink = { x: ball.x, z: ball.z, vx: ball.vx * 0.4, vz: ball.vz * 0.4 };
  } else if (ev === 'cup') {
    game.state = 'holing';
    game.timer = 0;
    game.sink = { x: ball.x, z: ball.z };
    sfx.cup();
  } else if (ev === 'stopped') {
    game.state = 'aiming';
  }
}

function update(dt, t) {
  switch (game.state) {
    case 'aiming':
    case 'dragging': {
      const near = hole.circles.some((c) => Math.hypot(c.x - ball.x, c.z - ball.z) < c.r + BALL_R + 0.35);
      if (near || speedOf(ball) > 0) {
        rollBall(dt);
        if (speedOf(ball) > 0 && game.state === 'aiming') game.state = 'rolling';
        syncBall();
      }
      break;
    }
    case 'rolling':
      rollBall(dt);
      syncBall();
      break;
    case 'sinking': {
      game.timer += dt;
      const s = game.sink;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.vx *= 0.9;
      s.vz *= 0.9;
      ball.x = s.x;
      ball.z = s.z;
      const k = Math.min(1, game.timer / 0.55);
      ballLift = -0.42 * k - 0.02;
      ballScale = 1 - 0.1 * k;
      syncBall();
      if (game.timer > 1.35) {
        ballToTee();
        game.state = 'aiming';
      }
      break;
    }
    case 'holing': {
      game.timer += dt;
      const k = Math.min(1, game.timer / 0.28);
      const s = game.sink;
      ball.x = lerp(s.x, hole.cup.x, k);
      ball.z = lerp(s.z, hole.cup.z, k);
      const fall = Math.min(1, game.timer / 0.32);
      ballScale = 1 - 0.18 * fall;
      ballLift = -0.36 * fall * fall;
      syncBall();
      if (game.timer > 0.3 && !game.burst) {
        game.burst = true;
        fx.confetti(hole.cup.x, FAIRWAY_TOP + 0.3, hole.cup.z);
        toast(scoreName(game.strokes, hole.par), 1600);
      }
      if (game.timer > 1.7) {
        game.burst = false;
        if (hole === warHole) startBattle();
        else if (hole === brawlHole) startBrawl();
        else finishHole();
      }
      break;
    }
  }
}

const allWaterMats = [...waterMats, ...holes.flatMap((h) => h.waterMats)];

scene.onBeforeRenderObservable.add(() => {
  const raw = engine.getDeltaTime() / 1000;
  const dt = Math.min(raw, 0.05);
  const t = performance.now() / 1000;
  syncVisibility();
  for (const h of holes) if (visKey.includes(h.island)) h.update(t, dt);
  update(dt, t);
  if (game.state === 'battle') feedBattleInput();
  if (game.state === 'brawl') feedBrawlInput();
  brawl.update(dt, t);
  warzone.update(dt, t, { ball, canBomb: hole === warHole && (game.state === 'aiming' || game.state === 'dragging' || game.state === 'rolling') });
  shake *= Math.exp(-6 * dt);
  updateCamera(Math.min(raw, 0.25), t);
  if (visKey.includes('1')) spain.update(t);
  if (visKey.includes('2')) uk.update(t);
  kid.update(dt, t);
  helper.update(dt, t);
  for (const m of allWaterMats) {
    m.setFloat('time', t);
    m.setVector3('camPos', camera.position);
  }
  if (game.state === 'overview' || game.state === 'flying') updateLabels();
});

placeKid(game.kidAt);
ballToTee();
setTitle();
applyView(viewFor('overview', 0));
setShadowMode('overview');
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
engine.resize();

window.__mg = { snap: () => (tween = null), brawl, brawlHole, helper, ogre, showLetter, sfx, spain, kid, islands, uk, unlockUk, startTransit, switchIsland, DIFFICULTY, scene, camera, game, ball, holes, startHole, toOverview, launch, warzone, blast, flyTo, get hole() { return hole; }, speedOf };

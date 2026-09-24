import { MeshBuilder, StandardMaterial, DynamicTexture, Color3, TransformNode } from '@babylonjs/core';
import { polygonMesh, ensureCCW } from './geometry.js';

// Shared by the Spain and United Kingdom islands: land masses drawn from coastline polygons.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const boundsOf = (pts) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  maxX: Math.max(...pts.map((p) => p.x)),
  minZ: Math.min(...pts.map((p) => p.z)),
  maxZ: Math.max(...pts.map((p) => p.z)),
});

function polyPath(poly, X, Y) {
  const path = new Path2D();
  poly.forEach((p, i) => (i ? path.lineTo(X(p), Y(p)) : path.moveTo(X(p), Y(p))));
  path.closePath();
  return path;
}

// Map-style ground texture: base colour, soft coloured zones (uplands, dry plateau...) and a sandy beach along the coast.
// zones: [{ x, z, r, inner, outer, rocks }] in world units, painted with radial gradients.
function landMaterial(scene, poly, { ppu, base, zones }) {
  const b = boundsOf(poly);
  const W = Math.max(64, Math.ceil((b.maxX - b.minX) * ppu));
  const H = Math.max(64, Math.ceil((b.maxZ - b.minZ) * ppu));
  const tex = new DynamicTexture('landTex', { width: W, height: H }, scene, true);
  const ctx = tex.getContext();
  const rand = rng(W * 7 + H);
  const X = (p) => (p.x - b.minX) * ppu;
  const Y = (p) => (b.maxZ - p.z) * ppu;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H * 0.05; i++) {
    ctx.fillStyle = `rgba(${40 + rand() * 50},${110 + rand() * 60},${40 + rand() * 30},0.35)`;
    ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 3, 2 + rand() * 3);
  }
  for (const zone of zones) {
    const cx = X(zone);
    const cy = Y(zone);
    const rr = zone.r * ppu;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    g.addColorStop(0, zone.inner);
    g.addColorStop(0.55, zone.mid ?? zone.inner);
    g.addColorStop(1, zone.outer);
    ctx.fillStyle = g;
    ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    if (zone.rocks) {
      for (let i = 0; i < rr * 5; i++) {
        const a = rand() * 6.28;
        const d = Math.sqrt(rand()) * rr * 0.8;
        const gray = 120 + rand() * 60;
        ctx.fillStyle = `rgba(${gray},${gray - 6},${gray - 16},0.35)`;
        ctx.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + rand() * 3, 2 + rand() * 2);
      }
    }
  }

  const path = polyPath(poly, X, Y);
  ctx.save();
  ctx.clip(path);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#8dbc60';
  ctx.lineWidth = 8 * ppu;
  ctx.stroke(path);
  ctx.strokeStyle = '#e2d195';
  ctx.lineWidth = 4.4 * ppu;
  ctx.stroke(path);
  ctx.strokeStyle = '#f0e3b0';
  ctx.lineWidth = 1.5 * ppu;
  ctx.stroke(path);
  ctx.restore();
  tex.update();
  tex.anisotropicFilteringLevel = 8;

  const mat = new StandardMaterial('landMat', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  return mat;
}

// Soft turquoise shallows around the coast, drawn once as a blurred alpha mask just above the sea.
function createShelf(scene, polys, all) {
  const ppu = 5;
  const margin = 12;
  const W = Math.ceil((all.maxX - all.minX + margin * 2) * ppu);
  const H = Math.ceil((all.maxZ - all.minZ + margin * 2) * ppu);
  const tex = new DynamicTexture('shelfTex', { width: W, height: H }, scene, true);
  const ctx = tex.getContext();
  const X = (p) => (p.x - all.minX + margin) * ppu;
  const Y = (p) => (all.maxZ + margin - p.z) * ppu;
  for (const [blur, color] of [[9 * ppu, 'rgba(120,225,225,0.55)'], [3.5 * ppu, 'rgba(170,240,235,0.6)']]) {
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = color;
    for (const poly of polys) ctx.fill(polyPath(poly, X, Y));
  }
  ctx.filter = 'none';
  tex.update();
  tex.hasAlpha = true;
  const mat = new StandardMaterial('shelfMat', scene);
  mat.diffuseTexture = tex;
  mat.useAlphaFromDiffuseTexture = true;
  mat.emissiveColor = new Color3(0.8, 1, 1);
  mat.disableLighting = true;
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  const ground = MeshBuilder.CreateGround('shelf', { width: W / ppu, height: H / ppu }, scene);
  ground.position.set((all.minX + all.maxX) / 2, -0.7, (all.minZ + all.maxZ) / 2);
  ground.material = mat;
  ground.isPickable = false;
  return ground;
}

// Builds every landmass (top with the painted map, sandy body) plus the shallows. Landmasses flagged `main` get the zones.
export function createLandmasses(scene, landmasses, { name, base, zones, ppu = 14 }) {
  const root = new TransformNode(name, scene);
  const polys = landmasses.map((l) => ensureCCW(l.poly));
  const all = boundsOf(polys.flat());
  const sand = new StandardMaterial(name + 'Sand', scene);
  sand.diffuseColor = new Color3(0.86, 0.78, 0.55);
  sand.specularColor = Color3.Black();

  landmasses.forEach((land, i) => {
    const poly = polys[i];
    const top = polygonMesh(`${name}Top${i}`, poly, [], scene, 0);
    top.material = landMaterial(scene, poly, { ppu: land.main ? ppu : ppu - 2, base, zones: land.main ? zones : [] });
    top.receiveShadows = true;
    top.parent = root;
    top.isPickable = false;
    const body = polygonMesh(`${name}Body${i}`, poly, [], scene, 1.6);
    body.position.y = -0.02;
    body.material = sand;
    body.parent = root;
    body.isPickable = false;
  });
  createShelf(scene, polys, all).parent = root;
  return { root, polys, bounds: all };
}

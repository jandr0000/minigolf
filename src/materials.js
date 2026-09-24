import {
  DynamicTexture,
  StandardMaterial,
  ShaderMaterial,
  Color3,
  Vector2,
  Vector3,
  Effect,
} from '@babylonjs/core';

export const SKY = new Color3(0.63, 0.83, 0.96);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shade(rgb, k) {
  return `rgb(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)})`;
}

export function grassMaterial(scene, wUnits, hUnits, seed = 1) {
  const ppu = 56;
  const W = Math.round(wUnits * ppu);
  const H = Math.round(hUnits * ppu);
  const tex = new DynamicTexture('grassTex', { width: W, height: H }, scene, true);
  const ctx = tex.getContext();
  const rand = rng(seed);
  const base = [82, 176, 66];
  const band = 1.25 * ppu;
  for (let y = 0, i = 0; y < H; y += band, i++) {
    ctx.fillStyle = shade(base, i % 2 ? 0.9 : 1.03);
    ctx.fillRect(0, y, W, band + 1);
  }
  for (let i = 0; i < W * H * 0.012; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const k = 0.82 + rand() * 0.34;
    ctx.strokeStyle = shade(base, k);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y + (rand() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  tex.update();
  tex.anisotropicFilteringLevel = 8;
  const mat = new StandardMaterial('grass', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  return mat;
}

export function islandMaterial(scene) {
  const S = 2048;
  const tex = new DynamicTexture('islandTex', { width: S, height: S }, scene, true);
  const ctx = tex.getContext();
  const rand = rng(7);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, '#4f9a45');
  g.addColorStop(0.8, '#4f9a45');
  g.addColorStop(0.87, '#6cae52');
  g.addColorStop(0.905, '#dcc98d');
  g.addColorStop(0.96, '#e9d9a3');
  g.addColorStop(1.0, '#cdbb86');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 160000; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    const sand = d > 0.9;
    ctx.fillStyle = sand
      ? `rgba(${170 + rand() * 60},${150 + rand() * 60},${100 + rand() * 40},0.35)`
      : `rgba(${50 + rand() * 40},${120 + rand() * 60},${40 + rand() * 30},0.4)`;
    ctx.fillRect(x, y, 2 + rand() * 3, 2 + rand() * 3);
  }
  tex.update();
  tex.anisotropicFilteringLevel = 8;
  const mat = new StandardMaterial('island', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  return mat;
}

export function ballMaterial(scene) {
  const tex = new DynamicTexture('ballTex', { width: 256, height: 128 }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#e5383b';
  ctx.fillRect(0, 54, 256, 20);
  ctx.fillStyle = '#e5383b';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(32 + i * 64, 20, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.update();
  const mat = new StandardMaterial('ball', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = new Color3(0.6, 0.6, 0.6);
  mat.specularPower = 48;
  return mat;
}

function unionJack(ctx, W, H) {
  const diag = (width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, H);
    ctx.moveTo(W, 0);
    ctx.lineTo(0, H);
    ctx.stroke();
  };
  diag(34, '#ffffff');
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.translate(0, 0);
  diag(11, '#c8102e');
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, H / 2 - 27, W, 54);
  ctx.fillRect(W / 2 - 27, 0, 54, H);
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(0, H / 2 - 16, W, 32);
  ctx.fillRect(W / 2 - 16, 0, 32, H);
}

export function flagMaterial(scene, label, style = 'red') {
  const tex = new DynamicTexture('flagTex_' + label, { width: 256, height: 160 }, scene, true);
  const ctx = tex.getContext();
  const spain = style === 'spain';
  const uk = style === 'uk';
  ctx.fillStyle = spain ? '#c60b1e' : uk ? '#012169' : '#e63946';
  ctx.fillRect(0, 0, 256, 160);
  if (spain) {
    ctx.fillStyle = '#ffc400';
    ctx.fillRect(0, 40, 256, 80);
  }
  if (uk) unionJack(ctx, 256, 160);
  ctx.fillStyle = spain ? 'rgba(90,20,10,0.92)' : 'rgba(255,255,255,0.95)';
  if (uk) {
    ctx.strokeStyle = 'rgba(1,20,60,0.9)';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
  }
  ctx.font = 'bold 110px "Trebuchet MS", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (uk) ctx.strokeText(String(label), 128, 88);
  ctx.fillText(String(label), 128, 88);
  tex.update();
  const mat = new StandardMaterial('flag_' + style + '_' + label, scene);
  mat.diffuseTexture = tex;
  mat.emissiveColor = new Color3(0.25, 0.25, 0.25);
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  return mat;
}

export function softDotTexture(scene) {
  const tex = new DynamicTexture('dot', { width: 64, height: 64 }, scene, true);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export function flatMaterial(scene, name, hex, opts = {}) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = opts.spec ? new Color3(opts.spec, opts.spec, opts.spec) : Color3.Black();
  if (opts.emissive) m.emissiveColor = Color3.FromHexString(opts.emissive);
  if (opts.alpha !== undefined) m.alpha = opts.alpha;
  m.backFaceCulling = opts.cull ?? true;
  return m;
}

Effect.ShadersStore.waterVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vW;
void main() {
  vec4 w = world * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore.waterFragmentShader = `
precision highp float;
varying vec3 vW;
uniform float time;
uniform float scale;
uniform float alpha;
uniform vec3 shallow;
uniform vec3 deep;
uniform vec3 camPos;
uniform vec3 fogColor;
uniform vec2 fogRange;
uniform vec3 sunDir;
float h(vec2 p) {
  float t = time;
  return sin(p.x * 1.3 + t * 0.9) * 0.5 + sin(p.y * 1.7 - t * 0.7) * 0.5
       + sin((p.x + p.y) * 2.3 + t * 1.3) * 0.3 + sin((p.x - p.y * 1.3) * 3.7 - t * 1.1) * 0.2;
}
void main() {
  vec2 p = vW.xz * scale;
  float d = length(vW - camPos);
  float detail = 1.0 - smoothstep(60.0, 190.0, d);
  float e = 0.04;
  float hc = h(p) * detail;
  vec3 n = normalize(vec3(-(h(p + vec2(e, 0.0)) * detail - hc) / e * 0.07, 1.0, -(h(p + vec2(0.0, e)) * detail - hc) / e * 0.07));
  vec3 V = normalize(camPos - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 col = mix(deep, shallow, clamp(0.5 + 0.28 * hc, 0.0, 1.0));
  vec3 R = reflect(-sunDir, n);
  float spec = pow(max(dot(R, V), 0.0), 90.0);
  col += vec3(1.0, 0.97, 0.88) * spec * 0.9;
  col = mix(col, vec3(0.78, 0.92, 1.0), fres * 0.35);
  float c = pow(max(0.0, sin(p.x * 4.0 + hc * 2.0) * sin(p.y * 4.0 - hc * 2.0)), 6.0);
  col += c * 0.10 * detail;
  float f = clamp((d - fogRange.x) / (fogRange.y - fogRange.x), 0.0, 1.0);
  col = mix(col, fogColor, f);
  gl_FragColor = vec4(col, mix(alpha, 1.0, fres * 0.3));
}`;

export function waterMaterial(scene, { shallow, deep, alpha = 1, scale = 1, fogRange = [1e5, 2e5] }) {
  const mat = new ShaderMaterial(
    'water',
    scene,
    { vertex: 'water', fragment: 'water' },
    {
      attributes: ['position'],
      uniforms: ['world', 'worldViewProjection', 'time', 'scale', 'alpha', 'shallow', 'deep', 'camPos', 'fogColor', 'fogRange', 'sunDir'],
    }
  );
  mat.setFloat('time', 0);
  mat.setFloat('scale', scale);
  mat.setFloat('alpha', alpha);
  mat.setColor3('shallow', Color3.FromArray(shallow));
  mat.setColor3('deep', Color3.FromArray(deep));
  mat.setColor3('fogColor', SKY);
  mat.setVector2('fogRange', new Vector2(fogRange[0], fogRange[1]));
  mat.setVector3('sunDir', new Vector3(0.45, 0.8, -0.35).normalize());
  mat.setVector3('camPos', Vector3.Zero());
  mat.backFaceCulling = false;
  if (alpha < 1) mat.alpha = 0.99;
  return mat;
}

const stoneMats = new WeakMap();
export function stoneMaterial(scene) {
  let mat = stoneMats.get(scene);
  if (mat) return mat;
  const S = 256;
  const tex = new DynamicTexture('stoneTex', { width: S, height: S }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = '#8d8c86';
  ctx.fillRect(0, 0, S, S);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 900; i++) {
    const g = 110 + rnd() * 80;
    ctx.fillStyle = `rgba(${g},${g - 2},${g - 8},0.35)`;
    ctx.beginPath();
    ctx.ellipse(rnd() * S, rnd() * S, 3 + rnd() * 14, 2 + rnd() * 8, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = 'rgba(40,40,36,0.28)';
    ctx.lineWidth = 1 + rnd() * 1.5;
    ctx.beginPath();
    const x = rnd() * S;
    const y = rnd() * S;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 60);
    ctx.stroke();
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = 'rgba(96,130,70,0.35)';
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2 + rnd() * 3);
  }
  tex.update();
  mat = new StandardMaterial('stone', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  stoneMats.set(scene, mat);
  return mat;
}

// Bullring floor: raked sand with concentric rake lines and two painted rings. Square canvas; the ring radius is `radius` units.
export function sandGroundMaterial(scene, radius, seed = 1) {
  const ppu = 44;
  const S = Math.round(radius * 2 * ppu);
  const tex = new DynamicTexture('sandGroundTex', { width: S, height: S }, scene, true);
  const ctx = tex.getContext();
  const rand = rng(seed);
  ctx.fillStyle = '#dcc08b';
  ctx.fillRect(0, 0, S, S);
  const c = S / 2;
  for (let r = 0.3 * ppu, i = 0; r < c * 1.45; r += 0.3 * ppu, i++) {
    ctx.strokeStyle = i % 2 ? 'rgba(150,110,60,0.13)' : 'rgba(255,240,205,0.16)';
    ctx.lineWidth = 0.09 * ppu;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < S * S * 0.03; i++) {
    const g = 150 + rand() * 90;
    ctx.fillStyle = `rgba(${g},${g - 30},${g - 80},0.25)`;
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  ctx.strokeStyle = 'rgba(255,250,240,0.85)';
  ctx.lineWidth = 0.11 * ppu;
  for (const r of [radius - 1.5, radius * 0.42]) {
    ctx.beginPath();
    ctx.arc(c, c, r * ppu, 0, Math.PI * 2);
    ctx.stroke();
  }
  tex.update();
  tex.anisotropicFilteringLevel = 8;
  const mat = new StandardMaterial('sandGround', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = Color3.Black();
  mat.backFaceCulling = false;
  return mat;
}

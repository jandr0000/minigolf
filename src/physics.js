import { pointInPolygon } from './geometry.js';

export const BALL_R = 0.22;
export const CUP_R = 0.55;
export const MAX_SPEED = 19;

const FRICTION_CONST = 1.5;
const FRICTION_LINEAR = 0.65;
const WALL_RESTITUTION = 0.78;
const BULL_RESTITUTION = 0.62;
const CUP_MAX_SPEED = 6.5;
const STOP_SPEED = 0.14;
const SUBSTEP = 1 / 240;

export function speedOf(b) {
  return Math.hypot(b.vx, b.vz);
}

export function launch(b, dx, dz, power) {
  const l = Math.hypot(dx, dz) || 1;
  const s = MAX_SPEED * Math.pow(power, 1.3);
  b.vx = (dx / l) * s;
  b.vz = (dz / l) * s;
}

// Advances the ball; returns null, 'cup', 'water' or 'stopped'.
export function stepBall(b, hole, dt) {
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
  const h = dt / steps;
  let event = null;
  for (let i = 0; i < steps && !event; i++) event = substep(b, hole, h);
  return event;
}

function substep(b, hole, dt) {
  let sp = speedOf(b);
  if (sp === 0) {
    // a resting ball can still be bumped by a moving obstacle
    if (!hole.circles.length) return null;
    for (const c of hole.circles) collideCircle(b, c);
    for (const s of hole.segs) collideSegment(b, s);
    return null;
  }

  // pull toward the cup when rolling slowly across its lip
  const cx = hole.cup.x - b.x;
  const cz = hole.cup.z - b.z;
  const cd = Math.hypot(cx, cz);
  if (cd < CUP_R * 1.5 && sp < 4.5) {
    const pull = 6 * (1 - cd / (CUP_R * 1.5));
    b.vx += (cx / cd) * pull * dt;
    b.vz += (cz / cd) * pull * dt;
    sp = speedOf(b);
  }

  // rolling resistance
  const decel = (FRICTION_CONST + FRICTION_LINEAR * sp) * dt;
  if (decel >= sp) {
    b.vx = 0;
    b.vz = 0;
    return cd < CUP_R * 1.2 ? 'cup' : 'stopped';
  }
  const k = (sp - decel) / sp;
  b.vx *= k;
  b.vz *= k;
  sp *= k;

  b.x += b.vx * dt;
  b.z += b.vz * dt;

  for (const s of hole.segs) collideSegment(b, s);
  for (const c of hole.circles) collideCircle(b, c);

  if (sp < STOP_SPEED) {
    b.vx = 0;
    b.vz = 0;
    return cd < CUP_R * 1.2 ? 'cup' : 'stopped';
  }

  for (const pond of hole.ponds) {
    if (pointInPolygon(b.x, b.z, pond)) return 'water';
  }

  const d = Math.hypot(hole.cup.x - b.x, hole.cup.z - b.z);
  if (d < CUP_R * 0.85 && speedOf(b) < CUP_MAX_SPEED) return 'cup';
  return null;
}

function bounce(b, nx, nz) {
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) {
    if (-vn > (b.bump || 0)) b.bump = -vn;
    b.vx -= (1 + WALL_RESTITUTION) * vn * nx;
    b.vz -= (1 + WALL_RESTITUTION) * vn * nz;
  }
}

function collideSegment(b, [x1, z1, x2, z2]) {
  const ex = x2 - x1;
  const ez = z2 - z1;
  const l2 = ex * ex + ez * ez;
  let t = ((b.x - x1) * ex + (b.z - z1) * ez) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = b.x - (x1 + ex * t);
  const dz = b.z - (z1 + ez * t);
  const d2 = dx * dx + dz * dz;
  if (d2 >= BALL_R * BALL_R) return;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = dx / d;
  const nz = dz / d;
  b.x += nx * (BALL_R - d);
  b.z += nz * (BALL_R - d);
  bounce(b, nx, nz);
}

function collideCircle(b, c) {
  const dx = b.x - c.x;
  const dz = b.z - c.z;
  const min = c.r + BALL_R;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = dx / d;
  const nz = dz / d;
  b.x += nx * (min - d);
  b.z += nz * (min - d);
  const vn = (b.vx - (c.vx || 0)) * nx + (b.vz - (c.vz || 0)) * nz;
  if (vn < 0) {
    const e = c.kind === 'bull' ? BULL_RESTITUTION : WALL_RESTITUTION;
    b.vx -= (1 + e) * vn * nx;
    b.vz -= (1 + e) * vn * nz;
    if (c.kind === 'bull') {
      b.bumpBull = Math.max(b.bumpBull || 0, -vn);
      b.bumpSpecies = c.species;
      if (c.onHit && -vn > 0.4) c.onHit();
    } else if (-vn > (b.bump || 0)) b.bump = -vn;
  }
}

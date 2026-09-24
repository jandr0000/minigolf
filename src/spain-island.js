import { pointInPolygon, mergeByMaterial } from './geometry.js';
import { createLandmasses } from './island-map.js';
import { createPalm } from './palm.js';
import { SPAIN_LANDMASSES, SPAIN_ZONES, KID_SPOT, LANDING_SPOT } from './spain-shape.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// The first island: Spain. Land, shallows and scenery palms; the kid and the holes are placed by the caller.
export function createSpainIsland(scene, { holes }) {
  const { root, polys, bounds } = createLandmasses(scene, SPAIN_LANDMASSES, {
    name: 'spain',
    base: '#64ab4e',
    zones: SPAIN_ZONES,
    ppu: 26,
  });
  const mainland = polys[0];

  const rand = rng(77);
  const avoid = holes.map((h) => ({
    x: h.center.x,
    z: h.center.z,
    hw: h.size.w / 2 + (h.extent || 0) + 3,
    hd: h.size.d / 2 + (h.extent || 0) + 3,
  }));
  const okSpot = (x, z) => {
    if (!pointInPolygon(x, z, mainland)) return false;
    if (Math.hypot(x - KID_SPOT.x, z - KID_SPOT.z) < 4.5 || Math.hypot(x - LANDING_SPOT.x, z - LANDING_SPOT.z) < 6) return false;
    if (avoid.some((r) => Math.abs(x - r.x) < r.hw && Math.abs(z - r.z) < r.hd)) return false;
    return [3, -3].every((d) => pointInPolygon(x + d, z, mainland) && pointInPolygon(x, z + d, mainland));
  };

  const palms = [];
  for (let tries = 0; tries < 6000 && palms.length < 34; tries++) {
    const x = bounds.minX + rand() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rand() * (bounds.maxZ - bounds.minZ);
    if (!okSpot(x, z)) continue;
    const palm = createPalm(scene, {
      x,
      z,
      height: 2.4 + rand() * 1.1,
      lean: [(rand() - 0.5) * 1.2, (rand() - 0.5) * 1.2],
      seed: 100 + palms.length,
    });
    palm.root.parent = root;
    palms.push(palm);
  }

  // the scattered palms are scenery: bake them into a few meshes (only the palms next to the holes sway)
  mergeByMaterial(palms.flatMap((p) => p.meshes), root);
  palms.forEach((p) => p.root.dispose());
  palms.length = 0;

  return {
    root,
    palms,
    casters: [],
    center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    halfW: (bounds.maxX - bounds.minX) / 2,
    halfD: (bounds.maxZ - bounds.minZ) / 2,
    kidSpot: KID_SPOT,
    landSpot: LANDING_SPOT,
    update(t) {
      palms.forEach((p) => p.update(t));
    },
  };
}

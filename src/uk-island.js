import { pointInPolygon, mergeByMaterial } from './geometry.js';
import { createLandmasses } from './island-map.js';
import { UK_LANDMASSES, UK_UPLANDS, UK_PAD, ukWorld } from './uk-shape.js';
import { createPine, createHelipad } from './uk-props.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// The United Kingdom island: land masses, shallows, scenery and the helipad the helicopter lands on.
export function createUkIsland(scene, { holes }) {
  const zones = UK_UPLANDS.map(([lon, lat, r]) => ({
    ...ukWorld(lon, lat),
    r: r * 16.3,
    inner: 'rgba(118,116,66,0.85)',
    mid: 'rgba(96,120,58,0.6)',
    outer: 'rgba(90,130,70,0)',
    rocks: true,
  }));
  const { root, polys, bounds } = createLandmasses(scene, UK_LANDMASSES, { name: 'uk', base: '#5ea94e', zones, ppu: 18 });
  const gb = polys[0];

  const helipad = createHelipad(scene, { x: UK_PAD.x, z: UK_PAD.z, y: 0 });
  helipad.root.parent = root;

  // Scenery pines: mostly near the holes so every hole view has a backdrop, plus a scatter across Scotland.
  const rand = rng(2024);
  const avoid = holes.map((h) => ({
    x: h.center.x,
    z: h.center.z,
    hw: h.size.w / 2 + (h.extent || 0) + 3,
    hd: h.size.d / 2 + (h.extent || 0) + 3,
  }));
  const okSpot = (x, z) => {
    if (!pointInPolygon(x, z, gb)) return false;
    if (Math.hypot(x - UK_PAD.x, z - UK_PAD.z) < 8) return false;
    if (avoid.some((r) => Math.abs(x - r.x) < r.hw && Math.abs(z - r.z) < r.hd)) return false;
    return [3, -3].every((d) => pointInPolygon(x + d, z, gb) && pointInPolygon(x, z + d, gb));
  };
  const pines = [];
  const plant = (x, z) => {
    pines.push(createPine(scene, { x, z, height: 3 + rand() * 2.8, seed: pines.length + 50 }));
    pines[pines.length - 1].root.parent = root;
  };
  for (const h of holes) {
    let n = 0;
    for (let tries = 0; tries < 400 && n < 14; tries++) {
      const a = rand() * 6.283;
      const d = 9 + rand() * 20;
      const x = h.center.x + Math.cos(a) * d * 1.5;
      const z = h.center.z + Math.sin(a) * d;
      if (okSpot(x, z)) {
        plant(x, z);
        n++;
      }
    }
  }
  for (let tries = 0, n = 0; tries < 3000 && n < 26; tries++) {
    const x = bounds.minX + rand() * (bounds.maxX - bounds.minX);
    const z = ukWorld(0, 55.4).z + rand() * (ukWorld(0, 58.3).z - ukWorld(0, 55.4).z);
    if (okSpot(x, z)) {
      plant(x, z);
      n++;
    }
  }

  // the scattered trees never move: bake them into a couple of meshes
  mergeByMaterial(pines.flatMap((p) => p.meshes), root);
  pines.forEach((p) => p.root.dispose());
  pines.length = 0;

  return {
    root,
    helipad,
    pines,
    casters: helipad.casters,
    center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    halfW: (bounds.maxX - bounds.minX) / 2,
    halfD: (bounds.maxZ - bounds.minZ) / 2,
    // where the kid stands after stepping off the helicopter
    kidSpot: { x: UK_PAD.x - 3.4, z: UK_PAD.z - 4.8 },
    update(t) {
      helipad.update(t);
      pines.forEach((p) => p.update(t));
    },
  };
}

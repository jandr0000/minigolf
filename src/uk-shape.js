import { chaikin } from './geometry.js';

// The second island is a map of the United Kingdom, drawn from rough (lon, lat) coastline points.
// One degree of latitude is KZ world units, one of longitude KX (at ~54 degrees north), so the shape keeps its real proportions.

const X0 = 190; // world x of lon -6
const Z0 = -66; // world z of lat 50
const KX = 9.6;
const KZ = 16.3;

export const ukWorld = (lon, lat) => ({ x: X0 + (lon + 6) * KX, z: Z0 + (lat - 50) * KZ });

// Helipad: just north of Lytham St Annes (hole 7 is centred on ukWorld(-1.5, 53.75), see holes.js), clear of its pines.
const LYTHAM = ukWorld(-1.5, 53.75);
export const UK_PAD = { x: LYTHAM.x - 1.2, z: LYTHAM.z + 12.6 };

// Great Britain, counter-clockwise: south coast west to east, up the east coast, round Scotland, down the west coast.
const GREAT_BRITAIN = [
  [-5.72, 50.07], [-5.35, 50.03], [-5.2, 49.96], [-5.05, 50.1], [-4.8, 50.2], [-4.15, 50.34],
  [-3.78, 50.2], [-3.55, 50.4], [-3.2, 50.62], [-2.45, 50.55], [-1.95, 50.65], [-1.2, 50.74],
  [-0.75, 50.78], [-0.14, 50.82], [0.25, 50.75], [0.7, 50.85], [0.98, 50.92], [1.4, 51.13],
  // Kent, Thames estuary, Essex, East Anglia
  [1.44, 51.37], [1.0, 51.37], [0.6, 51.45], [0.75, 51.6], [1.15, 51.72], [1.3, 51.93],
  [1.75, 52.3], [1.72, 52.6], [1.3, 52.95],
  // The Wash
  [0.5, 52.95], [0.35, 52.8], [0.2, 52.88], [0.3, 53.1], [0.2, 53.4], [0.1, 53.58],
  // Humber, Yorkshire, north-east England, Firth of Forth, Fife, Tay
  [-0.1, 53.7], [0.0, 53.8], [-0.08, 54.12], [-0.5, 54.4], [-1.1, 54.58], [-1.3, 54.85],
  [-1.5, 55.05], [-1.6, 55.4], [-2.0, 55.75], [-2.5, 56.0], [-3.1, 55.97], [-3.6, 56.05],
  [-3.0, 56.2], [-2.6, 56.32], [-3.0, 56.45], [-2.5, 56.5], [-2.45, 56.75],
  // north-east Scotland, Moray Firth, north coast
  [-2.08, 57.15], [-1.78, 57.5], [-2.0, 57.7], [-2.9, 57.68], [-3.6, 57.7], [-4.0, 57.55],
  [-4.2, 57.5], [-4.1, 57.65], [-3.9, 57.85], [-3.6, 58.0], [-3.1, 58.4], [-3.05, 58.63],
  [-3.4, 58.67], [-4.0, 58.55], [-4.6, 58.55], [-5.0, 58.63],
  // west coast of Scotland, Solway Firth
  [-5.2, 58.3], [-5.15, 57.95], [-5.7, 57.6], [-5.6, 57.3], [-5.85, 57.0], [-5.75, 56.85],
  [-6.2, 56.75], [-5.7, 56.6], [-5.55, 56.4], [-5.6, 56.05], [-5.75, 55.35], [-5.4, 55.55],
  [-5.0, 55.9], [-4.75, 55.95], [-4.75, 55.55], [-4.63, 55.45], [-5.0, 55.0], [-5.05, 54.85],
  [-4.85, 54.65], [-4.4, 54.75], [-4.0, 54.83], [-3.5, 54.97], [-3.1, 54.95],
  // Cumbria, Lancashire, Merseyside, north Wales
  [-3.4, 54.87], [-3.6, 54.55], [-3.4, 54.3], [-3.2, 54.1], [-2.86, 54.07], [-3.05, 53.82],
  [-3.0, 53.6], [-3.0, 53.4], [-3.2, 53.4], [-3.1, 53.3], [-3.4, 53.34], [-3.83, 53.33],
  [-4.35, 53.42], [-4.65, 53.3], [-4.4, 53.15], [-4.55, 53.0], [-4.75, 52.8], [-4.1, 52.85],
  // Cardigan Bay, Pembrokeshire, Severn, Devon and Cornwall
  [-4.05, 52.55], [-4.5, 52.15], [-5.3, 51.88], [-5.1, 51.7], [-4.7, 51.65], [-4.3, 51.7],
  [-3.95, 51.6], [-3.4, 51.4], [-3.15, 51.47], [-2.98, 51.58], [-2.65, 51.6], [-2.6, 51.5],
  [-3.0, 51.2], [-3.5, 51.2], [-4.2, 51.2], [-4.55, 51.0], [-4.55, 50.83], [-4.9, 50.6],
  [-5.15, 50.35], [-5.45, 50.2],
];

const NORTHERN_IRELAND = [
  [-7.25, 55.0], [-6.9, 55.18], [-6.5, 55.25], [-6.15, 55.25], [-5.95, 55.05], [-5.85, 54.85],
  [-5.9, 54.7], [-5.55, 54.65], [-5.5, 54.4], [-5.6, 54.15], [-6.0, 54.02], [-6.6, 54.05],
  [-7.1, 54.1], [-7.45, 54.3], [-8.0, 54.35], [-7.9, 54.55], [-7.55, 54.75], [-7.4, 54.95],
];

const isle = (lon, lat, rlon, rlat, n = 18) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [lon + Math.cos(a) * rlon, lat + Math.sin(a) * rlat];
  });

const toWorld = (pts) => pts.map(([lon, lat]) => ukWorld(lon, lat));

export const UK_LANDMASSES = [
  { name: 'Great Britain', poly: chaikin(toWorld(GREAT_BRITAIN), 2), main: true },
  { name: 'Northern Ireland', poly: chaikin(toWorld(NORTHERN_IRELAND), 2) },
  { name: 'Isle of Man', poly: chaikin(toWorld(isle(-4.5, 54.22, 0.26, 0.15)), 1) },
  { name: 'Isle of Wight', poly: chaikin(toWorld(isle(-1.3, 50.67, 0.27, 0.07)), 1) },
];

// Upland areas painted darker on the map: [lon, lat, radius in degrees of latitude]
export const UK_UPLANDS = [
  [-4.6, 57.2, 1.05], [-5.0, 56.6, 0.55], [-3.6, 55.3, 0.5], [-3.8, 52.5, 0.6],
  [-2.2, 54.4, 0.65], [-3.1, 54.5, 0.3], [-3.9, 50.6, 0.25], [-3.6, 51.1, 0.2],
];

import { chaikin } from './geometry.js';

// The first island is a map of Spain, drawn from rough (lon, lat) coastline points and centred on the world origin.
// The border with Portugal is treated as coast so the island reads as Spain on its own.
const KX = 6.56; // world units per degree of longitude (about 13 km per unit at 40 degrees north)
const KZ = 8.54; // world units per degree of latitude
const LON0 = -3.0;
const LAT0 = 39.9;

export const spainWorld = (lon, lat) => ({ x: (lon - LON0) * KX, z: (lat - LAT0) * KZ });

// north coast west to east, Pyrenees, Mediterranean coast south, Atlantic coast, then north along the Portuguese border
const MAINLAND = [
  [-9.27, 42.88], [-9.1, 43.1], [-8.75, 43.35], [-8.25, 43.45], [-7.7, 43.75], [-7.0, 43.55],
  [-6.2, 43.58], [-5.7, 43.55], [-5.0, 43.4], [-4.2, 43.4], [-3.8, 43.47], [-3.4, 43.4],
  [-2.9, 43.4], [-2.2, 43.35], [-1.78, 43.37],
  [-1.4, 43.0], [-0.7, 42.85], [0.1, 42.75], [0.7, 42.85], [1.4, 42.7], [1.75, 42.5],
  [2.4, 42.35], [3.17, 42.43], [3.3, 42.2],
  [3.2, 41.8], [2.8, 41.65], [2.2, 41.45], [1.5, 41.2], [1.0, 41.05], [0.9, 40.7],
  [0.55, 40.4], [0.0, 39.9], [-0.3, 39.45], [0.0, 39.0], [0.2, 38.75], [-0.2, 38.5],
  [-0.5, 38.3], [-0.7, 37.8], [-0.9, 37.6], [-1.5, 37.25], [-2.1, 36.9], [-2.5, 36.75],
  [-3.5, 36.72], [-4.4, 36.68], [-5.0, 36.45], [-5.35, 36.15], [-5.6, 36.0],
  [-6.1, 36.35], [-6.3, 36.6], [-6.4, 36.95], [-6.9, 37.15], [-7.4, 37.2],
  [-7.5, 37.6], [-7.3, 38.2], [-7.2, 38.6], [-7.0, 38.95], [-7.2, 39.3], [-7.35, 39.7],
  [-7.0, 40.0], [-6.85, 40.4], [-6.9, 40.9], [-6.5, 41.3], [-6.2, 41.55], [-6.6, 41.9],
  [-7.2, 41.95], [-7.7, 42.0], [-8.2, 42.1], [-8.7, 41.95], [-8.85, 42.2], [-8.85, 42.45],
  [-9.0, 42.75],
];

const isle = (lon, lat, rlon, rlat, n = 18) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [lon + Math.cos(a) * rlon, lat + Math.sin(a) * rlat];
  });

const toWorld = (pts) => pts.map(([lon, lat]) => spainWorld(lon, lat));

export const SPAIN_LANDMASSES = [
  { name: 'Spain', poly: chaikin(toWorld(MAINLAND), 2), main: true },
  { name: 'Mallorca', poly: chaikin(toWorld(isle(2.95, 39.6, 0.6, 0.3)), 1) },
  { name: 'Menorca', poly: chaikin(toWorld(isle(4.1, 39.95, 0.3, 0.1)), 1) },
  { name: 'Ibiza', poly: chaikin(toWorld(isle(1.4, 39.0, 0.17, 0.13)), 1) },
];

// Painted zones for the map: [lon, lat, radius in units, colours]. A warm dry plateau in the middle, greyer mountains.
export const SPAIN_ZONES = [
  { ...spainWorld(-4.0, 39.8), r: 30, inner: 'rgba(206,176,104,0.78)', mid: 'rgba(196,170,100,0.5)', outer: 'rgba(196,170,100,0)' },
  { ...spainWorld(0.0, 42.6), r: 9, inner: 'rgba(120,112,90,0.85)', outer: 'rgba(120,112,90,0)', rocks: true },
  { ...spainWorld(-5.4, 43.0), r: 8, inner: 'rgba(104,120,84,0.8)', outer: 'rgba(104,120,84,0)', rocks: true },
  { ...spainWorld(-3.2, 37.1), r: 7, inner: 'rgba(128,116,92,0.85)', outer: 'rgba(128,116,92,0)', rocks: true },
  { ...spainWorld(-4.0, 40.8), r: 6, inner: 'rgba(118,112,90,0.7)', outer: 'rgba(118,112,90,0)', rocks: true },
  { ...spainWorld(-2.5, 41.6), r: 6, inner: 'rgba(122,114,88,0.6)', outer: 'rgba(122,114,88,0)', rocks: true },
];

// Where things stand on the island (world x/z). The kid waits in the middle; the helicopter lands beside him.
export const KID_SPOT = { x: 6, z: -1 };
export const LANDING_SPOT = { x: 11, z: -1 };

export const SEED = 4817;
export const CHUNK_LENGTH = 128;
export const TERRAIN_STEP = 8;
export const ROAD_HALF_WIDTH = 5.5;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function randomAt(a, b = 0, seed = SEED) {
  let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed, 144269);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function seededRandom(seed) {
  let i = 0;
  return () => randomAt(seed, i++);
}

// Several long wavelengths produce composed bends instead of point-to-point noise.
export function roadX(s) { return 27 * Math.sin(s / 130) + 24 * Math.sin(s / 60 + .5) + 6 * Math.sin(s / 260 + 1.2); }
export function roadDerivative(s) { return 27 / 130 * Math.cos(s / 130) + 24 / 60 * Math.cos(s / 60 + .5) + 6 / 260 * Math.cos(s / 260 + 1.2); }
export function roadHeight(s) { return 24 + 6 * Math.sin(s / 173 + .5) + 3 * Math.sin(s / 83); }
export function coastOffset(s) { return -28 - 8 * Math.sin(s / 107 + .8) - 4 * Math.sin(s / 43) - 3 * Math.sin(s / 23 + 2); }
export function beachWidth(s) { return 3 + 20 * smoothstep(-.15, .85, Math.sin(s / 137 + 1.1)); }
export function shorelineOffset(s) { return coastOffset(s) - 10 - beachWidth(s) - 2.4; }

// Landmarks use world-space intervals, independently of streaming chunk boundaries.
export function bridgeAt(s) {
  const index = Math.round((s - 148) / 896);
  const center = 148 + index * 896;
  return { index, center, start: center - 36, end: center + 36, length: 72 };
}
export function ravineAmount(s, u) {
  const bridge = bridgeAt(s);
  const along = 1 - smoothstep(24, 46, Math.abs(s - bridge.center));
  return along * (1 - smoothstep(24, 112, u));
}
export function pondAt(s) {
  const index = Math.round((s - 246) / 704);
  const center = 246 + index * 704;
  return { index, center, u: 69 + randomAt(index, 370) * 13, rs: 32 + randomAt(index, 371) * 8, ru: 18 + randomAt(index, 372) * 5, level: roadHeight(center) + 8 };
}
export function pondRadius(s, u, pond = pondAt(s)) {
  const x = (s - pond.center) / pond.rs, y = (u - pond.u) / pond.ru;
  const angle = Math.atan2(y, x);
  return Math.hypot(x, y) / (1 + .09 * Math.sin(angle * 3 + pond.index) + .045 * Math.sin(angle * 5));
}
export function mountainHeight(s, u) {
  const cell = Math.floor(s / 256);
  let height = 0;
  for (let index = cell - 1; index <= cell + 1; index++) {
    const center = 120 + index * 256 + (randomAt(index, 715) - .5) * 54;
    const cross = 142 + randomAt(index, 716) * 49;
    const ridge = Math.max(0, 1 - Math.abs(s - center) / 140 - Math.abs(u - cross) / 100);
    height += (27 + randomAt(index, 717) * 25) * ridge * ridge;
  }
  return height;
}
export function roadFrame(s) {
  const dx = roadDerivative(s);
  const scale = Math.sqrt(1 + dx * dx);
  return { x: roadX(s), y: roadHeight(s), z: -s, nx: 1 / scale, nz: dx / scale, angle: Math.atan(dx), scale };
}
export function positionAt(s, u, height) {
  const f = roadFrame(s);
  // Fade out the normal offset beyond the shoulders so wide hills cannot fold
  // over themselves on the inside of a bend. The road itself uses exact normals.
  const offset = Math.abs(u) <= 7 ? u : Math.sign(u) * (7 + 30 * Math.tanh((Math.abs(u) - 7) / 30));
  return { x: f.x + u + offset * (f.nx - 1), y: height ?? terrainHeight(s, u), z: f.z + offset * f.nz };
}

function baseTerrainHeight(s, u) {
  const h = roadHeight(s);
  const coast = coastOffset(s);
  const ripple = Math.sin(s * .095 + u * .11) * .7 + Math.sin(s * .043 - u * .18) * .6;
  const beach = coast - 10 - beachWidth(s);
  if (u < beach - 7) return -3.2;
  if (u < beach) return lerp(-3.2, 1.2, smoothstep(beach - 7, beach, u));
  if (u < coast - 10) return 1.2;
  if (u < coast) return lerp(1.2, h + 1.2 + ripple, smoothstep(coast - 10, coast, u));
  if (u < -7) return h + (1.2 + ripple) * smoothstep(-7, coast, u);
  if (u < 7) return h;
  const inland = smoothstep(8, 96, u);
  const hill = 17 + 24 * Math.sin(s / 112 + u / 87) ** 2 + 25 * Math.sin(s / 63 - u / 69) ** 2;
  return h + inland * hill + ripple * smoothstep(7, 26, u) + mountainHeight(s, u) * inland;
}
export function groundHeight(s, u) {
  let height = baseTerrainHeight(s, u);
  const pond = pondAt(s), radius = pondRadius(s, u, pond);
  if (radius < 1.6) {
    const basin = pond.level - 2.2 + 3.5 * smoothstep(.45, 1.12, radius);
    height = lerp(basin, height, smoothstep(1.12, 1.6, radius));
  }
  const ravine = ravineAmount(s, u) * smoothstep(1.5, 2, radius);
  height = lerp(height, Math.min(height, -1.5 + smoothstep(20, 100, u) * 49), ravine);
  return height;
}
export function terrainHeight(s, u) {
  // Driving queries see the bridge deck; scenery queries see the inlet beneath it.
  if (Math.abs(u) <= 7) return roadHeight(s);
  return groundHeight(s, u);
}

// All chunk boundaries sample the same global rows, including their vertex jitter.
export function terrainColumns(s) {
  const c = coastOffset(s);
  const b = c - 10 - beachWidth(s);
  return [-300, -220, -160, b - 35, b - 17, b - 7, b, c - 10, c - 4, c, (c - 7) / 2, -7, 0, 7, ...Array.from({ length: 23 }, (_, i) => 14 + i * 12)];
}
export function terrainVertex(row, column) {
  const baseS = row * TERRAIN_STEP;
  const s = baseS + ((column > 2 && column !== 11 && column !== 12 && column !== 13) ? (randomAt(row, column) - .5) * 5.6 : 0);
  const columns = terrainColumns(s);
  let u = columns[column];
  if (column >= 7 && column <= 9) u += (randomAt(row + 218, column) - .5) * 2.7;
  if (column >= 14) u += (randomAt(row + 991, column) - .5) * Math.min(8, (u - 7) * .26);
  const p = positionAt(s, u, groundHeight(s, u));
  const detail = smoothstep(1.05, 1.65, pondRadius(s, u)) * (1 - ravineAmount(s, u));
  if (column >= 7 && column <= 9) p.y += (randomAt(row, column + 500) - .5) * 2.3 * detail;
  if (column >= 16) p.y += (randomAt(row, column + 700) - .5) * (column > 18 ? 8 : 3) * detail;
  return { ...p, s, u, column };
}

export const coastalDrivingRoute = {
  frame: roadFrame,
  position: positionAt,
  height: terrainHeight,
  bounds(s) {
    const onBridge = Math.abs(s - bridgeAt(s).center) < 49;
    return onBridge ? [-4.65, 4.65] : [Math.max(coastOffset(s) + 6, -15), 17];
  },
};

import { roadFrame, roadHeight, positionAt, randomAt, smoothstep, lerp } from './route.js';

export const JUNGLE_STEP = 8;
export const RIVER_STEP = 2;
export const POOL_SPAN = 112;

// Smooth two-dimensional value noise for cohesive groves, litter and moss patches.
export function jungleNoise(s, u, span, salt) {
  const cs = Math.floor(s / span), cu = Math.floor(u / span);
  const ts = smoothstep(0, 1, s / span - cs), tu = smoothstep(0, 1, u / span - cu);
  const at = (i, j) => randomAt(i * 1031 + j, salt);
  return lerp(lerp(at(cs, cu), at(cs + 1, cu), ts), lerp(at(cs, cu + 1), at(cs + 1, cu + 1), ts), tu);
}
export function ribbonNoise(s, span, salt) {
  const cell = Math.floor(s / span), t = smoothstep(0, 1, s / span - cell);
  return lerp(randomAt(cell, salt), randomAt(cell + 1, salt), t);
}

// A river runs below the road on the camera side, wandering closer and
// farther and widening into pools. Its banks are exact terrain columns.
export function riverCenter(s) { return -48 - 12 * Math.sin(s / 131 + .4) - 5 * Math.sin(s / 53); }
export function riverHalfWidth(s) { return 6 + 2 * Math.sin(s / 89 + 1) + 1.2 * Math.sin(s / 37); }

// Terraced pools step down three times, then a taller fall feeds the next
// reach. Boundaries snap to the river mesh rows so each lip is a single edge,
// and every level is a pure function of the pool index, never of chunks.
function poolBoundary(index) { return Math.round((index * POOL_SPAN + 22 + randomAt(index, 2201) * 60) / RIVER_STEP) * RIVER_STEP; }
function poolLevel(index) {
  // Each pool sits well below the lowest point of the road beside it.
  const start = poolBoundary(index), end = poolBoundary(index + 1);
  let road = Infinity;
  for (let i = 0; i <= 6; i++) road = Math.min(road, roadHeight(lerp(start, end, i / 6)));
  return road - 7.5 - 2.4 * ((index % 4 + 4) % 4) - randomAt(index, 2202) * 1.2;
}
export function poolAt(s) {
  let index = Math.floor((s - 22) / POOL_SPAN);
  if (s < poolBoundary(index)) index--;
  return { index, start: poolBoundary(index), end: poolBoundary(index + 1), level: poolLevel(index), above: poolLevel(index - 1), below: poolLevel(index + 1) };
}
export function riverLevel(s) {
  const pool = poolAt(s);
  // The higher pool keeps its level right up to the lip; the water drops on
  // the lower side over a single mesh row.
  if (pool.above > pool.level && s < pool.start + RIVER_STEP) return lerp(pool.above, pool.level, (s - pool.start) / RIVER_STEP);
  if (pool.below > pool.level && s > pool.end - RIVER_STEP) return lerp(pool.level, pool.below, (s - pool.end + RIVER_STEP) / RIVER_STEP);
  return pool.level;
}
// Lips inside [from, to). The direction points from the upper pool to the lower one.
export function riverLips(from, to) {
  const lips = [];
  for (let index = Math.floor((from - 22) / POOL_SPAN) - 1; index <= Math.floor((to - 22) / POOL_SPAN) + 1; index++) {
    const s = poolBoundary(index), upper = poolLevel(index - 1), lower = poolLevel(index);
    if (s < from || s >= to) continue;
    lips.push({ index, s, upper: Math.max(upper, lower), lower: Math.min(upper, lower), drop: Math.abs(upper - lower), direction: upper >= lower ? 1 : -1 });
  }
  return lips;
}
// Foam strength: strong below each lip, a light drawing-in above it.
export function riverTurbulence(s) {
  const pool = poolAt(s);
  let turbulence = 0;
  const lip = (at, higher) => {
    const d = Math.abs(s - at);
    turbulence = Math.max(turbulence, higher ? 1 - smoothstep(1.5, 11, d) : .55 * (1 - smoothstep(0, 4, d)));
  };
  lip(pool.start, pool.above > pool.level); lip(pool.end, pool.below > pool.level);
  return turbulence;
}
// The bed anticipates each drop so the rock never rises through the falling water.
export function riverBedLevel(s) { return Math.min(riverLevel(s - 6), riverLevel(s), riverLevel(s + 6)); }

export function cutHeight(s) { return .5 + 4 * smoothstep(.35, .8, ribbonNoise(s, 97, 2222)); }

// Mossy crags break through the undergrowth on both sides of the valley.
export function jungleCrags(s, u) {
  const side = u < 0 ? -1 : 1, cross = Math.abs(u);
  if (cross < 24 || cross > 150) return 0;
  const cell = Math.floor(s / 96);
  let relief = 0;
  for (let i = cell - 1; i <= cell + 1; i++) {
    const seed = i * 2 + (side < 0 ? 0 : 1);
    if (randomAt(seed, 2231) < .35) continue;
    const center = i * 96 + 20 + randomAt(seed, 2232) * 56;
    const across = side < 0 ? 105 + randomAt(seed, 2233) * 40 : 40 + randomAt(seed, 2233) * 85;
    const rs = 11 + randomAt(seed, 2234) * 12, ru = 8 + randomAt(seed, 2235) * 8;
    const x = (s - center) / rs, y = (cross - across) / ru, angle = Math.atan2(y, x);
    const radius = Math.hypot(x, y) / (1 + .1 * Math.sin(angle * 3 + i) + .06 * Math.sin(angle * 5 + seed));
    relief += (7 + randomAt(seed, 2236) * 10) * (1 - smoothstep(.5, 1, radius)) ** .75;
  }
  return relief * smoothstep(24, 34, cross) * (1 - smoothstep(135, 150, cross));
}

// Two staggered ranges of forested peaks stand in the haze beyond the hills.
export function jungleMountains(s, u) {
  if (u <= 150) return 0;
  let peaks = 0;
  for (let band = 0; band < 2; band++) {
    const spacing = 250 + band * 90, cell = Math.floor(s / spacing);
    for (let i = cell - 2; i <= cell + 2; i++) {
      const seed = i * 5 + band * 733;
      const center = i * spacing + randomAt(seed, 2241) * spacing * .6;
      const ridgeU = 215 + band * 150 + (randomAt(seed, 2242) - .5) * 70;
      const ds = (s - center) / (130 + band * 60 + randomAt(seed, 2243) * 70);
      const du = (u - ridgeU) / (75 + band * 35 + randomAt(seed, 2244) * 30);
      const tilted = du + ds * (randomAt(seed, 2245) - .5) * .5;
      const radius = Math.max(Math.abs(ds) * .8 + Math.abs(tilted) * .45, Math.abs(tilted) + Math.abs(ds) * .2);
      peaks = Math.max(peaks, (48 + band * 30 + randomAt(seed, 2246) * 40) * Math.max(0, 1 - radius) ** .85);
    }
  }
  const foothills = 10 + 9 * Math.sin(s / 141 + u / 97) ** 2;
  return (peaks + foothills) * smoothstep(150, 200, u);
}

function bankProfile(distance, level, bed) {
  // Water edge below the surface, a mossy rim just above it, then the bank top.
  if (distance < 1.3) return lerp(bed - .7, level + .5, distance / 1.3);
  return lerp(level + .5, level + 1.1, (distance - 1.3) / 2.7);
}
function nearHills(s, u) {
  const rise = smoothstep(-95, -160, u) * (10 + 12 * Math.sin(s / 97 + u / 71) ** 2 + 9 * Math.sin(s / 59 - u / 83) ** 2);
  return rise + jungleCrags(s, u);
}
function farSide(s, u, h) {
  const bank = smoothstep(9.5, 15, u) * cutHeight(s);
  const floor = smoothstep(15, 40, u) * (1 + 1.5 * ribbonNoise(s, 31, 2221));
  const hills = smoothstep(22, 140, u) * (15 + 12 * Math.sin(s / 97 + u / 61) ** 2 + 10 * Math.sin(s / 61 - u / 83) ** 2);
  const knolls = (Math.sin(s / 37 + u / 23) * Math.sin(s / 19 - u / 29) * 3 + Math.sin(s / 11 + u / 13)) * smoothstep(20, 60, u);
  return h + bank + floor + hills + knolls + jungleCrags(s, u) + jungleMountains(s, u);
}
export function jungleHeight(s, u) {
  const h = roadHeight(s);
  if (Math.abs(u) <= 7) return h;
  if (u > 0) return farSide(s, u, h);
  const rc = riverCenter(s), hw = riverHalfWidth(s), level = riverLevel(s), bed = riverBedLevel(s);
  const bankTop = rc + hw + 4, farTop = rc - hw - 4;
  if (u >= bankTop) {
    const verge = h - .12 * smoothstep(7, 9.5, -u);
    if (u >= -9.5) return verge;
    // A mossy slope from the verge down to the river terrace, with bumps that
    // fade out at both ends so the verge and bank top stay exact.
    const t = (u + 9.5) / (bankTop + 9.5);
    const bumps = (jungleNoise(s, u, 13, 2212) - .5) * 2.2 * Math.sin(t * Math.PI);
    return lerp(verge, level + 1.1, smoothstep(0, 1, t)) + bumps;
  }
  const near = rc + hw, far = rc - hw;
  if (u >= near) return bankProfile(u - near, level, bed);
  if (u > far) return bed - .7 - 1.7 * Math.cos((u - rc) / hw * Math.PI / 2);
  if (u >= farTop) return bankProfile(far - u, level, bed);
  const t = (farTop - u) / (farTop + 95);
  const rise = h + 9 + 6 * ribbonNoise(s, 73, 2213);
  if (u > -95) return lerp(level + 1.1, rise, smoothstep(0, 1, t)) + (jungleNoise(s, u, 17, 2214) - .5) * 3 * Math.sin(t * Math.PI);
  return rise + nearHills(s, u);
}
export const junglePosition = (s, u, y = jungleHeight(s, u)) => positionAt(s, u, y);
export function onRiver(s, u, margin = 0) {
  const rc = riverCenter(s), hw = riverHalfWidth(s);
  return u > rc - hw - margin && u < rc + hw + margin;
}

export function jungleColumns(s) {
  const rc = riverCenter(s), hw = riverHalfWidth(s), bankTop = rc + hw + 4, farTop = rc - hw - 4;
  const near = [-9.5, -12.5, lerp(-12.5, bankTop, .38), lerp(-12.5, bankTop, .72), bankTop, rc + hw + 1.3, rc + hw, rc + hw * .5, rc, rc - hw * .5, rc - hw, rc - hw - 1.3, farTop,
    lerp(farTop, -95, .33), lerp(farTop, -95, .66), -95, -112, -132, -156, -184, -216, -252, -292, -336, -384, -436];
  const far = [9.5, 12.5, 15, 17.5, 21, 26, 32, 39, 47, 56, 66, 78, 92, 108, 126, 146, 168, 192, 218, 246, 276, 308, 342, 378, 416, 456, 500];
  return [...near.reverse(), -7, 0, 7, ...far];
}
export const JUNGLE_COLUMN_COUNT = jungleColumns(0).length;
export function jungleVertex(row, column) {
  const baseS = row * JUNGLE_STEP, base = jungleColumns(baseS)[column];
  const road = Math.abs(base) <= 7;
  const river = base > riverCenter(baseS) - riverHalfWidth(baseS) - 4.5 && base < riverCenter(baseS) + riverHalfWidth(baseS) + 4.5;
  const s = baseS + (road || river ? 0 : (randomAt(row, column + 2261) - .5) * 3);
  const columns = jungleColumns(s);
  const gap = Math.min(columns[column] - (columns[column - 1] ?? columns[column] - 40), (columns[column + 1] ?? columns[column] + 40) - columns[column]);
  const u = columns[column] + (road || river ? 0 : (randomAt(row, column + 2262) - .5) * Math.min(7, gap * .42));
  const p = junglePosition(s, u);
  const cross = Math.abs(u);
  // Small roughness on the forest floor; taller lumps far out read as treetops.
  if (!river) p.y += (randomAt(row, column + 2263) - .5) * (.9 * smoothstep(12, 30, cross) * (1 - smoothstep(100, 130, cross)) + 4.6 * smoothstep(100, 140, cross));
  return { ...p, s, u, column };
}

export const jungleDrivingRoute = { frame: roadFrame, position: junglePosition, height: jungleHeight, bounds: () => [-8.8, 8.8] };

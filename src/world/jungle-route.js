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

// The river always runs toward -s, down the screen, so every fall faces the
// camera. It steps down from pool to pool over rocky
// lips. Where the road climbs and the next pool would sink too far below it, a
// mossy rock barrier ends the reach, and the higher reach beyond is fed by a
// waterfall down the gorge wall. Boundaries snap to the river mesh rows, and
// every level is a pure function of the pool index: reaches are walked
// downstream from anchor pools fixed in world space.
const REACH = 32;
function poolBoundary(index) { return Math.round((index * POOL_SPAN + 22 + randomAt(index, 2201) * 60) / RIVER_STEP) * RIVER_STEP; }
function roadSpan(index) {
  const start = poolBoundary(index), end = poolBoundary(index + 1);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i <= 6; i++) { const h = roadHeight(lerp(start, end, i / 6)); low = Math.min(low, h); high = Math.max(high, h); }
  return { low, high };
}
// Terrain sampling asks for the same few pools thousands of times per chunk.
const poolLevels = new Map();
function poolLevel(index) {
  if (poolLevels.has(index)) return poolLevels.get(index);
  if (poolLevels.size > 4096) poolLevels.clear();
  const anchor = Math.floor(index / REACH) * REACH + REACH - 1;
  let level = Infinity;
  for (let i = anchor; i >= index; i--) {
    if (poolLevels.has(i)) { level = poolLevels.get(i); continue; }
    // Each pool sits well below the lowest road beside it. Most steps are
    // modest and a few are tall falls, but the river saves its height when the
    // road over the next few pools would leave it too deep.
    const { low, high } = roadSpan(i), cap = low - 7.5 - randomAt(i, 2202) * 1.2;
    let ahead = high;
    for (let k = 1; k <= 4; k++) ahead = Math.max(ahead, roadSpan(i - k).high);
    const wanted = randomAt(i, 2203) < .22 ? 5 + randomAt(i, 2204) * 5.5 : 1.3 + randomAt(i, 2204) * 1.8;
    const step = Math.max(1.15 + randomAt(i, 2205) * .4, Math.min(wanted, level - (ahead - 25) - 3.5));
    level = Math.min(level - step, cap);
    if (level < high - 25) level = cap;
    poolLevels.set(i, level);
  }
  return level;
}
// Boundary `index` lies between pool index - 1 and pool index. It is a
// barrier whenever the downstream pool (index - 1) is not clearly lower.
const barrier = index => poolLevel(index - 1) > poolLevel(index) - 1;
export function poolAt(s) {
  let index = Math.floor((s - 22) / POOL_SPAN);
  if (s < poolBoundary(index)) index--;
  return { index, start: poolBoundary(index), end: poolBoundary(index + 1), level: poolLevel(index), before: poolLevel(index - 1), after: poolLevel(index + 1),
    damStart: barrier(index), damEnd: barrier(index + 1) };
}
export function riverLevel(s) {
  const pool = poolAt(s);
  // A fall drops over the last mesh row of the lower pool, just below the lip;
  // at a barrier the surface steps inside the rock over the first row after it.
  if (pool.damStart && s < pool.start + RIVER_STEP) return lerp(pool.before, pool.level, (s - pool.start) / RIVER_STEP);
  if (!pool.damEnd && s > pool.end - RIVER_STEP) return lerp(pool.level, pool.after, (s - pool.end + RIVER_STEP) / RIVER_STEP);
  return pool.level;
}
function boundaries(from, to, dams) {
  const found = [];
  for (let index = Math.floor((from - 22) / POOL_SPAN) - 1; index <= Math.floor((to - 22) / POOL_SPAN) + 1; index++) {
    const s = poolBoundary(index);
    if (s < from || s >= to || barrier(index) !== dams) continue;
    const below = poolLevel(index - 1), above = poolLevel(index);
    found.push(dams ? { index, s, below, above, top: Math.max(below, above) + 1.8 } : { index, s, upper: above, lower: below, drop: above - below, direction: -1 });
  }
  return found;
}
// Lips inside [from, to); the water always falls toward -s. At a barrier,
// `above` is the calm pool upstream (higher s) and `below` the reach it starts.
export const riverLips = (from, to) => boundaries(from, to, false);
export const riverDams = (from, to) => boundaries(from, to, true);
// Foam strength: strong below each fall, a light drawing-in above it, calm at barriers.
export function riverTurbulence(s) {
  const pool = poolAt(s);
  let turbulence = 0;
  if (!pool.damEnd) turbulence = 1 - smoothstep(1.5, 11 + Math.min(8, pool.after - pool.level), pool.end - s);
  if (!pool.damStart) turbulence = Math.max(turbulence, .55 * (1 - smoothstep(0, 4, s - pool.start)));
  return turbulence;
}
// The bed anticipates each drop so the rock never rises through the falling water.
export function riverBedLevel(s) { return Math.min(riverLevel(s - 6), riverLevel(s), riverLevel(s + 6)); }
// How far a barrier's rock hump rises at s, and the height of its crest.
export function damAt(s) {
  const pool = poolAt(s);
  let amount = 0, top = -Infinity;
  for (const [at, isDam, other] of [[pool.start, pool.damStart, pool.before], [pool.end, pool.damEnd, pool.after]]) {
    const lift = isDam ? 1 - smoothstep(7, 14, Math.abs(s - at)) : 0;
    if (lift > amount) { amount = lift; top = Math.max(pool.level, other) + 1.8; }
  }
  return { amount, top };
}

// A sheer rock wall drops from a mossy terrace into the river along parts of
// the gorge, and always beside the taller falls and the barriers.
export function gorgeWall(s) {
  const pool = poolAt(s);
  let wall = smoothstep(.46, .64, ribbonNoise(s, 67, 2217));
  const near = (at, tall) => { if (tall) wall = Math.max(wall, 1 - smoothstep(20, 36, Math.abs(s - at))); };
  near(pool.start, pool.damStart || pool.level - pool.before > 4);
  near(pool.end, pool.damEnd || pool.after - pool.level > 4);
  return wall;
}

// Side streams come down the far hillside, pass under the road through a
// culvert, cross the terrace and pour down the gorge wall. A broad one feeds
// the reach beyond every barrier; the rest sit where the wall is sheer and
// tall, clear of the river's own lips, at most one per cell.
export const SIDE_FALL_CELL = 240;
export function sideFalls(from, to) {
  const falls = [];
  for (const dam of riverDams(from, to + 16)) {
    const s = dam.s - 16;
    if (s >= from && s < to) falls.push({ s, width: 6 + randomAt(dam.index, 2504) * 2.5, source: true });
  }
  for (let cell = Math.floor(from / SIDE_FALL_CELL) - 1; cell <= Math.floor(to / SIDE_FALL_CELL); cell++) {
    if (randomAt(cell, 2501) > .8) continue;
    const base = cell * SIDE_FALL_CELL, offset = Math.floor(randomAt(cell, 2502) * 26);
    for (let k = 0; k < 26; k++) {
      const s = base + 20 + ((offset + k) % 26) * 8, pool = poolAt(s);
      if (Math.min(Math.abs(s - pool.start), Math.abs(s - pool.end)) < 18 || pool.damEnd && pool.end - s < 60 || pool.damStart && s - pool.start < 30) continue;
      if (gorgeWall(s - 6) < .9 || gorgeWall(s + 6) < .9 || roadHeight(s) - pool.level < 9.5) continue;
      if (s >= from && s < to) falls.push({ s, width: 3.5 + randomAt(cell, 2503) * 2.5 });
      break;
    }
  }
  return falls;
}

// Stretches of the route lean toward one character or another: palm groves,
// bamboo thickets and tunnels of giant trees. Each weight
// eases in and out over a few hundred metres and most of the route has none.
export function jungleZones(s) {
  const zone = (span, salt, from, to) => smoothstep(from, to, ribbonNoise(s, span, salt));
  return { palms: zone(173, 2601, .6, .76), bamboo: zone(149, 2602, .64, .8), giants: zone(211, 2603, .6, .76) };
}

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
    const t = (u + 9.5) / (bankTop + 9.5), noise = jungleNoise(s, u, 13, 2212) - .5;
    const slope = lerp(verge, level + 1.1, smoothstep(0, 1, t)) + noise * 2.2 * Math.sin(t * Math.PI);
    const wall = gorgeWall(s);
    if (wall <= 0) return slope;
    // Under a wall the face runs down past the water line, so the river laps the cliff foot.
    const rim = bankTop + 3, top = lerp(verge, level + 1.1, .3);
    const cliff = u >= rim
      ? lerp(verge, top, smoothstep(0, 1, (u + 9.5) / (rim + 9.5))) + noise * 1.2 * Math.sin((u + 9.5) / (rim + 9.5) * Math.PI)
      : lerp(top, level - .6, (rim - u) / 3);
    return lerp(slope, cliff, wall);
  }
  const near = rc + hw, far = rc - hw;
  let channel;
  if (u >= near) channel = lerp(bankProfile(u - near, level, bed), lerp(bed - .7, level - .6, (u - near) / 4), gorgeWall(s));
  else if (u > far) channel = bed - .7 - 1.7 * Math.cos((u - rc) / hw * Math.PI / 2);
  else if (u >= farTop) channel = bankProfile(far - u, level, bed);
  if (channel !== undefined) {
    // A barrier's mossy hump closes the channel between two reaches.
    const dam = damAt(s);
    return dam.amount > 0 ? lerp(channel, Math.max(channel, dam.top + (jungleNoise(s, u, 5, 2215) - .5) * 1.8), dam.amount) : channel;
  }
  const t = (farTop - u) / (farTop + 95);
  const rise = h + 9 + 6 * ribbonNoise(s, 73, 2213);
  if (u > -95) return lerp(level + 1.1, rise, smoothstep(0, 1, t)) + (jungleNoise(s, u, 17, 2214) - .5) * 3 * Math.sin(t * Math.PI);
  return rise + nearHills(s, u);
}
export const junglePosition = (s, u, y = jungleHeight(s, u)) => positionAt(s, u, y);
// Water covers the channel, and under a gorge wall it reaches the cliff foot.
export function onRiver(s, u, margin = 0) {
  const rc = riverCenter(s), hw = riverHalfWidth(s);
  return u > rc - hw - margin && u < rc + hw + margin + 3.2 * gorgeWall(s);
}

export function jungleColumns(s) {
  const rc = riverCenter(s), hw = riverHalfWidth(s), bankTop = rc + hw + 4, farTop = rc - hw - 4;
  const near = [-9.5, -12.5, lerp(-12.5, bankTop + 3, .4), lerp(-12.5, bankTop + 3, .75), bankTop + 3, bankTop, rc + hw + 1.3, rc + hw, rc + hw * .5, rc, rc - hw * .5, rc - hw, rc - hw - 1.3, farTop,
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

// The guardrail on the river side stops the car short of the verge there.
export const jungleDrivingRoute = { frame: roadFrame, position: junglePosition, height: jungleHeight, bounds: () => [-6.9, 8.8] };

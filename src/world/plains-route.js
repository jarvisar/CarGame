import { roadFrame, positionAt, randomAt, smoothstep, lerp, clamp } from './route.js';

export const PLAINS_STEP = 8;
// The road runs over long, gentle swells rather than the coast's hills, so a
// straight can be held for a while and the fields read as one wide surface.
const swellPhase = [randomAt(0, 2701) * Math.PI * 2, randomAt(1, 2701) * Math.PI * 2];
export const plainsRoadHeight = s => 24 + 3.4 * Math.sin(s / 310 + swellPhase[0]) + 1.5 * Math.sin(s / 127 + swellPhase[1]);
export const plainsFrame = s => ({ ...roadFrame(s), y: plainsRoadHeight(s) });

// A creek crosses the road at world-space intervals, independently of the
// streaming chunks, under a short concrete bridge. It leans a little off the
// perpendicular and wanders, so it never reads as a slot cut across the fields.
export const CREEK_SPACING = 896;
export const BRIDGE_HALF_LENGTH = 14;
export function plainsCreekAt(s) {
  const index = Math.round((s - 420) / CREEK_SPACING), center = 420 + index * CREEK_SPACING;
  const lean = (randomAt(index, 2711) - .5) * .4;
  // The water lies below the road embankment, and the floodplain either side
  // of it is pulled down to the same level so the surface stays flat.
  const level = plainsRoadHeight(center) - 2.2;
  return { index, center, lean, level, start: center - BRIDGE_HALF_LENGTH, end: center + BRIDGE_HALF_LENGTH };
}
export function creekCenterS(creek, u) {
  return creek.center + u * creek.lean + 5 * Math.sin(u / 41 + creek.index) + 2.1 * Math.sin(u / 13 - creek.index * .7);
}
export function creekDistance(s, u) {
  const creek = plainsCreekAt(s);
  return Math.abs(s - creekCenterS(creek, u));
}
// The waterline sits where the carved bank crosses the creek level.
export const CREEK_WATER_HALF_WIDTH = 4.6;

// Stock ponds: a shallow basin dug in a pasture, one to a stretch of road on
// either side, kept away from the creek and the road reserve.
export const POND_SPACING = 512;
export function stockPondAt(index, side) {
  const salt = side > 0 ? 2861 : 2862;
  if (randomAt(index, salt) > .42) return null;
  const s = index * POND_SPACING + 60 + randomAt(index, salt + 1) * 390, cross = 72 + randomAt(index, salt + 2) * 120;
  const radius = 11 + randomAt(index, salt + 3) * 4, u = side * cross;
  if (Math.abs(s - creekCenterS(plainsCreekAt(s), u)) < radius + 28) return null;
  return { index, side, s, u, radius, rim: plainsBaseHeight(s, u, true) };
}
export function pondsNear(s) {
  const index = Math.floor(s / POND_SPACING), result = [];
  for (let i = index - 1; i <= index + 1; i++) for (const side of [-1, 1]) { const pond = stockPondAt(i, side); if (pond) result.push(pond); }
  return result;
}
export function pondDistance(s, u) {
  let best = { pond: null, d: Infinity };
  for (const pond of pondsNear(s)) {
    const d = Math.hypot(s - pond.s, u - pond.u) / pond.radius;
    if (d < best.d) best = { pond, d };
  }
  return best;
}

// Long, low rises beyond the far fields. They only show in the third-person
// view, where they close the horizon inside the fog instead of a flat edge.
export function distantRise(s, u) {
  if (u <= 280) return 0;
  let hills = 0;
  for (let band = 0; band < 2; band++) {
    const spacing = 300 + band * 110, cell = Math.floor(s / spacing);
    for (let i = cell - 2; i <= cell + 2; i++) {
      const seed = i * 5 + band * 733;
      const center = i * spacing + randomAt(seed, 2771) * spacing * .6;
      const ridgeU = 390 + band * 140 + (randomAt(seed, 2772) - .5) * 60;
      const ds = (s - center) / (150 + band * 70 + randomAt(seed, 2773) * 80);
      const du = (u - ridgeU) / (70 + band * 40 + randomAt(seed, 2774) * 30);
      const tilted = du + ds * (randomAt(seed, 2775) - .5) * .4;
      const radius = Math.max(Math.abs(ds) * .8 + Math.abs(tilted) * .45, Math.abs(tilted) + Math.abs(ds) * .2);
      hills = Math.max(hills, (16 + band * 12 + randomAt(seed, 2776) * 14) * Math.max(0, 1 - radius) ** .9);
    }
  }
  const foothills = 5 + 5 * Math.sin(s / 131 + u / 97) ** 2;
  return (hills + foothills) * smoothstep(280, 360, u);
}

function fieldSwell(s, u) {
  return 2.2 * Math.sin(s / 97 + u / 71 + swellPhase[0]) + 1.5 * Math.sin(s / 53 - u / 89) + .9 * Math.sin(s / 29 + u / 37) + .5 * Math.sin(s / 17 - u / 23);
}
// The plain without its creek: a flat road reserve with a drainage ditch on
// each side, then rolling fields that ease down toward the camera and up
// behind the road, so the far side presents more ground to the fixed view.
export function plainsBaseHeight(s, u, beforePonds = false) {
  const h = plainsRoadHeight(s), cross = Math.abs(u);
  if (cross <= 7) return h;
  const ditch = .55 * Math.sin(Math.PI * clamp((cross - 8.2) / 5.2, 0, 1)) ** 2;
  const swell = fieldSwell(s, u) * smoothstep(9, 42, cross);
  const fall = u < 0 ? 9 * smoothstep(60, 420, cross) : 0;
  const rise = u > 0 ? 6 * smoothstep(60, 300, u) : 0;
  let height = h - ditch + swell - fall + rise + distantRise(s, u);
  if (beforePonds || cross < 40 || cross > 220) return height;
  // A dug pond: a level rim with a low berm around it, so the water lies
  // flat inside whatever slope the field has.
  const { pond, d } = pondDistance(s, u);
  if (pond && d < 1.3) {
    const basin = pond.rim + .35 - 2.6 * (1 - smoothstep(.45, 1, d));
    height = lerp(basin, height, smoothstep(1, 1.3, d));
  }
  return height;
}
export function plainsGroundHeight(s, u) {
  const base = plainsBaseHeight(s, u);
  const creek = plainsCreekAt(s), d = Math.abs(s - creekCenterS(creek, u));
  if (d > 24) return base;
  // The floodplain pulls the fields down to the creek's own level, but the
  // road keeps its embankment, so under the bridge the banks are steeper.
  const bankNoise = .35 * Math.sin(s * .7 + u * .4) + .25 * Math.sin(u * 1.3);
  const plain = lerp(base, creek.level + 1.6 + bankNoise, (1 - smoothstep(8, 24, d)) * smoothstep(7, 12, Math.abs(u)));
  return plain - 3.4 * (1 - smoothstep(3, 8, d));
}
// Driving queries see the bridge deck; the terrain sees the channel beneath it.
export function plainsHeight(s, u) {
  return Math.abs(u) <= 7 ? plainsRoadHeight(s) : plainsGroundHeight(s, u);
}
export const plainsPosition = (s, u, y = plainsHeight(s, u)) => positionAt(s, u, y);

// Fields are a patchwork: rows of fields along the road, each row cut into
// bands away from it at its own offsets, so boundaries stagger from one row
// to the next instead of forming a grid. Every boundary is a line in (s, u),
// which is where the fences, hedges and shelterbelts stand.
export const FIELD_SPAN = 176;
export const ROAD_RESERVE = 13;
// Boundaries land on terrain rows and columns, so the colour change between
// two fields follows one line of facets instead of sawing across them.
export function fieldBoundary(index) { return Math.round((index * FIELD_SPAN + 40 + randomAt(index, 2721) * 88) / PLAINS_STEP) * PLAINS_STEP; }
export function fieldRowAt(s) {
  let index = Math.floor((s - 40) / FIELD_SPAN);
  if (s < fieldBoundary(index)) index--;
  return index;
}
const BAND_EDGES = [ROAD_RESERVE, 64, 150, 268, 400];
export function fieldBands(row, side) {
  return BAND_EDGES.map((u, k) => {
    if (k === 0) return u;
    const target = u + (randomAt(row * 2 + (side > 0 ? 1 : 0), 2731 + k) - .5) * u * .32;
    // The near side's terrain ends sooner than the far side's.
    const columns = PLAINS_COLUMNS.filter(column => column > ROAD_RESERVE && column <= (side > 0 ? 568 : 400));
    return columns.reduce((best, column) => Math.abs(column - target) < Math.abs(best - target) ? column : best, Infinity);
  });
}
const CROPS = ['wheat', 'stubble', 'ploughed', 'pasture', 'hay'];
export function fieldAt(s, u) {
  const cross = Math.abs(u);
  if (cross < ROAD_RESERVE) return null;
  const row = fieldRowAt(s), side = u < 0 ? -1 : 1, bands = fieldBands(row, side);
  let band = 0;
  while (band < bands.length - 1 && cross >= bands[band + 1]) band++;
  const seed = row * 8 + band, salt = side > 0 ? 2741 : 2751, r = randomAt(seed, salt);
  const kind = band >= 4 ? 'pasture' : CROPS[r < .3 ? 0 : r < .5 ? 1 : r < .64 ? 2 : r < .84 ? 3 : 4];
  return { row, band, side, kind, seed, salt, rows: randomAt(seed, salt + 1) < .5 ? 'along' : 'across',
    from: bands[band], to: bands[band + 1] ?? 600, start: fieldBoundary(row), end: fieldBoundary(row + 1) };
}
// What stands on a boundary. Row boundaries cross the whole view, so they
// are where the tall shelterbelts go; band boundaries run along the road.
export function rowBoundaryKind(row, side) {
  const r = randomAt(row, side > 0 ? 2781 : 2782);
  return r < .3 ? null : r < .58 ? 'fence' : r < .8 ? 'hedge' : 'shelterbelt';
}
export function bandBoundaryKind(row, side, band) {
  const r = randomAt(row * 4 + band, side > 0 ? 2783 : 2784);
  // Most band edges are just a change of crop. A line on every one of them
  // turned the fields into a thicket of dots at driving zoom.
  return r < .56 ? null : r < .78 ? 'fence' : 'hedge';
}
// Stone piles cleared off the fields, and a stock pond in some pastures.
export function fieldCorner(row, side, band) {
  return randomAt(row * 4 + band, side > 0 ? 2791 : 2792) < .3;
}
export function roadsideFence(row, side) { return randomAt(row, side > 0 ? 2785 : 2786) > .35; }
// A farm track leaves the road through a gate in some rows, with a mailbox.
export function farmGate(row, side) {
  if (randomAt(row, side > 0 ? 2787 : 2788) > .32) return null;
  const start = fieldBoundary(row), end = fieldBoundary(row + 1);
  return { s: Math.round(start + 18 + randomAt(row, side > 0 ? 2789 : 2790) * (end - start - 36)), side };
}

// Terrain columns are fixed offsets from the road. Fine rows and columns keep
// the ditch crisp beside the road; the fields coarsen outward, and the far
// rises, seen only in the third-person view, coarsest of all.
const PLAINS_COLUMNS = [-400, -352, -308, -268, -232, -200, -172, -148, -127, -109, -93, -79, -67, -56, -46, -37, -29, -22, -16.5, -13, -10.8, -8.6, -7,
  0, 7, 8.6, 10.8, 13, 16.5, 22, 29, 37, 46, 56, 67, 79, 93, 109, 127, 148, 172, 200, 232, 268, 308, 352, 400, 452, 508, 568];
export { PLAINS_COLUMNS };
export const PLAINS_COLUMN_COUNT = PLAINS_COLUMNS.length;
// The creek is only ten metres across, so the rows halve around each crossing.
export function plainsRowStep(row) {
  return Math.abs(row * PLAINS_STEP - plainsCreekAt(row * PLAINS_STEP).center) <= 72 ? .5 : 1;
}
export function plainsVertex(row, column) {
  const base = PLAINS_COLUMNS[column], cross = Math.abs(base);
  const fixed = cross <= ROAD_RESERVE;
  const seedRow = Number.isInteger(row) ? row : row * 2 + 1048576;
  const s = row * PLAINS_STEP + (fixed ? 0 : (randomAt(seedRow, column + 2761) - .5) * 3.6);
  const gap = Math.min(base - (PLAINS_COLUMNS[column - 1] ?? base - 40), (PLAINS_COLUMNS[column + 1] ?? base + 40) - base);
  const u = base + (fixed ? 0 : (randomAt(seedRow, column + 2762) - .5) * Math.min(4.5, gap * .32));
  const p = plainsPosition(s, u, plainsGroundHeight(s, u));
  // Small facet relief on the fields, more on the far rises, none at the water.
  const dry = smoothstep(4, 9, creekDistance(s, u));
  p.y += (randomAt(seedRow, column + 2763) - .5) * (.28 * smoothstep(13, 30, cross) + 2.2 * smoothstep(280, 360, cross)) * dry;
  return { ...p, s, u, column };
}

export const plainsDrivingRoute = {
  frame: plainsFrame, position: plainsPosition, height: plainsHeight,
  bounds: s => {
    const creek = plainsCreekAt(s);
    if (s > creek.start - 8 && s < creek.end + 8) return [-4.8, 4.8];
    return [-11.5, 11.5];
  },
};

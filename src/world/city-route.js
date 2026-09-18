import { roadFrame, positionAt, randomAt, smoothstep, lerp, clamp } from './route.js';

export const CITY_STEP = 8;
// A city boulevard is nearly level: only long, shallow swells, so the river
// beside it can lie on one plane and the quay wall changes height gently.
const swellPhase = [randomAt(0, 3001) * Math.PI * 2, randomAt(1, 3001) * Math.PI * 2];
export const cityRoadHeight = s => 24 + 1.2 * Math.sin(s / 340 + swellPhase[0]) + .5 * Math.sin(s / 141 + swellPhase[1]);
export const cityFrame = s => ({ ...roadFrame(s), y: cityRoadHeight(s) });

// The pavement stands a kerb above the road on both sides.
export const PAVEMENT_LIFT = .15;
export const KERB = 6;
export const pavementHeight = s => cityRoadHeight(s) + PAVEMENT_LIFT;

// The river fills the near side of the view, as the ocean does on the coast.
// Its surface is one level plane; the quay wall is whatever stands between
// that and the promenade. The quay wanders between a narrow promenade and a
// wider embankment with room for a car park or a green.
export const RIVER_LEVEL = 19.8;
export const RIVER_BED = 18.1;
export const QUAY_NEAR = 20, QUAY_FAR = 46;
const quayPhase = [randomAt(2, 3001) * Math.PI * 2, randomAt(3, 3001) * Math.PI * 2];
export function quayOffset(s) {
  const t = .5 + .32 * Math.sin(s / 241 + quayPhase[0]) + .18 * Math.sin(s / 89 + quayPhase[1]);
  return -(QUAY_NEAR + (QUAY_FAR - QUAY_NEAR) * clamp(t, 0, 1));
}
export const QUAY_WALL = 1.4;
// The far bank: a low embankment with wharf sheds, then blocks, then the
// skyline across the water.
export const FAR_BANK = -126.5, FAR_BANK_TOP = -131;
export const farBankHeight = s => cityRoadHeight(s) - .4;

// Blocks along the road, cut by cross streets. Every boundary lands on a
// terrain row and a cross street is exactly two rows wide, so the asphalt of
// a side street is a pair of facets and needs no geometry of its own.
export const BLOCK_SPAN = 104;
export const STREET_HALF_WIDTH = 8;
export function blockBoundary(index) { return Math.round((index * BLOCK_SPAN + 30 + randomAt(index, 3011) * 48) / CITY_STEP) * CITY_STEP; }
export function blockAt(s) {
  let index = Math.floor((s - 30) / BLOCK_SPAN);
  while (s < blockBoundary(index)) index--;
  while (s >= blockBoundary(index + 1)) index++;
  return index;
}
// A cross street leaves the far side at every boundary; on the near side only
// some run down to the quay.
export function nearStreet(index) { return randomAt(index, 3012) < .45; }
export function crossStreetAt(s) {
  const index = blockAt(s), before = blockBoundary(index), after = blockBoundary(index + 1);
  return s - before < after - s ? { index, center: before } : { index: index + 1, center: after };
}
export function onCrossStreet(s, u) {
  const street = crossStreetAt(s);
  if (Math.abs(s - street.center) >= STREET_HALF_WIDTH) return false;
  if (u > 0) return u > KERB && u < 150;
  return u < -KERB && nearStreet(street.index) && u > quayOffset(s);
}

// Building rows on the far side: three bands away from the road with an
// alley between each pair, then vacant ground, then the skyline.
export const BANDS = [{ front: 14, back: 36 }, { front: 44, back: 84 }, { front: 90, back: 150 }];
export const SKYLINE_FROM = 182;
// Wharf sheds and blocks on the far bank, and its skyline beyond them.
export const BANK_BANDS = [{ front: -134, back: -152 }, { front: -160, back: -206 }];

// Terrain columns. The quay follows the wandering embankment, so seven columns
// are placed relative to it: three across the promenade, the wall's top and
// foot, and two into the river. Everything else is a fixed offset.
const RIVER_COLUMNS = [-420, -370, -325, -285, -250, -220, -195, -172, -152, -138, FAR_BANK_TOP, FAR_BANK, -120, -108, -94, -80, -64];
const FAR_COLUMNS = [KERB, 6.6, 9.5, 13, 16, 20, 25, 30, 36, 40, 44, 50, 58, 67, 77, 84, 90, 98, 108, 120, 134, 150, 165, 182, 200, 222, 248, 278, 312, 350, 392, 440, 495, 555];
const QUAY_COLUMNS = 7;
export const CITY_COLUMN_COUNT = RIVER_COLUMNS.length + QUAY_COLUMNS + 2 + 1 + FAR_COLUMNS.length;
export function cityColumns(s) {
  const q = quayOffset(s), promenade = -6.6 - q;
  return [...RIVER_COLUMNS, q - 14, q - 7, q - QUAY_WALL, q, q + promenade * .28, q + promenade * .55, q + promenade * .8, -6.6, -KERB, 0, ...FAR_COLUMNS];
}

// The city's ground. The road and its gutters sit a kerb below the pavements.
// The far side rises very gently away from the road so the rows of buildings
// step up behind one another; the near side is the promenade, the quay wall,
// the river bed, and the far bank.
export function cityGroundHeight(s, u) {
  const h = cityRoadHeight(s), cross = Math.abs(u);
  if (cross <= KERB) return h;
  if (cross < 6.6) return h + PAVEMENT_LIFT * (cross - KERB) / .6;
  const pavement = h + PAVEMENT_LIFT;
  if (u > 0) {
    const swell = .35 * smoothstep(40, 90, u) * (Math.sin(s / 57 + u / 41) + .5 * Math.sin(s / 23 - u / 31));
    return pavement + 5 * smoothstep(60, 320, u) + swell + 7 * smoothstep(300, 520, u);
  }
  const q = quayOffset(s);
  if (u >= q) return pavement;
  if (u >= q - QUAY_WALL) return lerp(pavement, RIVER_BED, (q - u) / QUAY_WALL);
  if (u > FAR_BANK) return RIVER_BED;
  const bank = farBankHeight(s);
  if (u > FAR_BANK_TOP) return lerp(RIVER_BED, bank, (FAR_BANK - u) / (FAR_BANK - FAR_BANK_TOP));
  return bank + 2 * smoothstep(-180, -420, u);
}
// Driving queries see the road wherever the car is allowed to go.
export function cityHeight(s, u) {
  return Math.abs(u) <= KERB ? cityRoadHeight(s) : cityGroundHeight(s, u);
}
export const cityPosition = (s, u, y = cityHeight(s, u)) => positionAt(s, u, y);

export function cityVertex(row, column) {
  const s = row * CITY_STEP, columns = cityColumns(s), base = columns[column];
  // The city core is a clean grid: streets, kerbs and lots keep straight
  // edges. Only the river bed and the far rises are jittered.
  const loose = base < -140 || base > 160;
  const gap = Math.min(base - (columns[column - 1] ?? base - 40), (columns[column + 1] ?? base + 40) - base);
  const u = base + (loose ? (randomAt(row, column + 3021) - .5) * Math.min(6, gap * .3) : 0);
  const t = s + (loose ? (randomAt(row, column + 3022) - .5) * 3.2 : 0);
  const p = cityPosition(t, u, cityGroundHeight(t, u));
  if (u > 300) p.y += (randomAt(row, column + 3023) - .5) * 2.4 * smoothstep(300, 400, u);
  return { ...p, s: t, u, column };
}

export const cityDrivingRoute = {
  frame: cityFrame, position: cityPosition, height: cityHeight,
  // Both kerbs are solid: the car stays between them.
  bounds: () => [-KERB + .1, KERB - .1],
};

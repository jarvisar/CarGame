import { CHUNK_LENGTH, roadHeight, roadFrame, positionAt, randomAt, smoothstep, seededRandom } from './route.js';

export const DESERT_STEP = 4;

export function canyonProfile(s, side) {
  const phase = side < 0 ? .7 : 2.1;
  const foot = (side < 0 ? 58 : 56) + 7 * Math.sin(s / 117 + phase)
    + 4 * Math.sin(s / 47 - phase) + 1.6 * Math.sin(s / 9.7 + phase);
  const height = (side < 0 ? 33 : 55) + (side < 0 ? 6 : 10) * Math.sin(s / 143 + phase)
    + 5 * Math.sin(s / 39 + phase) + 3 * Math.sin(s / 15.7);
  return { foot, height };
}
export function dryWashCenter(s) { return -26 - 2 * Math.sin(s / 57 + .4); }

export function desertColumns(s) {
  const sideColumns = side => {
    const { foot } = canyonProfile(s, side);
    const wash = -dryWashCenter(s);
    const floor = side < 0 ? [7, 15, 20, wash - 3, wash - 1.5, wash, wash + 1.5, wash + 3] : [7, 15, 20, 27, 32];
    const upland = Array.from({ length: 30 }, (_, i) => foot + 47 + (360 - foot - 47) * i / 29);
    return [...floor, foot - 7, foot, foot + 6, foot + 9, foot + 12, foot + 19, foot + 24,
      foot + 28, foot + 34, foot + 41, ...upland];
  };
  return [...sideColumns(-1).reverse().map(u => -u), 0, ...sideColumns(1)];
}
export const DESERT_COLUMNS = desertColumns(0);

export function canyonRise(s, u) {
  const { foot, height } = canyonProfile(s, Math.sign(u) || 1);
  const distance = Math.abs(u) - foot;
  return height * (
    .13 * smoothstep(-7, 6, distance)
    + .38 * smoothstep(6, 12, distance)
    + .02 * smoothstep(12, 24, distance)
    + .42 * smoothstep(24, 34, distance)
    + .05 * smoothstep(34, 41, distance)
  );
}

export function desertHeight(s, u) {
  const shoulder = smoothstep(7, 36, Math.abs(u));
  const dunes = 2.8 * Math.sin(s / 62 + u / 33) + 1.6 * Math.sin(s / 27 - u / 41);
  const foothills = smoothstep(32, 175, Math.abs(u)) * (3 + 5 * Math.sin(s / 103 + u / 77) ** 2);
  const rim = smoothstep(41, 65, Math.abs(u) - canyonProfile(s, Math.sign(u) || 1).foot)
    * (2.7 * Math.sin(s / 21 + u / 17) + 1.6 * Math.sin(s / 11 - u / 13));
  const wash = 1 - smoothstep(.5, 3, Math.abs(u - dryWashCenter(s)));
  return roadHeight(s) + shoulder * (dunes + foothills) + canyonRise(s, u) + rim - wash * 1.05;
}
export function desertPosition(s, u, height) { return positionAt(s, u, height ?? desertHeight(s, u)); }

export function desertVertex(row, column) {
  const road = Math.abs(DESERT_COLUMNS[column]) <= 7;
  const s = row * DESERT_STEP + (road ? 0 : (randomAt(row, column + 3200) - .5) * 1.7);
  const columns = desertColumns(s);
  const gap = Math.min(columns[column] - (columns[column - 1] ?? columns[column] - 40), (columns[column + 1] ?? columns[column] + 40) - columns[column]);
  const u = columns[column] + (road ? 0 : (randomAt(row + 791, column) - .5) * Math.min(6, gap * .35));
  const p = desertPosition(s, u);
  p.y += (randomAt(row, column + 927) - .5) * smoothstep(30, 80, Math.abs(u)) * 1.2;
  return { ...p, s, u };
}

// Entire rock formations belong to a single chunk, with their full footprint
// generated outside the visible range before the player reaches them.
export function mesasForChunk(index) {
  const random = seededRandom(index + 34191), start = index * CHUNK_LENGTH;
  const rightS = start + 38 + random() * 50, leftS = start + 15 + random() * 75;
  const nearRightS = start + 55 + random() * 35, nearLeftS = start + 9 + random() * 35;
  return [
    { s: rightS, u: canyonProfile(rightS, 1).foot + 50, rs: 12 + random() * 9, ru: 10 + random() * 8, height: 15 + random() * 20, seed: index * 17 + 1 },
    { s: leftS, u: -canyonProfile(leftS, -1).foot - 51, rs: 11 + random() * 7, ru: 8 + random() * 7, height: 10 + random() * 17, seed: index * 17 + 2 },
    { s: nearRightS, u: Math.max(35, canyonProfile(nearRightS, 1).foot - 13), rs: 6 + random() * 4, ru: 4 + random() * 3, height: 13 + random() * 16, seed: index * 17 + 3 },
    { s: nearLeftS, u: -Math.max(35, canyonProfile(nearLeftS, -1).foot - 11), rs: 5 + random() * 4, ru: 4 + random() * 3, height: 9 + random() * 15, seed: index * 17 + 4 },
  ];
}

export function insideMesa(s, u, padding = 1.28) {
  const cell = Math.floor(s / CHUNK_LENGTH);
  for (let index = cell - 1; index <= cell + 1; index++) {
    for (const mesa of mesasForChunk(index)) {
      if (Math.hypot((s - mesa.s) / mesa.rs, (u - mesa.u) / mesa.ru) < padding) return true;
    }
  }
  return false;
}

export const desertDrivingRoute = {
  frame: roadFrame,
  position: desertPosition,
  height: desertHeight,
  bounds: () => [-17, 17],
};

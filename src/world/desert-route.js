import { CHUNK_LENGTH, roadHeight, roadFrame, positionAt, randomAt, smoothstep, seededRandom } from './route.js';

export const DESERT_STEP = 8;

// Broad rock masses with short transitions between their flat shoulders.
// All samples are global so a terrace continues through streaming boundaries.
function terraceNoise(s, span, seed) {
  const cell = Math.floor(s / span), t = s / span - cell;
  const a = randomAt(cell, seed), b = randomAt(cell + 1, seed);
  return a + (b - a) * smoothstep(.26, .74, t);
}

export function canyonProfile(s, side) {
  const phase = side < 0 ? .7 : 2.1;
  const foot = Math.max(44, (side < 0 ? 60 : 64) + 8 * Math.sin(s / 137 + phase)
    + 28 * (terraceNoise(s + side * 27, 48, side + 611) - .5)
    + 2.8 * Math.sin(s / 7.7 + phase));
  // Even when seeded terraces dip together, the lowest rim must clear the dunes.
  const height = Math.max(27, (side < 0 ? 23 : 28) + 3 * Math.sin(s / 193 + phase)
    + (side < 0 ? 29 : 37) * terraceNoise(s + side * 51, 88, side + 612));
  const shelfEnd = 27 + 8 * terraceNoise(s, 64, side + 613);
  const lowerShare = .43 + .12 * terraceNoise(s, 96, side + 614);
  const upperStrength = .25 + .75 * smoothstep(.22, .62, terraceNoise(s + side * 110, 144, side + 615));
  return { foot, height, shelfEnd, lowerShare, upperStrength };
}
export function dryWashCenter(s) { return -26 - 2 * Math.sin(s / 57 + .4); }

export function desertColumns(s) {
  const sideColumns = side => {
    const { foot, shelfEnd } = canyonProfile(s, side);
    const wash = -dryWashCenter(s);
    const floor = side < 0 ? [7, 15, 20, wash - 3, wash - 1.5, wash, wash + 1.5, wash + 3] : [7, 15, 20, 27, 32];
    const upland = Array.from({ length: 30 }, (_, i) => foot + 47 + (360 - foot - 47) * i / 29);
    return [...floor, foot - 7, foot, foot + 5, foot + 7, foot + 9,
      foot + 15, foot + (15 + shelfEnd) / 2, foot + shelfEnd,
      foot + shelfEnd + 2, foot + shelfEnd + 4, foot + 41, ...upland];
  };
  return [...sideColumns(-1).reverse().map(u => -u), 0, ...sideColumns(1)];
}
export const DESERT_COLUMNS = desertColumns(0);

export function canyonRise(s, u) {
  const { foot, height, shelfEnd, lowerShare, upperStrength } = canyonProfile(s, Math.sign(u) || 1);
  const distance = Math.abs(u) - foot;
  return height * (
    .11 * smoothstep(-7, 5, distance)
    + lowerShare * smoothstep(5, 9, distance)
    + .025 * smoothstep(9, shelfEnd, distance)
    + (.84 - lowerShare) * upperStrength * smoothstep(shelfEnd, shelfEnd + 4, distance)
    + .025 * smoothstep(shelfEnd + 4, 41, distance)
  );
}

export function desertHeight(s, u) {
  const shoulder = smoothstep(7, 36, Math.abs(u));
  const dunes = 2.8 * Math.sin(s / 62 + u / 33) + 1.6 * Math.sin(s / 27 - u / 41);
  const foothills = smoothstep(32, 175, Math.abs(u)) * (3 + 5 * Math.sin(s / 103 + u / 77) ** 2);
  const rim = smoothstep(41, 65, Math.abs(u) - canyonProfile(s, Math.sign(u) || 1).foot)
    * (.7 * Math.sin(s / 43 + u / 31) + .4 * Math.sin(s / 21 - u / 27));
  const wash = 1 - smoothstep(.5, 3, Math.abs(u - dryWashCenter(s)));
  return roadHeight(s) + shoulder * (dunes + foothills) + canyonRise(s, u) + rim - wash * 1.05;
}
export function desertPosition(s, u, height) { return positionAt(s, u, height ?? desertHeight(s, u)); }

export function desertVertex(row, column) {
  const road = Math.abs(DESERT_COLUMNS[column]) <= 7;
  const s = row * DESERT_STEP + (road ? 0 : (randomAt(row, 3200) - .5) * 2.6);
  const columns = desertColumns(s);
  const gap = Math.min(columns[column] - (columns[column - 1] ?? columns[column] - 40), (columns[column + 1] ?? columns[column] + 40) - columns[column]);
  const u = columns[column] + (road ? 0 : (randomAt(row + 791, column) - .5) * Math.min(6, gap * .35));
  const p = desertPosition(s, u);
  const { foot, shelfEnd } = canyonProfile(s, Math.sign(u) || 1);
  const distance = Math.abs(u) - foot;
  const fracture = Math.max(1 - Math.abs(distance - 7) / 2, 1 - Math.abs(distance - shelfEnd - 2) / 2, 0);
  p.x += Math.sign(u) * fracture * (randomAt(row, column + 1751) - .5) * 1.4;
  p.y += (randomAt(row, column + 927) - .5) * smoothstep(30, 80, Math.abs(u)) * .45;
  return { ...p, s, u };
}

// Entire rock formations belong to a single chunk, with their full footprint
// generated outside the visible range before the player reaches them.
export function mesasForChunk(index) {
  const random = seededRandom(index + 34191), start = index * CHUNK_LENGTH;
  const rightS = start + 38 + random() * 50, leftS = start + 15 + random() * 75;
  const nearRightS = start + 55 + random() * 35, nearLeftS = start + 9 + random() * 35;
  const mesas = [
    { s: rightS, u: canyonProfile(rightS, 1).foot + 43, rs: 25 + random() * 15, ru: 19 + random() * 9, height: 23 + random() * 29, seed: index * 17 + 1 },
    { s: leftS, u: -canyonProfile(leftS, -1).foot - 40, rs: 23 + random() * 13, ru: 18 + random() * 8, height: 17 + random() * 24, seed: index * 17 + 2 },
    { s: nearRightS, u: Math.max(35, canyonProfile(nearRightS, 1).foot - 13), rs: 6 + random() * 4, ru: 4 + random() * 3, height: 13 + random() * 16, seed: index * 17 + 3 },
    { s: nearLeftS, u: -Math.max(35, canyonProfile(nearLeftS, -1).foot - 11), rs: 5 + random() * 4, ru: 4 + random() * 3, height: 9 + random() * 15, seed: index * 17 + 4 },
  ];
  // Squared rock shoulders grow out of the lower cliff, breaking up long walls.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const s = start + 20 + i * 62 + random() * 19;
      const { foot, height, lowerShare } = canyonProfile(s, side);
      mesas.push({ s, u: side * (foot + 2), rs: 8 + random() * 7, ru: 5 + random() * 3,
        height: height * (lowerShare + .13), seed: index * 17 + 5 + i + (side + 1), kind: 'buttress' });
    }
  }
  return mesas;
}

export function insideMesa(s, u, padding = 1.28) {
  const cell = Math.floor(s / CHUNK_LENGTH);
  for (let index = cell - 1; index <= cell + 1; index++) {
    for (const mesa of mesasForChunk(index)) {
      const power = mesa.ru >= 18 || mesa.kind === 'buttress' ? 3.45 : 2;
      const radius = (Math.abs((s - mesa.s) / mesa.rs) ** power + Math.abs((u - mesa.u) / mesa.ru) ** power) ** (1 / power);
      if (radius < padding) return true;
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

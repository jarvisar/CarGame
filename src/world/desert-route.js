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
  // Eroded fans replace whole stretches of the lower scarp with a sandy slope.
  const cliffStrength = side < 0
    ? smoothstep(.44, .76, .5 + .38 * Math.sin(s / 91 - .9) + .18 * Math.sin(s / 39 + 1.4))
    : .58 + .42 * terraceNoise(s, 137, 632);
  return { foot, height, shelfEnd, lowerShare, upperStrength, cliffStrength };
}
export function dryWashCenter(s) {
  return -Math.min(27 + 3 * Math.sin(s / 91 + .4) + 2 * Math.sin(s / 34), canyonProfile(s, -1).foot - 13);
}
export function dryWashWidth(s) { return 1.6 + 1.1 * Math.sin(s / 72 + .6) ** 2; }

// Low, dissected benches give the camera-facing side its own relief. Unlike a
// single plateau, each landform has an outer face, a cap, and sandy space around it.
export function desertRelief(s, u) {
  const side = Math.sign(u) || 1, cross = Math.abs(u);
  if (cross < 65 || cross > 360) return 0;
  const cell = Math.floor(s / 160);
  let relief = 0;
  for (let i = cell - 1; i <= cell + 1; i++) {
    for (let belt = 0; belt < (side < 0 ? 2 : 1); belt++) {
      const seed = side + 1870;
      const center = i * 160 + 40 + randomAt(i, seed + belt * 13) * 65 + belt * 64;
      const across = (side < 0 ? 137 + belt * 99 : 166) + (randomAt(i, seed + 2) - .5) * 32;
      const rs = 48 + randomAt(i, seed + 3) * 23 + belt * 12, ru = 34 + randomAt(i, seed + 4) * 17 + belt * 18;
      const x = (s - center) / rs, y = (cross - across) / ru;
      const angle = Math.atan2(y, x);
      const radius = Math.hypot(x, y) / (1 + .08 * Math.sin(angle * 3 + i) + .045 * Math.sin(angle * 5));
      const height = (side < 0 ? 14 : 10) + randomAt(i, seed + 5) * (belt ? 10 : 18);
      relief += height * (.28 * (1 - smoothstep(.55, 1.4, radius)) + .72 * (1 - smoothstep(.58, belt ? 1.04 : .9, radius)));
    }
  }
  return relief * smoothstep(65, 84, cross) * (1 - smoothstep(338, 360, cross));
}

export function desertColumns(s) {
  const sideColumns = side => {
    const { foot, shelfEnd } = canyonProfile(s, side);
    const wash = -dryWashCenter(s), width = dryWashWidth(s);
    const floor = side < 0 ? [7, 13, wash - width * 1.5, wash - width * .6, wash, wash + width * .6, wash + width * 1.5] : [7, 15, 20, 27, 32];
    const upland = Array.from({ length: 30 }, (_, i) => foot + 47 + (360 - foot - 47) * i / 29);
    return [...floor, foot - 7, foot, foot + 5, foot + 7, foot + 9,
      foot + 15, foot + (15 + shelfEnd) / 2, foot + shelfEnd,
      foot + shelfEnd + 2, foot + shelfEnd + 4, foot + 41, ...upland];
  };
  return [...sideColumns(-1).reverse().map(u => -u), 0, ...sideColumns(1)];
}
export const DESERT_COLUMNS = desertColumns(0);

export function canyonRise(s, u) {
  const { foot, height, shelfEnd, lowerShare, upperStrength, cliffStrength } = canyonProfile(s, Math.sign(u) || 1);
  const distance = Math.abs(u) - foot;
  return height * (
    cliffStrength * (.11 * smoothstep(-7, 5, distance)
      + lowerShare * smoothstep(5, 9, distance)
      + .025 * smoothstep(9, shelfEnd, distance))
    + (1 - cliffStrength) * (.135 + lowerShare) * smoothstep(-15, shelfEnd, distance)
    + (.84 - lowerShare) * upperStrength * (cliffStrength * smoothstep(shelfEnd, shelfEnd + 4, distance)
      + (1 - cliffStrength) * smoothstep(shelfEnd - 6, 55, distance))
    + .025 * smoothstep(shelfEnd + 4, 41, distance)
  );
}

export function desertHeight(s, u) {
  const shoulder = smoothstep(7, 36, Math.abs(u));
  const dunes = 2.8 * Math.sin(s / 62 + u / 33) + 1.6 * Math.sin(s / 27 - u / 41);
  const foothills = smoothstep(32, 175, Math.abs(u)) * (3 + 5 * Math.sin(s / 103 + u / 77) ** 2);
  const rim = smoothstep(41, 65, Math.abs(u) - canyonProfile(s, Math.sign(u) || 1).foot)
    * (.7 * Math.sin(s / 43 + u / 31) + .4 * Math.sin(s / 21 - u / 27));
  const wash = 1 - smoothstep(dryWashWidth(s) * .15, dryWashWidth(s) * 1.5, Math.abs(u - dryWashCenter(s)));
  const washDepth = .18 + .55 * (.5 + .5 * Math.sin(s / 101 + .5)) ** 2;
  return roadHeight(s) + shoulder * (dunes + foothills) + canyonRise(s, u) + rim + desertRelief(s, u) - wash * washDepth;
}
export function desertPosition(s, u, height) { return positionAt(s, u, height ?? desertHeight(s, u)); }

export function desertVertex(row, column, sampleColumns = desertColumns) {
  const road = Math.abs(DESERT_COLUMNS[column]) <= 7;
  const s = row * DESERT_STEP + (road ? 0 : (randomAt(row, 3200) - .5) * 2.6);
  const columns = sampleColumns(s);
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
      const { foot, height, lowerShare, cliffStrength } = canyonProfile(s, side);
      if (cliffStrength < .35) continue;
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

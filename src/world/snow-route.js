import { roadFrame, roadHeight, positionAt, randomAt, smoothstep } from './route.js';

export const SNOW_STEP = 4;
export const LAMP_SPACING = 52;
export const snowRoadHeight = s => roadHeight(s) + 38 + 5 * Math.sin(s / 270);
export const snowFrame = s => ({ ...roadFrame(s), y: snowRoadHeight(s) });
export const ledgeEdge = s => -23 - 7 * Math.sin(s / 91 + .8) - 4 * Math.sin(s / 31 + .1);

export function summitForCell(index) {
  return { index, s: index * 280 + 76 + (randomAt(index, 618) - .5) * 28,
    u: 60 + randomAt(index, 619) * 12, height: 62 + randomAt(index, 620) * 16,
    rs: 156 + randomAt(index, 621) * 24, ru: 50 + randomAt(index, 622) * 12 };
}

export function mountainHeight(s, u) {
  let peak = 0;
  const cell = Math.floor((s - 76) / 280);
  for (let i = cell - 1; i <= cell + 1; i++) {
    const summit = summitForCell(i);
    // Elongated, pointed mountain masses meet at saddles along the route.
    // Their far slopes descend again, producing summits rather than terraces.
    const distance = Math.hypot((s - summit.s) / summit.rs, (u - summit.u) / summit.ru);
    peak = Math.max(peak, summit.height * Math.max(0, 1 - distance));
  }
  const apron = (6 + 5 * Math.sin(s / 94 + u / 67) ** 2) * smoothstep(11, 34, u);
  const rockFaces = (3.3 * Math.sin(s / 18 + u / 11) + 2.1 * Math.sin(s / 31 - u / 9))
    * smoothstep(16, 36, u) * (1 - smoothstep(125, 210, u));
  return apron + peak * smoothstep(11, 26, u) + rockFaces;
}

const valleyColumns = Array.from({ length: 12 }, (_, i) => -350 + i * 130 / 11);
const uplandColumns = Array.from({ length: 26 }, (_, i) => 103 + i * 247 / 25);
export function snowColumns(s) {
  const edge = ledgeEdge(s);
  return [...valleyColumns, ...[175, 155, 138, 122, 108, 96, 85, 75, 66, 58, 51, 44, 38, 32, 26, 21, 16, 12, 8, 4, 0].map(d => edge - d), -10, -7, 0, 7, 11,
    16, 22, 28, 35, 43, 51, 60, 70, 80, 91, ...uplandColumns];
}
const initialColumns = snowColumns(0);
export const SNOW_COLUMN_COUNT = initialColumns.length;
export function snowBaseHeight(s, u) {
  const h = snowRoadHeight(s);
  if (Math.abs(u) <= 7) return h;
  if (u < -7) {
    const distance = ledgeEdge(s) - u;
    // Broad spurs and recesses move the actual slope contours in and out.
    const spur = (7 * Math.sin(s / 37 + .5) + 4 * Math.sin(s / 19 - .7))
      * smoothstep(4, 28, distance) * (1 - smoothstep(85, 145, distance));
    const d = distance - spur;
    const drop = 89 * smoothstep(0, 78, d) ** .95 + 17 * smoothstep(60, 155, d);
    const valley = smoothstep(75, 155, d) * (6 * Math.sin(s / 89 + u / 57) + 9 * Math.sin(s / 127 - u / 63) ** 2);
    const fissure = (3.2 * (.5 + .5 * Math.sin(s / 6.7 + u / 47)) ** 8 + 1.3 * Math.sin(s / 11 + u / 19))
      * smoothstep(1, 7, d) * (1 - smoothstep(29, 43, d));
    return h + smoothstep(-7, -13, u) * (1.1 + .55 * Math.sin(s / 17)) - drop + valley - fissure;
  }
  const fissure = 2.8 * (.5 + .5 * Math.sin(s / 7.3 + u / 39)) ** 7
    * smoothstep(14, 25, u) * (1 - smoothstep(48, 73, u));
  return h + mountainHeight(s, u) - fissure;
}

export function terrainPocket(index, side) {
  const seed = index * 2 + (side > 0 ? 1 : 0);
  const s = index * 80 + 14 + randomAt(seed, 730) * 48;
  return { s, u: side < 0 ? ledgeEdge(s) - 18 - randomAt(seed, 731) * 48 : 22 + randomAt(seed, 731) * 25,
    rs: 14 + randomAt(seed, 732) * 10, ru: 9 + randomAt(seed, 733) * 4, side, seed };
}

export function snowHeight(s, u) {
  let height = snowBaseHeight(s, u);
  if (u >= -10 && u <= 11) return height;
  const side = u < 0 ? -1 : 1, cell = Math.floor(s / 80);
  const mask = side < 0 ? 1 : 1 - smoothstep(50, 62, u);
  if (!mask || (side < 0 && (u < ledgeEdge(s) - 105 || u > ledgeEdge(s) - 4))) return height;
  for (let i = cell - 1; i <= cell + 1; i++) {
    const pocket = terrainPocket(i, side);
    const radius = Math.hypot((s - pocket.s) / pocket.rs, (u - pocket.u) / pocket.ru);
    if (radius >= 1) continue;
    const shelf = snowBaseHeight(pocket.s, pocket.u) + (s - pocket.s) * .02;
    height += (shelf - height) * .84 * (1 - smoothstep(.3, 1, radius)) * mask;
  }
  return height;
}
export const snowPosition = (s, u, y = snowHeight(s, u)) => positionAt(s, u, y);
export function snowVertex(row, column) {
  const road = Math.abs(initialColumns[column]) <= 7;
  const s = row * SNOW_STEP + (road ? 0 : (randomAt(row, column + 811) - .5) * 3.3);
  const columns = snowColumns(s);
  const gap = Math.min(columns[column] - (columns[column - 1] ?? columns[column] - 40), (columns[column + 1] ?? columns[column] + 40) - columns[column]);
  const u = columns[column] + (road ? 0 : (randomAt(row, column + 912) - .5) * Math.min(8, gap * .5));
  const p = snowPosition(s, u);
  p.y += (randomAt(row, column + 177) - .5) * smoothstep(10, 35, Math.abs(u)) * 2.4;
  return { ...p, s, u };
}
export function lampAt(index) {
  const s = index * LAMP_SPACING + 16, u = 8.8;
  return { s, u, ...snowPosition(s, u, snowRoadHeight(s) + 7.6) };
}
export const snowDrivingRoute = { frame: snowFrame, position: snowPosition, height: snowHeight, bounds: () => [-5.85, 6.3] };

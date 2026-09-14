import { roadFrame, roadHeight, positionAt, randomAt, smoothstep } from './route.js';

export const SNOW_STEP = 8;
export const LAMP_SPACING = 52;
export const snowRoadHeight = s => roadHeight(s) + 38 + 5 * Math.sin(s / 270);
export const snowFrame = s => ({ ...roadFrame(s), y: snowRoadHeight(s) });
export const ledgeEdge = s => -17 - 3 * Math.sin(s / 83 + .8);

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

export function snowColumns(s) {
  const edge = ledgeEdge(s);
  return [-350, -300, -250, -210, -178, -148, -123, -103, -87, -73, -61, -51,
    edge - 25, edge - 17, edge - 12, edge - 8, edge - 3, edge, -10, -7, 0, 7, 11,
    16, 22, 28, 35, 43, 51, 60, 70, 80, 91, 103, 117, 134, 155, 180, 210, 245, 290, 350];
}
export function snowHeight(s, u) {
  const h = snowRoadHeight(s);
  if (Math.abs(u) <= 7) return h;
  if (u < -7) {
    const d = ledgeEdge(s) - u;
    const drop = 105 * smoothstep(0, 31, d) ** .8 + 18 * smoothstep(31, 105, d);
    const valley = smoothstep(35, 130, d) * (8 * Math.sin(s / 89 + u / 57) + 12 * Math.sin(s / 127 - u / 63) ** 2);
    return h + smoothstep(-7, -13, u) * (1.1 + .55 * Math.sin(s / 17)) - drop + valley;
  }
  return h + mountainHeight(s, u);
}
export const snowPosition = (s, u, y = snowHeight(s, u)) => positionAt(s, u, y);
export function snowVertex(row, column) {
  const base = snowColumns(row * SNOW_STEP)[column], road = Math.abs(base) <= 7;
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

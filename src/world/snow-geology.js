import * as THREE from 'three';
import { CHUNK_LENGTH, seededRandom } from './route.js';
import { ledgeEdge, snowHeight, snowPosition } from './snow-route.js';

// Each whole formation is owned by its center chunk. Overlapping footprints
// are safe across chunk boundaries because their positions use world coordinates.
export function cragsForChunk(index) {
  const random = seededRandom(index + 74813), start = index * CHUNK_LENGTH;
  const crags = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const s = start + (i + .18 + random() * .64) * CHUNK_LENGTH / 7;
      const u = side < 0 ? ledgeEdge(s) - 3 - random() * 23 : 25 + random() * 35;
      crags.push({ s, u, side, rs: 5 + random() * 5.5, ru: 3.2 + random() * 2.6,
        depth: 13 + random() * 19, y: snowHeight(s, u) + 1.4,
        tree: random() > .6, seed: index * 31 + i + (side > 0 ? 15 : 0) });
    }
  }
  return crags;
}

function buffer(positions, colors) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.computeVertexNormals(); result.computeBoundingSphere(); return result;
}

export function buildCrags(index) {
  const start = index * CHUNK_LENGTH, rockPositions = [], rockColors = [], snowPositions = [], snowColors = [], trees = [], ledges = [];
  const slate = ['#46536b', '#58647a', '#66738a', '#505d74', '#3f4c64'];
  const snow = ['#b8cbe2', '#a9bfdd', '#c2d0e4'];
  function face(a, b, c, color, snowy = false) {
    const vertices = snowy ? snowPositions : rockPositions, colors = snowy ? snowColors : rockColors;
    for (const p of [a, b, c]) { vertices.push(p.x, p.y, p.z + start); colors.push(color.r, color.g, color.b); }
  }
  for (const crag of cragsForChunk(index)) {
    const random = seededRandom(crag.seed + 53921);
    // The broad central block forms a ledge; narrower columns fracture its sides.
    for (let piece = 0; piece < 3; piece++) {
      const main = piece === 0;
      const s = crag.s + (main ? 0 : (piece === 1 ? -1 : 1) * crag.rs * .84);
      const u = crag.u - (main ? 1 : 1 + random() * 2.3);
      const rs = crag.rs * (main ? 1 : .45 + random() * .2), ru = crag.ru * (main ? 1 : .55 + random() * .22);
      const topY = crag.y - (main ? 0 : 2 + random() * 7);
      const depth = crag.depth * (main ? 1 : .6 + random() * .35);
      const sides = 7, shape = Array.from({ length: sides }, () => .78 + random() * .27);
      const top = [], middle = [], bottom = [];
      for (let j = 0; j < sides; j++) {
        const angle = j / sides * Math.PI * 2, ds = Math.sin(angle) * rs * shape[j], du = Math.cos(angle) * ru * shape[j];
        top.push(snowPosition(s + ds * .85, u + du * .85, topY + ds * .015));
        middle.push(snowPosition(s + ds * (1 + random() * .12), u + du * 1.04, topY - depth * (.27 + random() * .16)));
        const rootS = s + ds * 1.06, rootU = u + 1.8 + du * .94;
        // Sink each foot into the actual cliff surface, even on the steepest
        // faces, so the column grows out of the mountain with no exposed base.
        bottom.push(snowPosition(rootS, rootU, Math.min(topY - depth, snowHeight(rootS, rootU) - 4)));
      }
      const rings = [bottom, middle, top];
      for (let level = 0; level < 2; level++) for (let j = 0; j < sides; j++) {
        const next = (j + 1) % sides, a = rings[level][j], b = rings[level][next], c = rings[level + 1][j], d = rings[level + 1][next];
        const color = new THREE.Color(slate[Math.floor(random() * slate.length)]);
        // Front faces point out of the mountain; alternating diagonals break up the columns.
        face(a, b, c, color); face(b, d, c, color.clone().multiplyScalar(.91 + random() * .15));
      }
      const center = snowPosition(s, u, topY + .34);
      const cap = top.map(p => ({ x: center.x + (p.x - center.x) * 1.06, y: p.y + .36 + random() * .16, z: center.z + (p.z - center.z) * 1.06 }));
      for (let j = 0; j < sides; j++) {
        const next = (j + 1) % sides, color = new THREE.Color(snow[Math.floor(random() * snow.length)]);
        face(center, cap[j], cap[next], color, true);
        face(top[j], top[next], cap[j], color.clone().multiplyScalar(.86), true);
        face(top[next], cap[next], cap[j], color.clone().multiplyScalar(.9), true);
      }
      if (main) {
        ledges.push({ s, u, y: topY + .4, rs: rs * .65, ru: ru * .6, seed: crag.seed });
        // Place the trunk in the exposed forward half of the solid snow cap.
        if (crag.tree) trees.push({ s, u: u - ru * .24, y: topY + .32, height: 4.2 + random() * 3.3, angle: random() * Math.PI });
      }
    }
  }
  return { rock: buffer(rockPositions, rockColors), snow: buffer(snowPositions, snowColors), trees, ledges };
}

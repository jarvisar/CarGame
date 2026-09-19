import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { bridgeAt, pondAt, pondRadius, roadHeight, groundHeight, positionAt, terrainCell, terrainColumns, randomAt, TERRAIN_STEP, CHUNK_LENGTH } from './route.js';
import { createPondMaterial } from './water.js';

const bridgeMaterial = new THREE.MeshStandardMaterial({ color: '#d8c9ab', emissive: '#766b54', emissiveIntensity: .08, roughness: 1, flatShading: true, side: THREE.DoubleSide });
const lakeMaterial = createPondMaterial();
registerChunkResources('landmarks', { bridgeMaterial, lakeMaterial });

function geometry(vertices, colors) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (colors) result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.computeVertexNormals(); result.computeBoundingSphere(); return result;
}

function buildBridge(chunk, bridge) {
  const first = Math.max(chunk.start, bridge.start - 12);
  const last = Math.min(chunk.start + CHUNK_LENGTH, bridge.end + 12);
  if (first >= last) return;
  const vertices = [];
  function quad(a, b, c, d) {
    for (const p of [a, b, c, b, d, c]) vertices.push(p.x, p.y, p.z + chunk.start);
  }
  function point(s, u, y) { return positionAt(s, u, y); }
  function bottom(s, u) {
    if (s <= bridge.start || s >= bridge.end) return Math.min(roadHeight(s) - 1.3, groundHeight(s, u) - .4);
    const across = (s - bridge.start) % 24 - 12;
    return Math.abs(across) > 10 ? -2 : roadHeight(s) - 13.4 + Math.sqrt(100 - across * across);
  }
  for (let s = first; s < last; s++) {
    const end = Math.min(s + 1, last);
    for (const side of [-1, 1]) {
      const outer = side * 6.13, inner = side * 5.38;
      const low = bottom(s, outer), lowEnd = bottom(end, outer);
      const high = roadHeight(s) - .13, highEnd = roadHeight(end) - .13;
      for (const u of [outer, inner]) quad(point(s, u, low), point(end, u, lowEnd), point(s, u, high), point(end, u, highEnd));
      quad(point(s, inner, low), point(end, inner, lowEnd), point(s, outer, low), point(end, outer, lowEnd));
      // Open balustrades preserve the tiny car's silhouette on the bridge.
      for (const u of [outer, outer - side * .24]) quad(point(s, u, high + 1.15), point(end, u, highEnd + 1.15), point(s, u, high + 1.4), point(end, u, highEnd + 1.4));
      quad(point(s, outer, high + 1.4), point(end, outer, highEnd + 1.4), point(s, outer - side * .24, high + 1.4), point(end, outer - side * .24, highEnd + 1.4));
      if (s % 3 === 0) {
        for (const u of [outer, outer - side * .28]) quad(point(s, u, high), point(s + .33, u, high), point(s, u, high + 1.35), point(s + .33, u, high + 1.35));
      }
    }
    // The deck has an underside, so the arches remain solid from the ocean side.
    quad(point(s, -6.13, roadHeight(s) - 1), point(end, -6.13, roadHeight(end) - 1), point(s, 6.13, roadHeight(s) - 1), point(end, 6.13, roadHeight(end) - 1));
  }
  const mesh = chunk.addMesh(geometry(vertices), bridgeMaterial, true);
  mesh.name = `coastal-bridge-${bridge.index}`;
  chunk.features.bridges.push(bridge.index);
}

function buildPond(chunk, pond) {
  if (pond.center + pond.rs * 1.5 < chunk.start || pond.center - pond.rs * 1.5 > chunk.start + CHUNK_LENGTH) return;
  const vertices = [], colors = [];
  const shallow = new THREE.Color('#5cacb3'), deep = new THREE.Color('#317f99');
  // Slice the actual terrain faces at the waterline. An independent square
  // water grid left exposed teeth and detached patches beyond the coarse bank.
  // Using the terrain's global rows also matches its jittered streaming seams.
  const firstRow = chunk.start / TERRAIN_STEP;
  for (let row = firstRow; row < firstRow + CHUNK_LENGTH / TERRAIN_STEP; row++) {
    for (let col = 15; col < terrainColumns(row * TERRAIN_STEP).length - 1; col++) {
      for (const triangle of terrainCell(row, col)) {
        if (!triangle.some(p => p.y < pond.level && pondRadius(p.s, p.u, pond) < 1.12)) continue;
        const polygon = [];
        for (let i = 0; i < 3; i++) {
          const a = triangle[i], b = triangle[(i + 1) % 3];
          const wetA = a.y < pond.level, wetB = b.y < pond.level;
          if (wetA) polygon.push(a);
          if (wetA !== wetB) {
            const t = (pond.level - a.y) / (b.y - a.y);
            polygon.push({ x: a.x + (b.x - a.x) * t, y: pond.level, z: a.z + (b.z - a.z) * t });
          }
        }
        if (polygon.length < 3) continue;
        // Broad, quiet color facets follow the same faces as the hillside.
        // Avoid a smooth cyan halo that makes the pond look airbrushed in.
        const depth = polygon.reduce((sum, p) => sum + pond.level - p.y, 0) / polygon.length;
        const color = shallow.clone().lerp(deep, Math.min(1, depth / 2.4));
        color.multiplyScalar(.97 + randomAt(row, col + 2201) * .06);
        for (let i = 1; i < polygon.length - 1; i++) {
          // Terrain cells wind downward; the water is viewed from above.
          for (const p of [polygon[0], polygon[i + 1], polygon[i]]) {
            vertices.push(p.x, pond.level, p.z + chunk.start); colors.push(color.r, color.g, color.b);
          }
        }
      }
    }
  }
  if (!vertices.length) return;
  const mesh = chunk.addMesh(geometry(vertices, colors), lakeMaterial);
  mesh.name = `inland-pond-${pond.index}`;
  mesh.geometry.boundingSphere.radius += .3;
  chunk.features.ponds.push(pond.index);
}

export function buildLandmarks(chunk) {
  chunk.features = { bridges: [], ponds: [] };
  const bridge = bridgeAt(chunk.start + CHUNK_LENGTH / 2);
  buildBridge(chunk, bridge);
  buildPond(chunk, pondAt(chunk.start + CHUNK_LENGTH / 2));
}

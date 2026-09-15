import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { bridgeAt, pondAt, pondRadius, roadHeight, groundHeight, positionAt, CHUNK_LENGTH } from './route.js';
import { createWaterMaterial } from './water.js';

const bridgeMaterial = new THREE.MeshStandardMaterial({ color: '#d8c9ab', emissive: '#766b54', emissiveIntensity: .08, roughness: 1, flatShading: true, side: THREE.DoubleSide });
const lakeMaterial = createWaterMaterial(true);
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
  const first = Math.max(chunk.start, Math.floor((pond.center - pond.rs * 1.2) / 2) * 2);
  const last = Math.min(chunk.start + CHUNK_LENGTH, pond.center + pond.rs * 1.2);
  if (first >= last) return;
  const vertices = [], colors = [];
  for (let s = first; s < last; s += 2) {
    for (let u = pond.u - pond.ru * 1.2; u < pond.u + pond.ru * 1.2; u += 2) {
      const coords = [[s, u], [s + 2, u], [s, u + 2], [s + 2, u + 2]];
      if (coords.every(([t, v]) => pondRadius(t, v, pond) > 1.05)) continue;
      const points = coords.map(([t, v]) => positionAt(t, v, pond.level));
      for (const index of [0, 2, 1, 1, 2, 3]) {
        const p = points[index]; const radius = pondRadius(...coords[index], pond);
        const color = new THREE.Color('#276d78').lerp(new THREE.Color('#72b8a5'), Math.min(1, radius));
        vertices.push(p.x, p.y, p.z + chunk.start); colors.push(color.r, color.g, color.b);
      }
    }
  }
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

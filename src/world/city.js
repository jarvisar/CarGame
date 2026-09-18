import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { finalizeChunkTransforms } from './chunk-transforms.js';
import { splitBatch } from './instance-batches.js';
import { updateResidentChunks } from './resident.js';
import { CHUNK_LENGTH, randomAt, seededRandom, smoothstep, lerp, positionAt, roadFrame } from './route.js';
import { CITY_STEP, CITY_COLUMN_COUNT, KERB, PAVEMENT_LIFT, cityVertex, cityPosition, cityRoadHeight, cityGroundHeight, quayOffset, RIVER_LEVEL,
  FAR_BANK, FAR_BANK_TOP, QUAY_WALL, blockBoundary, blockAt, crossStreetAt, nearStreet, onCrossStreet, STREET_HALF_WIDTH, BANDS, SKYLINE_FROM,
  BANK_BANDS } from './city-route.js';
import { createWaterMaterial, animateWater } from './water.js';
import { terrainSampler } from './coastal-assets.js';
import { plainsTrees } from './plains-assets.js';
import { cityAssets, parkedCars, PARKED_PAINTS } from './city-assets.js';
import { cityDiscoveries, cityDiscoveryClears, cityLotClears } from './city-discoveries.js';
import { buildCityDiscoveries } from './city-discovery-scenery.js';
import { Rainfall } from './rainfall.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });
const terrainMaterial = material('#ffffff', { vertexColors: true });
// Wet asphalt: darker than the other routes' roads and glossy enough to take
// a broad sheen from the weak sun.
const roadMaterial = material('#45484c', { roughness: .5, flatShading: false });
const kerbMaterial = material('#a4a7a9', { flatShading: false });
const edgeMaterial = material('#c3c6c3', { flatShading: false });
const centerMaterial = material('#bda041', { flatShading: false });
const waterMaterial = createWaterMaterial(true);
const blocksMaterial = material('#ffffff', { vertexColors: true, roughness: .92 });
const skylineMaterial = material('#ffffff', { vertexColors: true });
// Lit windows ignore the weather: an unlit material reads as light from inside.
const litMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
// Standing water on the road and pavements reflects the overcast sky as a
// flat, slightly transparent patch.
const puddleMaterial = new THREE.MeshBasicMaterial({ color: '#a9b2b9', transparent: true, opacity: .5, depthWrite: false, forceSinglePass: true, toneMapped: false });
const furnitureMaterial = material('#ffffff', { vertexColors: true, roughness: .9 });
const paintedMaterial = material('#ffffff');
const parkedPaintMaterial = material('#ffffff', { roughness: .6 });
const parkedTrimMaterial = material('#ffffff', { vertexColors: true, roughness: .76 });
const leavesMaterial = material('#ffffff', { vertexColors: true });
const barkMaterial = material('#55483b');
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
registerChunkResources('city', { terrainMaterial, roadMaterial, kerbMaterial, edgeMaterial, centerMaterial, waterMaterial, blocksMaterial, skylineMaterial, litMaterial,
  puddleMaterial, furnitureMaterial, paintedMaterial, parkedPaintMaterial, parkedTrimMaterial, leavesMaterial, barkMaterial, boxGeometry, cityAssets, parkedCars, trees: plainsTrees });

function geometry(vertices, colors) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function triangle(vertices, colors, a, b, c, color, start) {
  if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
  for (const p of [a, b, c]) { vertices.push(p.x, p.y, p.z + start); if (colors) colors.push(color.r, color.g, color.b); }
}
function instances(group, geo, mat, items, name, shadows = true, ambientOcclusion = true) {
  if (!items.length) return;
  for (const part of splitBatch(items)) {
    const mesh = new THREE.InstancedMesh(geo, mat, part.length); mesh.name = name;
    for (let i = 0; i < part.length; i++) {
      const item = part[i]; dummy.position.set(...item.p); dummy.rotation.set(...(item.r ?? [0, 0, 0]));
      if (item.q) dummy.quaternion.copy(item.q);
      dummy.scale.set(...(item.scale ?? [1, 1, 1])); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
    }
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    if (!ambientOcclusion) mesh.userData.ambientOcclusion = false;
    mesh.computeBoundingSphere(); group.add(mesh);
  }
}

// The palette is cool and wet: grey stone, dark brick, concrete, a little
// painted render, with warm accents on fascias, awnings and lit windows.
const WALLS = ['#7a5b54', '#87685d', '#6b524f', '#96969a', '#a4a09b', '#adb0b3', '#999ea3', '#889aa3', '#6e7d87', '#a4978a', '#b2a189', '#5c6975', '#4f5b66', '#8f8579'];
const ROOFS = ['#54585c', '#4c5054', '#5e6266', '#474b4f'];
const ACCENTS = ['#8c3a3a', '#2f6c6a', '#ad7a2f', '#3f5a86', '#6a4a78', '#3b6d47', '#b0553a'];
const GLASS = new THREE.Color('#2c3741'), LIT = ['#e3b96f', '#e9c27d', '#d9ad62', '#ecc98c'];
const asphalt = new THREE.Color('#4a4d51'), gutter = new THREE.Color('#3c3f43'), pavement = new THREE.Color('#878b8f'), paving = new THREE.Color('#8a8e92');
const lots = new THREE.Color('#7d8286'), vacant = new THREE.Color('#71767a'), far = new THREE.Color('#6d747b'), fog = new THREE.Color('#98a3ac');
const wall = new THREE.Color('#79766f'), bed = new THREE.Color('#3b464c'), bank = new THREE.Color('#6d6b66'), bankTop = new THREE.Color('#787b7d');
const lawn = new THREE.Color('#587347'), lawnWet = new THREE.Color('#4b653e');
const waterDeep = new THREE.Color('#57656e'), waterLight = new THREE.Color('#63717a');
const TREE_GREENS = ['#3b6136', '#426639', '#345832', '#456b3e'];
const pick = (list, n) => list[((n % list.length) + list.length) % list.length];

export class CityChunk {
  constructor(index) {
    this.index = index; this.start = index * CHUNK_LENGTH; this.group = new THREE.Group(); this.group.name = `city-chunk-${index}`; this.owned = [];
    this.features = { discoveries: [] };
    this.discoveries = cityDiscoveries(this.start - 160, this.start + CHUNK_LENGTH + 160);
    this.scenery = { blocks: { vertices: [], colors: [] }, lit: { vertices: [], colors: [] }, skyline: { vertices: [], colors: [] }, puddles: [],
      boxes: [], furniture: new Map(), parked: new Map(), bark: new Map(), leaves: new Map() };
    this.buildTerrain(); this.buildRoad(); this.buildRiver(); this.buildBlocks(); this.buildStreets();
    buildCityDiscoveries(this, this.discoveries);
    this.finishScenery();
    finalizeChunkTransforms(this.group);
  }
  addMesh(g, mat, name, shadows = false) {
    const mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.castShadow = shadows; mesh.receiveShadow = true;
    this.group.add(mesh); this.owned.push(g); return mesh;
  }
  inChunk(s) { return s >= this.start && s < this.start + CHUNK_LENGTH; }
  // Scenery stands on the rendered facets; the analytic ground covers spots
  // outside this chunk.
  ground(s, u) {
    const p = positionAt(s, u, 0);
    return { x: p.x, y: this.sampleGround(p.x, p.z + this.start) ?? cityGroundHeight(s, u), z: p.z + this.start };
  }
  // Local coordinates for a point on the road frame at a given height.
  at(s, u, y) { const p = cityPosition(s, u, y); return { x: p.x, y: p.y, z: p.z + this.start }; }
  buildTerrain() {
    const vertices = [], colors = [], cache = new Map();
    const vertex = (row, col) => {
      const key = `${row},${col}`;
      if (!cache.has(key)) cache.set(key, cityVertex(row, col));
      return cache.get(key);
    };
    for (let row = this.start / CITY_STEP; row < (this.start + CHUNK_LENGTH) / CITY_STEP; row++) {
      for (let col = 0; col < CITY_COLUMN_COUNT - 1; col++) {
        const a = vertex(row, col), b = vertex(row + 1, col), c = vertex(row, col + 1), d = vertex(row + 1, col + 1);
        const tris = (row + col) % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
        tris.forEach((tri, i) => triangle(vertices, colors, ...tri, this.facetColor(tri, row, col, i), this.start));
      }
    }
    this.terrain = this.addMesh(geometry(vertices, colors), terrainMaterial, 'city-ground', true);
    this.sampleGround = terrainSampler(this.terrain);
  }
  facetColor(tri, row, col, i) {
    const s = tri.reduce((sum, p) => sum + p.s, 0) / 3, u = tri.reduce((sum, p) => sum + p.u, 0) / 3, cross = Math.abs(u);
    const facet = randomAt(row * 2 + i, col + 3041);
    let color;
    if (cross <= KERB + .3) color = asphalt.clone();
    else if (cross < 6.6) color = gutter.clone();
    else if (u > 0) {
      const square = this.discoveries.find(site => site.kind === 'square' && Math.abs(s - site.s) < site.halfS && u > site.u0 && u < site.u1);
      if (onCrossStreet(s, u)) color = asphalt.clone();
      else if ((u > BANDS[0].back && u < BANDS[1].front) || (u > BANDS[1].back && u < BANDS[2].front)) color = asphalt.clone().multiplyScalar(.94);
      else if (square) {
        const paved = Math.hypot(s - square.s, u - square.u) < 11.5 || Math.abs(s - square.s) < 2.5 || Math.abs(u - square.u) < 2.5;
        color = paved ? paving.clone() : lawn.clone().lerp(lawnWet, .5 + .5 * Math.sin(s / 9 + u / 7));
      } else if (u < 13) color = pavement.clone();
      else if (u < BANDS[2].back) color = lots.clone();
      else if (u < SKYLINE_FROM) color = vacant.clone();
      else color = far.clone().lerp(fog, smoothstep(180, 420, u) * .6);
    } else {
      const q = quayOffset(s);
      if (u >= q) {
        if (onCrossStreet(s, u)) color = asphalt.clone();
        else color = (Math.floor(row) % 2 ? paving : pavement).clone();
      } else if (u >= q - QUAY_WALL) color = wall.clone();
      else if (u > FAR_BANK) color = bed.clone();
      else if (u > FAR_BANK_TOP) color = bank.clone();
      else color = bankTop.clone().lerp(fog, smoothstep(-200, -420, u) * .6);
    }
    return color.multiplyScalar(.975 + facet * .05);
  }
  ribbon(ranges, lift, mat, name) {
    const vertices = [];
    for (const [low, high] of ranges) for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      const at = (t, u) => cityPosition(t, u, cityRoadHeight(t) + lift);
      const a = at(s, low), b = at(s + 2, low), c = at(s, high), d = at(s + 2, high);
      triangle(vertices, null, a, b, c, null, this.start); triangle(vertices, null, b, d, c, null, this.start);
    }
    this.addMesh(geometry(vertices), mat, name);
  }
  buildRoad() {
    this.ribbon([[-5.5, 5.5]], .075, roadMaterial, 'city-road');
    this.ribbon([[-6.7, -6.05], [6.05, 6.7]], PAVEMENT_LIFT + .02, kerbMaterial, 'kerbs');
    this.ribbon([[-5.05, -4.89], [4.89, 5.05]], .09, edgeMaterial, 'road-edges');
    this.ribbon([[-.21, -.07], [.07, .21]], .093, centerMaterial, 'center-lines');
  }
  // The river: one level plane from the far bank to just inside the quay
  // wall, so the wall's own facet meets the water without a seam.
  buildRiver() {
    const vertices = [], colors = [];
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += CITY_STEP) {
      const t = s + CITY_STEP;
      const columns = q => [-128.3, -104, -82, -62, q - .9];
      const c0 = columns(quayOffset(s)), c1 = columns(quayOffset(t));
      for (let k = 0; k < c0.length - 1; k++) {
        const at = (v, u) => cityPosition(v, u, RIVER_LEVEL);
        const a = at(s, c0[k]), b = at(t, c1[k]), c = at(s, c0[k + 1]), d = at(t, c1[k + 1]);
        const color = waterDeep.clone().lerp(waterLight, .3 + .35 * Math.sin(s / 41 + k * 1.7)).multiplyScalar(.97 + randomAt(s, k + 3051) * .06);
        triangle(vertices, colors, a, b, c, color, this.start); triangle(vertices, colors, b, d, c, color, this.start);
      }
    }
    const water = this.addMesh(geometry(vertices, colors), waterMaterial, 'city-river');
    water.geometry.boundingSphere.radius += .5;
  }
  // A face of a building, in local coordinates, wound to face outward.
  quad(target, points, color, outward) {
    const [p1, p2, p3, p4] = points;
    const ax = p2.x - p1.x, ay = p2.y - p1.y, az = p2.z - p1.z, bx = p3.x - p1.x, by = p3.y - p1.y, bz = p3.z - p1.z;
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const order = nx * outward[0] + ny * outward[1] + nz * outward[2] < 0 ? [p1, p4, p3, p2] : [p1, p2, p3, p4];
    for (const p of [order[0], order[1], order[2], order[0], order[2], order[3]]) {
      target.vertices.push(p.x, p.y, p.z); target.colors.push(color.r, color.g, color.b);
    }
  }
  // A block standing on the road frame: its footprint is a rectangle in
  // (s, u), so rows of buildings stay square to the road round the bends.
  prism(target, s0, s1, u0, u1, y0, y1, color, { top = true, back = true, sides = true, shade = 1 } = {}) {
    const c = [[s0, u0], [s1, u0], [s1, u1], [s0, u1]].map(([s, u]) => [this.at(s, u, y0), this.at(s, u, y1)]);
    const face = (i, j, tint, outward) => this.quad(target, [c[i][0], c[j][0], c[j][1], c[i][1]], color.clone().multiplyScalar(tint * shade), outward);
    face(0, 1, 1, [-1, 0, 0]);
    if (sides) { face(1, 2, .9, [0, 0, 1]); face(3, 0, .9, [0, 0, -1]); }
    if (back) face(2, 3, .82, [1, 0, 0]);
    if (top) this.quad(target, [c[0][1], c[1][1], c[2][1], c[3][1]], color.clone().multiplyScalar(1.04 * shade), [0, 1, 0]);
  }
  // Windows on the front and the near end of a building: punched holes in
  // rows, or ribbon strips on the towers. Some are lit from inside.
  windows(b, y0, seed, kind) {
    const { s0, s1, u0, u1 } = b, { blocks, lit } = this.scenery;
    const storeys = Math.floor((b.height - 1.2) / 3.2), first = b.shop ? 1 : 0;
    let n = 0;
    const pane = (points, outward, salt) => {
      const on = randomAt(seed, 3061 + salt) < b.lit;
      this.quad(on ? lit : blocks, points, on ? new THREE.Color(pick(LIT, seed + salt)) : GLASS.clone().multiplyScalar(.92 + randomAt(seed, 3062 + salt) * .16), outward);
    };
    for (let k = first; k < storeys; k++) {
      const yLow = y0 + 1.1 + k * 3.2, yHigh = yLow + 1.55;
      if (kind === 'ribbon') {
        // Ribbon strips in bays, so a lit office is one bay, not a whole floor.
        for (let s = s0 + .5; s < s1 - .5; s += 6) {
          const e = Math.min(s + 5.7, s1 - .5);
          pane([this.at(s, u0 - .05, yLow), this.at(e, u0 - .05, yLow), this.at(e, u0 - .05, yHigh), this.at(s, u0 - .05, yHigh)], [-1, 0, 0], ++n);
        }
        for (let u = u0 + .5; u < u1 - .5; u += 6) {
          const e = Math.min(u + 5.7, u1 - .5);
          pane([this.at(s0 - .05, u, yLow), this.at(s0 - .05, e, yLow), this.at(s0 - .05, e, yHigh), this.at(s0 - .05, u, yHigh)], [0, 0, 1], ++n);
        }
        continue;
      }
      for (let s = s0 + 1.3; s + 1.3 <= s1 - .9; s += 2.5) {
        pane([this.at(s, u0 - .05, yLow), this.at(s + 1.3, u0 - .05, yLow), this.at(s + 1.3, u0 - .05, yHigh), this.at(s, u0 - .05, yHigh)], [-1, 0, 0], ++n);
      }
      for (let u = u0 + 1.4; u + 1.3 <= u1 - 1; u += 2.7) {
        pane([this.at(s0 - .05, u, yLow), this.at(s0 - .05, u + 1.3, yLow), this.at(s0 - .05, u + 1.3, yHigh), this.at(s0 - .05, u, yHigh)], [0, 0, 1], ++n);
      }
    }
  }
  // Ground-floor shopfronts along the building line: a glass strip, a fascia
  // in the shop's colour, a door, and an awning over some of them.
  shopfront(b, y0, seed) {
    const { s0, s1, u0 } = b, { blocks, lit } = this.scenery, accent = new THREE.Color(pick(ACCENTS, seed));
    const glassLit = randomAt(seed, 3071) < .45;
    this.quad(glassLit ? lit : blocks, [this.at(s0 + .5, u0 - .06, y0 + .25), this.at(s1 - .5, u0 - .06, y0 + .25), this.at(s1 - .5, u0 - .06, y0 + 2.8), this.at(s0 + .5, u0 - .06, y0 + 2.8)],
      glassLit ? new THREE.Color('#e7d7b0') : GLASS.clone().multiplyScalar(1.12), [-1, 0, 0]);
    this.quad(blocks, [this.at(s0 + .3, u0 - .12, y0 + 2.8), this.at(s1 - .3, u0 - .12, y0 + 2.8), this.at(s1 - .3, u0 - .12, y0 + 3.55), this.at(s0 + .3, u0 - .12, y0 + 3.55)], accent, [-1, 0, 0]);
    this.quad(blocks, [this.at(s0 + .3, u0 - .12, y0 + 3.55), this.at(s1 - .3, u0 - .12, y0 + 3.55), this.at(s1 - .3, u0, y0 + 3.55), this.at(s0 + .3, u0, y0 + 3.55)], accent.clone().multiplyScalar(1.1), [0, 1, 0]);
    const door = s0 + 1 + randomAt(seed, 3072) * (s1 - s0 - 3.2);
    this.quad(blocks, [this.at(door, u0 - .09, y0 + .2), this.at(door + 1.2, u0 - .09, y0 + .2), this.at(door + 1.2, u0 - .09, y0 + 2.5), this.at(door, u0 - .09, y0 + 2.5)], new THREE.Color('#2a2c30'), [-1, 0, 0]);
    if (randomAt(seed, 3073) < .4) {
      const a0 = Math.max(s0 + .6, door - 1.4), a1 = Math.min(s1 - .6, a0 + 3.6 + randomAt(seed, 3074) * 2);
      this.quad(blocks, [this.at(a0, u0 - .12, y0 + 3.05), this.at(a1, u0 - .12, y0 + 3.05), this.at(a1, u0 - 1.35, y0 + 2.55), this.at(a0, u0 - 1.35, y0 + 2.55)], accent.clone().multiplyScalar(.95), [-1, 1, 0]);
      this.quad(blocks, [this.at(a0, u0 - 1.35, y0 + 2.55), this.at(a1, u0 - 1.35, y0 + 2.55), this.at(a1, u0 - 1.35, y0 + 2.25), this.at(a0, u0 - 1.35, y0 + 2.25)], accent.clone().multiplyScalar(.8), [-1, 0, 0]);
    }
  }
  // One building: walls, roof, parapet or gable, roof furniture and windows.
  building(b, seed) {
    const { blocks } = this.scenery, { s0, s1, u0, u1 } = b;
    const heights = [[s0, u0], [s1, u0], [s1, u1], [s0, u1], [(s0 + s1) / 2, (u0 + u1) / 2]].map(([s, u]) => this.ground(s, u).y);
    const y0 = Math.min(...heights) - .25, y1 = Math.max(...heights) + b.height;
    const color = new THREE.Color(b.wall);
    this.prism(blocks, s0, s1, u0, u1, y0, y1, color, { top: b.roof !== 'gable', shade: b.shade });
    if (b.roof === 'gable') {
      const ridge = y1 + (u1 - u0) * .32, um = (u0 + u1) / 2, roof = new THREE.Color(b.roofColor);
      this.quad(blocks, [this.at(s0 - .3, u0 - .3, y1 - .15), this.at(s1 + .3, u0 - .3, y1 - .15), this.at(s1 + .3, um, ridge), this.at(s0 - .3, um, ridge)], roof, [-1, 1, 0]);
      this.quad(blocks, [this.at(s0 - .3, um, ridge), this.at(s1 + .3, um, ridge), this.at(s1 + .3, u1 + .3, y1 - .15), this.at(s0 - .3, u1 + .3, y1 - .15)], roof.clone().multiplyScalar(.9), [1, 1, 0]);
      for (const [s, outward] of [[s0, [0, 0, 1]], [s1, [0, 0, -1]]]) {
        const a = this.at(s, u0, y1), c = this.at(s, u1, y1), t = this.at(s, um, ridge);
        this.quad(blocks, [a, c, t, t], color.clone().multiplyScalar(.9 * b.shade), outward);
      }
    } else {
      const roof = new THREE.Color(b.roofColor), p = color.clone().multiplyScalar(.9);
      this.quad(blocks, [this.at(s0, u0, y1 + .02), this.at(s1, u0, y1 + .02), this.at(s1, u1, y1 + .02), this.at(s0, u1, y1 + .02)], roof, [0, 1, 0]);
      for (const [a, c, d, e] of [[s0, s1, u0, u0 + .45], [s0, s1, u1 - .45, u1], [s0, s0 + .45, u0, u1], [s1 - .45, s1, u0, u1]]) this.prism(blocks, a, c, d, e, y1, y1 + .7, p, { shade: 1 });
      // Tanks, plant and stair heads on the flat roofs.
      const inset = 1.4;
      for (let k = 0, count = 1 + Math.floor(randomAt(seed, 3081) * 3); k < count; k++) {
        const w = 1.4 + randomAt(seed, 3082 + k) * 2.2, d = 1.4 + randomAt(seed, 3086 + k) * 2, h = .9 + randomAt(seed, 3090 + k) * 1.8;
        if (s1 - s0 < w + inset * 2 + 1 || u1 - u0 < d + inset * 2 + 1) break;
        const rs = s0 + inset + randomAt(seed, 3094 + k) * (s1 - s0 - w - inset * 2), ru = u0 + inset + randomAt(seed, 3098 + k) * (u1 - u0 - d - inset * 2);
        this.prism(blocks, rs, rs + w, ru, ru + d, y1, y1 + h, new THREE.Color(k ? '#8d9195' : '#6f7377'), {});
      }
    }
    if (b.windows !== 'none') this.windows(b, y0, seed, b.windows);
    if (b.shop) this.shopfront(b, y0, seed);
  }
  // Lots along each block, each row of buildings at its own scale: shops
  // and flats on the building line, taller blocks behind, towers at the back.
  lotsFor(block, band, s0, s1) {
    const lots = [];
    let s = s0, i = 0;
    while (s1 - s > 9) {
      const r = randomAt(block * 16 + band * 5, 3111 + i);
      let w = band === 2 ? 16 + r * 18 : band === 3 ? 14 + r * 16 : 11 + r * 13;
      if (s1 - s - w < 9) w = s1 - s;
      lots.push({ s0: s, s1: s + w, i }); s += w + .7; i++;
    }
    return lots;
  }
  buildBlocks() {
    const first = blockAt(this.start - 160), last = blockAt(this.start + CHUNK_LENGTH + 160);
    for (let block = first; block <= last; block++) {
      const start = blockBoundary(block) + STREET_HALF_WIDTH + 1.5, end = blockBoundary(block + 1) - STREET_HALF_WIDTH - 1.5;
      for (const [band, range] of BANDS.entries()) {
        for (const lot of this.lotsFor(block, band, start, end)) {
          const center = (lot.s0 + lot.s1) / 2;
          if (!this.inChunk(center)) continue;
          const seed = (block * 16 + band * 5) * 41 + lot.i, r = k => randomAt(seed, 3121 + k);
          if (r(0) > [.94, .88, .74][band]) continue;
          const depth = band === 0 ? 16 + r(1) * 6 : band === 1 ? 18 + r(1) * 18 : 20 + r(1) * 30;
          const u0 = range.front + (band ? r(2) * 4 : 0), u1 = Math.min(range.back, u0 + depth);
          if (!cityLotClears(lot.s0, lot.s1, u0, u1, this.discoveries)) continue;
          const storeys = band === 0 ? 3 + Math.floor(r(3) * 4) : band === 1 ? 5 + Math.floor(r(3) * 7) : 8 + Math.floor(r(3) * 11);
          const gable = band === 0 && storeys <= 4 && r(4) < .35;
          this.building({ s0: lot.s0, s1: lot.s1, u0, u1, height: storeys * 3.2 + 1.2, wall: WALLS[Math.floor(r(5) * WALLS.length)], roofColor: ROOFS[Math.floor(r(6) * ROOFS.length)],
            roof: gable ? 'gable' : 'flat', windows: band === 2 && r(7) < .5 ? 'ribbon' : 'punched', shop: band < 2 && r(8) < (band ? .35 : .85), lit: [.22, .16, .1][band], shade: .96 + r(9) * .08 }, seed);
        }
      }
    }
    // Wharf sheds and blocks along the far bank, on their own lattice.
    for (const [k, range] of BANK_BANDS.entries()) {
      const step = k ? 34 : 24;
      for (let n = Math.floor((this.start - 60) / step); n * step < this.start + CHUNK_LENGTH + 60; n++) {
        const seed = n * 7 + k * 3, r = j => randomAt(seed, 3141 + j), s0 = n * step + r(0) * 8, w = (k ? 16 : 12) + r(1) * (k ? 14 : 10);
        if (!this.inChunk(s0 + w / 2) || r(2) < .22 || !cityLotClears(s0, s0 + w, range.back, range.front, this.discoveries)) continue;
        const u1 = range.front - r(3) * 3, u0 = Math.max(range.back, u1 - (k ? 16 + r(4) * 20 : 9 + r(4) * 8));
        const height = k ? 14 + r(5) * 26 : 6 + r(5) * 5;
        this.building({ s0, s1: s0 + w, u0, u1, height, wall: WALLS[Math.floor(r(6) * WALLS.length)], roofColor: ROOFS[Math.floor(r(7) * ROOFS.length)],
          roof: !k && r(8) < .55 ? 'gable' : 'flat', windows: k ? 'punched' : 'none', shop: false, lit: k ? .1 : 0, shade: .94 + r(9) * .08 }, seed);
      }
    }
    // The skyline: plain towers beyond the far blocks, fading into the fog,
    // without shadows or soft shading, like the far windbreaks on the plains.
    // The near side has none: nothing on the camera's side of the road is
    // ever far enough away for the fog to soften it.
    const { skyline } = this.scenery;
    for (const [lane, u] of [[0, 200], [1, 250], [2, 310], [3, 380], [4, 460]]) {
      for (let n = Math.floor((this.start - 60) / 46); n * 46 < this.start + CHUNK_LENGTH + 60; n++) {
        const r = j => randomAt(n, lane * 10 + 3161 + j), s = n * 46 + r(0) * 30, w = 14 + r(1) * 18, d = 14 + r(2) * 18;
        if (!this.inChunk(s) || r(3) < .3) continue;
        const height = 30 + r(4) * 95 + lane * 6;
        const base = cityGroundHeight(s, u) - 1, color = new THREE.Color(lane % 2 ? '#6b7581' : '#737d88').lerp(fog, .15 + .06 * (lane % 5));
        this.prism(skyline, s, s + w, u, u + d, base, base + height, color, { back: false, sides: true });
      }
    }
  }
  clearAt(s, u, r = 1) { return cityDiscoveryClears(s, u, this.discoveries, r); }
  furniture(name, s, u, yaw, extra = {}) {
    const p = this.ground(s, u), { furniture } = this.scenery;
    if (!furniture.has(name)) furniture.set(name, []);
    furniture.get(name).push({ p: [p.x, p.y + (extra.lift ?? 0), p.z], r: [0, yaw, 0], scale: extra.scale });
  }
  tree(s, u, height, color, yaw) {
    const variants = plainsTrees.oak, variant = variants[Math.abs(Math.round(s * 7 + u)) % variants.length];
    const p = this.ground(s, u), { bark, leaves } = this.scenery;
    if (!bark.has(variant)) { bark.set(variant, []); leaves.set(variant, []); }
    bark.get(variant).push({ p: [p.x, p.y - .12, p.z], scale: [height, height, height], r: [0, yaw, 0] });
    leaves.get(variant).push({ p: [p.x, p.y - .12, p.z], scale: [height, height, height], r: [0, yaw, 0], color });
  }
  parkedCar(s, u, yaw, seed) {
    // Two body shapes per chunk: variety along the route, few draw calls in it.
    const names = Object.keys(parkedCars), name = names[(Math.abs(this.index) * 2 + (randomAt(seed, 3181) < .5 ? 0 : 1)) % names.length], p = this.ground(s, u), { parked } = this.scenery;
    if (!parked.has(name)) parked.set(name, []);
    parked.get(name).push({ p: [p.x, p.y + .02, p.z], r: [0, yaw, 0], color: PARKED_PAINTS[Math.floor(randomAt(seed, 3182) * PARKED_PAINTS.length)] });
  }
  beam(list, a, b, width, color) {
    const from = new THREE.Vector3(a.x, a.y, a.z), to = new THREE.Vector3(b.x, b.y, b.z), direction = to.clone().sub(from);
    list.push({ p: from.clone().add(to).multiplyScalar(.5).toArray(), scale: [width, direction.length(), width], q: new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()), color });
  }
  puddle(s, u, radius, seed) {
    const { puddles } = this.scenery, center = this.ground(s, u), points = [];
    for (let k = 0; k < 7; k++) {
      const angle = k / 7 * Math.PI * 2, r = radius * (.6 + randomAt(seed, 3191 + k) * .6);
      const p = this.ground(s + Math.cos(angle) * r * 1.4, u + Math.sin(angle) * r);
      points.push({ x: p.x, y: center.y + .035, z: p.z });
    }
    for (let k = 0; k < 7; k++) {
      const a = { x: center.x, y: center.y + .035, z: center.z }, b = points[k], c = points[(k + 1) % 7];
      triangle(puddles, null, a, b, c, null, 0);
    }
  }
  buildStreets() {
    const random = seededRandom(this.index + 30231), { boxes } = this.scenery;
    const yaw = s => -roadFrame(s).angle, across = s => yaw(s) + Math.PI / 2;
    const street = s => { const c = crossStreetAt(s); return Math.abs(s - c.center) < STREET_HALF_WIDTH + 2; };
    // Street lamps face the road from both pavements; benches, trees and
    // shelters keep the promenade side, with trees also along the far pavement.
    for (let s = Math.ceil((this.start - 4) / 26) * 26 + 5; s < this.start + CHUNK_LENGTH + 4; s += 26) {
      if (!this.inChunk(s) || street(s)) continue;
      if (this.clearAt(s, 7.4)) this.furniture('lamp', s, 7.4, yaw(s));
      if (this.clearAt(s, -7.4)) this.furniture('lamp', s, -7.4, yaw(s) + Math.PI);
    }
    for (let s = Math.ceil((this.start - 4) / 18) * 18 + 9; s < this.start + CHUNK_LENGTH + 4; s += 18) {
      const t = s + (randomAt(Math.round(s), 3201) - .5) * 4;
      if (!this.inChunk(t) || street(t)) continue;
      if (randomAt(Math.round(s), 3202) < .8 && this.clearAt(t, -10.4, 2)) this.tree(t, -10.4, 5.5 + randomAt(Math.round(s), 3203) * 3, TREE_GREENS[Math.abs(Math.round(s / 18)) % 4], random() * 6.28);
      if (randomAt(Math.round(s), 3204) < .4 && this.clearAt(t, 10.2, 2)) this.tree(t, 10.2, 5 + randomAt(Math.round(s), 3205) * 2.5, TREE_GREENS[(Math.abs(Math.round(s / 18)) + 1) % 4], random() * 6.28);
    }
    for (let s = Math.ceil((this.start - 4) / 36) * 36 + 20; s < this.start + CHUNK_LENGTH + 4; s += 36) {
      if (!this.inChunk(s) || street(s) || randomAt(Math.round(s), 3211) > .65 || !this.clearAt(s, -12.8, 1.5)) continue;
      this.furniture('bench', s, -12.8, yaw(s));
    }
    for (let s = Math.ceil((this.start - 4) / 176) * 176 + 60; s < this.start + CHUNK_LENGTH + 4; s += 176) {
      if (!this.inChunk(s) || street(s)) continue;
      if (randomAt(Math.round(s), 3221) < .7 && this.clearAt(s, 8.6, 2.5)) this.furniture('shelter', s, 8.6, yaw(s));
      if (randomAt(Math.round(s), 3222) < .5 && this.clearAt(s, -8.6, 2.5)) this.furniture('shelter', s, -8.6, yaw(s) + Math.PI);
    }
    // The quay railing follows the wandering embankment in four-metre runs.
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 4) {
      if (!this.clearAt(s + 2, quayOffset(s + 2) + .5, 1)) continue;
      const a = this.ground(s, quayOffset(s) + .55), b = this.ground(s + 4, quayOffset(s + 4) + .55);
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      this.furniture('railing', s + 2, quayOffset(s + 2) + .55, Math.atan2(dx, dz), { scale: [1, 1, length / 4] });
    }
    // Every cross street gets its corner signals and zebra crossings; the
    // near-side streets that reach the quay get bollards where they end.
    const first = crossStreetAt(this.start - 20).index, last = crossStreetAt(this.start + CHUNK_LENGTH + 20).index;
    for (let index = first; index <= last; index++) {
      const center = blockBoundary(index);
      for (const k of [-1, 1]) {
        const s = center + k * (STREET_HALF_WIDTH + 1.4);
        if (this.inChunk(s)) this.furniture('signal', s, 7.6, yaw(s));
        if (this.inChunk(s) && nearStreet(index)) this.furniture('signal', s, -7.6, yaw(s) + Math.PI);
        const crossing = center + k * (STREET_HALF_WIDTH + 3.2);
        if (!this.inChunk(crossing)) continue;
        for (let j = 0; j < 8; j++) {
          const u = -4.4 + j * 1.26, p = this.at(crossing, u, cityRoadHeight(crossing) + .088);
          boxes.push({ p: [p.x, p.y, p.z], scale: [.62, .012, 2.6], r: [0, yaw(crossing), 0], color: '#d2d4d2' });
        }
      }
      if (nearStreet(index) && this.inChunk(center)) {
        const q = quayOffset(center);
        for (const k of [-1, 1]) this.furniture('bollard', center + k * 5.2, q + 2.2, yaw(center));
      }
      // Cars parked along the side streets, nose to the kerb.
      for (const k of [-1, 1]) for (let u = 17; u < 34; u += 6.2) {
        const s = center + k * (STREET_HALF_WIDTH - 2.6);
        if (!this.inChunk(s) || randomAt(index * 4 + k, Math.round(u) + 3231) > .5 || !this.clearAt(s, u, 2)) continue;
        this.parkedCar(s, u, across(s), index * 100 + Math.round(u) + k * 7);
      }
    }
    // Cars in the alleys behind the building line, and rows nose-to-river on
    // the wider stretches of embankment.
    for (const alley of [(BANDS[0].back + BANDS[1].front) / 2, (BANDS[1].back + BANDS[2].front) / 2]) {
      for (let s = Math.ceil((this.start - 4) / 22) * 22 + 6; s < this.start + CHUNK_LENGTH + 4; s += 22) {
        if (!this.inChunk(s) || street(s) || randomAt(Math.round(s), Math.round(alley) + 3241) > .4 || !this.clearAt(s, alley, 2)) continue;
        this.parkedCar(s, alley - 1.6, yaw(s) + (randomAt(Math.round(s), 3242) < .5 ? 0 : Math.PI), Math.round(s) * 3 + Math.round(alley));
      }
    }
    for (let s = Math.ceil(this.start / 3.4) * 3.4; s < this.start + CHUNK_LENGTH; s += 3.4) {
      const q = quayOffset(s);
      if (q > -35 || randomAt(Math.round(s * 10), 3251) > .6 || street(s) || !this.clearAt(s, q + 6, 2.2)) continue;
      this.parkedCar(s, q + 6.2, across(s), Math.round(s * 10));
    }
    // Manholes and puddles on the road and the pavements.
    for (let k = 0; k < 2; k++) {
      const s = this.start + 12 + random() * (CHUNK_LENGTH - 24), u = (random() - .5) * 6;
      this.furniture('manhole', s, u, yaw(s), { lift: .08 - (this.ground(s, u).y - cityRoadHeight(s)) });
    }
    for (let k = 0; k < 5; k++) {
      const s = this.start + 6 + random() * (CHUNK_LENGTH - 12), onRoad = random() < .6;
      const u = onRoad ? (random() - .5) * 8.4 : (random() < .5 ? -1 : 1) * (7.4 + random() * 4.5);
      if (!onRoad && !this.clearAt(s, u, 2)) continue;
      this.puddle(s, u, .9 + random() * 1.5, this.index * 8 + k);
    }
  }
  finishScenery() {
    const { blocks, lit, skyline, puddles, boxes, furniture, parked, bark, leaves } = this.scenery;
    if (blocks.vertices.length) this.addMesh(geometry(blocks.vertices, blocks.colors), blocksMaterial, 'city-blocks', true);
    if (lit.vertices.length) { const mesh = this.addMesh(geometry(lit.vertices, lit.colors), litMaterial, 'lit-windows'); mesh.receiveShadow = false; }
    if (skyline.vertices.length) {
      const mesh = this.addMesh(geometry(skyline.vertices, skyline.colors), skylineMaterial, 'city-skyline');
      mesh.userData.ambientOcclusion = false;
    }
    if (puddles.length) {
      const mesh = this.addMesh(geometry(puddles), puddleMaterial, 'puddles');
      mesh.receiveShadow = false; mesh.userData.ambientOcclusion = false; mesh.renderOrder = 1;
    }
    instances(this.group, boxGeometry, paintedMaterial, boxes, 'city-boxes');
    const names = { lamp: 'street-lamps', signal: 'traffic-signals', bench: 'benches', shelter: 'bus-shelters', railing: 'quay-railings', bollard: 'bollards', manhole: 'manholes' };
    for (const [name, items] of furniture) instances(this.group, cityAssets[name], furnitureMaterial, items, names[name], name !== 'manhole');
    for (const [name, items] of parked) {
      instances(this.group, parkedCars[name].paint, parkedPaintMaterial, items, 'parked-cars');
      instances(this.group, parkedCars[name].trim, parkedTrimMaterial, items.map(item => ({ ...item, color: undefined })), 'parked-car-trim');
    }
    for (const [variant, items] of bark) {
      instances(this.group, variant.bark, barkMaterial, items, 'city-trunks');
      instances(this.group, variant.leaves, leavesMaterial, leaves.get(variant), 'city-crowns');
    }
    this.scenery = null;
  }
  dispose() {
    this.group.removeFromParent(); for (const g of this.owned) g.dispose();
    this.group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  }
}

// Lightning: a rare double flash, on a fixed schedule from the scene clock so
// it pauses with the drive and repeats for a shared seed.
export function lightning(time) {
  const window = 42, k = Math.floor(time / window);
  let strength = 0;
  for (const cell of [k - 1, k]) {
    if (randomAt(cell, 3301) > .7) continue;
    const dt = time - (cell * window + 4 + randomAt(cell, 3302) * 34);
    if (dt < 0 || dt > .6) continue;
    strength = Math.max(strength, .9 * (Math.exp(-dt / .05) + (dt > .17 ? .6 * Math.exp(-(dt - .17) / .07) : 0)));
  }
  return strength;
}

export class CityWorld {
  constructor(scene, chunkSource = null) {
    this.scene = scene; this.chunkSource = chunkSource; this.chunks = new Map(); this.origin = 0; this.center = null; this.s = 0;
    this.effects = new THREE.Group(); this.effects.name = 'city-storm-effects'; scene.add(this.effects);
    this.rainfall = new Rainfall(); this.drops = this.rainfall.points; this.dropGeometry = this.rainfall.geometry; this.effects.add(this.drops);
    this.flash = new THREE.AmbientLight('#dbe6f4', 0); this.effects.add(this.flash);
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.time = 0;
  }
  update(s) {
    this.s = s; this.origin = Math.floor(s / 1024) * 1024;
    const center = Math.floor(s / CHUNK_LENGTH);
    updateResidentChunks(this, center, CityChunk);
    for (const chunk of this.chunks.values()) chunk.group.position.z = this.origin - chunk.start;
  }
  animate(time) {
    this.time = time; animateWater(time, this.origin);
    const anchor = cityPosition(this.s, -20, cityRoadHeight(this.s));
    this.rainfall.update(time, anchor, this.origin);
    this.flash.intensity = this.reducedMotion ? 0 : lightning(time);
  }
  dispose() {
    this.chunkSource?.dispose();
    for (const chunk of this.chunks.values()) chunk.dispose(); this.chunks.clear();
    this.effects.removeFromParent(); this.rainfall.dispose(); this.flash.dispose();
  }
}

import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { finalizeChunkTransforms } from './chunk-transforms.js';
import { splitBatch } from './instance-batches.js';
import { updateResidentChunks } from './resident.js';
import { CHUNK_LENGTH, randomAt, seededRandom, smoothstep, lerp, positionAt, roadFrame } from './route.js';
import { PLAINS_STEP, PLAINS_COLUMN_COUNT, ROAD_RESERVE, plainsVertex, plainsRowStep, plainsPosition, plainsRoadHeight, plainsGroundHeight,
  plainsCreekAt, creekCenterS, creekDistance, CREEK_WATER_HALF_WIDTH, BRIDGE_HALF_LENGTH, fieldAt, fieldRowAt, fieldBoundary, fieldBands,
  rowBoundaryKind, bandBoundaryKind, roadsideFence, farmGate, fieldCorner, pondsNear, pondDistance } from './plains-route.js';
import { createWaterMaterial, animateWater } from './water.js';
import { terrainSampler } from './coastal-assets.js';
import { plainsTrees, baleGeometry } from './plains-assets.js';
import { plainsDiscoveries, plainsDiscoveryClears } from './plains-discoveries.js';
import { buildPlainsDiscoveries } from './plains-discovery-scenery.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });
const terrainMaterial = material('#ffffff', { vertexColors: true });
const roadMaterial = material('#6b6a64', { roughness: .95, flatShading: false });
const shoulderMaterial = material('#c3b58c', { flatShading: false });
const edgeMaterial = material('#ece3c8', { flatShading: false });
const centerMaterial = material('#e2be4b', { flatShading: false });
const dirtMaterial = material('#b89e6f', { flatShading: false, side: THREE.DoubleSide });
const waterMaterial = createWaterMaterial(true);
const leavesMaterial = material('#ffffff', { vertexColors: true });
const barkMaterial = material('#6a563f');
const shrubMaterial = material('#ffffff');
const strawMaterial = material('#ffffff', { vertexColors: true });
const timberMaterial = material('#8b7455');
const poleMaterial = material('#7d6a50');
const wireMaterial = material('#3f3c36', { flatShading: false });
const metalMaterial = material('#8e948f', { metalness: .15 });
const concreteMaterial = material('#bcb7a8');
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const poleGeometry = new THREE.CylinderGeometry(.85, 1, 1, 6);
const shrubGeometry = new THREE.IcosahedronGeometry(1, 0);
const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
registerChunkResources('plains', { terrainMaterial, roadMaterial, shoulderMaterial, edgeMaterial, centerMaterial, dirtMaterial, waterMaterial, leavesMaterial,
  barkMaterial, shrubMaterial, strawMaterial, timberMaterial, poleMaterial, wireMaterial, metalMaterial, concreteMaterial, boxGeometry, poleGeometry, shrubGeometry, plainsTrees, baleGeometry });

function geometry(vertices, colors) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function triangle(vertices, colors, a, b, c, color, start) {
  if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
  for (const p of [a, b, c]) { vertices.push(p.x, p.y, p.z + start); if (colors) colors.push(color.r, color.g, color.b); }
}
function instances(group, geo, mat, items, name, shadows = true) {
  if (!items.length) return;
  for (const part of splitBatch(items)) {
    const mesh = new THREE.InstancedMesh(geo, mat, part.length); mesh.name = name;
    for (let i = 0; i < part.length; i++) {
      const item = part[i]; dummy.position.set(...item.p); dummy.rotation.set(...(item.r ?? [0, 0, 0]));
      if (item.q) dummy.quaternion.copy(item.q);
      dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
    }
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); group.add(mesh);
  }
}

// Field colours by crop. A field keeps one tint of its palette throughout, so
// the patchwork reads as a set of distinct fields rather than mottled ground.
const CROP_PALETTES = {
  wheat: ['#e3b545', '#ecbf4c', '#dbab3d'], stubble: ['#dcbd68', '#e4c672', '#d3b45f'], ploughed: ['#8f5f3a', '#986640', '#855636'],
  pasture: ['#82a838', '#8bb03e', '#79a034'], hay: ['#c9bb52', '#d1c258', '#c0b24c'],
};
const STRIPE = { wheat: .06, stubble: .1, ploughed: .17, pasture: 0, hay: .07 };
const verge = new THREE.Color('#a4ad4e'), ditch = new THREE.Color('#7a9640'), lush = new THREE.Color('#699e42'), mud = new THREE.Color('#77704f');
const haze = new THREE.Color('#cdbf7c'), pastureLight = new THREE.Color('#a3b64a');

export class PlainsChunk {
  constructor(index) {
    this.index = index; this.start = index * CHUNK_LENGTH; this.group = new THREE.Group(); this.group.name = `plains-chunk-${index}`; this.owned = [];
    this.features = { discoveries: [] };
    // A row of turbines reaches well past its own district anchor.
    this.discoveries = plainsDiscoveries(this.start - 160, this.start + CHUNK_LENGTH + 160);
    this.scenery = { posts: [], wires: [], poles: [], shrubs: [], bales: [], boxes: [], concrete: [], bark: new Map(), leaves: new Map(), dirt: [] };
    this.buildTerrain(); this.buildRoad(); this.buildCreek(); this.buildScenery();
    buildPlainsDiscoveries(this, this.discoveries);
    this.finishScenery();
    finalizeChunkTransforms(this.group);
  }
  addMesh(g, mat, name, shadows = false) {
    const mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.castShadow = shadows; mesh.receiveShadow = true;
    this.group.add(mesh); this.owned.push(g); return mesh;
  }
  // Scenery stands on the rendered facets, including across chunk seams; the
  // analytic ground covers spots outside this chunk, such as a wire's far pole.
  ground(s, u) {
    const p = positionAt(s, u, 0);
    return { x: p.x, y: this.sampleGround(p.x, p.z + this.start) ?? plainsGroundHeight(s, u), z: p.z + this.start };
  }
  buildTerrain() {
    const vertices = [], colors = [], cache = new Map();
    const vertex = (row, col) => {
      const key = `${row},${col}`;
      if (!cache.has(key)) cache.set(key, plainsVertex(row, col));
      return cache.get(key);
    };
    for (let row = this.start / PLAINS_STEP; row < (this.start + CHUNK_LENGTH) / PLAINS_STEP; row += plainsRowStep(row)) {
      const next = row + plainsRowStep(row);
      for (let col = 0; col < PLAINS_COLUMN_COUNT - 1; col++) {
        const a = vertex(row, col), b = vertex(next, col), c = vertex(row, col + 1), d = vertex(next, col + 1);
        const tris = (Math.round(row * 2) + col) % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
        tris.forEach((tri, i) => triangle(vertices, colors, ...tri, this.facetColor(tri, row, col, i), this.start));
      }
    }
    this.terrain = this.addMesh(geometry(vertices, colors), terrainMaterial, 'plains-fields', true);
    this.sampleGround = terrainSampler(this.terrain);
  }
  facetColor(tri, row, col, i) {
    const s = tri.reduce((sum, p) => sum + p.s, 0) / 3, u = tri.reduce((sum, p) => sum + p.u, 0) / 3, cross = Math.abs(u);
    const facet = randomAt(Math.round(row * 2) * 2 + i, col + 2801);
    const d = creekDistance(s, u);
    let color;
    if (cross < 7.2) color = new THREE.Color('#7d7c72');
    else if (cross < ROAD_RESERVE) color = verge.clone().lerp(ditch, 1 - smoothstep(0, 1.7, Math.abs(cross - 10.8)));
    else {
      const field = fieldAt(s, u), palette = CROP_PALETTES[field.kind];
      color = new THREE.Color(palette[Math.floor(randomAt(field.seed, field.salt + 5) * palette.length)]);
      // Furrows and swaths: the facet rows and columns are already straight
      // lines, so alternating them reads as ploughing without extra geometry.
      const stripe = field.rows === 'across' ? Math.floor(row) % 2 : col % 2;
      if (stripe) color.multiplyScalar(1 - STRIPE[field.kind]);
      if (field.kind === 'pasture') color.lerp(pastureLight, smoothstep(.3, .8, .5 + .3 * Math.sin(s / 37 + u / 29) + .2 * Math.sin(s / 13 - u / 17)) * .5);
      color.lerp(haze, smoothstep(280, 430, cross) * .7);
    }
    // Wet meadow along the creek and around the ponds, and bare mud under the water.
    if (d < 11) color.lerp(lush, 1 - smoothstep(6.5, 11, d));
    if (cross > 40 && cross < 220) {
      const pond = pondDistance(s, u);
      if (pond.d < 1.6) color.lerp(lush, 1 - smoothstep(1.1, 1.6, pond.d));
      if (pond.d < .85) color.lerp(mud, 1 - smoothstep(.7, .85, pond.d));
    }
    if (d < 5.4) color.lerp(mud, 1 - smoothstep(4.6, 5.4, d));
    return color.multiplyScalar(.975 + facet * .05);
  }
  ribbon(ranges, lift, mat, name) {
    const vertices = [];
    for (const [low, high] of ranges) for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      const at = (t, u) => plainsPosition(t, u, plainsRoadHeight(t) + lift);
      const a = at(s, low), b = at(s + 2, low), c = at(s, high), d = at(s + 2, high);
      triangle(vertices, null, a, b, c, null, this.start); triangle(vertices, null, b, d, c, null, this.start);
    }
    this.addMesh(geometry(vertices), mat, name);
  }
  buildRoad() {
    this.ribbon([[-6.4, 6.4]], .045, shoulderMaterial, 'gravel-shoulders');
    this.ribbon([[-5.5, 5.5]], .075, roadMaterial, 'plains-road');
    this.ribbon([[-5.05, -4.89], [4.89, 5.05]], .09, edgeMaterial, 'road-edges');
    this.ribbon([[-.21, -.07], [.07, .21]], .093, centerMaterial, 'center-lines');
  }
  // A dirt track from the road edge out across the fields, and yards for the
  // farm compounds, both laid on the rendered facets.
  track(s, side, toCross, fromCross = 6.4) {
    for (let cross = fromCross; cross < toCross; cross += 3) {
      const next = Math.min(cross + 3, toCross);
      this.dirtQuad([[s - 1.6, side * cross], [s + 1.6, side * cross], [s - 1.6, side * next], [s + 1.6, side * next]]);
    }
  }
  dirtPatch(s, u, halfS, halfU) {
    for (let ds = -halfS; ds < halfS; ds += 3) for (let du = -halfU; du < halfU; du += 3) {
      const es = Math.min(ds + 3, halfS), eu = Math.min(du + 3, halfU);
      this.dirtQuad([[s + ds, u + du], [s + es, u + du], [s + ds, u + eu], [s + es, u + eu]]);
    }
  }
  dirtQuad(corners) {
    const [a, b, c, d] = corners.map(([s, u]) => { const p = this.ground(s, u); return { x: p.x, y: p.y + .07, z: p.z - this.start }; });
    triangle(this.scenery.dirt, null, a, b, c, null, this.start); triangle(this.scenery.dirt, null, b, d, c, null, this.start);
  }
  buildCreek() {
    const creek = plainsCreekAt(this.start + CHUNK_LENGTH / 2);
    if (Math.abs(creek.center - this.start - CHUNK_LENGTH / 2) > CHUNK_LENGTH / 2 + 150) return;
    const vertices = [], colors = [], shallow = new THREE.Color('#7fa08a'), deep = new THREE.Color('#557b6c');
    // Water quads follow the wandering channel; each belongs to the chunk its
    // middle falls in, so neighbours meet edge to edge without overlap.
    for (let u = -400; u < 568; u += 4) {
      const s0 = creekCenterS(creek, u), s1 = creekCenterS(creek, u + 4), middle = (s0 + s1) / 2;
      if (middle < this.start || middle >= this.start + CHUNK_LENGTH) continue;
      const w = CREEK_WATER_HALF_WIDTH;
      const at = (s, v) => plainsPosition(s, v, creek.level);
      const a = at(s0 - w, u), b = at(s0 + w, u), c = at(s1 - w, u + 4), d = at(s1 + w, u + 4);
      const color = shallow.clone().lerp(deep, .35 + .35 * Math.sin(u / 23 + creek.index)).multiplyScalar(.95 + randomAt(Math.round(u), creek.index + 2811) * .1);
      triangle(vertices, colors, a, b, c, color, this.start); triangle(vertices, colors, b, d, c, color, this.start);
    }
    if (vertices.length) {
      const water = this.addMesh(geometry(vertices, colors), waterMaterial, 'creek-water');
      water.geometry.boundingSphere.radius += .5;
    }
    // A short concrete bridge: a deck slab in road-following segments with
    // parapets, wing walls at the abutments, and a pier on each bank.
    const { concrete } = this.scenery, inChunk = s => s >= this.start && s < this.start + CHUNK_LENGTH;
    const road = plainsRoadHeight, across = s => -roadFrame(s).angle;
    const point = (s, u, y) => { const p = plainsPosition(s, u, y); return [p.x, p.y, p.z + this.start]; };
    for (let k = 0; k < 4; k++) {
      const s = creek.center - BRIDGE_HALF_LENGTH + 3.5 + k * 7;
      if (!inChunk(s)) continue;
      concrete.push({ p: point(s, 0, road(s) - .48), scale: [14.6, .9, 7.05], r: [0, across(s), 0] });
      for (const side of [-1, 1]) {
        concrete.push({ p: point(s, side * 6.55, road(s) + .55), scale: [.36, 1.02, 7.05], r: [0, across(s), 0], color: '#cbc6b7' });
      }
    }
    for (const s of [creek.start, creek.end]) {
      if (!inChunk(s)) continue;
      const low = Math.min(...[-7.5, 0, 7.5].map(u => plainsGroundHeight(s, u))) - .5;
      concrete.push({ p: point(s, 0, (road(s) - .1 + low) / 2), scale: [15.4, road(s) - .1 - low, 2.2], r: [0, across(s), 0] });
      for (const side of [-1, 1]) concrete.push({ p: point(s, side * 6.55, road(s) + .7), scale: [.55, 1.32, .55], r: [0, across(s), 0], color: '#cbc6b7' });
    }
    for (const k of [-1, 1]) {
      const s = creek.center + k * 5.5;
      if (!inChunk(s)) continue;
      const floor = plainsGroundHeight(s, 0) - .6;
      concrete.push({ p: point(s, 0, (road(s) - .9 + floor) / 2), scale: [12.6, road(s) - .9 - floor, 1.3], r: [0, across(s), 0] });
    }
  }
  buildScenery() {
    const random = seededRandom(this.index + 27113), { posts, wires, poles, shrubs, bales, boxes } = this.scenery;
    const hedgeGreens = ['#4a7a35', '#557f3a', '#3f6e30', '#5e8a3f'], strawTints = ['#d9b566', '#d1ab5c', '#dfbc6d'];
    const oakGreens = ['#587f3a', '#4d7434', '#65883f', '#43682e'], poplarGreens = ['#5f8a3b', '#6a9542', '#547d34'], willowGreens = ['#7f9c4a', '#8aa552', '#73923f'];
    const clear = (s, u, r = 1) => Math.abs(u) > r + 6.6 && creekDistance(s, u) > r + 5.5 && plainsDiscoveryClears(s, u, this.discoveries, r)
      && pondsNear(s).every(pond => Math.hypot(s - pond.s, u - pond.u) > pond.radius * 1.2 + r);
    const stone = ['#a9a496', '#9b9789', '#b5b0a3', '#8f8b80'];
    const inChunk = s => s >= this.start && s < this.start + CHUNK_LENGTH;
    const beam = (list, a, b, width, color) => {
      const from = new THREE.Vector3(a.x, a.y, a.z), to = new THREE.Vector3(b.x, b.y, b.z), direction = to.clone().sub(from);
      list.push({ p: from.clone().add(to).multiplyScalar(.5).toArray(), scale: [width, direction.length(), width], q: new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()), color });
    };
    // Posts and a single wire between neighbours; a gap where a post is
    // missing (a gate, the creek, a yard) breaks the wire too.
    const fence = points => {
      let previous = null;
      for (const point of points) {
        if (!clear(point.s, point.u, .3)) { previous = null; continue; }
        const p = this.ground(point.s, point.u);
        // A point past the chunk's end is the next chunk's post; only its wire is ours.
        if (point.own !== false) posts.push({ p: [p.x, p.y + .55, p.z], scale: [.2, 1.16, .2], r: [0, -roadFrame(point.s).angle, 0] });
        if (previous) beam(wires, { ...previous, y: previous.y + 1.02 }, { ...p, y: p.y + 1.02 }, .055);
        previous = p;
      }
    };
    const hedge = points => {
      for (const point of points) {
        if (point.own === false || !clear(point.s, point.u, 1)) continue;
        const p = this.ground(point.s + (random() - .5) * .8, point.u + (random() - .5) * .8), size = 1.1 + random() * .7;
        shrubs.push({ p: [p.x, p.y + size * .3, p.z], scale: [size, size * .78, size * .9], r: [0, random() * 6.28, 0], color: hedgeGreens[Math.floor(random() * hedgeGreens.length)] });
      }
    };
    // Posts stand on a lattice offset from the chunk seams, where the terrain's
    // edge row is jittered; one extra point past the end carries the wire over.
    const along = (u, s0, s1, step, skip, end = Infinity) => {
      const points = [];
      for (let s = Math.ceil((s0 - 2) / step) * step + 2; s <= s1 + step && s < end; s += step) {
        if (!skip || Math.abs(s - skip) > 3.6) points.push({ s, u, own: s <= s1 });
      }
      return points;
    };
    const acrossPoints = (s, side, from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => ({ s, u: side * (from + i * step) }));
    // Each row of fields: its roadside fence and gate, the fences and hedges
    // between its bands, and the bales and lone trees in the fields themselves.
    for (let row = fieldRowAt(this.start) - 1; fieldBoundary(row) < this.start + CHUNK_LENGTH; row++) {
      const rowStart = fieldBoundary(row), rowEnd = fieldBoundary(row + 1);
      const s0 = Math.max(rowStart + 2, this.start), s1 = Math.min(rowEnd - 2, this.start + CHUNK_LENGTH - .01);
      for (const side of [-1, 1]) {
        const bands = fieldBands(row, side), gate = farmGate(row, side);
        if (s0 < s1) {
          if (roadsideFence(row, side)) fence(along(side * ROAD_RESERVE, s0, s1, 4, gate?.s, rowEnd - 2));
          for (let band = 1; band <= 3; band++) {
            const kind = bandBoundaryKind(row, side, band);
            if (kind === 'fence') fence(along(side * bands[band], s0, s1, 4, null, rowEnd - 2));
            else if (kind === 'hedge') hedge(along(side * bands[band], s0, s1, 2.4));
          }
        }
        if (gate && inChunk(gate.s)) {
          this.track(gate.s, side, bands[1] - 6);
          // The mailbox stays inside this chunk, on whichever side of the gate that is.
          const boxS = inChunk(gate.s - 4.5) ? gate.s - 4.5 : gate.s + 4.5;
          const p = this.ground(boxS, side * 7.4), angle = -roadFrame(gate.s).angle;
          posts.push({ p: [p.x, p.y + .5, p.z], scale: [.09, 1.05, .09], r: [0, angle, 0] });
          boxes.push({ p: [p.x, p.y + 1.15, p.z], scale: [.3, .3, .52], r: [0, angle, 0], color: '#9aa09a' });
        }
        for (let band = 0; band < 4; band++) {
          const field = fieldAt(rowStart + 1, side * (bands[band] + .5)), from = bands[band], to = bands[band + 1];
          if (field.kind === 'hay') {
            // Bales in loose rows, as the baler left them, anchored to the field.
            for (let s = rowStart + 9; s < rowEnd - 6; s += 15) for (let cross = from + 7; cross < to - 6; cross += 12) {
              const t = s + (randomAt(Math.round(s), Math.round(cross) + 2821) - .5) * 4, v = side * (cross + (randomAt(Math.round(s), Math.round(cross) + 2822) - .5) * 4);
              if (!inChunk(t) || randomAt(Math.round(s), Math.round(cross) + 2823) < .32 || !clear(t, v, 1.4)) continue;
              const p = this.ground(t, v);
              bales.push({ p: [p.x, p.y + .85, p.z], scale: [1.2, 1.2, 1.2], r: [0, -roadFrame(t).angle + (randomAt(Math.round(s), Math.round(cross) + 2824) - .5) * .5, 0], color: strawTints[Math.floor(randomAt(Math.round(s), Math.round(cross) + 2825) * 3)] });
            }
          }
          if ((field.kind === 'pasture' || field.kind === 'hay') && randomAt(field.seed, field.salt + 7) < .4) {
            const t = rowStart + 14 + randomAt(field.seed, field.salt + 8) * (rowEnd - rowStart - 28);
            const v = side * (from + 12 + randomAt(field.seed, field.salt + 9) * Math.max(4, to - from - 24));
            if (inChunk(t) && clear(t, v, 4)) this.tree('oak', t, v, 9 + randomAt(field.seed, field.salt + 10) * 5, oakGreens[field.seed % oakGreens.length], random() * 6.28);
          }
          if (field.kind === 'pasture' && randomAt(field.seed, field.salt + 11) < .5) for (let i = 0; i < 4; i++) {
            const t = rowStart + 6 + randomAt(field.seed * 4 + i, field.salt + 12) * (rowEnd - rowStart - 12);
            const v = side * (from + 5 + randomAt(field.seed * 4 + i, field.salt + 13) * Math.max(2, to - from - 10));
            if (!inChunk(t) || !clear(t, v, 1.5)) continue;
            const p = this.ground(t, v), size = 1.2 + random() * 1.1;
            shrubs.push({ p: [p.x, p.y + size * .3, p.z], scale: [size, size * .7, size], r: [0, random() * 6.28, 0], color: hedgeGreens[i % hedgeGreens.length] });
          }
        }
      }
      // Stones cleared off the fields lie heaped in some corners, and a
      // few pastures carry a clump of oaks rather than one lone tree.
      for (const side of [-1, 1]) {
        const bands = fieldBands(row, side);
        for (let band = 0; band < 3; band++) {
          if (!fieldCorner(row, side, band)) continue;
          const t = rowStart + 5 + randomAt(row * 4 + band, 2841) * 4, v = side * (bands[band + 1] - 4 - randomAt(row * 4 + band, 2842) * 3);
          if (!inChunk(t) || !clear(t, v, 3)) continue;
          for (let i = 0; i < 7; i++) {
            const p = this.ground(t + (random() - .5) * 3.2, v + (random() - .5) * 3.2), size = .45 + random() * .7;
            boxes.push({ p: [p.x, p.y + size * .3, p.z], scale: [size, size * .7, size * .85], r: [random() * .5, random() * 6.28, random() * .5], color: stone[i % stone.length] });
          }
        }
        const field = fieldAt(rowStart + 1, side * (bands[1] + .5));
        if (field.kind === 'pasture' && randomAt(field.seed, field.salt + 14) < .45) {
          const t = rowStart + 20 + randomAt(field.seed, field.salt + 15) * (rowEnd - rowStart - 40);
          const v = side * (bands[1] + 14 + randomAt(field.seed, field.salt + 16) * Math.max(4, bands[2] - bands[1] - 28));
          for (let i = 0; i < 3; i++) {
            const dt = t + (random() - .5) * 12, dv = v + (random() - .5) * 10;
            if (inChunk(dt) && clear(dt, dv, 3.5)) this.tree('oak', dt, dv, 8 + random() * 5, oakGreens[(field.seed + i) % oakGreens.length], random() * 6.28);
          }
        }
      }
      // The boundary between rows crosses the whole view. Shelterbelts of
      // poplars stand here, throwing long shadows across the fields.
      if (!inChunk(rowStart)) continue;
      const line = rowStart + 2.2;
      for (const side of [-1, 1]) {
        const kind = rowBoundaryKind(row, side), far = Math.min(fieldBands(row, side)[4], 330);
        if (kind === 'fence') fence(acrossPoints(line, side, 15, far, 4));
        else if (kind === 'hedge') hedge(acrossPoints(line, side, 15, far, 2.4));
        else if (kind === 'shelterbelt') for (let cross = 18; cross < Math.min(far, 260); cross += 6.5) {
          const t = line + (random() - .5) * 1.6, v = side * (cross + (random() - .5) * 1.4);
          if (!clear(t, v, 2)) continue;
          this.tree('poplar', t, v, 11 + random() * 5, poplarGreens[Math.floor(random() * poplarGreens.length)], random() * 6.28);
        }
      }
    }
    // A shade tree stands just off the road reserve now and then.
    for (let cell = Math.floor(this.start / 64); cell * 64 < this.start + CHUNK_LENGTH; cell++) {
      if (randomAt(cell, 2851) > .22) continue;
      const side = randomAt(cell, 2852) > .5 ? 1 : -1, t = cell * 64 + 8 + randomAt(cell, 2853) * 48, v = side * (16.5 + randomAt(cell, 2854) * 4);
      if (inChunk(t) && clear(t, v, 3)) this.tree('oak', t, v, 9 + randomAt(cell, 2855) * 4, oakGreens[cell & 3], randomAt(cell, 2856) * 6.28);
    }
    // Stock ponds: a level disc of water in each basin, its rim under the bank.
    for (const pond of pondsNear(this.start + CHUNK_LENGTH / 2)) {
      if (!inChunk(pond.s)) continue;
      const vertices = [], colors = [], level = pond.rim - .55, tint = new THREE.Color('#6f9484');
      const center = plainsPosition(pond.s, pond.u, level);
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2, b = (i + 1) / 18 * Math.PI * 2, r = pond.radius * .75;
        const p = plainsPosition(pond.s + Math.cos(a) * r, pond.u + Math.sin(a) * r, level), q = plainsPosition(pond.s + Math.cos(b) * r, pond.u + Math.sin(b) * r, level);
        triangle(vertices, colors, center, p, q, tint.clone().multiplyScalar(.95 + randomAt(i, pond.index + 2857) * .1), this.start);
      }
      const water = this.addMesh(geometry(vertices, colors), waterMaterial, 'stock-pond');
      water.geometry.boundingSphere.radius += .5;
      // Cattle keep the bank bare; a few rushes and a stone or two ring it.
      for (let i = 0; i < 9; i++) {
        const a = random() * Math.PI * 2, r = pond.radius * (1.02 + random() * .2);
        const p = this.ground(pond.s + Math.cos(a) * r, pond.u + Math.sin(a) * r), size = .8 + random() * .8;
        if (i % 3) shrubs.push({ p: [p.x, p.y + size * .25, p.z], scale: [size, size * .6, size], r: [0, random() * 6.28, 0], color: '#7d9a3e' });
        else boxes.push({ p: [p.x, p.y + size * .2, p.z], scale: [size * .8, size * .5, size * .7], r: [0, random() * 6.28, .2], color: stone[i % stone.length] });
      }
    }
    // Utility poles along the far verge, wired to the next pole that stands;
    // a pole never stands in the creek.
    const POLE_U = ROAD_RESERVE + 1.8, standing = s => creekDistance(s, POLE_U) > 9;
    for (let s = Math.ceil((this.start - 8) / 32) * 32 + 8; s < this.start + CHUNK_LENGTH; s += 32) {
      if (!standing(s) || !plainsDiscoveryClears(s, POLE_U, this.discoveries, 1)) continue;
      const p = this.ground(s, POLE_U), angle = -roadFrame(s).angle;
      poles.push({ p: [p.x, p.y + 4.2, p.z], scale: [.13, 8.7, .13] });
      posts.push({ p: [p.x, p.y + 8.15, p.z], scale: [1.7, .12, .12], r: [0, angle, 0] });
      let next = s + 32;
      while (!standing(next) && next - s < 100) next += 32;
      if (next - s > 100) continue;
      const q = this.ground(next, POLE_U);
      for (const offset of [-.7, .7]) {
        const a = this.ground(s, POLE_U + offset), b = this.ground(next, POLE_U + offset);
        const middle = { x: (a.x + b.x) / 2, y: (p.y + q.y) / 2 + 8.15 - .4, z: (a.z + b.z) / 2 };
        beam(wires, { x: a.x, y: p.y + 8.2, z: a.z }, middle, .04); beam(wires, middle, { x: b.x, y: q.y + 8.2, z: b.z }, .04);
      }
    }
    // Willows and cottonwoods line the creek on both banks.
    const creek = plainsCreekAt(this.start + CHUNK_LENGTH / 2);
    if (Math.abs(creek.center - this.start - CHUNK_LENGTH / 2) < CHUNK_LENGTH / 2 + 150) {
      const treeRandom = seededRandom(creek.index + 51203);
      for (let u = -392; u <= 540; u += 10) for (const bank of [-1, 1]) {
        const keep = treeRandom() > .58, d = 8.5 + treeRandom() * 7, height = 6 + treeRandom() * 4.5, yaw = treeRandom() * 6.28, willow = treeRandom() > .35;
        const v = u + (treeRandom() - .5) * 5, t = creekCenterS(creek, v) + bank * d;
        if (!keep || !inChunk(t) || Math.abs(v) < 16 || !plainsDiscoveryClears(t, v, this.discoveries, 3)) continue;
        this.tree(willow ? 'willow' : 'oak', t, v, willow ? height : height * 1.2, (willow ? willowGreens : oakGreens)[Math.abs(Math.floor(u / 8)) % 3], yaw);
      }
    }
  }
  tree(kind, s, u, height, color, yaw) {
    const variants = plainsTrees[kind], variant = variants[Math.abs(Math.round(s * 7 + u)) % variants.length];
    const p = this.ground(s, u), { bark, leaves } = this.scenery;
    if (!bark.has(variant)) { bark.set(variant, []); leaves.set(variant, []); }
    bark.get(variant).push({ p: [p.x, p.y - .12, p.z], scale: [height, height, height], r: [0, yaw, 0] });
    leaves.get(variant).push({ p: [p.x, p.y - .12, p.z], scale: [height, height, height], r: [0, yaw, 0], color });
  }
  finishScenery() {
    const { posts, wires, poles, shrubs, bales, boxes, concrete, bark, leaves, dirt } = this.scenery;
    if (dirt.length) this.addMesh(geometry(dirt), dirtMaterial, 'farm-tracks');
    instances(this.group, boxGeometry, timberMaterial, posts, 'fence-posts');
    instances(this.group, boxGeometry, wireMaterial, wires, 'fence-wires', false);
    instances(this.group, poleGeometry, poleMaterial, poles, 'utility-poles');
    instances(this.group, shrubGeometry, shrubMaterial, shrubs, 'hedgerows');
    instances(this.group, baleGeometry, strawMaterial, bales, 'hay-bales');
    instances(this.group, boxGeometry, metalMaterial, boxes, 'mailboxes');
    instances(this.group, boxGeometry, concreteMaterial, concrete, 'creek-bridge');
    for (const [variant, items] of bark) {
      instances(this.group, variant.bark, barkMaterial, items, 'plains-trunks');
      instances(this.group, variant.leaves, leavesMaterial, leaves.get(variant), 'plains-crowns');
    }
    this.scenery = null;
  }
  dispose() {
    this.group.removeFromParent(); for (const g of this.owned) g.dispose();
    this.group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  }
}

export class PlainsWorld {
  constructor(scene, chunkSource = null) { this.scene = scene; this.chunkSource = chunkSource; this.chunks = new Map(); this.origin = 0; this.center = null; }
  update(s) {
    const center = Math.floor(s / CHUNK_LENGTH); this.origin = Math.floor(s / 1024) * 1024;
    updateResidentChunks(this, center, PlainsChunk);
    for (const chunk of this.chunks.values()) chunk.group.position.z = this.origin - chunk.start;
  }
  // One clock turns the creek's ripples, the farm windmills and the turbines.
  animate(time) { animateWater(time, this.origin); }
  dispose() { this.chunkSource?.dispose(); for (const chunk of this.chunks.values()) chunk.dispose(); this.chunks.clear(); }
}

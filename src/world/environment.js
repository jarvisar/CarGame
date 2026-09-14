import * as THREE from 'three';
import { CHUNK_LENGTH, TERRAIN_STEP, randomAt, seededRandom, roadFrame, coastOffset, shorelineOffset, terrainColumns, terrainVertex, positionAt, pondRadius, ravineAmount, groundHeight, mountainHeight, bridgeAt, clamp, lerp } from './route.js';
import { createWaterMaterial, createSurfMaterial, animateWater } from './water.js';
import { buildLandmarks } from './landmarks.js';
import { CoastalBirds } from './birds.js';

const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
const waterMaterial = createWaterMaterial();
const roadMaterial = new THREE.MeshStandardMaterial({ color: '#717c79', roughness: 1 });
const shoulderMaterial = new THREE.MeshStandardMaterial({ color: '#d5c7a2', roughness: 1 });
const lineMaterial = new THREE.MeshStandardMaterial({ color: '#f3ecd2', roughness: 1 });
const centerMaterial = new THREE.MeshStandardMaterial({ color: '#e9cf88', roughness: 1 });
const foamMaterial = createSurfMaterial();
const rollingSurfMaterial = createSurfMaterial(true);
const leavesMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });
const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#78664a', roughness: 1 });
const rockMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });
const postMaterial = new THREE.MeshStandardMaterial({ color: '#f4e9cd', roughness: 1 });
const trunkGeometry = new THREE.CylinderGeometry(.16, .25, 1, 5);
const coneGeometry = new THREE.ConeGeometry(1, 1, 6);
const shrubGeometry = new THREE.IcosahedronGeometry(1, 0);
const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
const postGeometry = new THREE.BoxGeometry(.22, 1.25, .25);
const capGeometry = new THREE.BoxGeometry(.235, .18, .265);
const capMaterial = new THREE.MeshStandardMaterial({ color: '#466050' });
const grassGeometry = new THREE.BufferGeometry();
grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -.45, 0, 0, .12, .95, .04, .2, 0, 0,
  0, 0, -.35, .06, .7, .2, 0, 0, .4,
  -.25, 0, .2, -.4, .55, -.1, .3, 0, -.2,
], 3));
grassGeometry.computeVertexNormals();
const grassMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 1 });
const matrix = new THREE.Object3D();

function geometryFrom(positions, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function addTriangle(positions, colors, a, b, c, color, start) {
  // All generated surfaces are height fields: keep their winding facing upward.
  if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
  for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z + start); if (colors) colors.push(color.r, color.g, color.b); }
}
function makeInstances(group, geometry, material, items, shadows = true) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((item, i) => {
    matrix.position.set(...item.p); matrix.rotation.set(...(item.r ?? [0, 0, 0])); matrix.scale.set(...item.scale); matrix.updateMatrix(); mesh.setMatrixAt(i, matrix.matrix);
    if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
  });
  mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere(); group.add(mesh); return mesh;
}

class Chunk {
  constructor(index) {
    this.index = index; this.start = index * CHUNK_LENGTH; this.group = new THREE.Group(); this.owned = [];
    this.buildTerrain(); this.buildWater(); this.buildRoad(); buildLandmarks(this); this.buildScenery();
    if (index % 3 === 0) this.birds = new CoastalBirds(this);
  }
  addMesh(geometry, material, shadows = false) {
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; mesh.castShadow = shadows; this.group.add(mesh); this.owned.push(geometry); return mesh;
  }
  buildTerrain() {
    const positions = []; const colors = [];
    const firstRow = this.start / TERRAIN_STEP;
    const palette = ['#78a23d', '#8eaf47', '#819f40', '#93b44f', '#709a3a', '#a0b75b'];
    const stone = ['#aaa593', '#b6ac98', '#c5b79e', '#949889', '#c5ad91', '#a5a393'];
    for (let row = firstRow; row < firstRow + CHUNK_LENGTH / TERRAIN_STEP; row++) {
      for (let col = 0; col < terrainColumns(row * TERRAIN_STEP).length - 1; col++) {
        const a = terrainVertex(row, col), b = terrainVertex(row + 1, col), c = terrainVertex(row, col + 1), d = terrainVertex(row + 1, col + 1);
        const triangles = (row + col) % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
        triangles.forEach((tri, j) => {
          const r = randomAt(row * 2 + j, col + 191);
          let color;
          const s = tri.reduce((sum, p) => sum + p.s, 0) / 3;
          const u = tri.reduce((sum, p) => sum + p.u, 0) / 3;
          const edgeA = new THREE.Vector3(tri[1].x - tri[0].x, tri[1].y - tri[0].y, tri[1].z - tri[0].z);
          const edgeB = new THREE.Vector3(tri[2].x - tri[0].x, tri[2].y - tri[0].y, tri[2].z - tri[0].z);
          const steep = Math.abs(edgeA.cross(edgeB).normalize().y) < .54;
          if (col <= 6 || (ravineAmount(s, u) > .65 && u < 35)) color = new THREE.Color('#e5d3aa');
          else if (col <= 8 || (steep && u > 12) || (mountainHeight(s, u) > 16 && r > .34)) color = new THREE.Color(stone[Math.floor(r * stone.length)]);
          else if (pondRadius(s, u) < 1.1) color = new THREE.Color('#b7bd83');
          else if (col >= 22 && r > .85) color = new THREE.Color(stone[Math.floor(r * stone.length)]).lerp(new THREE.Color('#9aaa6b'), .25);
          else color = new THREE.Color(palette[Math.floor(r * palette.length)]);
          color.multiplyScalar(.96 + randomAt(row, col + j + 873) * .08);
          addTriangle(positions, colors, ...tri, color, this.start);
        });
      }
    }
    this.terrain = this.addMesh(geometryFrom(positions, colors), terrainMaterial, true);
  }
  buildWater() {
    const positions = [], colors = [];
    const step = 16, firstRow = this.start / step;
    const seaPoint = (row, col) => {
      const s = row * step + (randomAt(row, col + 717) - .5) * 9;
      const u = -420 + col * 16 + (row % 2 === 0 ? -3 : 3) + (randomAt(row + 122, col) - .5) * 9;
      return { ...positionAt(s, u, -.05), u, s };
    };
    for (let row = firstRow; row < firstRow + CHUNK_LENGTH / step; row++) for (let col = 0; col < 32; col++) {
      const a = seaPoint(row, col), b = seaPoint(row + 1, col), c = seaPoint(row, col + 1), d = seaPoint(row + 1, col + 1);
      const triangles = randomAt(row, col + 613) > .5 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
      triangles.forEach((tri, t) => {
        const u = tri.reduce((sum, v) => sum + v.u, 0) / 3;
        const s = tri.reduce((sum, v) => sum + v.s, 0) / 3;
        const depth = clamp((shorelineOffset(s) - u) / 190, 0, 1);
        const color = new THREE.Color('#79d5cf').lerp(new THREE.Color('#3f9eb9'), depth);
        color.multiplyScalar(.94 + randomAt(row * 2 + t, col + 819) * .13);
        addTriangle(positions, colors, ...tri, color, this.start);
      });
    }
    const ocean = this.addMesh(geometryFrom(positions, colors), waterMaterial);
    ocean.name = 'animated-ocean'; ocean.geometry.boundingSphere.radius += .5;
    for (let line = 0; line < 4; line++) {
      const foam = [], flow = [];
      for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
        if (ravineAmount(s, 0) > .15) continue;
        if (line > 0 && randomAt(Math.floor(s / 6), line + 19) > .8) continue;
        const offset = line === 0 ? 0 : 12;
        const width = line === 0 ? 1.4 + Math.sin(s * .9) * .6 : 1.0 + Math.sin(s * .18 + line) * .6;
        const at = (t, du) => positionAt(t, shorelineOffset(t) - offset + Math.sin(t * .21 + line) * .65 + du, .17);
        const a = at(s, 0), b = at(s + 2, 0), c = at(s, -width), d = at(s + 2, -width);
        addTriangle(foam, null, a, c, b, null, this.start); addTriangle(foam, null, b, c, d, null, this.start);
        for (let vertex = 0; vertex < 6; vertex++) flow.push(1, 0, line / 3);
      }
      const geo = geometryFrom(foam);
      if (line > 0) geo.setAttribute('surfFlow', new THREE.Float32BufferAttribute(flow, 3));
      geo.boundingSphere.radius += 12;
      const surf = this.addMesh(geo, line === 0 ? foamMaterial : rollingSurfMaterial);
      surf.name = line === 0 ? 'shore-wash' : 'rolling-breakers';
    }
  }
  ribbon(low, high, lift, material, dashed = false) {
    const positions = [];
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      if (dashed && Math.floor(s / 4) % 3 === 2) continue;
      const point = (t, u) => { const f = roadFrame(t); return positionAt(t, u, f.y + lift); };
      const a = point(s, low), b = point(s + 2, low), c = point(s, high), d = point(s + 2, high);
      addTriangle(positions, null, a, b, c, null, this.start); addTriangle(positions, null, b, d, c, null, this.start);
    }
    this.addMesh(geometryFrom(positions), material);
  }
  buildRoad() {
    this.ribbon(-6.25, 6.25, .045, shoulderMaterial);
    this.ribbon(-5.5, 5.5, .075, roadMaterial);
    this.ribbon(-5.05, -4.89, .09, lineMaterial); this.ribbon(4.89, 5.05, .09, lineMaterial);
    this.ribbon(-.15, -.055, .093, centerMaterial); this.ribbon(.055, .15, .093, centerMaterial);
  }
  buildScenery() {
    const random = seededRandom(this.index + 8913);
    const trunks = [], foliage = [], shrubs = [], rocks = [], posts = [], caps = [], grasses = [];
    const canGrow = (s, u) => pondRadius(s, u) > 1.15 && ravineAmount(s, u) < .13 && groundHeight(s, u) > 2;
    const green = ['#234d3a', '#2c593c', '#35653f', '#20513e', '#3f6b3e', '#355b32'];
    const bushColors = ['#6e9344', '#81a548', '#648a3f', '#9db354'];
    const rockColors = ['#bdb8a1', '#ccc1a5', '#a9aa98', '#c2b79c'];
    for (let i = 0; i < 265; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      let u = 12 + random() ** .8 * 162;
      if (i < 13) u = lerp(coastOffset(s) + 4, -10, random());
      if (Math.sin(s / 23 + u / 33) > .63 && i % 4 !== 0) continue;
      if (!canGrow(s, u) || mountainHeight(s, u) > 24) continue;
      const p = positionAt(s, u); const size = (4.4 + random() * 5.1) * (u < 0 ? .72 : 1);
      const y = p.y - .25; const rotation = random() * Math.PI;
      trunks.push({ p: [p.x, y + size * .29, p.z + this.start], scale: [size * .35, size * .6, size * .35] });
      if (i % 4 === 0 && u < 105) {
        for (let crown = 0; crown < 3; crown++) {
          const angle = crown * 2.1 + rotation;
          shrubs.push({ p: [p.x + Math.cos(angle) * size * .2, y + size * (.48 + crown * .06), p.z + this.start + Math.sin(angle) * size * .19], scale: [size * .33, size * .32, size * .35], r: [0, angle, .1], color: bushColors[i % bushColors.length] });
        }
        continue;
      }
      const color = green[Math.floor(random() * green.length)];
      for (let layer = 0; layer < 3; layer++) {
        const radius = size * (.34 - layer * .068);
        foliage.push({ p: [p.x, y + size * (.48 + layer * .215), p.z + this.start], scale: [radius, size * (.65 - layer * .09), radius], r: [0, rotation + layer * .16, 0], color });
      }
    }
    for (let i = 0; i < 86; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const u = i < 42 ? lerp(coastOffset(s) + 1.7, -8.5, random()) : 9.5 + random() * 91;
      if (!canGrow(s, u)) continue;
      const p = positionAt(s, u); const size = .65 + random() * 1.8;
      shrubs.push({ p: [p.x, p.y + size * .43, p.z + this.start], scale: [size, size * .7, size * .86], r: [0, random() * 6, .15], color: bushColors[Math.floor(random() * bushColors.length)] });
      if (i % 4 === 0) shrubs.push({ p: [p.x + size * .72, p.y + size * .25, p.z + this.start + .4], scale: [size * .65, size * .5, size * .7], color: '#a4b94f' });
    }
    for (let i = 0; i < 52; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const sea = i < 25;
      const u = sea ? shorelineOffset(s) - 4 - random() ** 1.7 * 71 : (i < 35 ? coastOffset(s) + random() * 5 : 12 + random() * 140);
      if (!sea && !canGrow(s, u)) continue;
      const p = positionAt(s, u);
      const size = sea ? 1.4 + random() ** 2 * 6.1 : .7 + random() * 3.1;
      const height = size * (1.1 + random() * .9);
      rocks.push({ p: [p.x, sea ? -.8 + height * .3 : p.y + height * .28, p.z + this.start], scale: [size, height, size * (.6 + random() * .6)], r: [random() * .25, random() * 6, random() * .4], color: rockColors[Math.floor(random() * rockColors.length)] });
      if (sea) {
        // Broken pale rings read as surf around the sea stacks.
        const ring = [];
        for (let k = 0; k < 12; k++) {
          if (random() > .7) continue;
          const angle = k / 12 * Math.PI * 2;
          const at = (a, r) => ({ x: p.x + Math.cos(a) * r * size, y: .17, z: p.z + Math.sin(a) * r * size * .85 });
          addTriangle(ring, null, at(angle, 1.22), at(angle + .49, 1.22), at(angle, 1.6), null, this.start);
          addTriangle(ring, null, at(angle + .49, 1.22), at(angle + .49, 1.6), at(angle, 1.6), null, this.start);
        }
        if (!this.rockFoam) this.rockFoam = [];
        this.rockFoam.push(...ring);
      }
    }
    for (let i = 0; i < 34; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const u = coastOffset(s) - 3.5 - random() * 7;
      if (ravineAmount(s, u) > .12) continue;
      const p = positionAt(s, u); const size = 1.6 + random() * 2.8;
      rocks.push({ p: [p.x, p.y - size * .15, p.z + this.start], scale: [size, size * (1.2 + random()), size * .9], r: [random() * .3, random() * 6, -.1 + random() * .2], color: rockColors[Math.floor(random() * rockColors.length)] });
    }
    if (this.rockFoam?.length) this.addMesh(geometryFrom(this.rockFoam), foamMaterial);
    // Small cream and golden wildflower patches share the shrub instance batch.
    for (let patch = 0; patch < 16; patch++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const u = patch % 2 ? 10 + random() * 20 : lerp(coastOffset(s) + 3, -9, random());
      if (!canGrow(s, u)) continue;
      for (let flower = 0; flower < 6; flower++) {
        const t = s + (random() - .5) * 3, v = u + (random() - .5) * 2;
        const p = positionAt(t, v);
        shrubs.push({ p: [p.x, p.y + .23, p.z + this.start], scale: [.24, .2, .24], color: patch % 3 ? '#e9cf6e' : '#eee8cf' });
      }
    }
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 16) {
      if (Math.abs(s - bridgeAt(s).center) < 49) continue;
      for (const u of [-6.85, 6.85]) {
        const p = positionAt(s, u); const angle = -roadFrame(s).angle;
        posts.push({ p: [p.x, p.y + .62, p.z + this.start], scale: [1, 1, 1], r: [0, angle, 0] });
        caps.push({ p: [p.x, p.y + .94, p.z + this.start], scale: [1, 1, 1], r: [0, angle, 0] });
      }
    }
    // Small scree fans and grass pockets fill the spaces between the existing
    // boulders and trees. Raycast against the faceted mesh to seat every cluster.
    const detailRandom = seededRandom(this.index + 45192);
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    const grounded = (s, u) => {
      const p = positionAt(s, u);
      ray.ray.origin.set(p.x, 250, p.z + this.start);
      const hit = ray.intersectObject(this.terrain, false)[0];
      return hit && hit.face.normal.y > .48 ? hit.point : null;
    };
    for (let patch = 0; patch < 30; patch++) {
      const s = this.start + 5 + detailRandom() * (CHUNK_LENGTH - 10);
      const u = patch < 10 ? coastOffset(s) + 3 + detailRandom() * 6 : 12 + detailRandom() * 110;
      for (let item = 0; item < 9; item++) {
        const t = s + (detailRandom() - .5) * 8, v = u + (detailRandom() - .5) * 6;
        if (!canGrow(t, v) || v < coastOffset(t) + 1 || Math.abs(v) < 9) continue;
        const p = grounded(t, v);
        if (!p) continue;
        const size = .22 + detailRandom() * .65;
        if (item < 5) rocks.push({ p: [p.x, p.y + size * .18, p.z], scale: [size, size * .48, size * .7], r: [0, detailRandom() * 6.28, .15], color: rockColors[patch % rockColors.length] });
        else grasses.push({ p: [p.x, p.y - .03, p.z], scale: [size * 1.5, .45 + detailRandom() * .7, size * 1.5], r: [0, detailRandom() * 6.28, 0], color: ['#a9b45c', '#8d9d45', '#c1bd73'][patch % 3] });
      }
    }
    // Pebble drifts on the sand give the coves the reference's broken edges.
    for (let patch = 0; patch < 9; patch++) {
      const s = this.start + 5 + detailRandom() * (CHUNK_LENGTH - 10);
      const u = coastOffset(s) - 11 - detailRandom() * 2;
      if (ravineAmount(s, u) > .1) continue;
      for (let item = 0; item < 8; item++) {
        const t = s + (detailRandom() - .5) * 6, v = u + (detailRandom() - .5) * 2;
        const p = grounded(t, v);
        if (!p || p.y < .6 || p.y > 3) continue;
        const size = .18 + detailRandom() * .55;
        rocks.push({ p: [p.x, p.y + size * .16, p.z], scale: [size, size * .4, size * .75], r: [0, detailRandom() * 6.28, 0], color: rockColors[item % rockColors.length] });
      }
    }
    makeInstances(this.group, trunkGeometry, trunkMaterial, trunks);
    makeInstances(this.group, coneGeometry, leavesMaterial, foliage);
    makeInstances(this.group, shrubGeometry, leavesMaterial, shrubs);
    makeInstances(this.group, rockGeometry, rockMaterial, rocks);
    makeInstances(this.group, postGeometry, postMaterial, posts);
    makeInstances(this.group, capGeometry, capMaterial, caps);
    const grass = makeInstances(this.group, grassGeometry, grassMaterial, grasses, false);
    if (grass) grass.name = 'coastal-grass-pockets';
  }
  dispose() {
    this.group.removeFromParent();
    for (const geometry of this.owned) geometry.dispose();
    this.group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  }
}

export class CoastalWorld {
  constructor(scene) { this.scene = scene; this.chunks = new Map(); this.origin = 0; this.center = null; }
  update(s) {
    const center = Math.floor(s / CHUNK_LENGTH);
    this.origin = Math.floor(s / 1024) * 1024;
    if (center !== this.center) {
      // Both directions are retained. Streaming begins well outside the visible area.
      for (let i = center - 3; i <= center + 5; i++) {
        if (!this.chunks.has(i)) { const chunk = new Chunk(i); this.chunks.set(i, chunk); this.scene.add(chunk.group); }
      }
      for (const [i, chunk] of this.chunks) if (i < center - 3 || i > center + 5) { chunk.dispose(); this.chunks.delete(i); }
      this.center = center;
    }
    for (const chunk of this.chunks.values()) chunk.group.position.z = this.origin - chunk.start;
  }
  animate(time) {
    animateWater(time, this.origin);
    for (const chunk of this.chunks.values()) chunk.birds?.update(time);
  }
  dispose() { for (const chunk of this.chunks.values()) chunk.dispose(); this.chunks.clear(); }
}

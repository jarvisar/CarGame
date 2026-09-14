import * as THREE from 'three';
import { CHUNK_LENGTH, randomAt, seededRandom, roadHeight } from './route.js';
import { DESERT_COLUMNS, DESERT_STEP, desertVertex, desertPosition, desertHeight, canyonProfile, canyonRise, dryWashCenter, mesasForChunk, insideMesa } from './desert-route.js';

const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
const rockMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
const barkMaterial = new THREE.MeshStandardMaterial({ color: '#745038', roughness: 1, flatShading: true });
const plantMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, side: THREE.DoubleSide });
const asphaltMaterial = new THREE.MeshStandardMaterial({ color: '#797669', roughness: 1 });
const sandMaterial = new THREE.MeshStandardMaterial({ color: '#dcb07a', roughness: 1 });
const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#f6dfac', roughness: 1 });
const centerMaterial = new THREE.MeshStandardMaterial({ color: '#eac36a', roughness: 1 });
const stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
const bushGeometry = new THREE.IcosahedronGeometry(1, 0);
const trunkGeometry = new THREE.CylinderGeometry(.72, 1, 1, 5);
const cactusGeometry = new THREE.SphereGeometry(1, 7, 5);
const transform = new THREE.Object3D();
const up = new THREE.Vector3(0, 1, 0);

function geometry(positions, colors) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.computeVertexNormals(); result.computeBoundingSphere(); return result;
}
function triangle(positions, colors, a, b, c, color, start, upward = true) {
  if (upward && (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
  for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z + start); if (colors) colors.push(color.r, color.g, color.b); }
}
function instances(group, source, material, items) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(source, material, items.length);
  items.forEach((item, index) => {
    transform.position.set(...item.p); transform.rotation.set(...(item.r ?? [0, 0, 0]));
    if (item.q) transform.quaternion.copy(item.q);
    transform.scale.set(...item.scale); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
    if (item.color) mesh.setColorAt(index, new THREE.Color(item.color));
  });
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere(); group.add(mesh);
}

// Flat triangular leaves form the spiky silhouettes of yuccas and Joshua trees.
const leafPositions = [];
for (let i = 0; i < 31; i++) {
  const angle = i * 2.399963;
  const radius = .65 + randomAt(i, 916) * .65;
  const x = Math.cos(angle), z = Math.sin(angle);
  const height = .2 + randomAt(i, 917) * 1.1;
  leafPositions.push(-z * .11, 0, x * .11, x * radius, height, z * radius, z * .11, 0, -x * .11);
}
const leafGeometry = geometry(leafPositions);

class DesertChunk {
  constructor(index) {
    this.index = index; this.start = index * CHUNK_LENGTH; this.group = new THREE.Group(); this.owned = [];
    this.group.name = `desert-chunk-${index}`;
    this.buildGround(); this.buildMesas(); this.buildRoad(); this.buildPlants();
  }
  addMesh(source, material, castShadow = false) {
    const mesh = new THREE.Mesh(source, material); mesh.castShadow = castShadow; mesh.receiveShadow = true;
    this.group.add(mesh); this.owned.push(source); return mesh;
  }
  buildGround() {
    const positions = [], colors = [];
    const sand = ['#d9a477', '#d39b6f', '#dfae81', '#cf966a', '#e3b387', '#d5a174'];
    const stone = ['#b96645', '#c5744a', '#ae5c40', '#d38a57', '#b3694a', '#bb7250'];
    for (let row = this.start / DESERT_STEP; row < (this.start + CHUNK_LENGTH) / DESERT_STEP; row++) {
      for (let col = 0; col < DESERT_COLUMNS.length - 1; col++) {
        const a = desertVertex(row, col), b = desertVertex(row + 1, col), c = desertVertex(row, col + 1), d = desertVertex(row + 1, col + 1);
        const triangles = (row + col) % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
        triangles.forEach((tri, i) => {
          const s = tri.reduce((sum, p) => sum + p.s, 0) / 3;
          const u = tri.reduce((sum, p) => sum + p.u, 0) / 3;
          const distance = Math.abs(u) - canyonProfile(s, Math.sign(u) || 1).foot;
          const facet = randomAt(row * 2 + i, col + 393);
          let color;
          if (distance > -4) {
            const stratum = Math.floor(canyonRise(s, u) / 7);
            color = new THREE.Color(stone[((stratum + Math.floor(facet * 3)) % stone.length + stone.length) % stone.length]);
            if (distance > 12 && distance < 24) color.lerp(new THREE.Color('#d89c70'), .25);
            color.multiplyScalar(.94 + facet * .12);
          } else if (Math.abs(u - dryWashCenter(s)) < 2.3) {
            color = new THREE.Color(facet > .5 ? '#b08d6d' : '#b99876');
          } else color = new THREE.Color(sand[Math.floor(facet * sand.length)]);
          triangle(positions, colors, ...tri, color, this.start);
        });
      }
    }
    this.addMesh(geometry(positions, colors), groundMaterial, true).name = 'desert-floor';
  }
  buildMesas() {
    const positions = [], colors = [];
    const stone = ['#bd663b', '#ce7440', '#d68349', '#b95e36', '#df8a4b', '#c36c3f'];
    this.mesas = mesasForChunk(this.index);
    for (const mesa of this.mesas) {
      const random = seededRandom(mesa.seed + 4371);
      const sides = mesa.ru > 20 ? 14 : 9;
      const shape = Array.from({ length: sides }, () => .78 + random() * .34);
      const shelf = .23 + random() * .18;
      const layers = mesa.ru < 10
        ? [[0, 1.22], [.16, .81], [.58, .72], [.94, .48], [1, .43]]
        : [[0, 1.2], [.13, 1.01], [shelf, .95], [shelf + .025, .80], [.76, .74], [.79, .69], [.985, .67], [1, .62]];
      const base = desertHeight(mesa.s, mesa.u) - 1.5;
      const rings = layers.map(([height, radius], layer) => Array.from({ length: sides }, (_, i) => {
        const angle = i / sides * Math.PI * 2;
        const erosion = layer === 0 ? 1 : 1 + (randomAt(mesa.seed + layer, i + 572) - .5) * .11;
        const s = mesa.s + Math.sin(angle) * mesa.rs * radius * shape[i] * erosion;
        const u = mesa.u + Math.cos(angle) * mesa.ru * radius * shape[i] * erosion;
        // The same height variation at every level keeps thin ledges from
        // crossing each other while still breaking up their horizontal edges.
        const y = layer === 0 ? desertHeight(s, u) - 1 : base + height * mesa.height * (1 + (randomAt(mesa.seed, i + 16) - .5) * .03);
        return desertPosition(s, u, y);
      }));
      for (let layer = 0; layer < layers.length - 1; layer++) {
        for (let i = 0; i < sides; i++) {
          const next = (i + 1) % sides;
          const a = rings[layer][i], b = rings[layer][next], c = rings[layer + 1][i], d = rings[layer + 1][next];
          const color = new THREE.Color(stone[Math.floor(random() * stone.length)]);
          const center = new THREE.Vector3((a.x + b.x + c.x + d.x) / 4, (a.y + b.y + c.y + d.y) / 4, (a.z + b.z + c.z + d.z) / 4);
          const mesaCenter = desertPosition(mesa.s, mesa.u);
          const outward = new THREE.Vector3(center.x - mesaCenter.x, 0, center.z - mesaCenter.z).normalize();
          const wall = layers[layer + 1][0] - layers[layer][0] > .08;
          if (wall) center.addScaledVector(outward, (random() - .15) * Math.min(mesa.ru, mesa.rs) * .11);
          for (const tri of [[a, b, center], [b, d, center], [d, c, center], [c, a, center]]) {
            triangle(positions, colors, ...tri, color.clone().multiplyScalar(.92 + random() * .14), this.start, false);
          }
        }
      }
      const top = desertPosition(mesa.s, mesa.u, base + mesa.height + .15);
      const ring = rings.at(-1);
      for (let i = 0; i < sides; i++) triangle(positions, colors, top, ring[i], ring[(i + 1) % sides], new THREE.Color('#df9b59').multiplyScalar(.94 + random() * .13), this.start);
    }
    this.addMesh(geometry(positions, colors), groundMaterial, true).name = 'sandstone-mesas';
  }
  ribbon(low, high, lift, material) {
    const vertices = [];
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      const at = (t, u) => desertPosition(t, u, roadHeight(t) + lift);
      const a = at(s, low), b = at(s + 2, low), c = at(s, high), d = at(s + 2, high);
      triangle(vertices, null, a, b, c, null, this.start); triangle(vertices, null, b, d, c, null, this.start);
    }
    this.addMesh(geometry(vertices), material);
  }
  buildRoad() {
    this.ribbon(-6.25, 6.25, .045, sandMaterial);
    this.ribbon(-5.5, 5.5, .075, asphaltMaterial);
    this.ribbon(-5.05, -4.89, .09, edgeMaterial); this.ribbon(4.89, 5.05, .09, edgeMaterial);
    this.ribbon(-.15, -.055, .093, centerMaterial); this.ribbon(.055, .15, .093, centerMaterial);
  }
  buildPlants() {
    const random = seededRandom(this.index + 64713);
    const stones = [], bushes = [], trunks = [], crowns = [], cacti = [];
    const stoneColors = ['#c67a48', '#af643d', '#db9858', '#c28650', '#dbab74'];
    const greens = ['#6c753f', '#8e8546', '#626d44', '#959255'];
    const sample = () => ({ s: this.start + random() * CHUNK_LENGTH, u: (random() > .5 ? 1 : -1) * (10 + random() ** 1.5 * 210) });
    const canGrow = (s, u) => !insideMesa(s, u) && Math.abs(desertHeight(s, u + .6) - desertHeight(s, u - .6)) < .9 && Math.abs(u - dryWashCenter(s)) > 2;
    for (let i = 0; i < 155; i++) {
      const { s, u } = sample(); if (insideMesa(s, u, .98)) continue;
      const p = desertPosition(s, u); const size = .35 + random() ** 2 * 3.5;
      stones.push({ p: [p.x, p.y + size * .35, p.z + this.start], scale: [size, size * (.6 + random() * .8), size * .82], r: [random() * .25, random() * 6, random() * .4], color: stoneColors[Math.floor(random() * stoneColors.length)] });
    }
    // Continuous rockfall aprons and fractured blocks tie both canyon walls
    // into the valley floor, with occasional larger pieces on the ledges.
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 4) {
      for (const side of [-1, 1]) {
        const t = s + random() * 3;
        const { foot } = canyonProfile(t, side);
        for (let piece = 0; piece < 3; piece++) {
          const ledge = piece === 2 && random() > .52;
          const u = side * (foot + (ledge ? 17 + random() * 5 : -9 + random() * 15));
          const p = desertPosition(t, u); const size = .8 + random() ** 1.4 * (ledge ? 2.8 : 4.4);
          stones.push({ p: [p.x, p.y + size * .21, p.z + this.start], scale: [size * .85, size * (.8 + random()), size * 1.1], r: [random() * .5, random() * 6, random() * .45], color: stoneColors[Math.floor(random() * stoneColors.length)] });
        }
      }
    }
    for (let i = 0; i < 55; i++) {
      const s = this.start + random() * CHUNK_LENGTH, u = dryWashCenter(s) + (random() - .5) * 3.7;
      const p = desertPosition(s, u); const size = .17 + random() * .48;
      stones.push({ p: [p.x, p.y + size * .21, p.z + this.start], scale: [size, size * .5, size * .8], r: [0, random() * 6, 0], color: '#bba68c' });
    }
    for (const mesa of this.mesas) {
      for (let i = 0; i < 12; i++) {
        const angle = random() * Math.PI * 2;
        const top = i < 4 && mesa.ru > 20;
        const radius = top ? random() * .28 : 1.03 + random() * .3;
        const s = mesa.s + Math.sin(angle) * mesa.rs * radius;
        const u = mesa.u + Math.cos(angle) * mesa.ru * radius;
        if (Math.abs(u) < 22) continue;
        const size = top ? .6 + random() * 1.7 : 1.4 + random() * 3.2;
        const p = desertPosition(s, u, top ? desertHeight(mesa.s, mesa.u) - 1.5 + mesa.height : desertHeight(s, u));
        stones.push({ p: [p.x, p.y + size * .36, p.z + this.start], scale: [size, size * .9, size * .8], r: [.2, random() * 6, -.1], color: stoneColors[i % stoneColors.length] });
      }
    }
    for (let i = 0; i < 90; i++) {
      const { s, u } = sample(); if (!canGrow(s, u)) continue;
      const p = desertPosition(s, u); const size = .55 + random() * .85;
      if (i % 3 === 0) {
        crowns.push({ p: [p.x, p.y, p.z + this.start], scale: [size, size * .8, size], r: [0, random() * 6, 0], color: greens[i % greens.length] });
      } else {
        bushes.push({ p: [p.x, p.y + size * .35, p.z + this.start], scale: [size, size * .6, size * .83], r: [0, random() * 6, 0], color: greens[i % greens.length] });
      }
      if (i % 9 === 0) cacti.push({ p: [p.x + 1.1, p.y + .55, p.z + this.start], scale: [.45, .7, .45], color: '#819052' });
    }
    const branch = (a, b, radius) => {
      const direction = new THREE.Vector3().subVectors(b, a);
      trunks.push({ p: a.clone().add(b).multiplyScalar(.5).toArray(), scale: [radius, direction.length(), radius], q: new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()) });
    };
    for (let i = 0; i < 19; i++) {
      const { s, u } = sample(); if (!canGrow(s, u)) continue;
      const p = desertPosition(s, u); const height = 4.2 + random() * 4.1;
      const root = new THREE.Vector3(p.x, p.y - .2, p.z + this.start);
      const fork = root.clone().add(new THREE.Vector3(.2, height * .5, -.1));
      branch(root, fork, height * .078);
      for (let arm = 0; arm < 3; arm++) {
        const angle = arm * 2.1 + random() * .7;
        const elbow = fork.clone().add(new THREE.Vector3(Math.cos(angle) * height * .26, height * .17, Math.sin(angle) * height * .26));
        const tip = elbow.clone().add(new THREE.Vector3(Math.cos(angle) * .25, height * (.15 + random() * .17), Math.sin(angle) * .25));
        branch(fork, elbow, height * .045); branch(elbow, tip, height * .038);
        const scale = .75 + height * .055;
        crowns.push({ p: tip.toArray(), scale: [scale, scale, scale], r: [0, angle, 0], color: greens[arm % greens.length] });
        bushes.push({ p: tip.clone().add(new THREE.Vector3(0, .12, 0)).toArray(), scale: [.33 * scale, .27 * scale, .33 * scale], color: greens[arm % greens.length] });
      }
    }
    instances(this.group, stoneGeometry, rockMaterial, stones);
    instances(this.group, bushGeometry, plantMaterial, bushes);
    instances(this.group, trunkGeometry, barkMaterial, trunks);
    instances(this.group, leafGeometry, plantMaterial, crowns);
    instances(this.group, cactusGeometry, plantMaterial, cacti);
  }
  dispose() {
    this.group.removeFromParent();
    for (const source of this.owned) source.dispose();
    this.group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  }
}

export class DesertWorld {
  constructor(scene) { this.scene = scene; this.chunks = new Map(); this.origin = 0; this.center = null; }
  update(s) {
    const center = Math.floor(s / CHUNK_LENGTH); this.origin = Math.floor(s / 1024) * 1024;
    if (center !== this.center) {
      for (let i = center - 3; i <= center + 5; i++) {
        if (!this.chunks.has(i)) { const chunk = new DesertChunk(i); this.chunks.set(i, chunk); this.scene.add(chunk.group); }
      }
      for (const [i, chunk] of this.chunks) if (i < center - 3 || i > center + 5) { chunk.dispose(); this.chunks.delete(i); }
      this.center = center;
    }
    for (const chunk of this.chunks.values()) chunk.group.position.z = this.origin - chunk.start;
  }
  animate() {}
  dispose() { for (const chunk of this.chunks.values()) chunk.dispose(); this.chunks.clear(); }
}

import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { CHUNK_LENGTH, randomAt, seededRandom, smoothstep, lerp, positionAt, roadHeight } from './route.js';
import { JUNGLE_STEP, JUNGLE_COLUMN_COUNT, RIVER_STEP, jungleVertex, jungleHeight, riverCenter, riverHalfWidth, riverLevel, riverLips, riverTurbulence, onRiver, cutHeight, jungleCrags, jungleNoise } from './jungle-route.js';
import { riverMaterial, foamMaterial, mistMaterial } from './jungle-water.js';
import { animateWater } from './water.js';
import { terrainSampler } from './coastal-assets.js';
import { jungleCrowns, emergentCrown, emergentTrunks, junglePalms, fernGeometry, bigLeafGeometry, tuftGeometry, jungleBoulders } from './jungle-assets.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });
const terrainMaterial = material('#ffffff', { vertexColors: true });
const roadMaterial = material('#4a5156', { roughness: .95, flatShading: false });
const shoulderMaterial = material('#b5a77b', { flatShading: false });
const edgeMaterial = material('#d9d5c4', { flatShading: false });
const centerMaterial = material('#d4b03d', { flatShading: false });
const canopyMaterial = material('#ffffff', { vertexColors: true });
const frondMaterial = material('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
const shrubMaterial = material('#ffffff');
const barkMaterial = material('#6a5644');
const palmBarkMaterial = material('#8b7657', { vertexColors: true });
const stoneMaterial = material('#ffffff', { vertexColors: true, roughness: .95 });
const vineMaterial = material('#55702f');
const postMaterial = material('#e8e3d3');
const capMaterial = material('#3a3f3b');
const trunkGeometry = new THREE.CylinderGeometry(.5, .72, 1, 6);
const shrubGeometry = new THREE.IcosahedronGeometry(1, 0);
const vineGeometry = new THREE.CylinderGeometry(.5, .5, 1, 4);
const postGeometry = new THREE.BoxGeometry(.24, 1, .24);
const capGeometry = new THREE.BoxGeometry(.27, .16, .27);
const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
registerChunkResources('jungle', { terrainMaterial, roadMaterial, shoulderMaterial, edgeMaterial, centerMaterial, canopyMaterial, frondMaterial,
  shrubMaterial, barkMaterial, palmBarkMaterial, stoneMaterial, vineMaterial, postMaterial, capMaterial, trunkGeometry, shrubGeometry, vineGeometry,
  postGeometry, capGeometry, jungleCrowns, emergentCrown, emergentTrunks, junglePalms, fernGeometry, bigLeafGeometry, tuftGeometry, jungleBoulders });

function geometryFrom(vertices, colors) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function triangle(vertices, colors, a, b, c, color, start) {
  if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
  for (const p of [a, b, c]) { vertices.push(p.x, p.y, p.z + start); if (colors) colors.push(color.r, color.g, color.b); }
}
function instances(group, geometry, mat, items, name, shadows = true) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, mat, items.length); mesh.name = name;
  items.forEach((item, i) => {
    dummy.position.set(...item.p); dummy.rotation.set(...(item.r ?? [0, 0, 0]));
    if (item.q) dummy.quaternion.copy(item.q);
    dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
  });
  mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere(); group.add(mesh); return mesh;
}
// Quads over a parameter grid, each vertex carrying a three-component attribute.
function sheet(vertices, coords, rows, cols, point) {
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < cols.length - 1; j++) {
    const a = point(rows[i], cols[j]), b = point(rows[i + 1], cols[j]), c = point(rows[i], cols[j + 1]), d = point(rows[i + 1], cols[j + 1]);
    for (const tri of [[a, b, c], [b, d, c]]) for (const v of tri) { vertices.push(v.x, v.y, v.z); coords.push(...v.coord); }
  }
}

export class JungleChunk {
  constructor(index) {
    this.index = index; this.start = index * CHUNK_LENGTH; this.group = new THREE.Group(); this.group.name = `jungle-chunk-${index}`; this.owned = [];
    this.lips = riverLips(this.start, this.start + CHUNK_LENGTH); this.features = { lips: this.lips.map(lip => lip.index) };
    this.buildTerrain(); this.buildRiver(); this.buildRoad(); this.buildScenery();
  }
  addMesh(geometry, mat, name, shadows = false) {
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name; mesh.castShadow = shadows; mesh.receiveShadow = true;
    this.group.add(mesh); this.owned.push(geometry); return mesh;
  }
  buildTerrain() {
    const vertices = [], colors = [], ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
    const sampleRow = row => Array.from({ length: JUNGLE_COLUMN_COUNT }, (_, col) => jungleVertex(row, col));
    const lips = riverLips(this.start - 24, this.start + CHUNK_LENGTH + 24);
    const moss = new THREE.Color('#3d6f30'), brightMoss = new THREE.Color('#4c8238'), litter = new THREE.Color('#6b6541'), damp = new THREE.Color('#34602f');
    const dirt = new THREE.Color('#a89b6f'), verge = new THREE.Color('#6d7e46');
    const coolRock = new THREE.Color('#66746f'), warmRock = new THREE.Color('#8c8f7f'), fracture = new THREE.Color('#4d5652'), mossRock = new THREE.Color('#5a7d3c');
    const mud = new THREE.Color('#6e6a4f'), wetStone = new THREE.Color('#87897b'), bed = new THREE.Color('#2f4d47'), lipRock = new THREE.Color('#6f7b78');
    const canopy = ['#2d6a2c', '#367a33', '#3f8a3a', '#28602b', '#4a9440'].map(c => new THREE.Color(c)), farHaze = new THREE.Color('#33604c');
    const light = new THREE.Vector3(-55, 245, 40).normalize();
    let current = sampleRow(this.start / JUNGLE_STEP);
    for (let row = this.start / JUNGLE_STEP; row < (this.start + CHUNK_LENGTH) / JUNGLE_STEP; row++) {
      const next = sampleRow(row + 1);
      for (let col = 0; col < JUNGLE_COLUMN_COUNT - 1; col++) {
        const a = current[col], b = next[col], c = current[col + 1], d = next[col + 1];
        const tris = (row + col) % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
        tris.forEach((tri, i) => {
          ab.set(tri[1].x - tri[0].x, tri[1].y - tri[0].y, tri[1].z - tri[0].z); ac.set(tri[2].x - tri[0].x, tri[2].y - tri[0].y, tri[2].z - tri[0].z);
          normal.crossVectors(ab, ac).normalize(); if (normal.y < 0) normal.negate();
          const facet = randomAt(row * 2 + i, col + 2381);
          const s = (tri[0].s + tri[1].s + tri[2].s) / 3, u = (tri[0].u + tri[1].u + tri[2].u) / 3, y = (tri[0].y + tri[1].y + tri[2].y) / 3;
          const cross = Math.abs(u), fromWater = Math.abs(u - riverCenter(s)) - riverHalfWidth(s);
          const exposure = Math.max(0, normal.dot(light)), steep = normal.y < .6, crag = jungleCrags(s, u);
          let color;
          if (u < 0 && fromWater < 0) {
            // Grey rock shows through the churn at each lip; elsewhere the bed is dark.
            color = (lips.some(lip => Math.abs(s - lip.s) < 9) ? lipRock : bed).clone();
          } else if (u < 0 && fromWater < 4.6) {
            color = mud.clone().lerp(wetStone, jungleNoise(s, u, 5, 2382));
            if (normal.y > .8) color.lerp(mossRock, .35 * jungleNoise(s, u, 3, 2383) + .15);
          } else if (cross <= 9.6) {
            color = dirt.clone().lerp(verge, smoothstep(.35, .7, jungleNoise(s, u, 7, 2384)) * .8 + smoothstep(7.5, 9.6, cross) * .3);
          } else if (steep || (crag > 2.5 && normal.y < .74) || (u > 9.6 && u < 15.5 && cutHeight(s) > 2.2 && normal.y < .74)) {
            color = fracture.clone().lerp(coolRock, smoothstep(.05, .45, exposure));
            color.lerp(warmRock, smoothstep(.5, .95, exposure) * .7);
            color.lerp(mossRock, smoothstep(.45, .8, normal.y) * (.3 + .5 * jungleNoise(s, u, 6, 2385)));
          } else if (cross > (u < 0 ? 100 : 130)) {
            // Beyond the instanced trees the bumpy terrain itself reads as treetops.
            color = canopy[Math.floor(facet * canopy.length)].clone().multiplyScalar(.8 + .25 * smoothstep(-2.5, 2.5, y - jungleHeight(s, u)));
            if (u > 0) color.lerp(farHaze, smoothstep(190, 340, u) * .7);
          } else {
            const patch = jungleNoise(s, u, 23, 2386), fine = jungleNoise(s, u, 6, 2387);
            color = moss.clone().lerp(brightMoss, fine);
            color.lerp(litter, smoothstep(.58, .8, patch) * .85);
            if (u < 0) color.lerp(damp, .35 * (1 - smoothstep(4, 14, fromWater)));
          }
          color.multiplyScalar(.94 + facet * .12);
          triangle(vertices, colors, ...tri, color, this.start);
        });
      }
      current = next;
    }
    this.terrain = this.addMesh(geometryFrom(vertices, colors), terrainMaterial, 'jungle-floor', true);
    this.sampleGround = terrainSampler(this.terrain);
  }
  buildRiver() {
    const vertices = [], colors = [], coords = [];
    const across = [1, .82, .5, .17, -.17, -.5, -.82, -1];
    const shallow = new THREE.Color('#62c9b6'), deep = new THREE.Color('#2b8b90');
    // The surface runs under both bank rims, so the rising bank hides its edge.
    const at = (s, k) => {
      const f = across[k], u = riverCenter(s) + f * riverHalfWidth(s) + (k === 0 ? 1.05 : k === across.length - 1 ? -1.05 : 0);
      const p = positionAt(s, u, riverLevel(s));
      return { x: p.x, y: p.y, z: p.z + this.start, s, f, turbulence: riverTurbulence(s) };
    };
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += RIVER_STEP) for (let k = 0; k < across.length - 1; k++) {
      const a = at(s, k), b = at(s + RIVER_STEP, k), c = at(s, k + 1), d = at(s + RIVER_STEP, k + 1);
      for (let tri of (k % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]])) {
        const [p, q, r] = tri;
        if ((q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z) < 0) tri = [p, r, q];
        for (const v of tri) {
          vertices.push(v.x, v.y, v.z);
          const color = shallow.clone().lerp(deep, Math.pow(1 - Math.min(1, Math.abs(v.f)), .7));
          colors.push(color.r, color.g, color.b); coords.push(v.s, v.f, v.turbulence);
        }
      }
    }
    const river = geometryFrom(vertices, colors);
    river.setAttribute('riverCoord', new THREE.Float32BufferAttribute(coords, 3));
    river.boundingSphere.radius += 1;
    this.addMesh(river, riverMaterial, 'jungle-river');
    const foam = [], foamCoords = [], mist = [], mistCoords = [];
    for (const lip of this.lips) {
      if (lip.drop < .6) continue;
      const dir = lip.direction, hw = riverHalfWidth(lip.s), rc = riverCenter(lip.s);
      const spot = (s, f, y) => { const p = positionAt(s, rc + f * hw, y); return { x: p.x, y: p.y, z: p.z + this.start }; };
      const fs = [-1.02, -.6, -.2, .2, .6, 1.02], edge = f => 1 - smoothstep(.72, 1.02, Math.abs(f));
      // The falling sheet, pushed just downstream of the water's own face.
      sheet(foam, foamCoords, [0, .5, 1], fs, (t, f) => ({ ...spot(lip.s + dir * (t * RIVER_STEP + .12), f, lerp(lip.upper + .12, lip.lower + .1, t)), coord: [t * lip.drop * .5, f, edge(f)] }));
      // Churn spreading through the plunge pool, and a light drawing-in above the lip.
      sheet(foam, foamCoords, [RIVER_STEP, 4, 7, 11], fs, (d, f) => ({ ...spot(lip.s + dir * d, f, lip.lower + .1), coord: [d * .35 + lip.drop * .5, f, (1 - smoothstep(3, 11, d)) * edge(f)] }));
      sheet(foam, foamCoords, [-3.5, -1.2, 0], fs, (d, f) => ({ ...spot(lip.s + dir * d, f, lip.upper + .1), coord: [d * .3, f, .6 * (1 - smoothstep(0, 3.5, -d)) * edge(f)] }));
      if (lip.drop > 2) sheet(mist, mistCoords, [1, 4, 7, 10], [-1.3, -.45, .45, 1.3], (d, f) => ({ ...spot(lip.s + dir * d, f, lip.lower + 1.2 + Math.min(3, lip.drop * .35)),
        coord: [d, f, Math.sin((d - 1) / 9 * Math.PI) * (1 - Math.abs(f) / 1.3) * Math.min(1, lip.drop / 5)] }));
    }
    // Humid haze hangs low over the whole river.
    const rows = Array.from({ length: CHUNK_LENGTH / 8 + 1 }, (_, i) => this.start + i * 8);
    sheet(mist, mistCoords, rows, [-1.35, -.5, .5, 1.35], (s, f) => {
      const p = positionAt(s, riverCenter(s) + f * riverHalfWidth(s), riverLevel(s) + 2.4);
      return { x: p.x, y: p.y, z: p.z + this.start, coord: [s * .5, f, .45 * (1 - Math.abs(f) / 1.35)] };
    });
    if (foam.length) {
      const g = geometryFrom(foam); g.setAttribute('foamCoord', new THREE.Float32BufferAttribute(foamCoords, 3)); g.boundingSphere.radius += 1;
      this.addMesh(g, foamMaterial, 'cascade-foam');
    }
    const haze = geometryFrom(mist); haze.setAttribute('foamCoord', new THREE.Float32BufferAttribute(mistCoords, 3)); haze.boundingSphere.radius += 1;
    this.addMesh(haze, mistMaterial, 'river-mist');
  }
  ribbon(ranges, lift, mat, name) {
    const vertices = [];
    for (const [low, high] of ranges) for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      const at = (t, u) => positionAt(t, u, roadHeight(t) + lift);
      const a = at(s, low), b = at(s + 2, low), c = at(s, high), d = at(s + 2, high);
      triangle(vertices, null, a, b, c, null, this.start); triangle(vertices, null, b, d, c, null, this.start);
    }
    this.addMesh(geometryFrom(vertices), mat, name);
  }
  buildRoad() {
    this.ribbon([[-6.4, 6.4]], .045, shoulderMaterial, 'road-shoulders');
    this.ribbon([[-5.5, 5.5]], .075, roadMaterial, 'jungle-road');
    this.ribbon([[-5.05, -4.9], [4.9, 5.05]], .09, edgeMaterial, 'road-edges');
    this.ribbon([[-.31, -.19], [.19, .31]], .093, centerMaterial, 'center-lines');
  }
  buildScenery() {
    const random = seededRandom(this.index + 77113);
    const trunks = [], crowns = jungleCrowns.map(() => []), emergents = emergentTrunks.map(() => []), emergentCrowns = [], vines = [], vineLeaves = [];
    const palmTrunks = junglePalms.map(() => []), palmFronds = junglePalms.map(() => []), ferns = [], leaves = [], shrubs = [], tufts = [];
    const boulders = jungleBoulders.map(() => []), posts = [], caps = [], logs = [];
    const crownColors = ['#2c6429', '#33742f', '#3d8236', '#47903a', '#295c2a', '#529c40', '#397a33', '#3c8a3c'];
    const darkCrowns = ['#275727', '#2c642c', '#224f24', '#31692e'];
    const sunlitCrowns = ['#4d9440', '#57a047', '#3f8a38', '#5aa64a'];
    const palmColors = ['#4f9a3a', '#5ca744', '#438f36', '#6bb04c'];
    const fernColors = ['#4b8f3a', '#5a9c44', '#3f7f33', '#69a84d'];
    const leafColors = ['#3f8a3a', '#4d9842', '#367a33'];
    const shrubColors = ['#3f7a34', '#4a8a3b', '#357030', '#5b9a44'];
    const stoneTints = ['#e6e9e2', '#d5dbd3', '#f0f2ec', '#c9d1c8'];
    const pick = list => list[Math.floor(random() * list.length)];
    const ground = (s, u) => { const p = positionAt(s, u); return { x: p.x, y: this.sampleGround(p.x, p.z + this.start) ?? jungleHeight(s, u), z: p.z + this.start }; };
    const slope = (s, u) => Math.hypot(jungleHeight(s, u + 1) - jungleHeight(s, u - 1), jungleHeight(s + 1, u) - jungleHeight(s - 1, u)) / 2;
    // Near-side trees must stay below the camera's line of sight to the road;
    // farther out and lower down on the slope there is more headroom.
    const headroom = (s, u, y) => u > 0 ? 60 : Math.max(0, -u * .78 - 4 + Math.max(0, roadHeight(s) - y) * .8);
    const open = (s, u, margin = 0) => Math.abs(u) > 9.6 + margin && !onRiver(s, u, 1.5 + margin);
    const spots = [];
    const clear = (s, u, r) => spots.every(spot => Math.hypot(spot.s - s, spot.u - u) > spot.r + r);
    const tree = (s, u, height, palette) => {
      const p = ground(s, u), width = height * (.4 + random() * .18);
      trunks.push({ p: [p.x, p.y + height * .3, p.z], scale: [height * .045, height * .62, height * .045] });
      crowns[Math.floor(random() * crowns.length)].push({ p: [p.x, p.y + height * .42, p.z], scale: [width, height * .58, width], r: [0, random() * 6.28, 0], color: pick(palette) });
      spots.push({ s, u, r: width * .45 });
    };
    const emergent = (s, u, height, lean) => {
      const p = ground(s, u), width = height * (.36 + random() * .1), angle = random() * 6.28;
      // Stretch the larger giants upward while preserving crown spread and camera clearance.
      const tallHeight = Math.min(height + Math.max(0, height - 28) * 2, headroom(s, u, p.y));
      emergents[Math.floor(random() * emergents.length)].push({ p: [p.x, p.y - .1, p.z], scale: [height, tallHeight, height], r: [0, angle, 0] });
      const c = positionAt(s, u - lean), top = p.y + tallHeight * .78;
      emergentCrowns.push({ p: [c.x, top, c.z + this.start], scale: [width, width, width], r: [0, angle, 0], color: pick(sunlitCrowns) });
      spots.push({ s, u, r: width * .6 });
      // Lianas hang from the underside of the crown, some almost to the floor.
      for (let i = 0, count = 3 + Math.floor(random() * 5); i < count; i++) {
        const a = random() * 6.28, r = width * (.3 + random() * .55), length = Math.min(4 + random() * 9, top - p.y - 1.5);
        // Lianas over the road would brush the car; keep them beyond the verges.
        if (Math.abs(u - lean + Math.cos(a) * r) < 9.8) continue;
        if (length < 3) continue;
        const x = c.x + Math.cos(a) * r, z = c.z + this.start + Math.sin(a) * r;
        vines.push({ p: [x, top - width * .08 - length / 2, z], scale: [.11, length, .11], r: [(random() - .5) * .08, 0, (random() - .5) * .08] });
        vineLeaves.push({ p: [x, top - width * .08 - length, z], scale: [.42, .32, .42], r: [0, a, 0], color: '#4f8a38' });
      }
    };
    const palm = (s, u, height) => {
      const p = ground(s, u), w = height * .8, angle = random() * 6.28, variant = Math.floor(random() * junglePalms.length);
      palmTrunks[variant].push({ p: [p.x, p.y - .1, p.z], scale: [w, height, w], r: [0, angle, 0] });
      palmFronds[variant].push({ p: [p.x, p.y - .1, p.z], scale: [w, height, w], r: [0, angle, 0], color: pick(palmColors) });
      spots.push({ s, u, r: 1.2 });
    };
    const stone = (s, u, size, mossy, lift = null) => {
      const p = ground(s, u), variant = mossy ? 1 + Math.floor(random() * 2) : Math.floor(random() * 2);
      boulders[variant].push({ p: [p.x, lift ?? p.y + size * .28, p.z], scale: [size * (.8 + random() * .5), size * (.55 + random() * .55), size * (.7 + random() * .5)], r: [(random() - .5) * .4, random() * 6.28, (random() - .5) * .4], color: pick(stoneTints) });
    };
    // Emergent giants beside the road throw their crowns and shadows across it.
    for (let k = 0; k < 3; k++) {
      const s = this.start + 10 + k * 42 + random() * 24, u = 10.5 + random() * 5;
      if (random() < .3 || slope(s, u) > 2.2) continue;
      emergent(s, u, 24 + random() * 9, 3 + random() * 3);
    }
    for (let i = 0; i < 6; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const u = i < 4 ? 40 + random() * 85 : -100 - random() * 50;
      const p = ground(s, u), height = Math.min(22 + random() * 10, headroom(s, u, p.y));
      if (height < 16 || !open(s, u) || slope(s, u) > 2 || !clear(s, u, 6)) continue;
      emergent(s, u, height, 0);
    }
    for (let i = 0; i < 360; i++) {
      const s = this.start + random() * CHUNK_LENGTH, u = 11 + random() ** 1.35 * 128;
      const grove = jungleNoise(s, u, 29, 2271);
      if (random() > .3 + grove * .8 || !open(s, u) || slope(s, u) > 1.9 || (jungleCrags(s, u) > 3 && slope(s, u) > 1.2) || !clear(s, u, 1)) continue;
      tree(s, u, (5.5 + random() ** 1.2 * 10) * (1 - smoothstep(60, 130, u) * .35), grove > .6 ? darkCrowns : crownColors);
    }
    for (let i = 0; i < 90; i++) {
      const s = this.start + random() * CHUNK_LENGTH, bankTop = riverCenter(s) + riverHalfWidth(s) + 4;
      const u = lerp(-11.5, bankTop + .5, random()), p = ground(s, u);
      const height = Math.min(headroom(s, u, p.y), 5 + random() * 7);
      if (height < 3.8 || slope(s, u) > 2.3 || !open(s, u) || !clear(s, u, 1)) continue;
      tree(s, u, height, crownColors);
    }
    for (let i = 0; i < 260; i++) {
      const s = this.start + random() * CHUNK_LENGTH, farTop = riverCenter(s) - riverHalfWidth(s) - 4;
      const u = i < 190 ? farTop - 2 - random() ** 1.2 * 80 : -135 - random() * 125;
      const p = ground(s, u);
      // Trees on the far bank stay short near the water so the river stays visible.
      const height = Math.min(headroom(s, u, p.y), i < 190 ? 4 + (farTop - u) * .55 : 30, 5.5 + random() * 10);
      if (height < 3.8 || slope(s, u) > 2.1 || !open(s, u) || !clear(s, u, .6)) continue;
      tree(s, u, height, jungleNoise(s, u, 29, 2271) > .6 ? darkCrowns : crownColors);
    }
    for (let i = 0; i < 40; i++) {
      const s = this.start + random() * CHUNK_LENGTH, u = 130 + random() * 130;
      if (slope(s, u) > 2.4 || !clear(s, u, 2)) continue;
      tree(s, u, 9 + random() * 7, darkCrowns);
    }
    // Cheap single-lobe crowns texture the bumpy distant hills on both sides.
    const lumps = [];
    for (let i = 0; i < 170; i++) {
      const s = this.start + random() * CHUNK_LENGTH, u = (random() > .45 ? 1 : -1) * (105 + random() * 190);
      if (u > 0 && u < 130) continue;
      const p = ground(s, u), size = 4 + random() * 5;
      lumps.push({ p: [p.x, p.y + size * .2, p.z], scale: [size, size * .8, size], r: [0, random() * 6.28, 0], color: pick(darkCrowns) });
    }
    for (let i = 0; i < 50; i++) {
      const s = this.start + random() * CHUNK_LENGTH, rc = riverCenter(s), hw = riverHalfWidth(s), kind = random();
      const u = kind < .4 ? rc + hw + 5 + random() * 7 : kind < .7 ? rc - hw - 5 - random() * 9 : 10.5 + random() * 30;
      const p = ground(s, u), height = Math.min(headroom(s, u, p.y), 6 + random() * 5);
      if (height < 4.5 || slope(s, u) > 2.4 || !open(s, u) || !clear(s, u, 1.5)) continue;
      palm(s, u, height);
    }
    // Ferns, broad leaves, shrubs and grass fill the floor and crowd the verges.
    const floorSpot = (i, share) => {
      const s = this.start + random() * CHUNK_LENGTH, rc = riverCenter(s), hw = riverHalfWidth(s), kind = i / share;
      if (kind < .45) return [s, (random() > .5 ? 1 : -1) * (9.7 + random() * 3.5)];
      if (kind < .7) return [s, random() > .5 ? rc + hw + 1.5 + random() * 5 : rc - hw - 1.5 - random() * 5];
      return [s, (random() > .5 ? 1 : -1) * (10 + random() * 90)];
    };
    for (let i = 0; i < 460; i++) {
      const [s, u] = floorSpot(i, 460);
      if (!open(s, u) || slope(s, u) > 2.5) continue;
      const p = ground(s, u), size = .8 + random() * .9;
      ferns.push({ p: [p.x, p.y, p.z], scale: [size, size, size], r: [0, random() * 6.28, 0], color: pick(fernColors) });
    }
    for (let i = 0; i < 120; i++) {
      const [s, u] = floorSpot(i, 120);
      if (!open(s, u, .5) || slope(s, u) > 2.2) continue;
      const p = ground(s, u), size = 1.2 + random() * 1.1;
      leaves.push({ p: [p.x, p.y, p.z], scale: [size, size, size], r: [0, random() * 6.28, 0], color: pick(leafColors) });
    }
    for (let i = 0; i < 170; i++) {
      const s = this.start + random() * CHUNK_LENGTH, u = (random() > .5 ? 1 : -1) * (10.5 + random() * 110);
      if (!open(s, u, .8) || slope(s, u) > 2.3) continue;
      const p = ground(s, u), size = .9 + random() * 1.5;
      shrubs.push({ p: [p.x, p.y + size * .3, p.z], scale: [size, size * .7, size * .9], r: [0, random() * 6.28, .1], color: pick(shrubColors) });
    }
    for (let i = 0; i < 120; i++) {
      const [s, u] = floorSpot(i, 120);
      if (!open(s, u) || slope(s, u) > 2.5) continue;
      const p = ground(s, u), size = .7 + random() * .8;
      tufts.push({ p: [p.x, p.y, p.z], scale: [size, size, size], r: [0, random() * 6.28, 0], color: random() > .5 ? '#7fa04c' : '#94ad55' });
    }
    // Boulders line the banks, crowd each lip, and break through the slopes.
    for (let s = this.start + 2; s < this.start + CHUNK_LENGTH; s += 5) {
      const rc = riverCenter(s), hw = riverHalfWidth(s);
      for (let i = 0, count = 1 + Math.floor(random() * 3); i < count; i++) {
        const side = random() > .5 ? 1 : -1, wet = random() < .35;
        const u = rc + side * (wet ? hw * (.55 + random() * .4) : hw + .8 + random() * 3.2), t = s + random() * 4;
        const size = .5 + random() ** 1.5 * 1.9;
        stone(t, u, size, !wet && random() > .3, wet ? riverLevel(t) - .3 + size * .35 : null);
      }
    }
    for (const lip of this.lips) {
      const hw = riverHalfWidth(lip.s), rc = riverCenter(lip.s);
      for (let i = 0; i < 8; i++) {
        const f = -1.15 + i * 2.3 / 7 + (random() - .5) * .2, size = 1.1 + random() * 2.1;
        const s = lip.s + (random() - .5) * 1.6, u = rc + f * hw, p = ground(s, u);
        stone(s, u, size, Math.abs(f) > .9, Math.max(p.y + size * .3, lip.upper - size * .3));
      }
    }
    for (let i = 0; i < 45; i++) {
      const s = this.start + random() * CHUNK_LENGTH, u = (random() > .5 ? 1 : -1) * (12 + random() * 128);
      if (!open(s, u, 1)) continue;
      const crag = jungleCrags(s, u), size = crag > 2 ? 1.5 + random() * 2.5 : .6 + random() * 1.4;
      stone(s, u, size, random() > .4);
    }
    for (let s = this.start + 3; s < this.start + CHUNK_LENGTH; s += 6) {
      if (cutHeight(s) < 2.4 || random() > .6) continue;
      stone(s + random() * 3, 11 + random() * 3.5, .7 + random() * 1.1, random() > .5);
    }
    // Fallen, moss-covered trunks lie across the floor.
    for (let i = 0; i < 5; i++) {
      const s = this.start + random() * CHUNK_LENGTH, u = (random() > .5 ? 1 : -1) * (13 + random() * 80);
      if (!open(s, u, 4) || slope(s, u) > 1.2) continue;
      const p = ground(s, u), length = 5 + random() * 4, radius = .35 + random() * .2, angle = random() * 6.28;
      const direction = new THREE.Vector3(Math.cos(angle), .04, Math.sin(angle)).normalize();
      logs.push({ p: [p.x, p.y + radius * .8, p.z], scale: [radius * 1.4, length, radius * 1.4], q: new THREE.Quaternion().setFromUnitVectors(up, direction), color: '#8ea36a' });
    }
    // White marker posts guard the river side where the road stands high above the water.
    for (let s = this.start + 4; s < this.start + CHUNK_LENGTH; s += 12) {
      if (roadHeight(s) - riverLevel(s) < 9 || riverCenter(s) + riverHalfWidth(s) + 4 < -34) continue;
      const p = positionAt(s, -7.7, roadHeight(s));
      posts.push({ p: [p.x, p.y + .5, p.z + this.start], scale: [1, 1.05, 1] });
      caps.push({ p: [p.x, p.y + 1.05, p.z + this.start], scale: [1, 1, 1] });
    }
    instances(this.group, trunkGeometry, barkMaterial, trunks, 'jungle-trunks');
    jungleCrowns.forEach((g, i) => instances(this.group, g, canopyMaterial, crowns[i], 'jungle-canopy'));
    emergentTrunks.forEach((g, i) => instances(this.group, g, barkMaterial, emergents[i], 'emergent-trunks'));
    instances(this.group, emergentCrown, canopyMaterial, emergentCrowns, 'emergent-crowns');
    instances(this.group, vineGeometry, vineMaterial, vines, 'lianas', false);
    instances(this.group, shrubGeometry, shrubMaterial, vineLeaves, 'liana-leaves', false);
    junglePalms.forEach((palmShape, i) => {
      instances(this.group, palmShape.trunk, palmBarkMaterial, palmTrunks[i], 'palm-trunks');
      instances(this.group, palmShape.fronds, frondMaterial, palmFronds[i], 'palm-fronds');
    });
    instances(this.group, fernGeometry, frondMaterial, ferns, 'ferns', false);
    instances(this.group, bigLeafGeometry, frondMaterial, leaves, 'broad-leaves');
    instances(this.group, shrubGeometry, shrubMaterial, shrubs, 'undergrowth');
    instances(this.group, shrubGeometry, shrubMaterial, lumps, 'distant-canopy', false);
    instances(this.group, tuftGeometry, frondMaterial, tufts, 'grass-tufts', false);
    jungleBoulders.forEach((g, i) => instances(this.group, g, stoneMaterial, boulders[i], 'mossy-boulders'));
    instances(this.group, trunkGeometry, barkMaterial, logs, 'fallen-logs');
    instances(this.group, postGeometry, postMaterial, posts, 'marker-posts');
    instances(this.group, capGeometry, capMaterial, caps, 'marker-caps');
  }
  dispose() {
    this.group.removeFromParent(); for (const g of this.owned) g.dispose();
    this.group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  }
}

export class JungleWorld {
  constructor(scene, chunkSource = null) { this.scene = scene; this.chunkSource = chunkSource; this.chunks = new Map(); this.origin = 0; this.center = null; }
  update(s) {
    const center = Math.floor(s / CHUNK_LENGTH); this.origin = Math.floor(s / 1024) * 1024;
    if (center !== this.center) {
      for (let i = center - 3; i <= center + 5; i++) {
        if (!this.chunks.has(i)) { const chunk = this.chunkSource?.take(i) ?? new JungleChunk(i); this.chunks.set(i, chunk); this.scene.add(chunk.group); }
      }
      for (const [i, chunk] of this.chunks) if (i < center - 3 || i > center + 5) { this.chunkSource?.retain(i, chunk); chunk.dispose(); this.chunks.delete(i); }
      this.center = center;
      this.chunkSource?.prefetch(center, this.chunks);
    }
    for (const chunk of this.chunks.values()) chunk.group.position.z = this.origin - chunk.start;
  }
  animate(time) { animateWater(time, this.origin); }
  dispose() { this.chunkSource?.dispose(); for (const chunk of this.chunks.values()) chunk.dispose(); this.chunks.clear(); }
}

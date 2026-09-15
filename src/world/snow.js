import * as THREE from 'three';
import { CHUNK_LENGTH, randomAt, seededRandom, smoothstep } from './route.js';
import { SNOW_STEP, SNOW_COLUMN_COUNT, LAMP_SPACING, snowVertex, snowPosition, snowHeight, snowRoadHeight, lampAt, summitForCell, terrainPocket, ledgeEdge, alpineRiver } from './snow-route.js';
import { alpineRockVariants } from './alpine-rocks.js';
import { Snowfall } from './snowfall.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .95, flatShading: true, ...extra });
const terrainMaterial = material('#ffffff', { vertexColors: true });
const snowMaterial = material('#bbcbe1');
const rockMaterial = material('#4b5870');
const stoneMaterial = material('#ffffff');
const riverMaterial = material('#ffffff', { roughness: .32, metalness: .18, vertexColors: true,
  emissive: '#224558', emissiveIntensity: .3 });
const riverClock = { value: 0 };
riverMaterial.onBeforeCompile = shader => {
  shader.uniforms.riverTime = riverClock;
  shader.vertexShader = 'attribute vec2 riverCoord; varying vec2 vRiverCoord;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiverCoord = riverCoord;');
  shader.fragmentShader = 'uniform float riverTime; varying vec2 vRiverCoord;\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    float flow = sin(vRiverCoord.x * 2.6 + sin(vRiverCoord.y * 0.35 - riverTime * 0.5) * 1.8 + vRiverCoord.y * 0.65 - riverTime * 1.1);
    float broken = smoothstep(0.15, 0.85, sin(vRiverCoord.y * 0.83 + vRiverCoord.x * 3.2 - riverTime * 0.35));
    float glint = pow(max(0.0, flow), 18.0) * broken;
    diffuseColor.rgb += vec3(0.12, 0.2, 0.23) * glint * 0.45;
  `);
};
riverMaterial.customProgramCacheKey = () => 'alpine-stream-v1';
const pineMaterial = material('#203c43');
const metalMaterial = material('#687688', { metalness: .2 });
const barkMaterial = material('#3a3e49');
const roadMaterial = material('#343c4a');
const lineMaterial = material('#b4ab84');
const edgeMaterial = material('#b1becf');
const glowMaterial = new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
const coneGeometry = new THREE.ConeGeometry(1, 1, 7);
const poleGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);

function geometry(vertices, colors) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function triangle(vertices, colors, a, b, c, color, start) {
  if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
  for (const p of [a, b, c]) { vertices.push(p.x, p.y, p.z + start); if (colors) colors.push(color.r, color.g, color.b); }
}
function instances(group, geo, mat, items, name) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length); mesh.name = name;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]; dummy.position.set(...item.p); dummy.rotation.set(0, item.angle ?? 0, 0);
    if (item.q) dummy.quaternion.copy(item.q);
    dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    if (item.color) mesh.setColorAt(i, new THREE.Color(item.color));
  }
  mesh.castShadow = mat !== glowMaterial; mesh.receiveShadow = true;
  mesh.computeBoundingSphere(); group.add(mesh);
}

class SnowChunk {
  constructor(index) {
    this.start = index * CHUNK_LENGTH; this.group = new THREE.Group(); this.group.name = `snow-chunk-${index}`; this.owned = [];
    this.buildTerrain(); this.buildRiver(); this.buildRoad(); this.buildScenery(index);
  }
  addMesh(g, mat, name) {
    const mesh = new THREE.Mesh(g, mat); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh); this.owned.push(g); return mesh;
  }
  buildTerrain() {
    const vertices = [], colors = [], cross = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
    const sampleRow = row => Array.from({ length: SNOW_COLUMN_COUNT }, (_, col) => snowVertex(row, col));
    let current = sampleRow(this.start / SNOW_STEP);
    for (let row = this.start / SNOW_STEP; row < (this.start + CHUNK_LENGTH) / SNOW_STEP; row++) {
      const next = sampleRow(row + 1);
      for (let col = 0; col < SNOW_COLUMN_COUNT - 1; col++) {
        const a = current[col], b = next[col], c = current[col + 1], d = next[col + 1];
        const tris = (row + col) % 2 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
        tris.forEach((tri, i) => {
          ab.set(tri[1].x - tri[0].x, tri[1].y - tri[0].y, tri[1].z - tri[0].z);
          ac.set(tri[2].x - tri[0].x, tri[2].y - tri[0].y, tri[2].z - tri[0].z);
          cross.crossVectors(ab, ac).normalize();
          const facet = randomAt(row * 2 + i, col + 923);
          const s = tri.reduce((sum, p) => sum + p.s, 0) / 3;
          const u = tri.reduce((sum, p) => sum + p.u, 0) / 3;
          const highSnow = tri.reduce((sum, p) => sum + p.y, 0) / 3 > snowRoadHeight(s) + 54;
          const exposure = .5 + .5 * Math.sin(s / 29 + u / 19);
          const snowy = Math.abs(cross.y) > (highSnow ? .5 : .66 + exposure * .07);
          const color = new THREE.Color(snowy ? '#b4c4dc' : '#657186');
          // Broad tonal changes let the actual fracture planes describe the
          // mountain, with only a little variation between adjacent facets.
          color.multiplyScalar(snowy ? .94 + exposure * .09 + facet * .045 : .87 + exposure * .07 + facet * .17);
          triangle(vertices, colors, ...tri, color, this.start);
        });
      }
      current = next;
    }
    this.addMesh(geometry(vertices, colors), terrainMaterial, 'snowy-mountain');
  }
  buildRiver() {
    const vertices = [], colors = [], coords = [];
    // Slightly overhang the submerged banks to cover the coarse terrain
    // triangles. Snow and stones naturally hide the water's outer edge.
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      const sample = (t, fraction) => {
        const river = alpineRiver(t), offset = (river.halfWidth + .35) * fraction;
        return { ...snowPosition(t, river.u + offset, river.y), t, offset };
      };
      for (const [low, high] of [[-1, -.55], [-.55, .55], [.55, 1]]) {
        const a = sample(s, low), b = sample(s + 2, low), c = sample(s, high), d = sample(s + 2, high);
        const shade = new THREE.Color(low === -.55 ? '#305364' : '#587d8e');
        for (let tri of [[a, b, c], [b, d, c]]) {
          if ((tri[1].z - tri[0].z) * (tri[2].x - tri[0].x) - (tri[1].x - tri[0].x) * (tri[2].z - tri[0].z) < 0) tri = [tri[0], tri[2], tri[1]];
          for (const p of tri) { vertices.push(p.x, p.y, p.z + this.start); colors.push(shade.r, shade.g, shade.b); coords.push(p.offset, p.t); }
        }
      }
    }
    const g = geometry(vertices, colors);
    // Route coordinates are independent of the floating rendering origin.
    g.setAttribute('riverCoord', new THREE.Float32BufferAttribute(coords, 2));
    this.addMesh(g, riverMaterial, 'alpine-river').castShadow = false;
  }
  ribbon(low, high, lift, mat, name) {
    const vertices = [];
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      const p = (t, u) => snowPosition(t, u, snowRoadHeight(t) + lift);
      const a = p(s, low), b = p(s + 2, low), c = p(s, high), d = p(s + 2, high);
      triangle(vertices, null, a, b, c, null, this.start); triangle(vertices, null, b, d, c, null, this.start);
    }
    this.addMesh(geometry(vertices), mat, name);
  }
  buildRoad() {
    this.ribbon(-7, 7, .025, snowMaterial, 'plowed-snow-shoulders');
    this.ribbon(-5.5, 5.5, .075, roadMaterial, 'mountain-road');
    this.ribbon(-4.98, -4.85, .094, edgeMaterial, 'road-edge');
    this.ribbon(4.85, 4.98, .094, edgeMaterial, 'road-edge');
    this.ribbon(-.08, .08, .096, lineMaterial, 'center-line');
  }
  buildScenery(index) {
    const random = seededRandom(index + 90241), trunks = [], pines = [], caps = [], metal = [], lamps = [];
    const rocks = alpineRockVariants.map(() => []), rockCaps = alpineRockVariants.map(() => []);
    const point = (s, u, y) => { const p = snowPosition(s, u, y); return [p.x, p.y, p.z + this.start]; };
    const besideRiver = (s, u, margin = 2) => Math.abs(u - alpineRiver(s).u) < alpineRiver(s).halfWidth + margin;
    const stone = (s, u, size, snowy = true, tall = false) => {
      if (besideRiver(s, u, size + .8)) return;
      const variant = Math.floor(random() * rocks.length);
      const item = { p: point(s, u, snowHeight(s, u) + size * .12),
        scale: [size * (.8 + random() * .5), size * (tall ? 1.35 : .55 + random() * .5), size * (.65 + random() * .5)],
        angle: random() * Math.PI * 2 };
      rocks[variant].push({ ...item, color: ['#455166', '#515d70', '#596477', '#414c60'][Math.floor(random() * 4)] });
      if (snowy) rockCaps[variant].push(item);
    };
    const beam = (a, b, width, depth = width) => {
      const direction = new THREE.Vector3().fromArray(b).sub(new THREE.Vector3().fromArray(a));
      metal.push({ p: a.map((v, i) => (v + b[i]) / 2), scale: [width, direction.length(), depth], q: new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()) });
    };
    const pine = (s, u, y, height, angle) => {
      trunks.push({ p: point(s, u, y + height * .26), scale: [.25, height * .6, .25] });
      for (let tier = 0; tier < 3; tier++) {
        const width = height * (.27 - tier * .062), coneHeight = height * .48;
        const centerY = y + height * (.36 + tier * .22);
        pines.push({ p: point(s, u, centerY), scale: [width, coneHeight, width], angle });
        caps.push({ p: point(s, u, centerY + coneHeight * .12), scale: [width * .9, coneHeight * .83, width * .9], angle });
      }
    };
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 4) {
      const y = snowRoadHeight(s), endY = snowRoadHeight(s + 4);
      metal.push({ p: point(s, -7.2, y + .73), scale: [.2, 1.65, .22] });
      beam(point(s, -7.2, y + 1.42), point(s + 4, -7.2, endY + 1.42), .3, .2);
      // Slim red snow stakes mark the inner shoulder without enclosing the view.
      if (s % 16 === 0) trunks.push({ p: point(s, 7.4, y + .9), scale: [.12, 1.9, .12] });
    }
    for (let i = Math.ceil((this.start - 16) / LAMP_SPACING); i * LAMP_SPACING + 16 < this.start + CHUNK_LENGTH; i++) {
      const lamp = lampAt(i), ground = snowRoadHeight(lamp.s);
      metal.push({ p: point(lamp.s, lamp.u, ground + 3.75), scale: [.17, 7.5, .17] });
      beam(point(lamp.s, lamp.u, ground + 7.5), point(lamp.s, 6.2, ground + 7.5), .14);
      lamps.push({ p: point(lamp.s, 6.2, ground + 7.38), scale: [.62, .18, .95] });
    }
    for (let i = 0; i < 135; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const u = (random() > .48 ? 1 : -1) * (12 + random() ** 1.5 * 190);
      const slope = Math.abs(snowHeight(s, u + 1) - snowHeight(s, u - 1));
      const y = snowHeight(s, u);
      if (slope > 1.65 || besideRiver(s, u, 4)) continue;
      const height = 5 + random() * 8.5, angle = random() * Math.PI;
      pine(s, u, y, height, angle);
    }
    for (let cell = Math.floor(this.start / 80) - 1; cell <= Math.floor((this.start + CHUNK_LENGTH) / 80); cell++) {
      for (const side of [-1, 1]) {
        const pocket = terrainPocket(cell, side);
        if (pocket.s < this.start || pocket.s >= this.start + CHUNK_LENGTH) continue;
        for (let i = 0; i < 2; i++) {
          const s = pocket.s + (i - .5) * 3.5, u = pocket.u + (i - .5) * 1.4;
          pine(s, u, snowHeight(s, u) - .6, 4.5 + random() * 3, random() * Math.PI);
        }
      }
    }
    // Loose angular debris gathers below the face and around the roadside toe.
    for (let i = 0; i < 105; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const u = i % 3 ? ledgeEdge(s) - 90 - random() * 35 : 12 + random() * 10;
      const size = .35 + random() ** 1.6 * 1.9;
      stone(s, u, size, i % 4 === 0);
    }
    for (let i = 0; i < 115; i++) {
      const s = this.start + random() * CHUNK_LENGTH, u = (random() > .5 ? 1 : -1) * (12 + random() ** 1.8 * 160);
      if (Math.abs(snowHeight(s, u + 1) - snowHeight(s, u - 1)) > 4) continue;
      const size = .8 + random() ** 2 * 4.6;
      stone(s, u, size, true, i % 5 === 0);
      // A few fragments around larger stones read as natural rockfall groups.
      if (size > 3) for (let chip = 0; chip < 2; chip++) {
        const ds = (random() - .5) * size * 3, du = (random() - .5) * size * 3;
        if (s + ds >= this.start && s + ds < this.start + CHUNK_LENGTH && Math.abs(u + du) > 10)
          stone(s + ds, u + du, size * (.15 + random() * .16), chip === 0);
      }
    }
    instances(this.group, poleGeometry, barkMaterial, trunks, 'alpine-trunks');
    instances(this.group, coneGeometry, pineMaterial, pines, 'alpine-pines');
    instances(this.group, coneGeometry, snowMaterial, caps, 'pine-snow');
    alpineRockVariants.forEach((variant, i) => {
      instances(this.group, variant.rock, stoneMaterial, rocks[i], 'alpine-boulders');
      instances(this.group, variant.snow, snowMaterial, rockCaps[i], 'boulder-snow');
    });
    instances(this.group, boxGeometry, metalMaterial, metal, 'guardrails-and-lamps');
    instances(this.group, boxGeometry, glowMaterial, lamps, 'amber-lanterns');
    const cell = Math.floor((this.start - 76) / 280);
    for (let i = cell; i <= cell + 1; i++) {
      const summit = summitForCell(i);
      if ((i % 3 + 3) % 3 === 0 && summit.s >= this.start && summit.s < this.start + CHUNK_LENGTH) this.buildRelay(point, summit);
    }
  }
  buildRelay(point, summit) {
    // A tiny mountaintop relay hut and antenna echo the reference's summit detail.
    const s = summit.s, u = summit.u, y = snowHeight(s, u);
    instances(this.group, boxGeometry, rockMaterial, [{ p: point(s, u, y + 2.1), scale: [5.2, 4.2, 5] }], 'relay-hut');
    instances(this.group, boxGeometry, snowMaterial, [{ p: point(s, u, y + 4.4), scale: [5.8, .6, 5.7] }], 'relay-roof');
    instances(this.group, boxGeometry, glowMaterial, [{ p: point(s, u - 2.62, y + 2.4), scale: [.07, 1.1, 1.1] }], 'relay-window');
    const metal = [];
    for (const ds of [-2, 2]) for (const du of [-2, 2]) {
      const ground = snowHeight(s + ds, u + du) - 3;
      metal.push({ p: point(s + ds, u + du, (y + ground) / 2), scale: [.22, Math.max(.2, y - ground), .22] });
    }
    const towerY = snowHeight(s, u + 7) - 1;
    for (const du of [-1, 1]) for (const ds of [-1, 1]) metal.push({ p: point(s + ds, u + 7 + du, towerY + 8), scale: [.14, 16, .14] });
    for (let h = 2; h < 16; h += 3) metal.push({ p: point(s, u + 7, towerY + h), scale: [2.2, .15, 2.2] });
    metal.push({ p: point(s, u + 7, towerY + 17), scale: [.08, 5, .08] });
    instances(this.group, boxGeometry, metalMaterial, metal, 'summit-relay');
    instances(this.group, rockGeometry, edgeMaterial, [{ p: point(s, u + 5.8, towerY + 13), scale: [.25, 1.15, .8] }], 'relay-dish');
  }
  dispose() {
    this.group.removeFromParent(); for (const g of this.owned) g.dispose();
    this.group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
  }
}

export class SnowWorld {
  constructor(scene) {
    this.scene = scene; this.chunks = new Map(); this.origin = 0; this.center = null;
    this.effects = new THREE.Group(); this.effects.name = 'snow-night-effects'; scene.add(this.effects);
    // A fixed pool lights only nearby lamps, with no additional shadow maps.
    this.lights = Array.from({ length: 7 }, () => { const light = new THREE.PointLight('#ffb964', 240, 32, 2); this.effects.add(light); return light; });
    this.headlights = new THREE.Group(); this.effects.add(this.headlights);
    this.headlight = new THREE.SpotLight('#ffce85', 850, 45, .48, .65, 1.5);
    this.headlight.position.set(0, 1.2, -1.8); this.headlight.target.position.set(0, -.3, -27);
    this.headlights.add(this.headlight, this.headlight.target);
    this.snowfall = new Snowfall(); this.flakes = this.snowfall.points;
    this.flakeGeometry = this.snowfall.geometry; this.flakeMaterial = this.snowfall.material;
    this.effects.add(this.flakes); this.time = 0;
  }
  update(s) {
    this.s = s; this.origin = Math.floor(s / 1024) * 1024;
    const center = Math.floor(s / CHUNK_LENGTH);
    if (center !== this.center) {
      for (let i = center - 3; i <= center + 5; i++) if (!this.chunks.has(i)) { const chunk = new SnowChunk(i); this.chunks.set(i, chunk); this.scene.add(chunk.group); }
      for (const [i, chunk] of this.chunks) if (i < center - 3 || i > center + 5) { chunk.dispose(); this.chunks.delete(i); }
      this.center = center;
    }
    for (const chunk of this.chunks.values()) chunk.group.position.z = this.origin - chunk.start;
    const lampIndex = Math.round((s - 16) / LAMP_SPACING);
    this.lights.forEach((light, i) => {
      const lamp = lampAt(lampIndex + i - 3), p = snowPosition(lamp.s, 6.2, lamp.y - .35);
      light.position.set(p.x, p.y, p.z + this.origin);
      light.intensity = 240 * (1 - smoothstep(120, 174, Math.abs(lamp.s - s)));
    });
  }
  animate(time, vehicle) {
    this.time = time; riverClock.value = time;
    if (vehicle) { this.headlights.position.copy(vehicle.car.position); this.headlights.quaternion.copy(vehicle.car.quaternion); }
    const anchor = snowPosition(this.s, -35, snowRoadHeight(this.s));
    this.snowfall.update(time, anchor, this.origin);
  }
  dispose() {
    for (const chunk of this.chunks.values()) chunk.dispose(); this.chunks.clear(); this.effects.removeFromParent();
    this.snowfall.dispose();
  }
}

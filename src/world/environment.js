import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { CHUNK_LENGTH, TERRAIN_STEP, randomAt, seededRandom, roadFrame, coastOffset, shorelineOffset, terrainColumns, terrainCell, terrainVertex, positionAt, pondAt, pondRadius, ravineAmount, groundHeight, mountainHeight, bridgeAt, clamp, lerp, smoothstep } from './route.js';
import { createWaterMaterial, createSurfMaterial, createRockWashMaterial, animateWater } from './water.js';
import { buildLandmarks } from './landmarks.js';
import { CoastalBirds } from './birds.js';
import { coastalCrags, coastalPines, coastalCypress, terrainSampler } from './coastal-assets.js';

const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
const waterMaterial = createWaterMaterial();
const roadMaterial = new THREE.MeshStandardMaterial({ color: '#566369', roughness: 1 });
const shoulderMaterial = new THREE.MeshStandardMaterial({ color: '#d5c7a2', roughness: 1 });
const lineMaterial = new THREE.MeshStandardMaterial({ color: '#f3ecd2', roughness: 1 });
const centerMaterial = new THREE.MeshStandardMaterial({ color: '#e9cf88', roughness: 1 });
const foamMaterial = createSurfMaterial();
const rollingSurfMaterial = createSurfMaterial(true);
const rockWashMaterial = createRockWashMaterial();
const leavesMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });
const pineMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, roughness: 1 });
const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#78664a', roughness: 1 });
const rockMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });
const cragMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, roughness: .92 });
cragMaterial.onBeforeCompile = shader => {
  shader.vertexShader = 'varying float vStoneHeight;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
    vec4 stonePosition = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      stonePosition = instanceMatrix * stonePosition;
    #endif
    vStoneHeight = (modelMatrix * stonePosition).y;
    #include <project_vertex>
  `);
  shader.fragmentShader = 'varying float vStoneHeight;\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    diffuseColor.rgb *= mix(vec3(0.46, 0.57, 0.58), vec3(1.0), smoothstep(0.1, 2.5, vStoneHeight));
  `);
};
cragMaterial.customProgramCacheKey = () => 'coastal-tidal-stone-v1';
const postMaterial = new THREE.MeshStandardMaterial({ color: '#f4e9cd', roughness: 1 });
const trunkGeometry = new THREE.CylinderGeometry(.16, .25, 1, 5);
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
registerChunkResources('coast', { terrainMaterial, waterMaterial, roadMaterial, shoulderMaterial, lineMaterial, centerMaterial,
  foamMaterial, rollingSurfMaterial, rockWashMaterial, leavesMaterial, pineMaterial, trunkMaterial, rockMaterial, cragMaterial,
  postMaterial, capMaterial, grassMaterial, trunkGeometry, shrubGeometry, rockGeometry, postGeometry, capGeometry, grassGeometry,
  coastalPines, coastalCrags, coastalCypress });

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

function addRockWash(rock, phase, vertices, washCoords, shape = rockGeometry) {
  matrix.position.set(...rock.p); matrix.rotation.set(...rock.r); matrix.scale.set(...rock.scale); matrix.updateMatrix();
  const position = shape.attributes.position;
  const points = [];
  // Intersect the actual rotated, scaled rock with the water plane so the
  // foam touches its base, rather than sitting in a detached oval around it.
  for (let i = 0; i < position.count; i += 3) {
    const triangle = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(position, i + j).applyMatrix4(matrix.matrix));
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      if ((a.y > .12) === (b.y > .12)) continue;
      const p = a.clone().lerp(b, (.12 - a.y) / (b.y - a.y));
      if (!points.some(other => other.distanceToSquared(p) < .000001)) points.push(p);
    }
  }
  if (points.length < 3) return;
  const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
  points.sort((a, b) => Math.atan2(a.z - center.z, a.x - center.x) - Math.atan2(b.z - center.z, b.x - center.x));
  const pairs = points.map(p => {
    const outward = p.clone().sub(center).setY(0).normalize();
    const angle = Math.atan2(outward.z, outward.x);
    const width = (.5 + Math.sqrt(rock.scale[0]) * .55) * (1 - outward.x * .3) * (.85 + .2 * Math.sin(angle * 3 + phase));
    return [p.clone().addScaledVector(outward, -.25), p.clone().addScaledVector(outward, width)];
  });
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i], [c, d] = pairs[(i + 1) % pairs.length];
    for (const [p, edge] of [[a, 0], [c, 0], [b, 1], [b, 1], [c, 0], [d, 1]]) {
      vertices.push(p.x, .12, p.z); washCoords.push(edge, phase);
    }
  }
}

export class CoastalChunk {
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
    // Adjacent faces share expensive terrain samples. Release the cache once
    // this chunk is built, so long drives never accumulate cached terrain.
    const vertices = new Map();
    const vertex = (row, col) => {
      const key = `${row},${col}`;
      if (!vertices.has(key)) vertices.set(key, terrainVertex(row, col));
      return vertices.get(key);
    };
    const columns = terrainColumns(this.start).length;
    const meadow = new THREE.Color('#a0b856'), fern = new THREE.Color('#6b963d');
    const stone = new THREE.Color('#bdb4a0'), coolStone = new THREE.Color('#899394');
    const cliffStone = new THREE.Color('#c9bda6'), coolCliff = new THREE.Color('#768995');
    const stoneLight = new THREE.Vector3(-145, 230, 95).normalize();
    for (let row = firstRow; row < firstRow + CHUNK_LENGTH / TERRAIN_STEP; row++) {
      for (let col = 0; col < columns - 1; col++) {
        const seedCol = col > 8 ? col - 1 : col;
        terrainCell(row, col, vertex).forEach((tri, j) => {
          const r = randomAt(row * 2 + j, seedCol + 191);
          let color, meadowFace = false;
          const s = tri.reduce((sum, p) => sum + p.s, 0) / 3;
          const u = tri.reduce((sum, p) => sum + p.u, 0) / 3;
          const edgeA = new THREE.Vector3(tri[1].x - tri[0].x, tri[1].y - tri[0].y, tri[1].z - tri[0].z);
          const edgeB = new THREE.Vector3(tri[2].x - tri[0].x, tri[2].y - tri[0].y, tri[2].z - tri[0].z);
          const longestEdgeSq = Math.max(edgeA.lengthSq(), edgeB.lengthSq(), edgeA.clone().sub(edgeB).lengthSq());
          const normal = edgeA.cross(edgeB);
          const sliver = normal.length() < longestEdgeSq * .12;
          normal.normalize();
          if (normal.y < 0) normal.negate();
          const steep = Math.abs(normal.y) < .59;
          const y = tri.reduce((sum, p) => sum + p.y, 0) / 3;
          const meadowMix = .5 + .28 * Math.sin(s / 47 + u / 33) + .2 * Math.sin(s / 103 - u / 58);
          const shoreFace = col <= 6 || (ravineAmount(s, u) > .65 && u < 35);
          // Sand stays on low, gentle ground. Turf follows the shaped rim
          // shoulder; cliff sliver cleanup never reaches the inland meadow.
          const sandyFace = shoreFace && normal.y > .78 && Math.max(...tri.map(p => p.y)) < 3.5;
          const grassyLedge = tri.rimTurf && normal.y > .5 && !(sliver && normal.y < .7) && ravineAmount(s, u) < .12;
          const coastalRock = col >= 7 && col <= 9 && !grassyLedge;
          const grassyShelf = col >= 10 && col <= 11 && ravineAmount(s, u) < .12;
          const inlandRock = !grassyShelf && ((steep && u > coastOffset(s) - 10) || mountainHeight(s, u) > 22);
          if (sandyFace) {
            color = new THREE.Color('#e5d1a7').lerp(new THREE.Color('#b9b7a0'), 1 - smoothstep(-.3, 1.5, y));
          } else if (shoreFace || coastalRock || (!grassyLedge && (col <= 9 || inlandRock))) {
            if (col <= 10) {
              const exposure = clamp(normal.dot(stoneLight), 0, 1);
              const weathering = randomAt(Math.floor((s + y * .2) / 14), 1641);
              color = coolCliff.clone().lerp(cliffStone, smoothstep(.43, .88, exposure) * .78 + weathering * .18);
            } else {
              const exposure = .5 + .5 * Math.sin(s / 34 + y / 13);
              color = coolStone.clone().lerp(stone, smoothstep(2, 29, y) * .48 + exposure * .3 + r * .12);
              color.multiplyScalar(.95 + .055 * Math.sin(y * .5 + s / 31));
            }
          } else if (pondRadius(s, u) < 1.12) color = new THREE.Color('#a5b88d');
          else {
            meadowFace = true;
            color = fern.clone().lerp(meadow, clamp(meadowMix * .7 + r * .3, 0, 1));
          }
          // Let broad meadow patches carry the color, with quieter random
          // variation so the flat-shaded slopes still define the facets.
          color.multiplyScalar(meadowFace ? .945 + r * .11 : col > 9 && !steep ? .9 + r * .2 : .965 + r * .07);
          addTriangle(positions, colors, ...tri, color, this.start);
        });
      }
    }
    this.terrain = this.addMesh(geometryFrom(positions, colors), terrainMaterial, true);
    this.sampleGround = terrainSampler(this.terrain);
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
        const depth = clamp((shorelineOffset(s) - u) / 135, 0, 1);
        const color = new THREE.Color('#55c8bd').lerp(new THREE.Color('#176880'), Math.pow(depth, .7));
        color.multiplyScalar(.96 + randomAt(row * 2 + t, col + 819) * .08);
        addTriangle(positions, colors, ...tri, color, this.start);
      });
    }
    const ocean = this.addMesh(geometryFrom(positions, colors), waterMaterial);
    ocean.name = 'animated-ocean'; ocean.geometry.boundingSphere.radius += .5;
    for (let line = 0; line < 4; line++) {
      const foam = [], flow = [], edges = [];
      for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
        if (ravineAmount(s, 0) > .15) continue;
        if (line > 0 && randomAt(Math.floor(s / 6), line + 19) > .8) continue;
        const offset = line === 0 ? 0 : 12;
        const width = line === 0 ? 2.1 + Math.sin(s * .31) * .7 : 1.5 + Math.sin(s * .18 + line) * .7;
        const at = (t, du) => positionAt(t, shorelineOffset(t) - offset + Math.sin(t * .21 + line) * .65 + du, .17);
        const a = at(s, 0), b = at(s + 2, 0), c = at(s, -width), d = at(s + 2, -width);
        a.edge = b.edge = 0; c.edge = d.edge = 1;
        for (let triangle of [[a, c, b], [b, c, d]]) {
          const [p, q, r] = triangle;
          if ((q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z) < 0) triangle = [p, r, q];
          for (const v of triangle) { foam.push(v.x, v.y, v.z + this.start); edges.push(v.edge); }
        }
        for (let vertex = 0; vertex < 6; vertex++) flow.push(1, 0, line / 3);
      }
      const geo = geometryFrom(foam);
      geo.setAttribute('surfEdge', new THREE.Float32BufferAttribute(edges, 1));
      if (line > 0) geo.setAttribute('surfFlow', new THREE.Float32BufferAttribute(flow, 3));
      geo.boundingSphere.radius += 12;
      const surf = this.addMesh(geo, line === 0 ? foamMaterial : rollingSurfMaterial);
      surf.name = line === 0 ? 'shore-wash' : 'rolling-breakers';
    }
  }
  ribbon(ranges, lift, material, dashed = false) {
    const positions = [];
    for (const [low, high] of ranges) for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      if (dashed && Math.floor(s / 4) % 3 === 2) continue;
      const point = (t, u) => { const f = roadFrame(t); return positionAt(t, u, f.y + lift); };
      const a = point(s, low), b = point(s + 2, low), c = point(s, high), d = point(s + 2, high);
      addTriangle(positions, null, a, b, c, null, this.start); addTriangle(positions, null, b, d, c, null, this.start);
    }
    this.addMesh(geometryFrom(positions), material);
  }
  buildRoad() {
    this.ribbon([[-6.25, 6.25]], .045, shoulderMaterial);
    this.ribbon([[-5.5, 5.5]], .075, roadMaterial);
    // Matching markings share geometry and a draw call within each chunk.
    this.ribbon([[-5.05, -4.89], [4.89, 5.05]], .09, lineMaterial);
    this.ribbon([[-.15, -.055], [.055, .15]], .093, centerMaterial);
  }
  buildScenery() {
    const random = seededRandom(this.index + 8913);
    const trunks = [], foliage = [[], []], shrubs = [], rocks = [], posts = [], caps = [], grasses = [], cypresses = [], stacks = [[], [], []];
    const rockWashVertices = [], rockWashCoords = [];
    const canGrow = (s, u) => pondRadius(s, u) > 1.15 && ravineAmount(s, u) < .13 && groundHeight(s, u) > 2;
    const green = ['#315b4c', '#3b6850', '#436c4e', '#285343', '#527952', '#38604a'];
    const bushColors = ['#668c4b', '#7d9b54', '#587d4c', '#8ba65e'];
    const rockColors = ['#b9b9ad', '#c9bda8', '#aab6b4', '#c1bcac'];
    const planted = (s, u) => {
      const p = positionAt(s, u);
      p.y = this.sampleGround(p.x, p.z + this.start) ?? p.y;
      return p;
    };
    for (let i = 0; i < 340; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      let u = 12 + random() ** .8 * 162;
      if (i < 13) u = lerp(coastOffset(s) + 4, -10, random());
      const grove = .5 + .3 * Math.sin(s / 30 + u / 26) + .2 * Math.sin(s / 71 - u / 19);
      if ((grove < .35 || random() > .12 + grove) && i >= 13) continue;
      if (!canGrow(s, u) || mountainHeight(s, u) > 24) continue;
      const p = planted(s, u); const size = (4.8 + random() * 6.3) * (u < 0 ? .72 : 1);
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
      foliage[i % 2].push({ p: [p.x, y, p.z + this.start], scale: [size, size, size], r: [0, rotation, 0], color });
    }
    for (let i = 0; i < 86; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const u = i < 42 ? lerp(coastOffset(s) + 1.7, -8.5, random()) : 9.5 + random() * 91;
      if (!canGrow(s, u)) continue;
      const p = planted(s, u); const size = .65 + random() * 1.8;
      shrubs.push({ p: [p.x, p.y + size * .43, p.z + this.start], scale: [size, size * .7, size * .86], r: [0, random() * 6, .15], color: bushColors[Math.floor(random() * bushColors.length)] });
      if (i % 4 === 0) shrubs.push({ p: [p.x + size * .72, p.y + size * .25, p.z + this.start + .4], scale: [size * .65, size * .5, size * .7], color: '#94a961' });
    }
    for (let i = 0; i < 52; i++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const sea = i < 25;
      // A few larger silhouettes and small companions leave breathing room in
      // the open water, instead of a field of equally prominent boulders.
      if (sea && i % 6 > 1) continue;
      const u = sea ? shorelineOffset(s) - 4 - random() ** 1.7 * 71 : (i < 35 ? coastOffset(s) + random() * 5 : 12 + random() * 140);
      if (!sea && !canGrow(s, u)) continue;
      const p = planted(s, u);
      const size = sea ? (i % 6 === 0 ? 4.4 + random() * 3.2 : .8 + random() * 2.2) : .7 + random() * 3.1;
      const height = size * (1.1 + random() * .9);
      const rock = { p: [p.x, sea ? -.8 + height * .3 : p.y + height * .28, p.z + this.start], scale: [size, height, size * (.6 + random() * .6)], r: [random() * .25, random() * 6, random() * .4], color: rockColors[Math.floor(random() * rockColors.length)] };
      if (sea) {
        const variant = Math.floor(i / 3) % 3;
        stacks[variant].push(rock);
        addRockWash(rock, randomAt(this.index, i + 503) * Math.PI * 2, rockWashVertices, rockWashCoords, coastalCrags[variant]);
        if (i % 6 === 0) for (let companion = 0; companion < 2; companion++) {
          // A shared fracture direction and overlapping feet make these read
          // as shoulders broken from the stack, not evenly orbiting pebbles.
          const angle = rock.r[1] + .7 + companion * 2.5 + randomAt(this.index * 31 + i, 614 + companion) * .5;
          const small = size * (companion === 0 ? .46 : .29);
          const radius = size * (companion === 0 ? .83 : 1.07);
          const satellite = { p: [p.x + Math.cos(angle) * radius, -.3 + small * .16, p.z + this.start + Math.sin(angle) * radius],
            scale: [small, small * (companion === 0 ? 1.65 : 1.05), small * .82],
            r: [.08, rock.r[1] + companion * .35, companion === 0 ? -.18 : .22], color: rock.color };
          const shape = (variant + companion + 1) % coastalCrags.length;
          stacks[shape].push(satellite);
          addRockWash(satellite, angle, rockWashVertices, rockWashCoords, coastalCrags[shape]);
        }
      } else rocks.push(rock);
    }
    // Substantial slabs collect beneath eroded sections, with smaller fragments
    // spreading toward the beach. Their buried bases merge into the cliff toe.
    const fallRandom = seededRandom(this.index + 68134);
    for (let pile = 0; pile < 3; pile++) {
      const center = this.start + 14 + pile * 36 + fallRandom() * 12;
      if (ravineAmount(center, coastOffset(center) - 14) > .1) continue;
      for (let piece = 0; piece < 12; piece++) {
        const large = piece < 3;
        const s = center + (fallRandom() - .5) * (large ? 12 : 23);
        const u = coastOffset(s) - (large ? 13.5 : 15) - fallRandom() * (large ? 3 : 6);
        const p = planted(s, u);
        if (p.y < .6 || p.y > 4 || ravineAmount(s, u) > .12) continue;
        const size = large ? 2.7 + fallRandom() * 3.1 : .5 + fallRandom() * 1.9;
        const height = size * (large ? .6 + fallRandom() * .45 : .4 + fallRandom() * .35);
        const rock = { p: [p.x, p.y + height * .12, p.z + this.start],
          scale: [size, height, size * (.65 + fallRandom() * .5)],
          r: [(fallRandom() - .5) * .6, fallRandom() * Math.PI * 2, (fallRandom() - .5) * .65],
          color: rockColors[Math.floor(fallRandom() * rockColors.length)] };
        const variant = (pile + piece) % coastalCrags.length;
        stacks[variant].push(rock);
        if (large) addRockWash(rock, pile + piece, rockWashVertices, rockWashCoords, coastalCrags[variant]);
      }
    }
    if (rockWashVertices.length) {
      const geometry = geometryFrom(rockWashVertices);
      geometry.setAttribute('rockWash', new THREE.Float32BufferAttribute(rockWashCoords, 2));
      geometry.boundingSphere.radius += .5;
      this.addMesh(geometry, rockWashMaterial).name = 'sea-stack-wash';
    }
    // Small cream and golden wildflower patches share the shrub instance batch.
    for (let patch = 0; patch < 16; patch++) {
      const s = this.start + random() * CHUNK_LENGTH;
      const u = patch % 2 ? 10 + random() * 20 : lerp(coastOffset(s) + 3, -9, random());
      if (!canGrow(s, u)) continue;
      for (let flower = 0; flower < 6; flower++) {
        const t = s + (random() - .5) * 3, v = u + (random() - .5) * 2;
        const p = planted(t, v);
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
    // Small scree fans and grass pockets follow the actual ground facets.
    const detailRandom = seededRandom(this.index + 45192);
    const grounded = (s, u) => {
      const p = planted(s, u);
      const slope = Math.abs(groundHeight(s, u + 1) - groundHeight(s, u - 1)) / 2;
      return slope < 1.7 ? new THREE.Vector3(p.x, p.y, p.z + this.start) : null;
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
    // Wind-shaped cypresses punctuate the headlands; their broad, leaning
    // crowns contrast with the taller inland fir groves.
    for (let i = 0; i < 3; i++) {
      const s = this.start + 8 + detailRandom() * 112;
      const u = lerp(coastOffset(s) + 6, -13, detailRandom());
      if (!canGrow(s, u) || u > -11) continue;
      const p = planted(s, u), size = 5.5 + detailRandom() * 3;
      cypresses.push({ p: [p.x, p.y - .12, p.z + this.start], scale: [size, size, size], r: [0, -.5 + detailRandom(), 0], color: '#547b50' });
    }
    // Reeds and low bank stones soften the pond's transition into the meadow.
    const pond = pondAt(this.start + CHUNK_LENGTH / 2);
    for (let i = 0; i < 64; i++) {
      const angle = i / 64 * Math.PI * 2;
      const shape = 1 + .09 * Math.sin(angle * 3 + pond.index) + .045 * Math.sin(angle * 5);
      const s = pond.center + Math.cos(angle) * pond.rs * shape * 1.1;
      const u = pond.u + Math.sin(angle) * pond.ru * shape * 1.1;
      if (s < this.start || s >= this.start + CHUNK_LENGTH || randomAt(pond.index, i + 819) < .35) continue;
      const p = planted(s, u);
      if (p.y < pond.level + .05 || p.y > pond.level + 3) continue;
      const size = .8 + randomAt(pond.index, i + 820) * .8;
      grasses.push({ p: [p.x, p.y, p.z + this.start], scale: [size, size * 1.6, size], r: [0, angle, 0], color: i % 3 ? '#677e45' : '#a6a06c' });
      if (i % 5 === 0) rocks.push({ p: [p.x + .6, p.y, p.z + this.start], scale: [size, size * .48, size * .8], r: [0, angle, 0], color: '#99a399' });
    }
    makeInstances(this.group, trunkGeometry, trunkMaterial, trunks);
    coastalPines.forEach((shape, i) => { const mesh = makeInstances(this.group, shape, pineMaterial, foliage[i]); if (mesh) mesh.name = 'coastal-firs'; });
    makeInstances(this.group, coastalCypress.bark, trunkMaterial, cypresses.map(({ color, ...item }) => item));
    const cypress = makeInstances(this.group, coastalCypress.leaves, leavesMaterial, cypresses);
    if (cypress) cypress.name = 'headland-cypresses';
    coastalCrags.forEach((shape, i) => { const mesh = makeInstances(this.group, shape, cragMaterial, stacks[i]); if (mesh) mesh.name = 'tidal-sea-stacks'; });
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
  constructor(scene, chunkSource = null) { this.scene = scene; this.chunkSource = chunkSource; this.chunks = new Map(); this.origin = 0; this.center = null; }
  update(s) {
    const center = Math.floor(s / CHUNK_LENGTH);
    this.origin = Math.floor(s / 1024) * 1024;
    if (center !== this.center) {
      // Both directions are retained. Streaming begins well outside the visible area.
      for (let i = center - 3; i <= center + 5; i++) {
        if (!this.chunks.has(i)) { const chunk = this.chunkSource?.take(i) ?? new CoastalChunk(i); this.chunks.set(i, chunk); this.scene.add(chunk.group); }
      }
      for (const [i, chunk] of this.chunks) if (i < center - 3 || i > center + 5) { this.chunkSource?.retain(i, chunk); chunk.dispose(); this.chunks.delete(i); }
      this.center = center;
      this.chunkSource?.prefetch(center, this.chunks);
    }
    for (const chunk of this.chunks.values()) chunk.group.position.z = this.origin - chunk.start;
  }
  animate(time) {
    animateWater(time, this.origin);
    for (const chunk of this.chunks.values()) chunk.birds?.update(time);
  }
  dispose() { this.chunkSource?.dispose(); for (const chunk of this.chunks.values()) chunk.dispose(); this.chunks.clear(); }
}

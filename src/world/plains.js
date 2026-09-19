import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { finalizeChunkTransforms } from './chunk-transforms.js';
import { splitBatch } from './instance-batches.js';
import { updateResidentChunks } from './resident.js';
import { CHUNK_LENGTH, randomAt, seededRandom, smoothstep, lerp, positionAt, roadFrame } from './route.js';
import { PLAINS_STEP, PLAINS_COLUMNS, PLAINS_COLUMN_COUNT, ROAD_RESERVE, plainsVertex, plainsRowStep, plainsPosition, plainsRoadHeight, plainsGroundHeight,
  plainsCreekAt, creekCenterS, creekDistance, CREEK_WATER_HALF_WIDTH, BRIDGE_HALF_LENGTH, fieldAt, fieldRowAt, fieldBoundary, fieldBands,
  rowBoundaryKind, bandBoundaryKind, roadsideFence, farmGate, fieldCorner, pondsNear, pondDistance, headlandDistance } from './plains-route.js';
import { createWaterMaterial, animateWater } from './water.js';
import { terrainSampler } from './coastal-assets.js';
import { plainsTrees, baleGeometry, squareBaleGeometry, cowGeometry, rushGeometry, stalkGeometry, wheatGeometry, crowGeometry, crowMaterial } from './plains-assets.js';
import { plainsDiscoveries, plainsDiscoveryClears } from './plains-discoveries.js';
import { plainsDiscoveryAssets, plainsDiscoveryMaterial } from './plains-discovery-assets.js';
import { buildPlainsDiscoveries } from './plains-discovery-scenery.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, ...extra });
const terrainMaterial = material('#ffffff', { vertexColors: true });
// Furrows and headlands are drawn in the fragment shader over the flat facets:
// each terrain vertex carries the field's own coordinate across its rows, how
// deep the rows are cut, and how far it stands from a fenced boundary. Rows
// at the facet size read as coarse stripes; these are metres apart, straight,
// and fade to the field's flat colour where they would alias.
const headlandTint = new THREE.Color('#c4ac7d');
terrainMaterial.onBeforeCompile = shader => {
  shader.vertexShader = 'attribute vec3 furrow;\nvarying vec3 vFurrow;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurrow = furrow;');
  shader.fragmentShader = 'varying vec3 vFurrow;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    float furrowEdge = min(fwidth(vFurrow.x) * 1.4, 0.5);
    float furrowRidge = smoothstep(0.5 - furrowEdge, 0.5 + furrowEdge, abs(fract(vFurrow.x) - 0.5) * 2.0);
    diffuseColor.rgb *= 1.0 + vFurrow.y * (furrowRidge - 0.5) * 2.0;
    float headland = 1.0 - smoothstep(1.7, 3.4, vFurrow.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${headlandTint.r.toFixed(4)}, ${headlandTint.g.toFixed(4)}, ${headlandTint.b.toFixed(4)}), headland * 0.8);
  `);
};
terrainMaterial.customProgramCacheKey = () => 'plains-fields-v1';
const roadMaterial = material('#6b6a64', { roughness: .95, flatShading: false });
const shoulderMaterial = material('#c9b88f', { flatShading: false });
const edgeMaterial = material('#f0e9d4', { flatShading: false });
const centerMaterial = material('#e6c04a', { flatShading: false });
const dirtMaterial = material('#ffffff', { vertexColors: true, flatShading: false, side: THREE.DoubleSide });
const waterMaterial = createWaterMaterial(true);
const leavesMaterial = material('#ffffff', { vertexColors: true });
const barkMaterial = material('#6a563f');
const shrubMaterial = material('#ffffff');
const strawMaterial = material('#ffffff', { vertexColors: true });
const timberMaterial = material('#74603f');
const poleMaterial = material('#6e5c45');
const wireMaterial = material('#3f3c36', { flatShading: false });
// Fence rails are weathered timber, not the near-black of an overhead wire,
// which at driving zoom turned every boundary into a line of harsh specks.
const railMaterial = material('#7f6946', { flatShading: false });
const metalMaterial = material('#8e948f', { metalness: .15 });
const concreteMaterial = material('#bcb7a8');
// Signs, rails and field stones carry their own instance colours.
const paintedMaterial = material('#ffffff');
const hideMaterial = material('#ffffff', { vertexColors: true });
const rushMaterial = material('#ffffff', { side: THREE.DoubleSide });
// The fringe carries its shading in its vertex colours, which the
// per-instance tint multiplies. Both sides of every blade are real geometry,
// so this stays single sided.
const fringeMaterial = material('#ffffff', { vertexColors: true });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const poleGeometry = new THREE.CylinderGeometry(.85, 1, 1, 6);
const shrubGeometry = new THREE.IcosahedronGeometry(1, 0);
const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
registerChunkResources('plains', { terrainMaterial, roadMaterial, shoulderMaterial, edgeMaterial, centerMaterial, dirtMaterial, waterMaterial, leavesMaterial,
  barkMaterial, shrubMaterial, strawMaterial, timberMaterial, poleMaterial, wireMaterial, railMaterial, metalMaterial, concreteMaterial, paintedMaterial, hideMaterial, rushMaterial, boxGeometry, poleGeometry, shrubGeometry, plainsTrees, baleGeometry, squareBaleGeometry, cowGeometry, rushGeometry, stalkGeometry, wheatGeometry, fringeMaterial, crowGeometry, crowMaterial });

function geometry(vertices, colors, furrows) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (furrows) g.setAttribute('furrow', new THREE.Float32BufferAttribute(furrows, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function triangle(vertices, colors, a, b, c, color, start, furrows, furrowAt) {
  if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) < 0) [b, c] = [c, b];
  for (const p of [a, b, c]) {
    vertices.push(p.x, p.y, p.z + start);
    // A point may carry its own colour, so a gradient across a strip survives
    // the winding swap above.
    if (colors) { const tint = p.color ?? color; colors.push(tint.r, tint.g, tint.b); }
    if (furrows) furrows.push(...furrowAt(p));
  }
}
function instances(group, geo, mat, items, name, shadows = true, occlusion = true) {
  if (!items.length) return;
  for (const part of splitBatch(items)) {
    const mesh = new THREE.InstancedMesh(geo, mat, part.length); mesh.name = name;
    if (!occlusion) mesh.userData.ambientOcclusion = false;
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
  wheat: ['#e5b53d', '#eebf46', '#dcaa36'], stubble: ['#dcc272', '#e3c97a', '#d3b866'], ploughed: ['#a8734d', '#b07b53', '#9f6a45'],
  pasture: ['#86b03e', '#8fb844', '#7da739'], hay: ['#cfc25a', '#d6c860', '#c5b852'],
};
// How the rows are cut in each crop: metres between furrows, and how much
// darker the trough is than the ridge. Pasture is not worked.
const FURROWS = { wheat: [2.2, .08], stubble: [3, .09], ploughed: [1.7, .13], pasture: [4, 0], hay: [4.5, .07] };
const NO_FURROW = () => [0, 0, 99];
const gravel = new THREE.Color('#c1b088'), verge = new THREE.Color('#9aad4f'), ditch = new THREE.Color('#7a9a43'), lush = new THREE.Color('#7aa34d'), mud = new THREE.Color('#8a7c58');
// The far fields fade into the same gold the horizon haze carries.
const haze = new THREE.Color('#dcb771'), pastureLight = new THREE.Color('#a3b84c');
// A dirt track across a field: two ruts worn down to darker earth, the crown
// the wheels miss, and edges pale with the dust thrown off them.
const dirtBase = new THREE.Color('#c0a778'), dirtRut = new THREE.Color('#a3885e'), dirtCrown = new THREE.Color('#cdb98d'), dirtEdge = new THREE.Color('#c6b082');
// Where a track meets the highway it runs out onto the gravel, so its mouth
// takes the shoulder's own colour and the join has no line across it.
const dirtApron = new THREE.Color('#c9b88f');
// The spruces and cypresses are the dark trees of the country, but only by
// a step: a green much deeper than this took no light on its shaded side
// and stood among the crowns as a black shape, worst on a phone's screen.
const CONIFER_GREENS = ['#4c7c3e', '#427037', '#558544'], CYPRESS_GREENS = ['#457a3c', '#4c8042', '#3f7137'];
// Only two kinds of ground grow a fringe, and each grows its own: long
// grass in the green fields and the verge, standing wheat at the edge of a
// grain field. A mown or ploughed field is bare to its boundary.
const GRASS_TINTS = { pasture: ['#8fae48', '#9db84f'], verge: ['#9bab4c', '#8da144'] };
const WHEAT_TINTS = ['#d9a93a', '#e3b545', '#d2a235'];

export class PlainsChunk {
  constructor(index) {
    this.index = index; this.start = index * CHUNK_LENGTH; this.group = new THREE.Group(); this.group.name = `plains-chunk-${index}`; this.owned = [];
    this.features = { discoveries: [] };
    // A row of turbines reaches well past its own district anchor.
    this.discoveries = plainsDiscoveries(this.start - 160, this.start + CHUNK_LENGTH + 160);
    this.scenery = { posts: [], wires: [], rails: [], poles: [], shrubs: [], bales: [], squareBales: [], boxes: [], painted: [], cows: [], rushes: [], grass: [], wheat: [], dirtTints: [], farLumps: [], concrete: [], sheds: [], tanks: [], bark: new Map(), leaves: new Map(), dirt: [] };
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
    const vertices = [], colors = [], furrows = [], cache = new Map();
    const vertex = (row, col) => {
      const key = `${row},${col}`;
      if (!cache.has(key)) cache.set(key, plainsVertex(row, col));
      return cache.get(key);
    };
    for (let row = this.start / PLAINS_STEP; row < (this.start + CHUNK_LENGTH) / PLAINS_STEP; row += plainsRowStep(row)) {
      const next = row + plainsRowStep(row);
      for (let col = 0; col < PLAINS_COLUMN_COUNT - 1; col++) {
        const a = vertex(row, col), b = vertex(next, col), c = vertex(row, col + 1), d = vertex(next, col + 1);
        // A checkerboard of diagonals reads as herringbone wherever the
        // vertices are not jittered, which is the whole road reserve. Hash the
        // choice out in the fields, and keep one consistent diagonal across the
        // reserve so the verge and ditch read as smooth bands beside the road.
        const reserve = Math.abs(PLAINS_COLUMNS[col] + PLAINS_COLUMNS[col + 1]) / 2 < ROAD_RESERVE;
        const tris = reserve || randomAt(Math.round(row * 2), col + 2805) > .5 ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]];
        tris.forEach((tri, i) => {
          const shade = this.facetShade(tri, row, col, i);
          triangle(vertices, colors, ...tri, shade.color, this.start, furrows, shade.furrow);
        });
      }
    }
    this.terrain = this.addMesh(geometry(vertices, colors, furrows), terrainMaterial, 'plains-fields', true);
    this.sampleGround = terrainSampler(this.terrain);
  }
  // A facet's flat colour, and the per-vertex furrow data the shader draws
  // over it: the field's coordinate across its rows in furrow widths, the
  // depth of the rows, and the distance to the nearest fenced boundary.
  facetShade(tri, row, col, i) {
    const s = tri.reduce((sum, p) => sum + p.s, 0) / 3, u = tri.reduce((sum, p) => sum + p.u, 0) / 3;
    const facet = randomAt(Math.round(row * 2) * 2 + i, col + 2801);
    const d = creekDistance(s, u);
    // Beside the road the columns are fixed, so a colour taken at the triangle's
    // own centroid differs between the two halves of one rectangular cell and
    // the ditch gradient turns into a zigzag. Shade those cells as a whole.
    const cellCross = Math.abs(PLAINS_COLUMNS[col] + PLAINS_COLUMNS[col + 1]) / 2;
    const inReserve = cellCross < ROAD_RESERVE;
    const cross = inReserve ? cellCross : Math.abs(u);
    let color, furrow = NO_FURROW;
    if (cross < 7.2) color = gravel.clone();
    else if (cross < 8.6) color = gravel.clone().lerp(verge, .5);
    else if (inReserve) {
      // Mown verge either side of a shallow grassy ditch, varying along the
      // road rather than across it, so the strip never reads as a pattern.
      color = verge.clone().lerp(ditch, 1 - smoothstep(0, 2.4, Math.abs(cross - 10.8)));
      color.multiplyScalar(.98 + .04 * (.5 + .5 * Math.sin(s / 23 + col)));
    }
    else {
      const field = fieldAt(s, u) ?? fieldAt(s, Math.sign(u) * (ROAD_RESERVE + 1)), palette = CROP_PALETTES[field.kind];
      color = new THREE.Color(palette[Math.floor(randomAt(field.seed, field.salt + 5) * palette.length)]);
      if (field.kind === 'pasture') color.lerp(pastureLight, smoothstep(.3, .8, .5 + .3 * Math.sin(s / 37 + u / 29) + .2 * Math.sin(s / 13 - u / 17)) * .5);
      color.lerp(haze, smoothstep(280, 430, cross) * .7);
      // Rows run along the road or across it, from the field's own edge, and
      // give way to the wet meadow at the creek and the ponds and to the haze.
      const [period, depth] = FURROWS[field.kind];
      let dry = smoothstep(6.5, 11, d) * (1 - smoothstep(280, 430, cross));
      if (cross > 40 && cross < 220) dry *= smoothstep(1.1, 1.6, pondDistance(s, u).d);
      const along = field.rows !== 'across';
      furrow = p => [(along ? Math.abs(p.u) - field.from : p.s - field.start) / period, depth * dry, headlandDistance(p.s, p.u, field)];
    }
    // Wet meadow along the creek and around the ponds, and bare mud under the water.
    if (d < 9.5) color.lerp(lush, (1 - smoothstep(6, 9.5, d)) * .85);
    if (cross > 40 && cross < 220) {
      const pond = pondDistance(s, u);
      if (pond.d < 1.6) color.lerp(lush, 1 - smoothstep(1.1, 1.6, pond.d));
      if (pond.d < .85) color.lerp(mud, 1 - smoothstep(.7, .85, pond.d));
    }
    if (d < 5.4) color.lerp(mud, 1 - smoothstep(4.6, 5.4, d));
    return { color: color.multiplyScalar(inReserve ? 1 : .985 + facet * .03), furrow };
  }
  ribbon(ranges, lift, mat, name, skip = null) {
    const vertices = [];
    for (const [low, high] of ranges) for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 2) {
      if (skip?.(s)) continue;
      const at = (t, u) => plainsPosition(t, u, plainsRoadHeight(t) + lift);
      const a = at(s, low), b = at(s + 2, low), c = at(s, high), d = at(s + 2, high);
      triangle(vertices, null, a, b, c, null, this.start); triangle(vertices, null, b, d, c, null, this.start);
    }
    this.addMesh(geometry(vertices), mat, name);
  }
  buildRoad() {
    this.ribbon([[-6.9, 6.9]], .045, shoulderMaterial, 'gravel-shoulders');
    this.ribbon([[-5.5, 5.5]], .075, roadMaterial, 'plains-road');
    this.ribbon([[-5.05, -4.89], [4.89, 5.05]], .09, edgeMaterial, 'road-edges');
    // One broken centre line, four metres of paint to four of gap, as a
    // two-lane country highway carries; the segments start on the chunk
    // seam, so the pattern runs on unbroken from one chunk to the next.
    this.ribbon([[-.15, .15]], .093, centerMaterial, 'center-lines', s => Math.floor(s / 2) % 4 >= 2);
  }
  // A dirt track from the road edge out across the fields: a band of bare
  // earth worn into two wheel ruts, wandering as it crosses the field, and
  // flaring into a mouth where it meets the shoulder, the way a farm
  // entrance opens out so a tractor can swing in off the highway.
  track(s, side, toCross, fromCross = 5.8) {
    if (toCross <= fromCross + 4) return;
    const salt = Math.round(s * 4) + (side > 0 ? 3301 : 3302), step = 2.5;
    // Where the track's middle runs, and how wide the bare earth is there.
    // The wander eases between one waypoint and the next rather than stepping
    // to it, so the track curves instead of turning a corner every few paces.
    const drift = cross => {
      const t = cross / 13, cell = Math.floor(t), f = t - cell;
      const wander = lerp(randomAt(cell, salt) - .5, randomAt(cell + 1, salt) - .5, f * f * (3 - 2 * f));
      return wander * 2.8 * smoothstep(fromCross + 4, fromCross + 30, cross);
    };
    const half = cross => (1.5 + .3 * Math.sin(cross / 8 + salt))
      * (1 + 1.2 * (1 - smoothstep(fromCross, fromCross + 8, cross)))
      * (1 - .35 * smoothstep(toCross - 9, toCross, cross));
    // Across the band: a pale edge, a worn rut, the crown between the wheels,
    // and the same again on the other side. The ruts fade out into the mouth,
    // where the traffic fans out rather than running in two lines.
    const across = [-1, -.6, -.28, .28, .6, 1], tints = [dirtEdge, dirtRut, dirtCrown, dirtCrown, dirtRut, dirtEdge];
    const tintAt = (tint, cross) => tint.clone().lerp(dirtApron, 1 - smoothstep(fromCross + 1, fromCross + 7, cross));
    for (let cross = fromCross; cross < toCross - .01; cross += step) {
      const next = Math.min(cross + step, toCross);
      const w0 = half(cross), w1 = half(next), c0 = drift(cross), c1 = drift(next);
      for (let i = 0; i < across.length - 1; i++) {
        this.dirtQuad([[s + c0 + across[i] * w0, side * cross], [s + c0 + across[i + 1] * w0, side * cross],
          [s + c1 + across[i] * w1, side * next], [s + c1 + across[i + 1] * w1, side * next]],
          [tintAt(tints[i], cross), tintAt(tints[i + 1], cross), tintAt(tints[i], next), tintAt(tints[i + 1], next)]);
      }
    }
  }
  // Yards for the farm compounds: the same earth, laid flat.
  dirtPatch(s, u, halfS, halfU) {
    for (let ds = -halfS; ds < halfS; ds += 3) for (let du = -halfU; du < halfU; du += 3) {
      const es = Math.min(ds + 3, halfS), eu = Math.min(du + 3, halfU);
      this.dirtQuad([[s + ds, u + du], [s + es, u + du], [s + ds, u + eu], [s + es, u + eu]]);
    }
  }
  dirtQuad(corners, shades = null) {
    const [a, b, c, d] = corners.map(([s, u], i) => {
      const p = this.ground(s, u);
      return { x: p.x, y: p.y + .07, z: p.z - this.start, color: shades ? shades[i] : dirtBase };
    });
    const { dirt, dirtTints } = this.scenery;
    triangle(dirt, dirtTints, a, b, c, dirtBase, this.start); triangle(dirt, dirtTints, b, d, c, dirtBase, this.start);
  }
  buildCreek() {
    const creek = plainsCreekAt(this.start + CHUNK_LENGTH / 2);
    if (Math.abs(creek.center - this.start - CHUNK_LENGTH / 2) > CHUNK_LENGTH / 2 + 150) return;
    // The creek is the same water as the ponds, a little greener for being
    // shallow; a grey-green ribbon read as a ditch against their blue.
    const vertices = [], colors = [], shallow = new THREE.Color('#6a9cb0'), deep = new THREE.Color('#487a94');
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
    const random = seededRandom(this.index + 27113), { posts, wires, poles, shrubs, bales, squareBales, boxes } = this.scenery;
    const hedgeGreens = ['#46722f', '#4f7a35', '#3d672b', '#557f3a'], strawTints = ['#d9b566', '#d1ab5c', '#dfbc6d'];
    const cypressGreens = CYPRESS_GREENS;
    const oakGreens = ['#587f3a', '#4d7434', '#65883f', '#43682e'], poplarGreens = ['#5f8a3b', '#6a9542', '#547d34'], willowGreens = ['#7f9c4a', '#8aa552', '#73923f'];
    // Boundary belts carry the widest spread of greens, with a few dark
    // conifers among them so the line is not one flat mass of the same tone.
    const lineGreens = ['#5d8a39', '#6b9942', '#4f7c32', '#76a54a', '#598136', '#6fa03f'];
    const coniferGreens = CONIFER_GREENS;
    const clear = (s, u, r = 1) => this.clearAt(s, u, r);
    const stone = ['#a9a496', '#9b9789', '#b5b0a3', '#8f8b80'];
    const inChunk = s => s >= this.start && s < this.start + CHUNK_LENGTH;
    // The terrain's edge rows are jittered, so a point right on the seam may
    // have no facet under it; a freely placed tree keeps a step inside.
    const inside = s => s >= this.start + 2 && s < this.start + CHUNK_LENGTH - 2;
    const beam = (list, a, b, width, color) => this.beam(list, a, b, width, color);
    const fence = points => this.fence(points);
    // A clipped hedge: overlapping scrub that reads as one continuous line.
    const hedge = points => {
      for (const point of points) {
        if (point.own === false || !clear(point.s, point.u, 1)) continue;
        const p = this.ground(point.s + (random() - .5) * .5, point.u + (random() - .5) * .5), size = 1.5 + random() * .8;
        shrubs.push({ p: [p.x, p.y + size * .28, p.z], scale: [size, size * .82, size * 1.05], r: [0, random() * 6.28, 0], color: hedgeGreens[Math.floor(random() * hedgeGreens.length)] });
      }
    };
    // A treed boundary instead: trees standing over low scrub, which is what
    // carries the country at driving zoom; a row of small beads did not.
    const treeLine = (points, near) => {
      let sinceTree = 99;
      for (const point of points) {
        if (point.own === false || !clear(point.s, point.u, 1)) continue;
        const jitter = (random() - .5) * 1.4;
        const s = point.s + jitter, u = point.u + (random() - .5) * 1.8;
        sinceTree += 1;
        // Trees every few metres, with scrub filling the gaps between them.
        if (sinceTree >= 2 && random() < .72 && inside(s) && clear(s, u, 2.5)) {
          sinceTree = 0;
          const tall = near ? 7 : 9;
          const height = tall + random() * (near ? 2.5 : 4);
          this.mixedTree(s, u, height, random, { conifer: .14, cypress: .1, oak: .12 });
          continue;
        }
        if (random() > .5) continue;
        const p = this.ground(s, u), size = 1.4 + random() * .9;
        shrubs.push({ p: [p.x, p.y + size * .26, p.z], scale: [size, size * .8, size * 1.05], r: [0, random() * 6.28, 0], color: hedgeGreens[Math.floor(random() * hedgeGreens.length)] });
      }
    };
    // Posts stand on a lattice offset from the chunk seams, where the terrain's
    // edge row is jittered; one extra point past the end carries the wire over.
    // Anchors are places a post has to land whatever the lattice says: the
    // corner where this line meets the one crossing it, and the posts a gate
    // hangs from. They override a lattice post standing too close to share it.
    const along = (u, s0, s1, step, skip, end = Infinity, anchors = []) => {
      const stops = [];
      for (let s = Math.ceil((s0 - 2) / step) * step + 2; s <= s1 + step && s < end; s += step) {
        if (!skip || Math.abs(s - skip) > 3.6) stops.push({ s });
      }
      for (const anchor of anchors) if (anchor.s >= s0 - .01 && anchor.s <= s1 + .01) stops.push(anchor);
      stops.sort((a, b) => a.s - b.s);
      const points = [];
      for (const stop of stops) {
        const last = points.at(-1);
        if (last && stop.s - last.s < step * .5) {
          if (!stop.anchor) continue;
          points.pop();
        }
        points.push({ ...stop, u, own: stop.s <= s1 });
      }
      return points;
    };
    // Points across the field, stepping out from the road reserve, landing
    // exactly on it, on every band boundary the line crosses, and on the far
    // end, so a cross fence meets the lines running along the road at the
    // corners rather than passing a pace behind them.
    const acrossPoints = (s, side, from, to, step, anchors = []) => {
      const stops = [from, ...anchors.filter(u => u > from + step * .5 && u < to - step * .5), to];
      const points = [];
      for (let i = 0; i < stops.length - 1; i++) {
        const span = stops[i + 1] - stops[i], count = Math.max(1, Math.round(span / step));
        for (let k = 0; k < count; k++) points.push({ s, u: side * (stops[i] + span * k / count) });
      }
      points.push({ s, u: side * stops.at(-1) });
      return points;
    };
    // A bush now and then at the foot of a fence, on the field side of it.
    const bushLine = (points, axis) => {
      for (const point of points) {
        if (point.own === false || random() > .28 || !clear(point.s, point.u, .6)) continue;
        const d = (random() < .5 ? -1 : 1) * (.9 + random() * .6);
        const p = this.ground(point.s + (axis === 's' ? d : (random() - .5) * 1.4), point.u + (axis === 'u' ? d : (random() - .5) * 1.4)), size = .8 + random() * .8;
        shrubs.push({ p: [p.x, p.y + size * .26, p.z], scale: [size, size * .72, size * 1.05], r: [0, random() * 6.28, 0], color: hedgeGreens[Math.floor(random() * hedgeGreens.length)] });
      }
    };
    // The fringe: what stands either side of a boundary, where the harvester
    // and the plough stop short of the edge. Whatever lies that side decides
    // both what grows there and how far in: grass crowds right up to the
    // line, wheat stands back past the bare headland. Only near the road,
    // where it can be seen; the far fields keep their flat colour.
    const fringe = (points, axis) => {
      for (const point of points) {
        if (Math.abs(point.u) > 170) continue;
        for (const k of [-1, 1]) {
          if (random() > .55) continue;
          const probeS = point.s + (axis === 's' ? k * 3.5 : 0), probeU = point.u + (axis === 'u' ? k * 3.5 : 0);
          const kind = Math.abs(probeU) < ROAD_RESERVE ? 'verge' : fieldAt(probeS, probeU)?.kind;
          if (kind !== 'pasture' && kind !== 'wheat' && kind !== 'verge') continue;
          const d = k * (kind === 'wheat' ? 2.6 + random() * 2.4 : 1.1 + random() * 2.2), jitter = (random() - .5) * 2.2;
          this.tuft(point.s + (axis === 's' ? d : jitter), point.u + (axis === 'u' ? d : jitter), kind, random);
        }
      }
    };
    // Each row of fields: its roadside fence and gate, the fences and hedges
    // between its bands, and the bales and lone trees in the fields themselves.
    for (let row = fieldRowAt(this.start) - 1; fieldBoundary(row) < this.start + CHUNK_LENGTH; row++) {
      const rowStart = fieldBoundary(row), rowEnd = fieldBoundary(row + 1);
      // A line running along the road reaches the cross line at either end of
      // its row, so the two meet at a corner instead of stopping a few paces
      // short of one another.
      const s0 = Math.max(rowStart + 2.2, this.start), s1 = Math.min(rowEnd + 2.2, this.start + CHUNK_LENGTH - .01);
      for (const side of [-1, 1]) {
        const bands = fieldBands(row, side), gate = farmGate(row, side);
        // The cross fence stands the corner post where it has one; otherwise
        // the line along the road stands its own.
        const corners = [[rowStart + 2.2, rowBoundaryKind(row, side)], [rowEnd + 2.2, rowBoundaryKind(row + 1, side)]]
          .map(([s, kind]) => ({ s, anchor: true, post: kind === 'fence' ? false : undefined }));
        // A gate hangs between two heavy posts of its own, and the fence runs
        // its rails up to them and stops: the gate fills the opening.
        const gateSide = gate ? [{ s: gate.s - 2.4, anchor: true, post: false, stop: true }, { s: gate.s + 2.4, anchor: true, post: false }] : [];
        if (s0 < s1) {
          if (roadsideFence(row, side)) fence(along(side * ROAD_RESERVE, s0, s1, 4, gate?.s, rowEnd + 2.3, [...corners, ...gateSide]));
          fringe(along(side * ROAD_RESERVE + side * 1.4, s0, s1, 2.6), 'u');
          for (let band = 1; band <= 3; band++) {
            const kind = bandBoundaryKind(row, side, band);
            fringe(along(side * bands[band], s0, s1, 2.6), 'u');
            if (kind === 'fence') {
              fence(along(side * bands[band], s0, s1, 4, null, rowEnd + 2.3, corners));
              bushLine(along(side * bands[band], s0, s1, 4), 'u');
              if (randomAt(row * 4 + band, side > 0 ? 2793 : 2794) < .5) treeLine(along(side * (bands[band] + 2.4), s0, s1, 8), side < 0);
            } else if (kind === 'hedge') hedge(along(side * bands[band], s0, s1, 1.7));
            else if (kind === 'treeline') treeLine(along(side * bands[band], s0, s1, 4.5), side < 0);
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
          if (field.kind === 'hay' || field.kind === 'wheat' || field.kind === 'stubble') {
            // Bales in loose rows, as the baler left them, anchored to the field.
            // Bales are dropped along the swath, so they line up down a field
            // rather than speckling it: round bales on the hay and the cut
            // wheat, square bales stacked in twos and threes on the stubble.
            const square = field.kind === 'stubble', skip = field.kind === 'hay' ? .3 : square ? .45 : .66;
            for (let s = rowStart + 12; s < rowEnd - 8; s += 23) for (let cross = from + 9; cross < to - 8; cross += 17) {
              const lane = randomAt(Math.round(cross), field.seed + 2826) - .5;
              const t = s + (randomAt(Math.round(s), Math.round(cross) + 2821) - .5) * 3, v = side * (cross + lane * 5);
              if (!inChunk(t) || randomAt(Math.round(s), Math.round(cross) + 2823) < skip || !clear(t, v, 1.4)) continue;
              const p = this.ground(t, v), yaw = -roadFrame(t).angle + (randomAt(Math.round(s), Math.round(cross) + 2824) - .5) * .5;
              const color = strawTints[Math.floor(randomAt(Math.round(s), Math.round(cross) + 2825) * 3)];
              for (let k = 0; k < 2; k++) this.tuft(t + (random() - .5) * 4.5, v + (random() - .5) * 4.5, field.kind, random);
              if (!square) { bales.push({ p: [p.x, p.y + .85, p.z], scale: [1.2, 1.2, 1.2], r: [0, yaw, 0], color }); continue; }
              const stack = 1 + Math.floor(randomAt(Math.round(s), Math.round(cross) + 2827) * 2.6);
              for (let k = 0; k < stack; k++) squareBales.push({ p: [p.x, p.y + .4 + k * .8, p.z], scale: [1, 1, 1], r: [0, yaw + (k % 2) * .12, 0], color });
            }
          }
          if ((field.kind === 'pasture' || field.kind === 'hay') && randomAt(field.seed, field.salt + 7) < .55) {
            const t = rowStart + 14 + randomAt(field.seed, field.salt + 8) * (rowEnd - rowStart - 28);
            const v = side * (from + 12 + randomAt(field.seed, field.salt + 9) * Math.max(4, to - from - 24));
            if (inChunk(t) && clear(t, v, 4)) this.tree('oak', t, v, 9 + randomAt(field.seed, field.salt + 10) * 5, oakGreens[field.seed % oakGreens.length], random() * 6.28);
          }
          // A herd grazes some pastures, loosely together and facing the same way.
          if (field.kind === 'pasture' && randomAt(field.seed, field.salt + 17) < .7) {
            const herdS = rowStart + 16 + randomAt(field.seed, field.salt + 18) * Math.max(4, rowEnd - rowStart - 32);
            const herdU = side * (from + 12 + randomAt(field.seed, field.salt + 19) * Math.max(4, to - from - 24)), heading = randomAt(field.seed, field.salt + 20) * 6.28;
            for (let i = 0, count = 4 + Math.floor(randomAt(field.seed, field.salt + 21) * 5); i < count; i++) {
              const t = herdS + (random() - .5) * 20, v = herdU + (random() - .5) * 14;
              if (inChunk(t) && clear(t, v, 1.2)) this.cow(t, v, heading + (random() - .5) * 1.1, random);
            }
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
      // Stones cleared off the fields lie heaped in some corners, a copse
      // stands in others where the plough never reached, a few pastures
      // carry a clump of oaks rather than one lone tree, and a field shed
      // with its water tank stands off in some fields.
      for (const side of [-1, 1]) {
        const bands = fieldBands(row, side);
        for (let band = 0; band < 3; band++) {
          if (fieldCorner(row, side, band)) {
            const t = rowStart + 5 + randomAt(row * 4 + band, 2841) * 4, v = side * (bands[band + 1] - 4 - randomAt(row * 4 + band, 2842) * 3);
            if (inChunk(t) && clear(t, v, 3)) for (let i = 0; i < 7; i++) {
              const p = this.ground(t + (random() - .5) * 3.2, v + (random() - .5) * 3.2), size = .45 + random() * .7;
              this.scenery.painted.push({ p: [p.x, p.y + size * .3, p.z], scale: [size, size * .7, size * .85], r: [random() * .5, random() * 6.28, random() * .5], color: stone[i % stone.length] });
            }
          }
          if (randomAt(row * 4 + band, side > 0 ? 2843 : 2844) < .4) {
            const t = rowEnd - 9 - randomAt(row * 4 + band, 2845) * 4, v = side * (bands[band + 1] - 7 - randomAt(row * 4 + band, 2846) * 3);
            if (!inChunk(t) || !clear(t, v, 5)) continue;
            for (let i = 0, count = 2 + Math.floor(random() * 3); i < count; i++) {
              const dt = t + (random() - .5) * 7, dv = v + (random() - .5) * 6;
              if (inside(dt) && clear(dt, dv, 2.5)) this.mixedTree(dt, dv, 7.5 + random() * 3.5, random, { conifer: .1, cypress: .22, oak: .2 });
            }
            for (let i = 0; i < 3; i++) {
              const p = this.ground(t + (random() - .5) * 9, v + (random() - .5) * 8), size = 1.1 + random() * .9;
              shrubs.push({ p: [p.x, p.y + size * .28, p.z], scale: [size, size * .75, size], r: [0, random() * 6.28, 0], color: hedgeGreens[i % hedgeGreens.length] });
            }
          }
        }
        if (randomAt(row, side > 0 ? 2851 : 2852) < .34) {
          const t = rowStart + 24 + randomAt(row, side > 0 ? 2853 : 2854) * (rowEnd - rowStart - 48);
          const v = side * (bands[1] + 12 + randomAt(row, side > 0 ? 2855 : 2856) * Math.min(44, bands[2] - bands[1] - 24));
          if (inChunk(t) && clear(t, v, 10)) this.outbuilding(t, v, random);
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
        const crossings = fieldBands(row, side).slice(1, 4);
        fringe(acrossPoints(line, side, ROAD_RESERVE, Math.min(far, 170), 2.6), 's');
        if (kind === 'fence') {
          fence(acrossPoints(line, side, ROAD_RESERVE, far, 6, crossings));
          bushLine(acrossPoints(line, side, ROAD_RESERVE, far, 6), 's');
          if (randomAt(row, side > 0 ? 2795 : 2796) < .35) treeLine(acrossPoints(line + 2.6, side, 16, far, 8), side < 0);
        } else if (kind === 'hedge') hedge(acrossPoints(line, side, ROAD_RESERVE, far, 1.7));
        else if (kind === 'treeline') treeLine(acrossPoints(line, side, 16, far, 4.5), side < 0);
        else if (kind === 'shelterbelt') for (let cross = 18; cross < Math.min(far, 260); cross += 6.5) {
          const t = line + (random() - .5) * 1.6, v = side * (cross + (random() - .5) * 1.4);
          if (!clear(t, v, 2)) continue;
          this.tree('poplar', t, v, 11 + random() * 5, poplarGreens[Math.floor(random() * poplarGreens.length)], random() * 6.28);
        }
      }
    }
    // Long grass stands in the verge, between the shoulder and the ditch.
    for (let s = this.start; s < this.start + CHUNK_LENGTH; s += 3) for (const side of [-1, 1]) {
      if (random() > .5) continue;
      this.tuft(s + random() * 3, side * (8.9 + random() * 3.4), 'verge', random);
    }
    // Trees follow the road in loose groups, thinning out and gathering again
    // rather than running as an unbroken avenue.
    for (let cell = Math.floor(this.start / 32) - 1; cell * 32 < this.start + CHUNK_LENGTH; cell++) {
      for (const side of [-1, 1]) {
        const density = randomAt(cell, side > 0 ? 2841 : 2842);
        if (density > .72) continue;
        for (let i = 0, count = 2 + Math.floor(random() * 4); i < count; i++) {
          const t = cell * 32 + random() * 32, v = side * (15 + random() * 7);
          if (!inChunk(t) || !clear(t, v, 3)) continue;
          const height = (side < 0 ? 6.5 : 8) + random() * 3.5;
          this.mixedTree(t, v, height, random, { conifer: .1, cypress: .14, oak: .26 });
        }
        // A bush or two under the trees, so a group has a foot as well as crowns.
        if (density < .4) for (let i = 0; i < 2; i++) {
          const t = cell * 32 + random() * 32, v = side * (14.5 + random() * 4);
          if (!inChunk(t) || !clear(t, v, 1)) continue;
          const p = this.ground(t, v), size = 1 + random() * .9;
          shrubs.push({ p: [p.x, p.y + size * .28, p.z], scale: [size, size * .7, size], r: [0, random() * 6.28, 0], color: hedgeGreens[Math.floor(random() * hedgeGreens.length)] });
        }
      }
    }
    // Stock ponds: a level disc of water in each basin, its rim under the bank.
    for (const pond of pondsNear(this.start + CHUNK_LENGTH / 2)) {
      if (!inChunk(pond.s)) continue;
      const vertices = [], colors = [], level = pond.rim - .55, tint = new THREE.Color('#5d93ad'), deep = new THREE.Color('#3f7492');
      const center = plainsPosition(pond.s, pond.u, level);
      // An irregular outline, so a dug pond is not a perfect disc.
      const edge = i => {
        const a = i / 18 * Math.PI * 2;
        const r = pond.radius * (.68 + .12 * Math.sin(a * 3 + pond.index) + .07 * Math.sin(a * 5 + pond.index * 2));
        return plainsPosition(pond.s + Math.cos(a) * r, pond.u + Math.sin(a) * r, level);
      };
      // One still surface: a fan of visibly different wedges reads as a pinwheel.
      const surface = tint.clone().lerp(deep, .35);
      for (let i = 0; i < 18; i++) {
        triangle(vertices, colors, center, edge(i), edge(i + 1), surface.clone().multiplyScalar(.99 + randomAt(i, pond.index + 2857) * .02), this.start);
      }
      const water = this.addMesh(geometry(vertices, colors), waterMaterial, 'stock-pond');
      water.geometry.boundingSphere.radius += .5;
      // Rushes ring the water, and a few head of cattle stand at the edge.
      for (let i = 0; i < 14; i++) {
        const a = random() * Math.PI * 2, r = pond.radius * (.86 + random() * .12), p = this.ground(pond.s + Math.cos(a) * r, pond.u + Math.sin(a) * r), size = .8 + random() * .5;
        this.scenery.rushes.push({ p: [p.x, p.y - .05, p.z], scale: [size, size, size], r: [0, random() * 6.28, 0], color: i % 2 ? '#8aa040' : '#9aa84a' });
      }
      const herdAngle = random() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const a = herdAngle + (random() - .5) * 1.2, r = pond.radius * (1.25 + random() * .25);
        this.cow(pond.s + Math.cos(a) * r, pond.u + Math.sin(a) * r, a + Math.PI + (random() - .5) * .8, random);
      }
      // A few trees stand over the water on the bank away from the cattle.
      for (let i = 0; i < 3; i++) {
        const a = herdAngle + Math.PI + (random() - .5) * 2, r = pond.radius * (1.85 + random() * .3);
        const t = pond.s + Math.cos(a) * r, v = pond.u + Math.sin(a) * r;
        if (inside(t) && clear(t, v, 3)) this.mixedTree(t, v, 8 + random() * 3.5, random, { conifer: 0, cypress: .3, oak: .4 });
      }
      // A stone or two lies on the bank.
      for (let i = 0; i < 9; i++) {
        const a = random() * Math.PI * 2, r = pond.radius * (1.02 + random() * .2);
        const p = this.ground(pond.s + Math.cos(a) * r, pond.u + Math.sin(a) * r), size = .8 + random() * .8;
        if (i % 3) shrubs.push({ p: [p.x, p.y + size * .25, p.z], scale: [size, size * .6, size], r: [0, random() * 6.28, 0], color: '#7d9a3e' });
        else this.scenery.painted.push({ p: [p.x, p.y + size * .2, p.z], scale: [size * .8, size * .5, size * .7], r: [0, random() * 6.28, .2], color: stone[i % stone.length] });
      }
    }
    // Road furniture: a warning diamond on each approach to the bridge, a
    // speed sign now and then, and a culvert where a farm track crosses the ditch.
    const sign = (s, side, kind) => {
      if (!inChunk(s) || creekDistance(s, side * 8.4) < 12) return;
      const p = this.ground(s, side * 8.4), angle = -roadFrame(s).angle;
      posts.push({ p: [p.x, p.y + 1.15, p.z], scale: [.12, 2.3, .12], r: [0, angle, 0] });
      if (kind === 'diamond') this.scenery.painted.push({ p: [p.x, p.y + 2.6, p.z], scale: [.92, .92, .07], r: [0, angle, Math.PI / 4], color: '#e9b52e' });
      else this.scenery.painted.push({ p: [p.x, p.y + 2.55, p.z], scale: [.78, .98, .07], r: [0, angle, 0], color: '#f2efe6' });
    };
    const creekHere = plainsCreekAt(this.start + CHUNK_LENGTH / 2);
    sign(creekHere.start - 70, 1, 'diamond'); sign(creekHere.end + 70, -1, 'diamond');
    for (let s = Math.ceil((this.start - 200) / 448) * 448 + 200; s < this.start + CHUNK_LENGTH; s += 448) sign(s, 1, 'speed');
    // A timber field gate stands back from the road where a farm track leaves
    // it: two posts and three rails, which reads as a gate at driving zoom.
    for (let row = fieldRowAt(this.start) - 1; fieldBoundary(row) < this.start + CHUNK_LENGTH; row++) for (const side of [-1, 1]) {
      const gate = farmGate(row, side);
      if (!gate || !inChunk(gate.s)) continue;
      // The gate hangs in the roadside fence itself, on two posts heavier than
      // the line's, so the fence reads as running into it and stopping. Its
      // timber is paler than the weathered rails either side, and it carries
      // four bars, two stiles and a diagonal brace, which is what tells a
      // gate apart from the fence it hangs in.
      const angle = -roadFrame(gate.s).angle, u = side * ROAD_RESERVE, timber = '#b39c73';
      for (const end of [-1, 1]) {
        const p = this.ground(gate.s + end * 2.4, u);
        posts.push({ p: [p.x, p.y + .82, p.z], scale: [.32, 1.72, .32], r: [0, angle, 0] });
      }
      const a = this.ground(gate.s - 2.4, u), b = this.ground(gate.s + 2.4, u);
      for (const height of [.42, .72, 1.02, 1.32]) {
        this.beam(this.scenery.rails, { ...a, y: a.y + height }, { ...b, y: b.y + height }, .085, timber);
      }
      for (const t of [1 / 3, 2 / 3]) {
        const stile = this.ground(gate.s - 2.4 + t * 4.8, u);
        this.beam(this.scenery.rails, { ...stile, y: stile.y + .42 }, { ...stile, y: stile.y + 1.32 }, .075, timber);
      }
      this.beam(this.scenery.rails, { ...a, y: a.y + .42 }, { ...b, y: b.y + 1.32 }, .08, timber);
    }
    // Rushes along the creek's waterline, thicker where the banks are gentle.
    if (Math.abs(creekHere.center - this.start - CHUNK_LENGTH / 2) < CHUNK_LENGTH / 2 + 150) {
      const rushRandom = seededRandom(creekHere.index + 61911);
      for (let u = -396; u <= 544; u += 3) for (const bank of [-1, 1]) {
        const keep = rushRandom() > .45, d = 5.6 + rushRandom() * 1.6, size = .7 + rushRandom() * .6, yaw = rushRandom() * 6.28;
        const t = creekCenterS(creekHere, u) + bank * d;
        if (!keep || !inChunk(t) || Math.abs(u) < 8.5) continue;
        const p = this.ground(t, u);
        this.scenery.rushes.push({ p: [p.x, p.y - .05, p.z], scale: [size, size, size], r: [0, yaw, 0], color: Math.floor(u) % 2 ? '#7f9a3c' : '#93a548' });
      }
    }
    // Windbreaks on the far rises give the third-person horizon a treeline.
    for (const [cross, span, salt] of [[318, 96, 2871], [372, 128, 2872], [436, 160, 2873]]) {
      for (let s = Math.ceil(this.start / 8) * 8; s < this.start + CHUNK_LENGTH; s += 8) {
        const cell = Math.floor(s / span);
        if (randomAt(cell, salt) < .45 || randomAt(Math.round(s / 8), salt + 1) < .12) continue;
        const p = this.ground(s + (randomAt(Math.round(s / 8), salt + 2) - .5) * 3, cross + (randomAt(cell, salt + 3) - .5) * 14), size = 4.5 + randomAt(Math.round(s / 8), salt + 4) * 3.5;
        this.scenery.farLumps.push({ p: [p.x, p.y + size * .35, p.z], scale: [size, size * 1.15, size], r: [0, randomAt(Math.round(s / 8), salt + 5) * 6.28, 0], color: cell % 2 ? '#587a38' : '#4f7033' });
      }
    }
    // A flock of crows wheels over a field in every third chunk.
    if (((this.index % 3) + 3) % 3 === 1) {
      const flockRandom = seededRandom(this.index + 70301), count = 5 + Math.floor(flockRandom() * 4);
      const s = this.start + 30 + flockRandom() * 68, u = (flockRandom() > .5 ? 1 : -1) * (36 + flockRandom() * 90);
      const height = Math.max(plainsGroundHeight(s, u), plainsRoadHeight(s)) + 15 + flockRandom() * 6;
      const flock = new THREE.InstancedMesh(crowGeometry, crowMaterial, count); flock.name = 'plains-crows';
      for (let i = 0; i < count; i++) {
        const p = plainsPosition(s + (flockRandom() - .5) * 9, u + (flockRandom() - .5) * 9, height + flockRandom() * 2.5);
        dummy.position.set(p.x, p.y, p.z + this.start); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(.9 + flockRandom() * .3); dummy.updateMatrix(); flock.setMatrixAt(i, dummy.matrix);
      }
      flock.castShadow = false; flock.computeBoundingSphere(); flock.boundingSphere.radius += 16;
      this.group.add(flock);
    }
    // Utility poles along the far verge, wired to the next pole that stands;
    // a pole never stands in the creek. A crossarm with an insulator at each
    // end carries two wires, and a third rides the top of the pole.
    const POLE_U = ROAD_RESERVE + 1.8, standing = s => creekDistance(s, POLE_U) > 9;
    for (let s = Math.ceil((this.start - 8) / 32) * 32 + 8; s < this.start + CHUNK_LENGTH; s += 32) {
      if (!standing(s) || !plainsDiscoveryClears(s, POLE_U, this.discoveries, 1)) continue;
      const p = this.ground(s, POLE_U), angle = -roadFrame(s).angle;
      poles.push({ p: [p.x, p.y + 4.7, p.z], scale: [.21, 9.6, .21] });
      posts.push({ p: [p.x, p.y + 8.95, p.z], scale: [2.3, .15, .15], r: [0, angle, 0] });
      for (const offset of [-.95, .95]) {
        const a = this.ground(s, POLE_U + offset);
        this.scenery.painted.push({ p: [a.x, p.y + 9.14, a.z], scale: [.14, .24, .14], r: [0, angle, 0], color: '#d9ddd6' });
      }
      let next = s + 32;
      while (!standing(next) && next - s < 100) next += 32;
      if (next - s > 100) continue;
      const q = this.ground(next, POLE_U);
      for (const [offset, height] of [[-.95, 9.24], [.95, 9.24], [0, 9.62]]) {
        const a = this.ground(s, POLE_U + offset), b = this.ground(next, POLE_U + offset);
        const middle = { x: (a.x + b.x) / 2, y: (p.y + q.y) / 2 + height - .45, z: (a.z + b.z) / 2 };
        // Wide enough to hold together as a line on a phone's screen; at half
        // this a wire fell apart into dots.
        beam(wires, { x: a.x, y: p.y + height, z: a.z }, middle, .075); beam(wires, middle, { x: b.x, y: q.y + height, z: b.z }, .075);
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
  // Nothing plantable stands on the road reserve, in the creek, on a pond,
  // or inside a discovery's footprint.
  clearAt(s, u, r = 1) {
    return Math.abs(u) > r + 6.6 && creekDistance(s, u) > r + 5.5 && plainsDiscoveryClears(s, u, this.discoveries, r)
      && pondsNear(s).every(pond => Math.hypot(s - pond.s, u - pond.u) > pond.radius * 1.2 + r);
  }
  beam(list, a, b, width, color) {
    const from = new THREE.Vector3(a.x, a.y, a.z), to = new THREE.Vector3(b.x, b.y, b.z), direction = to.clone().sub(from);
    list.push({ p: from.clone().add(to).multiplyScalar(.5).toArray(), scale: [width, direction.length(), width], q: new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()), color });
  }
  // Posts and a single wire between neighbours; a gap where a post is
  // missing (a gate, the creek, a yard) breaks the wire too.
  fence(points, keepClear = true) {
    const { posts, rails } = this.scenery;
    let previous = null;
    for (const point of points) {
      if (keepClear && !this.clearAt(point.s, point.u, .3)) { previous = null; continue; }
      const p = this.ground(point.s, point.u);
      // A point past the chunk's end is the next chunk's post; only its wire
      // is ours. A corner post or a gate's hanging post is placed by whichever
      // line owns it, and the others run their rails into it rather than
      // standing a second post in the same spot.
      if (point.own !== false && point.post !== false) posts.push({ p: [p.x, p.y + .62, p.z], scale: [.26, 1.32, .26], r: [0, -roadFrame(point.s).angle, 0] });
      // Two rails carry the line between posts; a single hairline wire left the
      // posts reading as loose specks across the fields.
      if (previous) for (const height of [.62, 1.04]) {
        this.beam(rails, { ...previous, y: previous.y + height }, { ...p, y: p.y + height }, .13);
      }
      // A gate fills its own opening, so the fence's rails stop at its posts.
      previous = point.stop ? null : p;
    }
  }
  // A tuft at a field's edge: long grass in the green fields and the verge,
  // standing wheat in a grain field, and nothing anywhere else.
  tuft(s, u, kind, random) {
    const where = kind ?? (Math.abs(u) < ROAD_RESERVE ? 'verge' : fieldAt(s, u)?.kind);
    if (where !== 'pasture' && where !== 'verge' && where !== 'wheat') return;
    if (!this.clearAt(s, u, .2)) return;
    const wheat = where === 'wheat', tints = wheat ? WHEAT_TINTS : GRASS_TINTS[where];
    const p = this.ground(s, u), size = wheat ? .85 + random() * .45 : .8 + random() * .6;
    (wheat ? this.scenery.wheat : this.scenery.grass).push({ p: [p.x, p.y - .03, p.z], scale: [size, size, size], r: [0, random() * 6.28, 0], color: tints[Math.floor(random() * tints.length)] });
  }
  cow(s, u, heading, random) {
    const p = this.ground(s, u), coats = ['#f0ece2', '#e8e2d4', '#9b7551', '#8a6340', '#f2eee6', '#7d5a3c'];
    this.scenery.cows.push({ p: [p.x, p.y, p.z], scale: [1, 1, 1], r: [0, heading, 0], color: coats[Math.floor(random() * coats.length)] });
  }
  // The farm country's mix of trees: mostly round crowns, with a spruce, a
  // dark cypress or a broad oak among them at the given shares.
  mixedTree(s, u, height, random, shares) {
    const r = random(), pick = list => list[Math.floor(random() * list.length)];
    if (r < shares.conifer) this.tree('conifer', s, u, height * 1.15, pick(CONIFER_GREENS), random() * 6.28);
    else if (r < shares.conifer + shares.cypress) this.tree('cypress', s, u, height * 1.35, pick(CYPRESS_GREENS), random() * 6.28);
    else if (r < shares.conifer + shares.cypress + shares.oak) this.tree('oak', s, u, height * 1.1, pick(['#587f3a', '#4d7434', '#65883f', '#43682e']), random() * 6.28);
    else this.tree('hedge', s, u, height, pick(['#5d8a39', '#6b9942', '#4f7c32', '#76a54a', '#598136', '#6fa03f']), random() * 6.28);
  }
  // A field shed on a footing, with a water tank and a few trees for shade,
  // on a patch of bare yard: a farm's outlying corner, well short of a farmstead.
  outbuilding(s, u, random) {
    const samples = [-5, 0, 5].flatMap(ds => [-5, 0, 5].map(du => this.ground(s + ds, u + du).y));
    const low = Math.min(...samples), high = Math.max(...samples);
    if (high - low > 2.4) return;
    const yaw = -roadFrame(s).angle + (random() - .5) * .6, p = this.ground(s, u);
    this.dirtPatch(s, u, 7, 6);
    this.scenery.painted.push({ p: [p.x, (low - .3 + high + .05) / 2, p.z], scale: [7.2, high - low + .35, 9.6], r: [0, yaw, 0], color: '#b1a892' });
    this.scenery.sheds.push({ p: [p.x, high + .05, p.z], scale: [1.2, 1.2, 1.2], r: [0, yaw, 0] });
    // A squat galvanised tank, kept dull: a pale drum under the low sun read
    // as a haystack from the road.
    const tank = this.ground(s + 6.2, u + (u > 0 ? 2.5 : -2.5));
    this.scenery.tanks.push({ p: [tank.x, tank.y + 1, tank.z], scale: [1.7, 2.1, 1.7], r: [0, random() * 6.28, 0], color: '#6c746f' });
    for (const [ds, du, kind, height, color] of [[-8.5, 5, 'oak', 9, '#587f3a'], [7, -7, 'hedge', 7.5, '#4d7434'], [-6, -8, 'cypress', 11, CYPRESS_GREENS[0]]]) {
      if (this.clearAt(s + ds, u + du, 2)) this.tree(kind, s + ds, u + du, height + random() * 2, color, random() * 6.28);
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
    const { posts, wires, rails, poles, shrubs, bales, squareBales, boxes, painted, cows, rushes, grass, wheat, farLumps, concrete, sheds, tanks, bark, leaves, dirt, dirtTints } = this.scenery;
    if (dirt.length) this.addMesh(geometry(dirt, dirtTints), dirtMaterial, 'farm-tracks');
    instances(this.group, squareBaleGeometry, strawMaterial, squareBales, 'square-bales');
    instances(this.group, plainsDiscoveryAssets.shed, plainsDiscoveryMaterial, sheds, 'field-sheds');
    instances(this.group, poleGeometry, metalMaterial, tanks, 'water-tanks');
    // Two lines meeting at a corner each want a post standing there, and two
    // posts in the same spot have no stable depth order: their faces flicker
    // against each other as the camera moves. Keep the first of each.
    const standing = new Set();
    const singles = posts.filter(post => {
      const key = post.p.map(value => Math.round(value * 8)).join() + '/' + Math.round(post.scale[1] * 100);
      if (standing.has(key)) return false;
      standing.add(key); return true;
    });
    instances(this.group, boxGeometry, timberMaterial, singles, 'fence-posts');
    instances(this.group, boxGeometry, railMaterial, rails, 'fence-rails', false);
    instances(this.group, boxGeometry, wireMaterial, wires, 'overhead-wires', false);
    instances(this.group, poleGeometry, poleMaterial, poles, 'utility-poles');
    instances(this.group, shrubGeometry, shrubMaterial, shrubs, 'hedgerows');
    instances(this.group, baleGeometry, strawMaterial, bales, 'hay-bales');
    instances(this.group, boxGeometry, metalMaterial, boxes, 'mailboxes');
    instances(this.group, boxGeometry, concreteMaterial, concrete, 'creek-bridge');
    instances(this.group, boxGeometry, paintedMaterial, painted, 'signs-and-stones');
    instances(this.group, cowGeometry, hideMaterial, cows, 'cattle');
    instances(this.group, rushGeometry, rushMaterial, rushes, 'rushes', false);
    // The fringe throws no shadow and stays out of the occlusion prepass:
    // hundreds of blades a chunk cost one draw call and nothing more.
    instances(this.group, stalkGeometry, fringeMaterial, grass, 'grass-fringe', false, false);
    instances(this.group, wheatGeometry, fringeMaterial, wheat, 'wheat-fringe', false, false);
    // Far windbreaks are horizon silhouettes: no shadow pass, no soft shading.
    for (const part of splitBatch(farLumps)) {
      if (!part.length) continue;
      const mesh = new THREE.InstancedMesh(shrubGeometry, shrubMaterial, part.length); mesh.name = 'far-windbreaks';
      part.forEach((item, i) => { dummy.position.set(...item.p); dummy.rotation.set(...item.r); dummy.scale.set(...item.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new THREE.Color(item.color)); });
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.ambientOcclusion = false; mesh.computeBoundingSphere(); this.group.add(mesh);
    }
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

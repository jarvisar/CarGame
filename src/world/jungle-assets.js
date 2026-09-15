import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomAt } from './route.js';

const up = new THREE.Vector3(0, 1, 0);
function geometry(vertices, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function tinted(source, tint) {
  // Merged parts must agree on indexing; the icosahedron lobes are unindexed.
  const g = source.index ? source.toNonIndexed() : source;
  if (g !== source) source.dispose();
  const colors = new Float32Array(g.attributes.position.count * 3).fill(tint);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv'); return g;
}
function finish(parts) {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  merged.deleteAttribute('normal'); merged.computeVertexNormals(); merged.computeBoundingSphere();
  return merged;
}
// A crease down each blade keeps flat leaves from reading as paper cutouts.
function blade(vertices, colors, spine, widths, side, tint, sag = .03) {
  const push = (p, shade) => { vertices.push(p.x, p.y, p.z); colors.push(tint * shade, tint * shade, tint * shade); };
  for (let k = 0; k < spine.length - 1; k++) {
    const a = spine[k], b = spine[k + 1], wa = widths[k], wb = widths[k + 1];
    const edge = (p, w, sign) => ({ x: p.x + side[0] * w * sign, y: p.y - sag * Math.min(1, w * 6), z: p.z + side[1] * w * sign });
    const la = edge(a, wa, 1), lb = edge(b, wb, 1), ra = edge(a, wa, -1), rb = edge(b, wb, -1);
    for (const [p, q, r] of [[a, la, b], [la, lb, b], [a, b, ra], [ra, b, rb]]) { push(p, 1); push(q, .93); push(r, 1); }
  }
}

// Broadleaf crowns: overlapping faceted lobes, brighter toward the top. The
// unit crown spans radius one and rises from y = 0 so instances scale simply.
function crown(seed, { lobes = 5, spread = .55, flat = 1, size = [.5, .75] } = {}) {
  const parts = [];
  for (let i = 0; i < lobes; i++) {
    const id = seed * 11 + i;
    const r = i === 0 ? 0 : spread * (.7 + randomAt(id, 2301) * .5), angle = i * 2.399963 + seed * .7;
    const scale = i === 0 ? size[1] : size[0] + randomAt(id, 2302) * (size[1] - size[0]) * .8;
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.rotateY(randomAt(id, 2303) * 6.28); g.rotateX((randomAt(id, 2304) - .5) * .6);
    g.scale(scale * (.9 + randomAt(id, 2307) * .25), scale * flat * (.75 + randomAt(id, 2308) * .4), scale * (.85 + randomAt(id, 2309) * .3));
    g.translate(Math.cos(angle) * r, (i === 0 ? 1 : .3 + randomAt(id, 2305) * .5) * scale * flat, Math.sin(angle) * r);
    parts.push(tinted(g, .9 + randomAt(id, 2306) * .18));
  }
  const merged = finish(parts);
  merged.computeBoundingBox();
  const box = merged.boundingBox, radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
  merged.translate(0, -box.min.y, 0); merged.scale(1 / radius, 1 / radius, 1 / radius);
  merged.computeBoundingBox();
  const top = merged.boundingBox.max.y, position = merged.attributes.position, color = merged.attributes.color;
  for (let i = 0; i < position.count; i++) {
    const shade = color.getX(i) * (.64 + .42 * Math.pow(position.getY(i) / top, .8));
    color.setXYZ(i, shade, shade, shade);
  }
  merged.computeVertexNormals(); merged.computeBoundingSphere();
  return merged;
}

// Emergent trees: a buttressed trunk with a few limbs opening into a wide,
// flat crown that overhangs the road. Height is the unit; the crown is separate.
function emergentTrunk(seed) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(.026, .044, .8, 7); trunk.translate(0, .4, 0); parts.push(tinted(trunk, 1));
  for (let i = 0; i < 4; i++) {
    const angle = i * 1.57 + randomAt(seed, i + 2311) * .8, reach = .3 + randomAt(seed, i + 2312) * .28;
    const from = new THREE.Vector3(0, .74, 0), to = new THREE.Vector3(Math.cos(angle) * reach, .86 + randomAt(seed, i + 2313) * .08, Math.sin(angle) * reach);
    const direction = to.clone().sub(from);
    const limb = new THREE.CylinderGeometry(.008, .017, direction.length(), 5);
    limb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize()));
    limb.translate(...from.add(to).multiplyScalar(.5).toArray()); parts.push(tinted(limb, .96));
  }
  for (let i = 0; i < 5; i++) {
    const angle = i * 1.2566 + randomAt(seed, i + 2314) * .5;
    const fin = new THREE.BoxGeometry(.012, .11, .085);
    fin.translate(0, .035, .05); fin.rotateX(-.55); fin.rotateY(-angle); parts.push(tinted(fin, 1.04));
  }
  return finish(parts);
}

// Palms: a leaning trunk topped by drooping, creased fronds. Both share one
// unit so an instance transform places the fronds on the trunk's top.
function palmTrunk(seed) {
  const parts = [], lean = .1 + randomAt(seed, 2321) * .08, stations = [[0, 0], [lean * .25, .35], [lean * .62, .7], [lean, 1]];
  for (let i = 0; i < stations.length - 1; i++) {
    const from = new THREE.Vector3(stations[i][0], stations[i][1], 0), to = new THREE.Vector3(stations[i + 1][0], stations[i + 1][1], 0);
    const direction = to.clone().sub(from);
    const segment = new THREE.CylinderGeometry(.03 - i * .004, .034 - i * .004, direction.length() * 1.04, 6);
    segment.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize()));
    segment.translate(...from.add(to).multiplyScalar(.5).toArray()); parts.push(tinted(segment, 1 - i * .04));
  }
  const cap = new THREE.IcosahedronGeometry(.05, 0); cap.translate(lean, 1, 0); parts.push(tinted(cap, .9));
  return { geometry: finish(parts), lean };
}
function palmFronds(seed, lean) {
  const vertices = [], colors = [], count = 9;
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2 + randomAt(seed, i + 2331) * .5;
    const dir = [Math.cos(angle), Math.sin(angle)], side = [-dir[1], dir[0]];
    const length = .6 + randomAt(seed, i + 2332) * .22, droop = .16 + randomAt(seed, i + 2333) * .24;
    const spine = [0, .28, .58, .82, 1].map(t => ({ x: lean + dir[0] * t * length, y: 1 + .15 * Math.sin(t * Math.PI * .8) - droop * t * t * 1.7, z: dir[1] * t * length }));
    blade(vertices, colors, spine, [.025, .095, .105, .075, .01], side, .9 + randomAt(seed, i + 2334) * .2);
  }
  return geometry(vertices, colors);
}

// Ferns and broad-leaved plants fill the floor between the trunks.
function fern(seed) {
  const vertices = [], colors = [], count = 8;
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2 + randomAt(seed, i + 2341) * .6;
    const dir = [Math.cos(angle), Math.sin(angle)], side = [-dir[1], dir[0]];
    const length = .55 + randomAt(seed, i + 2342) * .45, rise = .25 + randomAt(seed, i + 2343) * .25;
    const spine = [{ x: 0, y: .04, z: 0 }, { x: dir[0] * length * .5, y: rise, z: dir[1] * length * .5 }, { x: dir[0] * length, y: rise * .55, z: dir[1] * length }];
    blade(vertices, colors, spine, [.03, .13, .02], side, .88 + randomAt(seed, i + 2344) * .24, .02);
  }
  return geometry(vertices, colors);
}
function bigLeaf(seed) {
  const vertices = [], colors = [], count = 5;
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2 + randomAt(seed, i + 2351) * .7;
    const dir = [Math.cos(angle), Math.sin(angle)], side = [-dir[1], dir[0]];
    const reach = .85 + randomAt(seed, i + 2352) * .35, height = .45 + randomAt(seed, i + 2353) * .25;
    const stem = [{ x: 0, y: 0, z: 0 }, { x: dir[0] * .3, y: height, z: dir[1] * .3 }];
    blade(vertices, colors, stem, [.012, .012], side, .82, 0);
    const spine = [{ x: dir[0] * .28, y: height - .02, z: dir[1] * .28 }, { x: dir[0] * .62, y: height + .1, z: dir[1] * .62 }, { x: dir[0] * reach, y: height - .12, z: dir[1] * reach }];
    blade(vertices, colors, spine, [.05, .3, .02], side, .9 + randomAt(seed, i + 2354) * .2, .06);
  }
  return geometry(vertices, colors);
}

// Rounded boulders with moss baked onto their upward faces, so a single
// instanced material covers dry grey stone and the damp rocks by the river.
function boulder(seed, moss) {
  const sides = 5 + seed % 3, vertices = [], colors = [];
  const rings = [[-.48, .8], [.08, 1], [.72, .66]].map(([y, radius], layer) =>
    Array.from({ length: sides }, (_, i) => {
      const angle = i / sides * Math.PI * 2, r = radius * (.76 + randomAt(seed * 17 + i, 2361) * .42);
      return [Math.cos(angle) * r + layer * (seed % 2 ? .1 : -.07), y + (randomAt(seed * 17 + i, 2362 + layer) - .5) * .28, Math.sin(angle) * r];
    }));
  const stone = new THREE.Color('#aab2ab'), shade = new THREE.Color('#76837e'), green = new THREE.Color('#5f8f42');
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const face = (p, q, r) => {
    vertices.push(...p, ...q, ...r);
    a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]); b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]);
    const normalY = a.cross(b).normalize().y;
    const color = shade.clone().lerp(stone, .35 + Math.max(0, normalY) * .5 + randomAt(seed, vertices.length + 2363) * .15);
    color.lerp(green, moss * Math.pow(Math.max(0, normalY), .6) * (.55 + randomAt(seed, vertices.length + 2364) * .45));
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  const crown = [.1, .95, -.12];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    for (let layer = 0; layer < 2; layer++) {
      face(rings[layer][i], rings[layer][j], rings[layer + 1][i]);
      face(rings[layer][j], rings[layer + 1][j], rings[layer + 1][i]);
    }
    face(crown, rings[2][i], rings[2][j]);
    face([0, -.56, 0], rings[0][j], rings[0][i]);
  }
  return geometry(vertices, colors);
}
function tuft() {
  const vertices = [], colors = [];
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.399963, dir = [Math.cos(angle), Math.sin(angle)], side = [-dir[1], dir[0]];
    const height = .45 + randomAt(i, 2371) * .55, bend = .2 + randomAt(i, 2372) * .35;
    blade(vertices, colors, [{ x: 0, y: 0, z: 0 }, { x: dir[0] * bend * .5, y: height * .7, z: dir[1] * bend * .5 }, { x: dir[0] * bend, y: height, z: dir[1] * bend }], [.035, .028, .005], side, .9 + randomAt(i, 2373) * .2, 0);
  }
  return geometry(vertices, colors);
}

export const jungleCrowns = [crown(1), crown(2, { lobes: 6, spread: .62 }), crown(3, { lobes: 4, spread: .5, size: [.55, .8] }), crown(5, { lobes: 7, spread: .7, flat: .62, size: [.45, .68] })];
export const emergentCrown = crown(4, { lobes: 10, spread: .84, flat: .42, size: [.42, .62] });
export const emergentTrunks = [emergentTrunk(1), emergentTrunk(2)];
const palms = [palmTrunk(1), palmTrunk(2)];
export const junglePalms = palms.map((palm, i) => ({ trunk: palm.geometry, fronds: palmFronds(i + 1, palm.lean) }));
export const fernGeometry = fern(1);
export const bigLeafGeometry = bigLeaf(1);
export const tuftGeometry = tuft();
export const jungleBoulders = [boulder(1, 0), boulder(2, .75), boulder(3, 1)];

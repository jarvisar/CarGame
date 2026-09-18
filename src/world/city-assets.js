import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vehicleGeometry, TRAFFIC_MODELS } from '../traffic-models.js';

// Small merged, flat-shaded street furniture with its colours baked into
// vertex colours, so one instanced mesh per kind draws a whole chunk's worth.
export class Parts {
  constructor() { this.parts = []; }
  add(source, position, color, rotation = [0, 0, 0]) {
    let g = source;
    if (g.index) { g = source.toNonIndexed(); source.dispose(); }
    g.deleteAttribute('uv');
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
    g.translate(...position);
    const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); this.parts.push(g);
  }
  box(p, size, color, rotation) { this.add(new THREE.BoxGeometry(...size), p, color, rotation); }
  cylinder(p, top, bottom, height, color, sides = 8, rotation) { this.add(new THREE.CylinderGeometry(top, bottom, height, sides), p, color, rotation); }
  cone(p, radius, height, color, sides = 8) { this.add(new THREE.ConeGeometry(radius, height, sides), p, color); }
  beam(a, b, width, color, sides = 5) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const g = new THREE.CylinderGeometry(width, width, direction.length(), sides);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    this.add(g, from.add(to).multiplyScalar(.5).toArray(), color);
  }
  // A pitched roof over a footprint: two slabs and the two gable triangles.
  gable(p, width, length, wallHeight, ridgeHeight, wall, roof, overhang = .35) {
    const [x, y, z] = p, rise = ridgeHeight - wallHeight, half = width / 2;
    const slope = Math.atan2(rise, half), run = Math.hypot(half, rise) + overhang;
    for (const side of [-1, 1]) {
      this.box([x + side * (half + overhang) / 2, y + wallHeight + rise / 2 + .1, z], [run, .22, length + overhang * 2], roof, [0, 0, -side * slope]);
    }
    const ends = [];
    for (const zEnd of [z - length / 2, z + length / 2]) {
      ends.push(x - half, y + wallHeight, zEnd, x + half, y + wallHeight, zEnd, x, y + ridgeHeight, zEnd);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(ends, 3));
    g.computeVertexNormals(); this.add(g, [0, 0, 0], wall);
  }
  finish() {
    const g = mergeGeometries(this.parts); this.parts.forEach(part => part.dispose());
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
}

const iron = '#3d4246', darkIron = '#2f3336', galvanised = '#9da3a6', timber = '#6b5a48';

// A street lamp: a tapered column with an arm reaching over the road, unlit
// in the daytime storm. Local -x is toward the road.
function lampPost() {
  const p = new Parts();
  p.cylinder([0, 3.6, 0], .09, .15, 7.2, iron, 6);
  p.cylinder([0, .18, 0], .22, .26, .36, darkIron, 6);
  p.beam([0, 7.15, 0], [-1.6, 7.55, 0], .07, iron);
  p.box([-1.75, 7.5, 0], [.9, .24, .36], darkIron);
  p.box([-1.75, 7.36, 0], [.7, .06, .28], '#d9d5c4');
  return p.finish();
}
// A pedestal traffic signal on a street corner: three lamps in a hood.
function trafficSignal() {
  const p = new Parts();
  p.cylinder([0, 2.2, 0], .07, .1, 4.4, iron, 6);
  p.box([0, 4.6, 0], [.34, 1.05, .3], darkIron);
  for (const [y, color] of [[4.92, '#c8382b'], [4.6, '#d9a23a'], [4.28, '#3f9a55']]) p.box([-.15, y, 0], [.06, .22, .22], color);
  p.box([-.2, 5.16, 0], [.24, .06, .4], darkIron);
  return p.finish();
}
// A promenade bench facing the water.
function bench() {
  const p = new Parts();
  for (const z of [-.8, .8]) {
    p.box([0, .24, z], [.5, .48, .08], darkIron);
    p.box([.28, .62, z], [.08, .45, .08], darkIron);
  }
  p.box([0, .47, 0], [.55, .07, 1.9], timber);
  p.box([.3, .84, 0], [.07, .42, 1.9], timber);
  return p.finish();
}
// A bus shelter: a flat roof on two posts with a glass back and a stop sign.
function busShelter() {
  const p = new Parts();
  for (const z of [-1.7, 1.7]) p.box([.6, 1.25, z], [.1, 2.5, .1], iron);
  p.box([0, 2.55, 0], [1.6, .12, 4], darkIron);
  p.box([.62, 1.35, 0], [.04, 2, 3.5], '#5c6b74');
  p.box([0, .45, 0], [.5, .06, 3], timber);
  p.box([-.9, 2.9, 1.6], [.06, .5, .5], '#2f5f8a');
  p.cylinder([-.9, 1.4, 1.6], .05, .05, 2.8, iron, 5);
  return p.finish();
}
// A four-metre run of quay railing, laid along z.
function railing() {
  const p = new Parts();
  p.box([0, 1.02, 0], [.07, .09, 4], iron);
  p.box([0, .5, 0], [.05, .05, 4], iron);
  for (const z of [-2, -1, 0, 1, 2]) p.box([0, .52, z], [.05, 1.04, .05], darkIron);
  return p.finish();
}
// A bollard by the water and a bin by the bench.
function bollard() {
  const p = new Parts();
  p.cylinder([0, .42, 0], .12, .14, .84, darkIron, 6);
  p.cylinder([0, .88, 0], .1, .13, .1, galvanised, 6);
  return p.finish();
}
// A round manhole cover in the road.
function manhole() {
  const p = new Parts();
  p.cylinder([0, .015, 0], .52, .52, .03, '#35383b', 10);
  return p.finish();
}

export const cityAssets = { lamp: lampPost(), signal: trafficSignal(), bench: bench(), shelter: busShelter(), railing: railing(), bollard: bollard(), manhole: manhole() };

// Parked cars reuse the traffic fleet's bodies: the paint shell carries a
// per-instance colour and everything else keeps its own baked colours.
function parkedCar(spec) {
  const { paint, details, headlights, taillights } = vehicleGeometry(spec);
  const tint = (g, color) => {
    const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); return g;
  };
  const trim = mergeGeometries([details, tint(headlights, '#d8d4c2'), tint(taillights, '#8a3a30')]);
  for (const g of [details, headlights, taillights]) g.dispose();
  paint.computeBoundingSphere(); trim.computeBoundingSphere();
  return { paint, trim };
}
export const parkedCars = Object.fromEntries(TRAFFIC_MODELS.map(spec => [spec.name, parkedCar(spec)]));
export const PARKED_PAINTS = ['#c9bda3', '#dedbd1', '#4f7086', '#7a8b84', '#9c4a41', '#b8944a', '#4f585e', '#a9b4b9', '#6a6078', '#3b6f6d', '#2e3236'];

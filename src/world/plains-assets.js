import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomAt } from './route.js';
import { waterClock } from './water.js';

const up = new THREE.Vector3(0, 1, 0);

// Farm-country trees, one unit tall, built like the coast's cypresses: a few
// open bark cylinders for the trunk and limbs, and lobed crowns whose shading
// is baked into vertex colours so a per-instance tint still reads as foliage.
function plainsTree(seed, kind) {
  const bark = [], leaves = [];
  const branch = (from, to, width) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), direction = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(width * .6, width, direction.length(), 5, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize()));
    g.translate(...a.add(b).multiplyScalar(.5).toArray()); bark.push(g);
  };
  const lobe = (center, size, angle, salt) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(size[0] * (.9 + randomAt(salt, seed + 931) * .2), size[1], size[0] * (.9 + randomAt(salt, seed + 932) * .2));
    g.rotateY(angle); g.translate(...center);
    const colors = [], normals = g.attributes.normal;
    for (let j = 0; j < normals.count; j += 3) {
      const upward = (normals.getY(j) + normals.getY(j + 1) + normals.getY(j + 2)) / 3;
      const shade = .74 + Math.max(0, upward) * .25 + randomAt(j, salt + seed * 7 + 933) * .05;
      for (let k = 0; k < 3; k++) colors.push(shade, shade, shade * .97);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    leaves.push(g);
  };
  if (kind === 'poplar') {
    // Tall and narrow: a straight trunk with crowns stacked up it.
    branch([0, -.08, 0], [.01, .5, 0], .05); branch([.01, .5, 0], [.02, .82, 0], .03);
    lobe([0, .38, 0], [.2, .24], 0, 1); lobe([.01, .6, 0], [.18, .22], 1.1, 2); lobe([.02, .82, 0], [.13, .19], 2.3, 3);
  } else if (kind === 'willow') {
    // A short leaning trunk under a wide, drooping crown along the creek.
    branch([0, -.08, 0], [.12, .3, .04], .07); branch([.12, .3, .04], [.22, .52, .02], .045);
    for (let i = 0; i < 5; i++) {
      const angle = i * 1.26 + randomAt(i, seed + 941) * .5, r = .24 + randomAt(i, seed + 942) * .14;
      branch([.16, .4, .03], [.2 + Math.cos(angle) * r * .8, .5 + randomAt(i, seed + 943) * .12, Math.sin(angle) * r * .8], .022);
      lobe([.2 + Math.cos(angle) * r, .5 + randomAt(i, seed + 944) * .1, Math.sin(angle) * r], [.3, .17], angle, i + 10);
    }
    lobe([.2, .66, 0], [.3, .16], .7, 20);
  } else {
    // A broad oak: a forked trunk with five crowns around a taller one.
    const lean = .16;
    branch([0, -.08, 0], [lean * .3, .32, .02], .075); branch([lean * .3, .32, .02], [lean, .56, -.02], .05);
    for (let i = 0; i < 5; i++) {
      const angle = i * 1.26 + randomAt(i, seed + 951) * .6, r = .2 + randomAt(i, seed + 952) * .16;
      const crown = [lean + Math.cos(angle) * r, .6 + randomAt(i, seed + 953) * .14, Math.sin(angle) * r * .85];
      branch([lean * .7, .38 + i * .03, 0], crown, .028);
      lobe(crown, [.27 + randomAt(i, seed + 954) * .1, .2 + randomAt(i, seed + 955) * .06], angle, i);
    }
    lobe([lean, .8, 0], [.3, .21], .4, 30);
  }
  const result = { bark: mergeGeometries(bark), leaves: mergeGeometries(leaves) };
  for (const part of [...bark, ...leaves]) part.dispose();
  result.bark.computeBoundingSphere(); result.leaves.computeBoundingSphere();
  return result;
}
export const plainsTrees = { oak: [plainsTree(1, 'oak'), plainsTree(2, 'oak')], poplar: [plainsTree(3, 'poplar'), plainsTree(4, 'poplar')], willow: [plainsTree(5, 'willow')] };

// A round bale lying on its side, axis across x. The wrapped side is lighter
// than the cut ends, with a faint band every few segments.
function bale() {
  const g = new THREE.CylinderGeometry(.75, .75, 1.3, 10, 1).toNonIndexed();
  g.deleteAttribute('uv'); g.rotateZ(Math.PI / 2);
  const colors = [], positions = g.attributes.position, normals = g.attributes.normal;
  for (let i = 0; i < positions.count; i += 3) {
    const nx = (normals.getX(i) + normals.getX(i + 1) + normals.getX(i + 2)) / 3;
    const end = Math.abs(nx) > .5;
    const band = Math.floor(Math.atan2(positions.getY(i), positions.getZ(i)) / Math.PI * 5 + 5) % 3 === 0;
    const shade = end ? .8 : band ? .93 : 1;
    for (let k = 0; k < 3; k++) colors.push(shade, shade * (end ? .95 : 1), shade * .92);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
export const baleGeometry = bale();

// Cattle for the pastures: a few boxes with the head and legs a shade darker
// than the flank, so a per-instance coat colour still reads as an animal.
function cow() {
  const parts = [];
  const box = (size, position, shade) => {
    const g = new THREE.BoxGeometry(...size).toNonIndexed(); g.deleteAttribute('uv'); g.translate(...position);
    const colors = new Float32Array(g.attributes.position.count * 3).fill(shade);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
  };
  box([.95, .78, 1.75], [0, 1.02, 0], 1);
  box([.5, .46, .62], [0, 1.22, -1.08], .82);
  box([.62, .12, .12], [0, 1.48, -1.02], .55);
  for (const x of [-.3, .3]) for (const z of [-.62, .62]) box([.19, .66, .19], [x, .33, z], .78);
  box([.08, .5, .08], [0, .95, .9], .6);
  const g = mergeGeometries(parts); parts.forEach(part => part.dispose());
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
export const cowGeometry = cow();

// A clump of rushes at the water's edge: bent blades, like the desert grass.
function rushes() {
  const positions = [];
  for (let i = 0; i < 11; i++) {
    const angle = i * 2.399963, x = Math.cos(angle), z = Math.sin(angle);
    const height = .7 + randomAt(i, 962) * .6, bend = .18 + randomAt(i, 963) * .22;
    positions.push(-z * .04, 0, x * .04, x * bend * .5, height * .72, z * bend * .5, z * .04, 0, -x * .04,
      z * .04, 0, -x * .04, x * bend * .5, height * .72, z * bend * .5, x * bend, height, z * bend);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
export const rushGeometry = rushes();

// Crows: the gull's silhouette, smaller and dark. The flock circles a field
// in the vertex shader off the shared water clock, so it costs one draw call
// and nothing per frame, and it pauses with the scene like the parrots.
export const crowGeometry = new THREE.BufferGeometry();
crowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, -.38, -.65, .08, 0, -.1, 0, .3, -.65, .08, 0, -1.5, -.12, .45, -.1, 0, .3,
  0, 0, -.38, .1, 0, .3, .65, .08, 0, .65, .08, 0, .1, 0, .3, 1.5, -.12, .45,
  -.13, 0, .2, .13, 0, .2, 0, 0, .68,
].map(v => v * .72), 3));
crowGeometry.computeVertexNormals(); crowGeometry.computeBoundingSphere();
export const crowMaterial = new THREE.MeshBasicMaterial({ color: '#2b2622', side: THREE.DoubleSide, toneMapped: false });
crowMaterial.onBeforeCompile = shader => {
  shader.uniforms.plainsTime = waterClock.time;
  shader.vertexShader = 'uniform float plainsTime;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    float phase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
    float flap = sin(plainsTime * 6.2 + phase) * smoothstep(-0.4, 0.5, sin(plainsTime * 0.7 + phase));
    transformed.y += abs(position.x) * (0.1 + flap * 0.3);
    float orbit = plainsTime * 0.21 + phase;
    float yaw = orbit + 1.5708;
    mat2 heading = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw));
    transformed.xz = heading * transformed.xz;
    transformed += vec3(cos(orbit) * 11.0, sin(plainsTime * 1.1 + phase) * 0.6, sin(orbit) * 11.0);
  `);
};
crowMaterial.customProgramCacheKey = () => 'plains-crows-v1';

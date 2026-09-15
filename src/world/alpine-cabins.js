import * as THREE from 'three';
import { randomAt } from './route.js';
import { alpineLake, snowHeight, snowPosition } from './snow-route.js';

export const CABIN_SPACING = 512;
export function alpineCabin(index) {
  const s = index * CABIN_SPACING + 54 + randomAt(index, 884) * 44;
  const u = alpineLake(s).near + 8;
  return { s, u, y: snowHeight(s, u) + .25 };
}
export function nearCabin(s, u) {
  const cabin = alpineCabin(Math.floor(s / CABIN_SPACING));
  return Math.abs(s - cabin.s) < 10 && Math.abs(u - cabin.u) < 8;
}

const wood = new THREE.MeshStandardMaterial({ color: '#665048', roughness: .92, flatShading: true });
const snow = new THREE.MeshStandardMaterial({ color: '#c7d2df', roughness: .95 });
const dark = new THREE.MeshStandardMaterial({ color: '#303c44', roughness: .8 });
const glass = new THREE.MeshBasicMaterial({ color: '#ffc27b', toneMapped: false });
const box = new THREE.BoxGeometry(1, 1, 1);
const vertices = [
  -1,0,1, 1,0,1, 0,1,1, 1,0,-1, -1,0,-1, 0,1,-1,
  -1,0,-1, -1,0,1, 0,1,1, -1,0,-1, 0,1,1, 0,1,-1,
  1,0,1, 1,0,-1, 0,1,-1, 1,0,1, 0,1,-1, 0,1,1,
];
const gable = new THREE.BufferGeometry(); gable.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); gable.computeVertexNormals();

export function buildAlpineCabin(index, start) {
  const cabin = alpineCabin(index), p = snowPosition(cabin.s, cabin.u, cabin.y);
  const group = new THREE.Group(); group.name = 'lakeside-cabin'; group.position.set(p.x, p.y, p.z + start);
  const batches = new Map(), transform = new THREE.Object3D();
  const part = (mat, position, scale, rotation = 0, geo = box) => {
    transform.position.set(...position); transform.scale.set(...scale); transform.rotation.set(0, 0, rotation); transform.updateMatrix();
    if (geo === box) {
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push(transform.matrix.clone());
    } else {
      const mesh = new THREE.Mesh(geo, mat); mesh.applyMatrix4(transform.matrix);
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
  };
  part(wood, [0, 1.5, 0], [4.8, 3, 6]); part(wood, [0, 3, 0], [2.4, 2.15, 3], 0, gable);
  for (const side of [-1, 1]) part(snow, [side * 1.55, 4.05, 0], [4, .28, 7.1], side * -.64);
  part(dark, [1.35, 5.1, -.8], [.65, 2.05, .7]);
  for (const z of [-1.45, 1.45]) {
    part(glass, [-2.415, 1.65, z], [.025, 1.15, 1.1]);
    part(wood, [-2.44, 1.65, z], [.035, 1.2, .075]);
  }
  part(glass, [0, 3.6, 3.025], [.85, .7, .025]);
  part(wood, [0, .9, 3.025], [.95, 1.8, .05]);
  for (const x of [-1.9, 1.9]) for (const z of [-2.5, 2.5]) part(wood, [x, -.65, z], [.26, 1.5, .26]);
  for (const [mat, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(box, mat, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = mat !== glass; mesh.receiveShadow = mat !== glass; mesh.computeBoundingSphere(); group.add(mesh);
  }
  return group;
}

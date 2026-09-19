import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CoastalBirds } from '../src/world/birds.js';

test('gulls face their actual flight direction throughout turns on curved coastlines', () => {
  const matrix = new THREE.Matrix4();
  for (const index of [-30, -3, 0, 21, 99]) {
    const birds = new CoastalBirds({ index, start: index * 128, group: new THREE.Group() });
    const positions = time => {
      birds.update(time);
      return Array.from({ length: 4 }, (_, i) => {
        birds.mesh.getMatrixAt(i, matrix);
        return new THREE.Vector3().setFromMatrixPosition(matrix);
      });
    };
    for (let time = 0; time < 80; time += .7) {
      const before = positions(time - .02), after = positions(time + .02);
      birds.update(time);
      for (let i = 0; i < 4; i++) {
        birds.mesh.getMatrixAt(i, matrix);
        const forward = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
        const velocity = after[i].sub(before[i]).normalize();
        assert.ok(forward.dot(velocity) > .999, `gull ${i} flies sideways at ${index}, ${time}`);
      }
    }
    positions(13);
    const pose = birds.mesh.instanceMatrix.array.slice();
    positions(4); positions(13);
    assert.deepEqual(birds.mesh.instanceMatrix.array, pose, 'flight must be deterministic when pausing or restoring a chunk');
  }
});

test('neighboring gulls change their relative positions instead of turning in lockstep', () => {
  const birds = new CoastalBirds({ index: 0, start: 0, group: new THREE.Group() });
  const matrix = new THREE.Matrix4();
  const formation = time => {
    birds.update(time);
    return Array.from({ length: 4 }, (_, i) => {
      birds.mesh.getMatrixAt(i, matrix);
      return new THREE.Vector3().setFromMatrixPosition(matrix);
    });
  };
  const first = formation(0), later = formation(12);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const before = first[i].clone().sub(first[j]);
    const after = later[i].clone().sub(later[j]);
    assert.ok(before.distanceTo(after) > 3, 'birds should have independent turn timing and paths');
  }
});

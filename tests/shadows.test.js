import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitSunShadow } from '../src/shadows.js';

test('sun shadows cover screen edges across journeys, zoom, resize and origin shifts', () => {
  for (const aspect of [390 / 844, 1.44, 16 / 9, 32 / 9]) {
    for (const size of [165, 200, 235, 263.2]) {
      for (const offset of [[-110, 240, 100], [-170, 150, 120], [-150, 230, 110]]) {
        for (const z of [0, -1000, 1000]) {
          const target = new THREE.Vector3(25, 65, z);
          const camera = new THREE.OrthographicCamera(-size * aspect / 2, size * aspect / 2, size / 2, -size / 2, 1, 1200);
          camera.position.copy(target).add(new THREE.Vector3(-220, 245, 260));
          camera.lookAt(target);
          const sun = new THREE.DirectionalLight();
          sun.position.copy(target).add(new THREE.Vector3(...offset));
          sun.target.position.copy(target);
          fitSunShadow(camera, sun);
          const direction = camera.getWorldDirection(new THREE.Vector3());
          const towardSun = new THREE.Vector3(...offset).normalize();
          for (const x of [-1, -.5, 0, .5, 1]) for (const y of [-1, 0, 1]) {
            for (const height of [-40, 0, 65, 120, 180]) {
              const receiver = new THREE.Vector3(x, y, -1).unproject(camera);
              receiver.addScaledVector(direction, (height - receiver.y) / direction.y);
              // An offscreen object can still cast onto a visible receiver.
              for (const distance of [0, 150]) {
                const projected = receiver.clone().addScaledVector(towardSun, distance).project(sun.shadow.camera);
                assert.ok(Math.max(Math.abs(projected.x), Math.abs(projected.y), Math.abs(projected.z)) < 1,
                  `clipped shadow at aspect=${aspect}, size=${size}, screen=${x},${y}, height=${height}`);
              }
            }
          }
        }
      }
    }
  }
});

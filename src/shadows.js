import * as THREE from 'three';

// Enclose the visible terrain, from the valleys to the highest snowy peaks.
// Projecting both height planes also covers elevated shadow receivers.
export function fitSunShadow(camera, sun) {
  camera.updateMatrixWorld();
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  const lightCamera = sun.shadow.camera;
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const height of [-40, 180]) {
    point.set(x, y, -1).unproject(camera);
    point.addScaledVector(direction, (height - point.y) / direction.y);
    bounds.expandByPoint(point.applyMatrix4(lightCamera.matrixWorldInverse));
  }
  // Leave a border for filtering and depth room for offscreen casters.
  const padding = 24;
  lightCamera.left = bounds.min.x - padding;
  lightCamera.right = bounds.max.x + padding;
  lightCamera.bottom = bounds.min.y - padding;
  lightCamera.top = bounds.max.y + padding;
  lightCamera.near = -bounds.max.z - 250;
  lightCamera.far = -bounds.min.z + 250;
  lightCamera.updateProjectionMatrix();
}

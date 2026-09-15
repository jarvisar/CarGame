import * as THREE from 'three';

// Enclose the visible terrain, from valleys to peaks. Routes with a changing
// elevation datum pass the local height so coverage travels with the landscape.
// Translating both height planes preserves the shadow map's texel density.
export function fitSunShadow(camera, sun, heightOrigin = 0) {
  camera.updateMatrixWorld();
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  const lightCamera = sun.shadow.camera;
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  if (camera.isPerspectiveCamera) {
    // A chase view includes the horizon. Fit nearby shadows to a bounded
    // frustum instead of projecting parallel rays onto distant height planes.
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const depth of [camera.near, Math.min(100, camera.far)]) {
      point.set(x, y, 1).unproject(camera);
      point.sub(camera.position).multiplyScalar(depth / camera.far).add(camera.position);
      bounds.expandByPoint(point.applyMatrix4(lightCamera.matrixWorldInverse));
    }
  } else {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const height of [-40, 180]) {
      point.set(x, y, -1).unproject(camera);
      point.addScaledVector(direction, (heightOrigin + height - point.y) / direction.y);
      bounds.expandByPoint(point.applyMatrix4(lightCamera.matrixWorldInverse));
    }
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

import * as THREE from 'three';

export class ThirdPersonCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(45, 1, .1, 1200);
    this.initialized = false;
    this.heading = 0;
    this.pitch = 0;
    this.forward = new THREE.Vector3();
    this.target = new THREE.Vector3();
  }
  resize(aspect) {
    this.camera.aspect = aspect;
    // Preserve enough horizontal room for the car on narrow phones.
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.PI / 8) / Math.min(aspect, 1)));
    this.camera.updateProjectionMatrix();
  }
  snap() { this.initialized = false; }
  update(car, dt) {
    const heading = -car.rotation.y;
    if (!this.initialized) {
      this.heading = heading; this.pitch = car.rotation.x; this.initialized = true;
    } else {
      const difference = Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading));
      this.heading += difference * (1 - Math.exp(-dt * 5));
      this.pitch = THREE.MathUtils.damp(this.pitch, car.rotation.x, 5, dt);
    }
    this.forward.set(Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.camera.position.copy(car.position).addScaledVector(this.forward, -14);
    this.camera.position.y += 8 - Math.sin(this.pitch) * 14;
    this.target.copy(car.position).addScaledVector(this.forward, 5);
    this.target.y += 1 + Math.sin(this.pitch) * 5;
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ThirdPersonCamera } from '../src/third-person-camera.js';
import { touchDrivingInput, TouchDrivingFrame } from '../src/touch-stick.js';
import { DrivingController } from '../src/vehicle.js';
import { coastalDrivingRoute } from '../src/world/route.js';
import { desertDrivingRoute } from '../src/world/desert-route.js';
import { snowDrivingRoute } from '../src/world/snow-route.js';
import { fitSunShadow } from '../src/shadows.js';

test('third-person view stays behind the car, frames it on phones, and survives origin shifts', () => {
  for (const aspect of [390 / 844, 844 / 390, 16 / 9]) for (const heading of [-3, 0, 2]) {
    const car = new DrivingController(); car.heading = heading; car.update(0, {});
    const rig = new ThirdPersonCamera(); rig.resize(aspect); rig.update(car.car, 0);
    const forward = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
    assert.ok(rig.camera.position.clone().sub(car.car.position).dot(forward) < -13.9);
    const projected = car.car.position.clone().project(rig.camera);
    assert.ok(Math.abs(projected.x) < .01 && projected.y > -.8 && projected.y < 0);
    car.render(1, 20000); rig.update(car.car, 1 / 60);
    assert.ok(projected.distanceTo(car.car.position.clone().project(rig.camera)) < 1e-9);
  }
});

test('perspective joystick follows all screen directions on every route and after rebasing', () => {
  const directions = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const route of [coastalDrivingRoute, desertDrivingRoute, snowDrivingRoute]) {
    for (const aspect of [390 / 844, 844 / 390]) for (const s of [24, 148, 420, 20025]) {
      for (const [x, y] of directions) {
        const car = new DrivingController(route, { s });
        const origin = Math.floor(s / 1024) * 1024;
        car.render(1, origin);
        const rig = new ThirdPersonCamera(); rig.resize(aspect); rig.update(car.car, 0);
        // Also exercise an off-center car, where perspective depth matters.
        rig.camera.position.x += 1;
        rig.camera.updateMatrixWorld();
        const before = car.car.position.clone().project(rig.camera), length = Math.hypot(x, y);
        const input = touchDrivingInput({ x: x / length, y: y / length }, rig.camera, route, car.s, car.u, origin);
        car.update(1 / 60, { touchDrive: input }); car.render(1, origin);
        const after = car.car.position.clone().project(rig.camera);
        const dx = (after.x - before.x) * aspect, dy = after.y - before.y;
        const alignment = (dx * x + dy * y) / (Math.hypot(dx, dy) * length);
        assert.ok(alignment > .999, `screen ${x},${y} at ${s}: ${alignment}`);
      }
    }
  }
});

test('camera follows during a held joystick drag without rotating the input frame', () => {
  const car = new DrivingController();
  const rig = new ThirdPersonCamera(); rig.resize(390 / 844); rig.update(car.car, 0);
  const rotation = rig.camera.quaternion.clone();
  const frame = new TouchDrivingFrame();
  for (let i = 0; i < 60; i++) {
    const camera = frame.update(rig.camera, car.car.position, 1);
    car.update(1 / 60, { touchDrive: touchDrivingInput({ x: 0, y: -1 }, camera, car.route, car.s, car.u) });
    rig.update(car.car, 1 / 60);
    assert.ok(1 - Math.abs(camera.quaternion.dot(rotation)) < 1e-10);
  }
  assert.ok(car.speed > 1);
  assert.ok(Math.abs(rig.camera.quaternion.dot(rotation)) < .1);
  assert.ok(Math.cos(rig.heading - car.heading) > .999);
  assert.equal(frame.update(rig.camera, car.car.position, null), rig.camera);
  const nextDrag = frame.update(rig.camera, car.car.position, 1);
  assert.ok(1 - Math.abs(nextDrag.quaternion.dot(rig.camera.quaternion)) < 1e-10);
  for (let i = 0; i < 120; i++) {
    car.update(1 / 60, { touchDrive: { amount: 0 } }); rig.update(car.car, 1 / 60);
  }
  assert.equal(car.speed, 0);
  assert.ok(Math.cos(rig.heading - car.heading) > .999);
  car.heading = 1.2; car.update(0, {}); rig.snap(); rig.update(car.car, 0);
  assert.ok(Math.abs(rig.heading - car.heading) < 1e-9);
});

test('held touch frame tracks translation and origin shifts and resets outside third person', () => {
  const car = new DrivingController(), rig = new ThirdPersonCamera(), frame = new TouchDrivingFrame();
  rig.update(car.car, 0);
  const camera = frame.update(rig.camera, car.car.position, 4);
  const projected = car.car.position.clone().project(camera);
  car.car.position.add(new THREE.Vector3(12, 3, 20000));
  rig.update(car.car, 1 / 60);
  frame.update(rig.camera, car.car.position, 4);
  assert.ok(projected.distanceTo(car.car.position.clone().project(camera)) < 1e-9);
  const scenic = new THREE.OrthographicCamera();
  assert.equal(frame.update(scenic, car.car.position, 4), scenic);
  car.car.rotation.y = -1;
  rig.snap(); rig.update(car.car, 0);
  assert.ok(frame.update(rig.camera, car.car.position, 4).quaternion.angleTo(rig.camera.quaternion) < 1e-7);
});

test('perspective shadows cover nearby receivers without changing the camera projection', () => {
  for (const aspect of [390 / 844, 844 / 390]) {
    const rig = new ThirdPersonCamera(), car = new DrivingController();
    rig.resize(aspect); rig.update(car.car, 0);
    const sun = new THREE.DirectionalLight();
    sun.position.copy(car.car.position).add(new THREE.Vector3(-145, 230, 95));
    sun.target.position.copy(car.car.position);
    const projection = rig.camera.projectionMatrix.clone();
    fitSunShadow(rig.camera, sun);
    assert.deepEqual(rig.camera.projectionMatrix.elements, projection.elements);
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
      const point = new THREE.Vector3(x, y, 1).unproject(rig.camera);
      point.sub(rig.camera.position).multiplyScalar(90 / rig.camera.far).add(rig.camera.position);
      point.project(sun.shadow.camera);
      assert.ok(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) < 1);
    }
  }
});

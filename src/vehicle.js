import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, coastalDrivingRoute } from './world/route.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .74, flatShading: true, ...extra });
function box(group, size, location, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...location); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
export function createCar() {
  const car = new THREE.Group();
  const body = new THREE.Group(); car.add(body);
  const paint = mat('#d96143'); const roof = mat('#f5e8c8'); const glass = mat('#36545a', { roughness: .3, metalness: .16 });
  const tires = mat('#303b36'); const chrome = mat('#c9cbb6', { metalness: .2 });
  const front = mat('#fff5cf', { emissive: '#e9cc84', emissiveIntensity: .24 });
  const rear = mat('#8e3328', { emissive: '#b8220d', emissiveIntensity: .1 });
  const nightLights = [{ material: front, day: .24, night: 2.2 }, { material: rear, day: .1, night: 2.5 }];
  box(body, [2.05, .64, 3.9], [0, .9, 0], paint);
  box(body, [1.96, .24, 1.12], [0, 1.3, -1.32], paint);
  box(body, [1.92, .22, .74], [0, 1.28, 1.51], paint);
  box(body, [1.77, .81, 1.9], [0, 1.57, .12], glass);
  box(body, [1.89, .16, 2.03], [0, 2.04, .13], roof);
  for (const side of [-1, 1]) {
    for (const z of [-.77, .23, 1.03]) box(body, [.095, .85, .09], [side * .9, 1.61, z], paint);
    box(body, [.085, .16, 2], [side * .92, 1.24, .14], paint);
    box(body, [.09, .08, .27], [side * 1.03, 1.14, .52], chrome);
    box(body, [.23, .15, .29], [side * 1.1, 1.42, -.64], paint);
    box(body, [.42, .25, .055], [side * .64, 1.03, -1.978], front);
    box(body, [.33, .18, .05], [side * .72, 1.03, 1.978], rear);
  }
  box(body, [1.98, .14, .17], [0, .64, -1.97], chrome);
  box(body, [1.98, .14, .17], [0, .64, 1.97], chrome);
  const plate = box(body, [.6, .22, .02], [0, .91, 2.002], roof);
  box(body, [.77, .18, .02], [0, .89, -2.002], tires);
  // Fixed body parts sharing a material can draw together. The plate still
  // moves for the spare tire; accessories and animated wheels stay separate.
  const batches = new Map();
  for (const mesh of body.children) {
    if (mesh === plate) continue;
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(mesh);
  }
  for (const [material, parts] of batches) {
    if (parts.length < 2) continue;
    for (const part of parts) { part.updateMatrix(); part.geometry.applyMatrix4(part.matrix); }
    const mesh = new THREE.Mesh(mergeGeometries(parts.map(part => part.geometry)), material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    for (const part of parts) { body.remove(part); part.geometry.dispose(); }
    body.add(mesh);
  }
  // Keep the coastal design, with a small accessory swap for each other journey.
  const rack = new THREE.Group(); rack.name = 'roof-rack'; body.add(rack);
  for (const z of [-.48, .75]) box(rack, [1.65, .09, .12], [0, 2.2, z], tires);
  const surfboard = new THREE.Group(); surfboard.name = 'surfboard'; body.add(surfboard);
  const boardShape = new THREE.Shape();
  boardShape.moveTo(0, -1.65); boardShape.quadraticCurveTo(.5, -1.35, .47, .65); boardShape.quadraticCurveTo(.43, 1.55, 0, 1.65); boardShape.quadraticCurveTo(-.43, 1.55, -.47, .65); boardShape.quadraticCurveTo(-.5, -1.35, 0, -1.65);
  const board = new THREE.Mesh(new THREE.ExtrudeGeometry(boardShape, { depth: .11, bevelEnabled: false, curveSegments: 3 }), roof);
  board.rotation.x = Math.PI / 2; board.position.set(.14, 2.38, .04); board.castShadow = true; surfboard.add(board);
  box(surfboard, [.065, .02, 2.85], [.14, 2.385, .02], paint);
  const spare = new THREE.Group(); spare.name = 'desert-spare'; spare.position.set(0, 1.22, 2.12); body.add(spare);
  const spareTire = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .28, 12), tires);
  spareTire.rotation.x = Math.PI / 2; spareTire.castShadow = true; spare.add(spareTire);
  const spareHub = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .295, 10), roof);
  spareHub.rotation.x = Math.PI / 2; spare.add(spareHub);
  const roofBox = new THREE.Group(); roofBox.name = 'alpine-roof-box'; body.add(roofBox);
  box(roofBox, [1.24, .3, 1.86], [0, 2.4, .13], tires);
  box(roofBox, [1.16, .12, 1.72], [0, 2.61, .13], mat('#536774'));
  for (const x of [-.4, .4]) box(roofBox, [.07, .025, 1.74], [x, 2.68, .13], chrome);
  const cargo = new THREE.Group(); cargo.name = 'jungle-cargo'; body.add(cargo);
  const olive = mat('#5f6b3f'), canvas = mat('#c9b48b');
  for (const x of [-.52, .52]) box(cargo, [.44, .34, .3], [x, 2.42, -.55], olive);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, 1.5, 8), canvas);
  roll.rotation.z = Math.PI / 2; roll.position.set(0, 2.44, .55); roll.castShadow = true; cargo.add(roll);
  const wheels = [];
  for (const x of [-1.02, 1.02]) for (const z of [-1.18, 1.21]) {
    const pivot = new THREE.Group(); pivot.position.set(x, .49, z); car.add(pivot);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .28, 12), tires); wheel.rotation.z = Math.PI / 2; wheel.castShadow = true; pivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .295, 10), roof); hub.rotation.z = Math.PI / 2; pivot.add(hub);
    wheels.push({ pivot, wheel, hub, front: z < 0 });
  }
  // Reuse the model and its materials so repeated route changes stay bounded.
  function setAppearance(journey) {
    paint.color.set({ coast: '#d96143', desert: '#78977b', snow: '#9fc4d5', jungle: '#e0b44a' }[journey] ?? '#d96143');
    surfboard.visible = journey === 'coast'; spare.visible = journey === 'desert'; roofBox.visible = journey === 'snow'; cargo.visible = journey === 'jungle';
    rack.visible = surfboard.visible || roofBox.visible || cargo.visible;
    plate.position.x = spare.visible ? -.65 : 0;
  }
  setAppearance('coast');
  return { car, body, wheels, nightLights, setAppearance };
}

export class DrivingController {
  constructor(route = coastalDrivingRoute, state = {}) {
    this.route = route;
    const model = createCar(); Object.assign(this, model);
    this.s = state.s ?? 24; this.u = 2.4; this.speed = 0; this.steer = 0; this.heading = route.frame(this.s).angle;
    this.distance = state.distance ?? 0; this.pitch = 0; this.roll = 0; this.previousSpeed = 0; this.groundedPosition = new THREE.Vector3();
    this.bodyPitch = 0; this.bodyRoll = 0; this.wheelSpin = 0;
    this.audioTelemetry = { speed: 0, throttle: 0, brake: 0, offRoad: 0 };
    const pose = () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), bodyPitch: 0, bodyRoll: 0, wheelSpin: 0, steer: 0 });
    this.previousPose = pose(); this.currentPose = pose();
    this.update(0, {});
  }
  reset() { this.u = 2.4; this.speed = 0; this.steer = 0; this.heading = this.route.frame(this.s).angle; this.update(0, {}); }
  setNight(enabled) { for (const light of this.nightLights) light.material.emissiveIntensity = enabled ? light.night : light.day; }
  setRoute(route, state = {}) {
    this.route = route; this.s = state.s ?? 24; this.distance = state.distance ?? 0;
    this.pitch = 0; this.roll = 0; this.bodyPitch = 0; this.bodyRoll = 0; this.reset();
  }
  copyPose(target, source) {
    target.position.copy(source.position); target.quaternion.copy(source.quaternion);
    for (const key of ['bodyPitch', 'bodyRoll', 'wheelSpin', 'steer']) target[key] = source[key];
  }
  resolveTrafficCollision(dx, dz, speed) {
    const frame = this.route.frame(this.s);
    this.s += (dx * Math.sin(frame.angle) - dz * Math.cos(frame.angle)) / frame.scale;
    this.u += dx * Math.cos(frame.angle) + dz * Math.sin(frame.angle);
    this.u = clamp(this.u, ...this.route.bounds(this.s));
    this.bodyPitch = clamp(this.bodyPitch + (this.speed - speed) * .003, -.09, .09);
    this.speed = speed; this.audioTelemetry.speed = speed;
    const p = this.route.position(this.s, this.u);
    this.groundedPosition.set(p.x, p.y + .13, p.z);
    this.currentPose.position.copy(this.groundedPosition); this.currentPose.bodyPitch = this.bodyPitch;
    this.render(1);
  }
  render(alpha, origin = 0) {
    const a = this.previousPose, b = this.currentPose;
    alpha = clamp(alpha, 0, 1);
    // Interpolate in global coordinates, then rebase once for the entire display frame.
    this.car.position.lerpVectors(a.position, b.position, alpha); this.car.position.z += origin;
    this.car.quaternion.slerpQuaternions(a.quaternion, b.quaternion, alpha);
    this.body.rotation.x = THREE.MathUtils.lerp(a.bodyPitch, b.bodyPitch, alpha);
    this.body.rotation.z = THREE.MathUtils.lerp(a.bodyRoll, b.bodyRoll, alpha);
    const steer = THREE.MathUtils.lerp(a.steer, b.steer, alpha);
    const spin = THREE.MathUtils.lerp(a.wheelSpin, b.wheelSpin, alpha);
    for (const w of this.wheels) { if (w.front) w.pivot.rotation.y = -steer * .38; w.wheel.rotation.x = spin; w.hub.rotation.x = spin; }
  }
  update(dt, input) {
    this.copyPose(this.previousPose, this.currentPose);
    const { frame: roadFrame, position: positionAt, height: terrainHeight } = this.route;
    const touch = input.touchDrive;
    const forward = clamp(Number(input.forward) || 0, 0, 1); const brake = clamp(Number(input.brake) || 0, 0, 1);
    this.steer = THREE.MathUtils.damp(this.steer, touch ? 0 : (Number(input.right) || 0) - (Number(input.left) || 0), 7, dt);
    const offRoad = Math.abs(this.u) > 5.1;
    let acceleration = 0;
    if (forward) acceleration += forward * (this.speed < -.3 ? 19 : 11.3);
    if (brake) acceleration -= brake * (this.speed > .3 ? 20 : 6.5);
    if (input.handbrake) acceleration -= Math.sign(this.speed) * 27;
    const drag = .7 + .0095 * this.speed * this.speed + (offRoad ? 4.2 : 0);
    if (Math.abs(this.speed) > .015) acceleration -= Math.sign(this.speed) * drag;
    if (touch) {
      this.speed = Math.abs(this.speed);
      const targetSpeed = touch.amount * (offRoad ? 15 : 28);
      acceleration = dt ? clamp((targetSpeed - this.speed) / dt, -24, 11.3) : 0;
      if (touch.amount) this.heading = touch.heading;
    }
    const oldSpeed = this.speed;
    this.speed = clamp(this.speed + acceleration * dt, touch ? 0 : -7, offRoad ? 15 : 28);
    if (!forward && !brake && oldSpeed * this.speed < 0) this.speed = 0;
    if (input.handbrake && oldSpeed * this.speed < 0) this.speed = 0;
    const frame = roadFrame(this.s);
    if (!touch) this.heading += this.steer * this.speed / 3.3 * (.52 / (1 + Math.abs(this.speed) * .105)) * dt;
    let difference = Math.atan2(Math.sin(this.heading - frame.angle), Math.cos(this.heading - frame.angle));
    // A gentle alignment assist makes long bends relaxed; steering always wins.
    if (!touch && Math.abs(this.steer) < .08 && Math.abs(this.speed) > .2 && Math.abs(difference) < 1.15) {
      const laneCorrection = clamp((this.u - 2.4) * .026, -.12, .12) * Math.sign(this.speed);
      this.heading -= (difference + laneCorrection) * Math.min(1, dt * .85);
      difference = this.heading - frame.angle;
    }
    const step = this.speed * dt;
    this.s += touch?.amount ? touch.along * step : Math.cos(difference) * step / frame.scale;
    this.u += touch?.amount ? touch.across * step : Math.sin(difference) * step;
    if (!touch && Math.abs(difference) < 1.15) this.heading += (roadFrame(this.s).angle - frame.angle) * (1 - Math.abs(this.steer)) * .92;
    this.distance += Math.abs(step);
    const [coastLimit, inlandLimit] = this.route.bounds(this.s);
    if (this.u < coastLimit || this.u > inlandLimit) {
      this.u = clamp(this.u, coastLimit, inlandLimit); this.speed *= Math.exp(-dt * 4);
    }
    const p = positionAt(this.s, this.u); p.y += .13;
    this.groundedPosition.set(p.x, p.y, p.z); this.car.position.copy(this.groundedPosition);
    const slope = (terrainHeight(this.s + 1.5, this.u) - terrainHeight(this.s - 1.5, this.u)) / 3;
    const lateralSlope = (terrainHeight(this.s, this.u + .7) - terrainHeight(this.s, this.u - .7)) / 1.4;
    this.pitch = THREE.MathUtils.damp(this.pitch, Math.atan(slope * Math.cos(difference) + lateralSlope * Math.sin(difference)), 10, dt || 1);
    this.roll = THREE.MathUtils.damp(this.roll, Math.atan(lateralSlope * Math.cos(difference) - slope * Math.sin(difference)), 9, dt || 1);
    this.car.rotation.set(0, -this.heading, 0, 'YXZ'); this.car.rotateX(this.pitch); this.car.rotateZ(this.roll);
    this.bodyRoll = THREE.MathUtils.damp(this.bodyRoll, -this.steer * this.speed * .0022, 6, dt);
    this.bodyPitch = THREE.MathUtils.damp(this.bodyPitch, -clamp(acceleration, -15, 12) * .002, 5, dt);
    this.wheelSpin -= step / .48;
    // Report actual driving effort for keyboard, analog triggers, and touch.
    // This is read-only telemetry: sound never feeds back into driving physics.
    this.audioTelemetry.speed = this.speed;
    this.audioTelemetry.throttle = input.handbrake ? 0 : touch ? clamp((acceleration + (this.speed > .015 ? drag : 0)) / 11.3, 0, 1) : this.speed < -.3 ? brake : forward;
    this.audioTelemetry.brake = input.handbrake ? 1 : touch ? clamp(-acceleration / 24, 0, 1) : this.speed < -.3 ? forward : brake;
    this.audioTelemetry.offRoad = clamp((Math.abs(this.u) - 4.8) / .7, 0, 1);
    this.currentPose.position.copy(this.groundedPosition); this.currentPose.quaternion.copy(this.car.quaternion);
    for (const key of ['bodyPitch', 'bodyRoll', 'wheelSpin', 'steer']) this.currentPose[key] = this[key];
    // Resets and journey changes are teleports, so never blend from the old location.
    if (dt === 0) this.copyPose(this.previousPose, this.currentPose);
    this.render(1);
  }
}

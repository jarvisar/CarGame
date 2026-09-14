import * as THREE from 'three';
import { clamp, coastalDrivingRoute } from './world/route.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .74, flatShading: true, ...extra });
function box(group, size, location, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...location); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
export function createCar() {
  const car = new THREE.Group();
  const body = new THREE.Group(); car.add(body);
  const coral = mat('#d96143'); const roof = mat('#f5e8c8'); const glass = mat('#36545a', { roughness: .3, metalness: .16 });
  const tires = mat('#303b36'); const chrome = mat('#c9cbb6', { metalness: .2 });
  const nightLights = [];
  box(body, [2.05, .64, 3.9], [0, .9, 0], coral);
  box(body, [1.96, .24, 1.12], [0, 1.3, -1.32], coral);
  box(body, [1.92, .22, .74], [0, 1.28, 1.51], coral);
  box(body, [1.77, .81, 1.9], [0, 1.57, .12], glass);
  box(body, [1.89, .16, 2.03], [0, 2.04, .13], roof);
  for (const side of [-1, 1]) {
    for (const z of [-.77, .23, 1.03]) box(body, [.095, .85, .09], [side * .9, 1.61, z], coral);
    box(body, [.085, .16, 2], [side * .92, 1.24, .14], coral);
    box(body, [.09, .08, .27], [side * 1.03, 1.14, .52], chrome);
    box(body, [.23, .15, .29], [side * 1.1, 1.42, -.64], coral);
    const front = mat('#fff5cf', { emissive: '#e9cc84', emissiveIntensity: .24 });
    const rear = mat('#8e3328', { emissive: '#b8220d', emissiveIntensity: .1 });
    box(body, [.42, .25, .055], [side * .64, 1.03, -1.978], front);
    box(body, [.33, .18, .05], [side * .72, 1.03, 1.978], rear);
    nightLights.push({ material: front, day: .24, night: 2.2 }, { material: rear, day: .1, night: 2.5 });
  }
  box(body, [1.98, .14, .17], [0, .64, -1.97], chrome);
  box(body, [1.98, .14, .17], [0, .64, 1.97], chrome);
  box(body, [.6, .22, .02], [0, .91, 2.002], roof);
  box(body, [.77, .18, .02], [0, .89, -2.002], tires);
  // A tiny cream surfboard gives the silhouette a Sunday-on-the-coast character.
  for (const z of [-.48, .75]) box(body, [1.65, .09, .12], [0, 2.2, z], tires);
  const boardShape = new THREE.Shape();
  boardShape.moveTo(0, -1.65); boardShape.quadraticCurveTo(.5, -1.35, .47, .65); boardShape.quadraticCurveTo(.43, 1.55, 0, 1.65); boardShape.quadraticCurveTo(-.43, 1.55, -.47, .65); boardShape.quadraticCurveTo(-.5, -1.35, 0, -1.65);
  const board = new THREE.Mesh(new THREE.ExtrudeGeometry(boardShape, { depth: .11, bevelEnabled: false, curveSegments: 3 }), roof);
  board.rotation.x = Math.PI / 2; board.position.set(.14, 2.38, .04); board.castShadow = true; body.add(board);
  box(body, [.065, .02, 2.85], [.14, 2.385, .02], coral);
  const wheels = [];
  for (const x of [-1.02, 1.02]) for (const z of [-1.18, 1.21]) {
    const pivot = new THREE.Group(); pivot.position.set(x, .49, z); car.add(pivot);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .28, 12), tires); wheel.rotation.z = Math.PI / 2; wheel.castShadow = true; pivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .295, 10), roof); hub.rotation.z = Math.PI / 2; pivot.add(hub);
    wheels.push({ pivot, wheel, hub, front: z < 0 });
  }
  return { car, body, wheels, nightLights };
}

export class DrivingController {
  constructor(route = coastalDrivingRoute) {
    this.route = route;
    const model = createCar(); Object.assign(this, model);
    this.s = 24; this.u = 2.4; this.speed = 0; this.steer = 0; this.heading = route.frame(this.s).angle;
    this.distance = 0; this.pitch = 0; this.roll = 0; this.previousSpeed = 0; this.groundedPosition = new THREE.Vector3();
    this.update(0, {});
  }
  reset() { this.u = 2.4; this.speed = 0; this.steer = 0; this.heading = this.route.frame(this.s).angle; this.update(0, {}); }
  setNight(enabled) { for (const light of this.nightLights) light.material.emissiveIntensity = enabled ? light.night : light.day; }
  setRoute(route, state = {}) {
    this.route = route; this.s = state.s ?? 24; this.distance = state.distance ?? 0;
    this.pitch = 0; this.roll = 0; this.body.rotation.set(0, 0, 0); this.reset();
  }
  update(dt, input) {
    const { frame: roadFrame, position: positionAt, height: terrainHeight } = this.route;
    const forward = input.forward ? 1 : 0; const brake = input.brake ? 1 : 0;
    this.steer = THREE.MathUtils.damp(this.steer, (input.right ? 1 : 0) - (input.left ? 1 : 0), 7, dt);
    const offRoad = Math.abs(this.u) > 5.1;
    let acceleration = 0;
    if (forward) acceleration += this.speed < -.3 ? 19 : 11.3;
    if (brake) acceleration -= this.speed > .3 ? 20 : 6.5;
    if (input.handbrake) acceleration -= Math.sign(this.speed) * 27;
    const drag = .7 + .0095 * this.speed * this.speed + (offRoad ? 4.2 : 0);
    if (Math.abs(this.speed) > .015) acceleration -= Math.sign(this.speed) * drag;
    const oldSpeed = this.speed;
    this.speed = clamp(this.speed + acceleration * dt, -7, offRoad ? 15 : 28);
    if (!forward && !brake && oldSpeed * this.speed < 0) this.speed = 0;
    if (input.handbrake && oldSpeed * this.speed < 0) this.speed = 0;
    const frame = roadFrame(this.s);
    this.heading += this.steer * this.speed / 3.3 * (.52 / (1 + Math.abs(this.speed) * .105)) * dt;
    let difference = Math.atan2(Math.sin(this.heading - frame.angle), Math.cos(this.heading - frame.angle));
    // A gentle alignment assist makes long bends relaxed; steering always wins.
    if (Math.abs(this.steer) < .08 && Math.abs(this.speed) > .2 && Math.abs(difference) < 1.15) {
      const laneCorrection = clamp((this.u - 2.4) * .026, -.12, .12) * Math.sign(this.speed);
      this.heading -= (difference + laneCorrection) * Math.min(1, dt * .85);
      difference = this.heading - frame.angle;
    }
    const step = this.speed * dt;
    this.s += Math.cos(difference) * step / frame.scale;
    this.u += Math.sin(difference) * step;
    if (Math.abs(difference) < 1.15) this.heading += (roadFrame(this.s).angle - frame.angle) * (1 - Math.abs(this.steer)) * .92;
    this.distance += Math.abs(step);
    const [coastLimit, inlandLimit] = this.route.bounds(this.s);
    if (this.u < coastLimit || this.u > inlandLimit) {
      this.u = clamp(this.u, coastLimit, inlandLimit); this.speed *= Math.exp(-dt * 4);
      this.heading = THREE.MathUtils.damp(this.heading, roadFrame(this.s).angle, 3, dt);
    }
    const p = positionAt(this.s, this.u); p.y += .13;
    this.groundedPosition.set(p.x, p.y, p.z); this.car.position.copy(this.groundedPosition);
    const slope = (terrainHeight(this.s + 1.5, this.u) - terrainHeight(this.s - 1.5, this.u)) / 3;
    const lateralSlope = (terrainHeight(this.s, this.u + .7) - terrainHeight(this.s, this.u - .7)) / 1.4;
    this.pitch = THREE.MathUtils.damp(this.pitch, Math.atan(slope * Math.cos(difference) + lateralSlope * Math.sin(difference)), 10, dt || 1);
    this.roll = THREE.MathUtils.damp(this.roll, Math.atan(lateralSlope * Math.cos(difference) - slope * Math.sin(difference)), 9, dt || 1);
    this.car.rotation.set(0, -this.heading, 0, 'YXZ'); this.car.rotateX(this.pitch); this.car.rotateZ(this.roll);
    this.body.rotation.z = THREE.MathUtils.damp(this.body.rotation.z, -this.steer * this.speed * .0022, 6, dt);
    this.body.rotation.x = THREE.MathUtils.damp(this.body.rotation.x, -clamp(acceleration, -15, 12) * .002, 5, dt);
    for (const w of this.wheels) { if (w.front) w.pivot.rotation.y = -this.steer * .38; w.wheel.rotation.x -= step / .48; w.hub.rotation.x -= step / .48; }
  }
}

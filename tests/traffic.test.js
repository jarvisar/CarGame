import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Traffic, trafficContact } from '../src/traffic.js';
import { TRAFFIC_MODELS } from '../src/traffic-models.js';
import { DrivingController } from '../src/vehicle.js';
import { coastalDrivingRoute } from '../src/world/route.js';
import { desertDrivingRoute } from '../src/world/desert-route.js';
import { snowDrivingRoute } from '../src/world/snow-route.js';

const straightRoute = {
  frame: s => ({ x: 0, y: 0, z: -s, nx: 1, nz: 0, angle: 0, scale: 1 }),
  position: (s, u) => ({ x: u, y: 0, z: -s }),
  height: () => 0,
  bounds: () => [-4.65, 4.65],
};
function setup(route = straightRoute, s = 24) {
  const scene = new THREE.Scene(), player = new DrivingController(route, { s });
  const traffic = new Traffic(scene, route, s);
  return { scene, player, traffic };
}
function footprint(car) {
  return { x: car.position.x, z: car.position.z, heading: car.heading, halfWidth: car.spec.width / 2, halfLength: car.spec.length / 2 };
}
function playerFootprint(player) {
  return { x: player.groundedPosition.x, z: player.groundedPosition.z, heading: player.heading, halfWidth: 1, halfLength: 1.96 };
}

test('traffic has five distinct shapes, varied paint, and ample initial gaps', () => {
  const { traffic } = setup();
  assert.equal(traffic.vehicles.length, 6);
  assert.equal(new Set(traffic.vehicles.map(car => car.spec.name)).size, 5);
  assert.ok(new Set(traffic.vehicles.map(car => car.paint.color.getHex())).size >= 3);
  assert.equal(new Set(TRAFFIC_MODELS.map(spec => `${spec.length}/${spec.cabin.join('/')}`)).size, 5);
  for (const car of traffic.vehicles) {
    assert.equal(car.car.children.length, 4);
    for (const mesh of car.car.children) {
      assert.ok(mesh.geometry.attributes.position.count > 0);
      assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));
    }
    assert.ok(Math.abs(car.s - 24) > 70);
    for (const other of traffic.vehicles) if (other !== car && other.direction === car.direction) assert.ok(Math.abs(other.s - car.s) > 300);
  }
  traffic.dispose();
});

test('opposite lanes pass without collision and rotated footprints collide accurately', () => {
  const a = { x: 2.4, z: 0, heading: 0, halfWidth: 1, halfLength: 2 };
  assert.equal(trafficContact(a, { ...a, x: -2.4, heading: Math.PI }), null);
  assert.equal(trafficContact(a, { ...a, z: 4.1 }), null);
  const sideways = { ...a, x: 4.8, heading: Math.PI / 2 };
  const contact = trafficContact(a, sideways);
  assert.ok(contact && contact.depth > .5);
  assert.equal(trafficContact({ ...a, x: a.x + contact.x * (contact.depth + .01), z: a.z + contact.z * (contact.depth + .01) }, sideways), null);
});

test('rear, head-on, reverse, and side impacts separate cars and scrub speed', () => {
  for (const scenario of ['rear', 'head-on', 'reverse', 'side']) {
    const { player, traffic } = setup();
    const car = traffic.vehicles[0];
    car.s = player.s + (scenario === 'reverse' ? -3.3 : scenario === 'side' ? 0 : 3.3);
    if (scenario === 'head-on') car.direction = -1;
    player.speed = scenario === 'reverse' ? -7 : 28;
    if (scenario === 'side') { player.u = .9; player.heading = Math.PI / 2; }
    player.update(0, {}); traffic.pose(car);
    const speed = Math.abs(player.speed), distance = player.distance;
    assert.ok(trafficContact(playerFootprint(player), footprint(car)), scenario);
    traffic.collide(player);
    assert.ok(Math.abs(player.speed) < speed * .3, scenario);
    assert.equal(trafficContact(playerFootprint(player), footprint(car)), null, scenario);
    assert.equal(player.distance, distance);
    assert.equal(player.audioTelemetry.speed, player.speed);
    assert.deepEqual(player.currentPose.position, player.groundedPosition);
    assert.ok(player.u >= -4.65 && player.u <= 4.65);
    traffic.dispose();
  }
});

test('full-speed simulation catches an impact between fixed steps', () => {
  const { player, traffic } = setup();
  const car = traffic.vehicles[0]; car.s = player.s + 12; car.speed = 0; car.cruiseSpeed = 0; traffic.pose(car);
  player.speed = 28;
  let hit = false;
  for (let i = 0; i < 60; i++) {
    player.update(1 / 60, { forward: true }); traffic.update(1 / 60, player);
    if (player.speed < 10) hit = true;
    assert.ok(player.s < car.s, 'player tunneled through the stopped car');
  }
  assert.ok(hit);
  traffic.dispose();
});

test('traffic brakes behind a parked player and maintains a gap', () => {
  const { player, traffic } = setup();
  const car = traffic.vehicles[0]; car.s = player.s - 65; traffic.pose(car);
  const start = player.s;
  for (let i = 0; i < 60 * 15; i++) {
    player.update(1 / 60, {}); traffic.update(1 / 60, player);
    assert.equal(player.s, start);
    assert.equal(trafficContact(playerFootprint(player), footprint(car)), null);
  }
  assert.ok(car.speed < .1); assert.ok(player.s - car.s > 8);
  traffic.dispose();
});

test('traffic stays on all three roads through long drives, reverse travel, and rebasing', () => {
  for (const [journey, route] of [['coast', coastalDrivingRoute], ['desert', desertDrivingRoute], ['snow', snowDrivingRoute]]) {
    const { player, traffic } = setup(route, 1020);
    traffic.reset(route, player.s, journey);
    const geometries = new Set(traffic.vehicles.flatMap(car => car.car.children.map(mesh => mesh.geometry)));
    // Keep the test driver on the shoulder so it can cover distance unimpeded.
    for (let i = 0; i < 60 * 90; i++) {
      player.s += (i < 60 * 60 ? 28 : -7) / 60; player.u = 8; player.update(0, {});
      traffic.update(1 / 60, player);
      if (i % 120 !== 0) continue;
      const origin = Math.floor(player.s / 1024) * 1024;
      traffic.render(.5, origin);
      for (const car of traffic.vehicles) {
        assert.equal(car.u, car.direction * 2.4);
        assert.ok(Math.abs(car.s - player.s) < 625);
        assert.ok(Math.abs(car.position.y - route.height(car.s, car.u) - .13) < 1e-8);
        assert.ok(car.quaternion.toArray().every(Number.isFinite));
        assert.ok(Math.abs(car.car.getWorldPosition(new THREE.Vector3()).z) < 1700);
        assert.ok(car.car.children.every(mesh => geometries.has(mesh.geometry)));
      }
    }
    assert.ok(traffic.vehicles.some(car => car.generation > 2));
    for (const s of [100000, -100000, 24]) {
      player.s = s; player.reset(); traffic.update(1 / 60, player);
      assert.ok(traffic.vehicles.every(car => Math.abs(car.s - s) < 625));
    }
    traffic.dispose();
  }
});

test('rendering interpolates without moving simulation, and resets clear nearby traffic', () => {
  const { player, traffic } = setup();
  traffic.update(1 / 60, player);
  const car = traffic.vehicles[0], s = car.s;
  traffic.render(.5, 1024);
  assert.ok(Math.abs(car.car.position.z - (car.previousPosition.z + car.position.z) / 2) < 1e-8);
  const pose = car.car.getWorldPosition(new THREE.Vector3());
  traffic.render(.5, 1024);
  assert.deepEqual(car.car.getWorldPosition(new THREE.Vector3()), pose); assert.equal(car.s, s);
  car.s = player.s; traffic.pose(car); traffic.clearNear(player);
  assert.ok(Math.abs(car.s - player.s) > 250);
  assert.deepEqual(car.previousPosition, car.position);
  traffic.dispose();
});

test('route changes reuse resources, switch lamps, and disposal releases the fleet', () => {
  const { scene, traffic } = setup();
  const car = traffic.vehicles[0], mesh = car.car.children[0], geometry = mesh.geometry;
  const headlights = car.car.children[2].material;
  traffic.reset(snowDrivingRoute, 2000, 'snow'); assert.ok(headlights.emissiveIntensity > 2);
  traffic.reset(desertDrivingRoute, -4000, 'desert'); assert.ok(headlights.emissiveIntensity < 1);
  assert.equal(car.car.children[0].geometry, geometry);
  assert.deepEqual(car.position, car.previousPosition);
  let disposed = false; geometry.addEventListener('dispose', () => { disposed = true; });
  traffic.dispose(); assert.equal(scene.children.length, 0); assert.ok(disposed);
});

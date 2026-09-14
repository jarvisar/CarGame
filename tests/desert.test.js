import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { desertHeight, desertVertex, DESERT_COLUMNS, DESERT_STEP, desertColumns, canyonProfile, canyonRise, desertDrivingRoute, mesasForChunk } from '../src/world/desert-route.js';
import { roadHeight, coastalDrivingRoute } from '../src/world/route.js';
import { DesertWorld } from '../src/world/desert.js';
import { CoastalWorld } from '../src/world/environment.js';
import { DrivingController } from '../src/vehicle.js';

test('desert terrain and road connect across positive and negative chunk boundaries', () => {
  for (let chunk = -20; chunk < 50; chunk++) {
    const s = chunk * 128;
    const rows = 128 / DESERT_STEP;
    for (let column = 0; column < DESERT_COLUMNS.length; column++) assert.deepEqual(desertVertex(chunk * rows, column), desertVertex((chunk - 1) * rows + rows, column));
    for (const u of [-200, -17, -7, 0, 7, 17, 200]) assert.ok(Math.abs(desertHeight(s - .001, u) - desertHeight(s + .001, u)) < .01);
    assert.equal(desertHeight(s, 0), roadHeight(s));
  }
});

test('desert formations are deterministic and keep clear of the driving corridor', () => {
  for (let chunk = -30; chunk < 80; chunk++) {
    const mesas = mesasForChunk(chunk);
    assert.deepEqual(mesas, mesasForChunk(chunk));
    for (const mesa of mesas) assert.ok(Math.abs(mesa.u) - mesa.ru * 1.4 > 17, `mesa enters the driving corridor in chunk ${chunk}`);
  }
});

test('desert driving stays grounded and switching routes restores the given place', () => {
  const car = new DrivingController(desertDrivingRoute);
  for (let i = 0; i < 7200; i++) {
    car.update(1 / 60, { forward: true });
    assert.ok(Math.abs(car.u) < 4.9);
    assert.ok(Math.abs(car.car.position.y - desertHeight(car.s, car.u) - .13) < .0001);
  }
  assert.ok(car.distance > 3000);
  const saved = { s: car.s, distance: car.distance };
  car.setRoute(coastalDrivingRoute, { s: 148, distance: 130 });
  assert.equal(car.speed, 0); assert.equal(car.s, 148);
  car.setRoute(desertDrivingRoute, saved);
  assert.equal(car.s, saved.s); assert.equal(car.distance, saved.distance); assert.equal(car.speed, 0);
  for (let i = 0; i < 180; i++) car.update(1 / 60, { brake: true });
  assert.ok(car.speed < 0);
});

test('desert streaming and repeated world changes release scene objects and owned geometry', () => {
  const scene = new THREE.Scene(); let disposed = 0;
  for (const World of [DesertWorld, CoastalWorld, DesertWorld, CoastalWorld]) {
    const world = new World(scene); world.update(24);
    for (const chunk of world.chunks.values()) for (const source of chunk.owned) source.addEventListener('dispose', () => disposed++);
    for (const s of [250, 1025, 9000, -300]) {
      world.update(s); assert.equal(world.chunks.size, 9); assert.equal(scene.children.length, 9);
      assert.ok(Math.abs(-s + world.origin) <= 1024);
    }
    world.dispose(); assert.equal(scene.children.length, 0);
  }
  assert.ok(disposed > 200);
});

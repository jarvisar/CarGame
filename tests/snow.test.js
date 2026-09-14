import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHUNK_LENGTH } from '../src/world/route.js';
import { snowColumns, snowVertex, snowHeight, snowRoadHeight, snowDrivingRoute, SNOW_STEP, lampAt, summitForCell } from '../src/world/snow-route.js';
import { SnowWorld } from '../src/world/snow.js';
import { DrivingController } from '../src/vehicle.js';
import { cragsForChunk, buildCrags } from '../src/world/snow-geology.js';

test('mountain ledges stay continuous, ordered and clear of the driving corridor', () => {
  for (let s = -10000; s < 10000; s += 13) {
    const columns = snowColumns(s);
    for (let col = 1; col < columns.length; col++) assert.ok(columns[col] > columns[col - 1], `folded snow terrain at ${s}`);
    for (const u of [-7, 0, 7]) assert.equal(snowHeight(s, u), snowRoadHeight(s));
    assert.ok(snowHeight(s, -60) < snowRoadHeight(s) - 85);
    assert.ok(snowHeight(s, 75) > snowRoadHeight(s) + 5);
    for (const u of [-60, -25, 7, 25, 70]) assert.ok(Math.abs(snowHeight(s + .001, u) - snowHeight(s - .001, u)) < .02);
  }
  for (let chunk = -20; chunk < 40; chunk++) {
    const rows = CHUNK_LENGTH / SNOW_STEP;
    for (let col = 0; col < snowColumns(0).length; col++) assert.deepEqual(snowVertex(chunk * rows, col), snowVertex((chunk - 1) * rows + rows, col));
  }
});

test('alpine summits rise inland of the road and descend on the far side', () => {
  for (let i = -40; i < 40; i++) {
    const summit = summitForCell(i), top = snowHeight(summit.s, summit.u);
    assert.ok(top > snowRoadHeight(summit.s) + 60);
    assert.ok(top > snowHeight(summit.s, summit.u - 45) + 35);
    assert.ok(top > snowHeight(summit.s, summit.u + 55) + 40);
    assert.deepEqual(summit, summitForCell(i));
  }
});

test('snow drive stays grounded on slopes and safely within the ledge', () => {
  const car = new DrivingController(snowDrivingRoute);
  for (let i = 0; i < 10200; i++) {
    car.update(1 / 60, { forward: true, left: i >= 7200 && i < 8600, right: i >= 8600 });
    assert.ok(car.u >= -5.85 && car.u <= 6.3);
    assert.ok(Math.abs(car.car.position.y - snowHeight(car.s, car.u) - .13) < .0001);
    if (i === 7199) assert.ok(car.distance > 3000);
  }
  assert.ok(car.distance > 3000);
  car.reset(); for (let i = 0; i < 300; i++) car.update(1 / 60, { brake: true });
  assert.ok(car.speed < -2);
});

test('rock outcrops are stable across visits and keep their footprints clear of the road', () => {
  for (let chunk = -40; chunk < 60; chunk++) {
    const crags = cragsForChunk(chunk);
    assert.deepEqual(crags, cragsForChunk(chunk));
    for (const crag of crags) {
      assert.ok(crag.s >= chunk * CHUNK_LENGTH && crag.s < (chunk + 1) * CHUNK_LENGTH);
      assert.ok(Math.abs(crag.u) - crag.ru * 1.2 - 4 > 10);
    }
    assert.ok(crags.some(crag => crag.side < 0) && crags.some(crag => crag.side > 0));
  }
  const a = buildCrags(-3), b = buildCrags(-3);
  for (const key of ['rock', 'snow']) {
    assert.deepEqual(a[key].attributes.position.array, b[key].attributes.position.array);
    assert.ok(a[key].attributes.position.array.every(Number.isFinite));
    assert.ok(a[key].attributes.normal.array.every(Number.isFinite));
  }
  // Every ledge pine has a solid snow triangle directly under its planting point.
  const positions = a.snow.attributes.position;
  for (const tree of a.trees) {
    const p = snowDrivingRoute.position(tree.s, tree.u, tree.y); p.z += -3 * CHUNK_LENGTH;
    let supported = false;
    for (let i = 0; i < positions.count; i += 3) {
      const v = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions, i + j));
      const planar = v.map(q => new THREE.Vector3(q.x, 0, q.z));
      const bary = THREE.Triangle.getBarycoord(new THREE.Vector3(p.x, 0, p.z), ...planar, new THREE.Vector3());
      if (!bary || Math.min(bary.x, bary.y, bary.z) < -.001) continue;
      const y = bary.x * v[0].y + bary.y * v[1].y + bary.z * v[2].y;
      if (Math.abs(y - tree.y) < .3) { supported = true; break; }
    }
    assert.ok(supported, `unsupported pine at ${tree.s}, ${tree.u}`);
  }
  for (const detail of [a, b]) { detail.rock.dispose(); detail.snow.dispose(); }
});

test('night effects remain bounded, animate deterministically and dispose on leaving', () => {
  const scene = new THREE.Scene(), world = new SnowWorld(scene), car = new DrivingController(snowDrivingRoute);
  let disposed = 0;
  world.update(24);
  for (const chunk of world.chunks.values()) for (const g of chunk.owned) g.addEventListener('dispose', () => disposed++);
  world.flakeGeometry.addEventListener('dispose', () => disposed++);
  for (const s of [24, 148, 1025, 10000, -300, -1100]) {
    world.update(s); car.s = s; car.reset(); car.car.position.z += world.origin; world.animate(12, car);
    assert.equal(world.chunks.size, 9); assert.equal(scene.children.length, 10); assert.equal(world.lights.length, 7);
    for (const light of world.lights) assert.ok(Math.abs(light.position.z) < 1300);
    assert.deepEqual(world.headlights.position.toArray(), car.car.position.toArray());
    assert.ok(world.headlights.quaternion.angleTo(car.car.quaternion) < .0001);
    const first = Array.from(world.flakeGeometry.attributes.position.array);
    world.animate(12, car); assert.deepEqual(Array.from(world.flakeGeometry.attributes.position.array), first);
    world.animate(13, car); assert.notDeepEqual(Array.from(world.flakeGeometry.attributes.position.array), first);
  }
  for (let i = -50; i < 50; i++) assert.equal(lampAt(i).y, snowRoadHeight(lampAt(i).s) + 7.6);
  world.dispose(); assert.equal(scene.children.length, 0); assert.ok(disposed >= 55);
});

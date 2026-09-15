import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHUNK_LENGTH } from '../src/world/route.js';
import { snowColumns, snowVertex, snowHeight, snowBaseHeight, snowRoadHeight, snowDrivingRoute, SNOW_STEP, lampAt, summitForCell, ledgeEdge, terrainPocket, alpineRiver } from '../src/world/snow-route.js';
import { SnowWorld } from '../src/world/snow.js';
import { Snowfall } from '../src/world/snowfall.js';
import { DrivingController } from '../src/vehicle.js';

test('mountain ledges stay continuous, ordered and clear of the driving corridor', () => {
  for (let s = -10000; s < 10000; s += 13) {
    const columns = snowColumns(s);
    for (let col = 1; col < columns.length; col++) assert.ok(columns[col] > columns[col - 1], `folded snow terrain at ${s}`);
    for (const u of [-7, 0, 7]) assert.equal(snowHeight(s, u), snowRoadHeight(s));
    assert.ok(snowHeight(s, ledgeEdge(s) - 155) < snowRoadHeight(s) - 88);
    const descent = snowHeight(s, ledgeEdge(s) - 15) - snowHeight(s, ledgeEdge(s) - 80);
    assert.ok(descent > 40 && descent < 94, `excessively steep or missing slope at ${s}`);
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

test('the narrow alpine river sits in a submerged channel with dry banks below the ledge', () => {
  for (let s = -10000; s < 10000; s += 11) {
    const river = alpineRiver(s);
    assert.ok(river.halfWidth > 2 && river.halfWidth < 4.2);
    assert.ok(river.y < snowRoadHeight(s) - 95);
    for (const fraction of [-.8, 0, .8]) assert.ok(snowHeight(s, river.u + river.halfWidth * fraction) < river.y - .25);
    for (const side of [-1, 1]) assert.ok(snowHeight(s, river.u + side * (river.halfWidth + 1.5)) > river.y + .5);
  }
  // Check actual shared terrain samples, including the noise suppression at
  // the waterline, so the rendered channel cannot randomly fill with snow.
  for (let row = -256; row <= 256; row++) {
    const river = alpineRiver(row * SNOW_STEP), columns = snowColumns(row * SNOW_STEP);
    const center = columns.indexOf(river.u), floor = snowVertex(row, center);
    assert.ok(floor.y < river.y - 1);
    assert.equal(floor.s, row * SNOW_STEP);
    for (const col of [center - 2, center + 2]) assert.ok(Math.abs(snowVertex(row, col).y - river.y) < .0001);
  }
});

test('snowfall stays in world space while the camera follows and the origin rebases', () => {
  const snowfall = new Snowfall(), anchor = { x: 12, y: 67, z: -1023 };
  snowfall.update(12, anchor, 0);
  const before = Array.from(snowfall.geometry.attributes.position.array);
  const next = { x: 14, y: 67.3, z: -1025 };
  snowfall.update(12, next, 1024);
  const after = snowfall.geometry.attributes.position.array;
  let compared = 0;
  for (let i = 0; i < before.length; i += 3) {
    if (Math.abs(before[i]) > 140 || Math.abs(before[i + 1]) > 90 || Math.abs(before[i + 2]) > 170) continue;
    assert.ok(Math.abs(before[i] + anchor.x - (after[i] + next.x)) < .0001);
    assert.ok(Math.abs(before[i + 1] + anchor.y - (after[i + 1] + next.y)) < .0001);
    assert.ok(Math.abs(before[i + 2] + anchor.z - (after[i + 2] + snowfall.points.position.z - 1024)) < .0001);
    compared++;
  }
  assert.ok(compared > 900);
  snowfall.dispose();
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

test('snow pockets flatten the terrain itself and blend continuously into the slope', () => {
  let reshaped = 0;
  for (let i = -40; i < 40; i++) for (const side of [-1, 1]) {
    const pocket = terrainPocket(i, side), { s, u, ru, rs } = pocket;
    assert.deepEqual(pocket, terrainPocket(i, side));
    const slope = Math.abs(snowHeight(s, u + .2) - snowHeight(s, u - .2));
    const baseSlope = Math.abs(snowBaseHeight(s, u + .2) - snowBaseHeight(s, u - .2));
    assert.ok(slope < baseSlope * .4 + .001);
    if (Math.abs(snowHeight(s, u + ru * .5) - snowBaseHeight(s, u + ru * .5)) > .5) reshaped++;
    for (const t of [s - rs, s + rs]) assert.ok(Math.abs(snowHeight(t - .001, u) - snowHeight(t + .001, u)) < .02);
    for (const v of [u - ru, u + ru]) assert.ok(Math.abs(snowHeight(s, v - .001) - snowHeight(s, v + .001)) < .02);
    for (const v of [-7, 0, 7]) assert.equal(snowHeight(s, v), snowRoadHeight(s));
  }
  assert.ok(reshaped > 100);
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

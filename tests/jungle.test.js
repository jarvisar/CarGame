import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHUNK_LENGTH, roadHeight, roadX } from '../src/world/route.js';
import { JUNGLE_STEP, JUNGLE_COLUMN_COUNT, POOL_SPAN, jungleColumns, jungleVertex, jungleHeight, jungleDrivingRoute, riverLevel, riverBedLevel, riverLips, riverCenter, riverHalfWidth, jungleMountains, jungleCrags } from '../src/world/jungle-route.js';
import { JungleWorld, JungleChunk } from '../src/world/jungle.js';
import { waterClock } from '../src/world/water.js';
import { DrivingController } from '../src/vehicle.js';

test('jungle columns stay ordered, the road stays flat and the river sits in its valley', () => {
  for (let s = -10000; s < 10000; s += 13) {
    const columns = jungleColumns(s);
    assert.equal(columns.length, JUNGLE_COLUMN_COUNT);
    for (let col = 1; col < columns.length; col++) assert.ok(columns[col] > columns[col - 1], `folded jungle terrain at ${s}`);
    for (const u of [-7, 0, 7]) assert.equal(jungleHeight(s, u), roadHeight(s));
    const rc = riverCenter(s), hw = riverHalfWidth(s), level = riverLevel(s);
    assert.ok(level < roadHeight(s) - 5 && level > roadHeight(s) - 26, `river level ${level} at ${s}`);
    assert.ok(jungleHeight(s, rc) < level - 1.5, `river bed above the water at ${s}`);
    assert.ok(jungleHeight(s, rc + hw + 4) > level + 1 && jungleHeight(s, rc - hw - 4) > level + 1, `submerged bank at ${s}`);
    assert.ok(jungleHeight(s, 100) > roadHeight(s) + 5);
    // Camera-side terrain must stay below the line of sight to the road.
    for (const u of [-100, -160, -250, -400]) assert.ok(jungleHeight(s, u) - roadHeight(s) < -u * .55, `near hill blocks the road at ${s}, ${u}`);
    for (const u of [-300, -120, -30, -9, 9, 30, 120, 300]) assert.ok(Math.abs(jungleHeight(s + .001, u) - jungleHeight(s - .001, u)) < .05);
  }
  for (let chunk = -20; chunk < 40; chunk++) {
    const rows = CHUNK_LENGTH / JUNGLE_STEP;
    for (let col = 0; col < JUNGLE_COLUMN_COUNT; col++) assert.deepEqual(jungleVertex(chunk * rows, col), jungleVertex((chunk - 1) * rows + rows, col));
  }
});

test('river pools are terraced by rocky lips fixed in world space', () => {
  const lips = riverLips(-4000, 4000);
  assert.ok(lips.length > 50);
  for (let i = 1; i < lips.length; i++) {
    const spacing = lips[i].s - lips[i - 1].s;
    assert.ok(spacing >= 50 && spacing <= POOL_SPAN + 60, `pool spacing ${spacing}`);
    assert.ok(lips[i].s % 2 === 0);
  }
  assert.ok(lips.filter(lip => lip.drop > 1.5).length > lips.length * .55, 'most lips are visible cascades');
  for (const lip of lips) {
    assert.ok(Math.abs(riverLevel(lip.s) - lip.upper) < 1e-9, `the lip at ${lip.s} holds the upper pool`);
    assert.ok(Math.abs(riverLevel(lip.s + lip.direction * 2) - lip.lower) < 1e-9);
    for (const d of [-8, -4, -1, 0, 1, 4, 8]) assert.ok(riverBedLevel(lip.s + d) <= riverLevel(lip.s + d) + 1e-9);
    for (const d of [-3, -2, -1.5, -.5, .5, 1.5, 2, 3]) assert.ok(Math.abs(riverLevel(lip.s + d + .001) - riverLevel(lip.s + d - .001)) < .02);
  }
  for (let chunk = -30; chunk < 30; chunk++) {
    for (const local of riverLips(chunk * CHUNK_LENGTH, chunk * CHUNK_LENGTH + CHUNK_LENGTH)) assert.ok(lips.some(lip => lip.s === local.s && lip.index === local.index));
  }
});

test('misty mountains and crags are deterministic and continuous', () => {
  for (const s of [-10000, -1024, 0, 256, 1024, 10000]) {
    const heights = Array.from({ length: 30 }, (_, i) => jungleMountains(s, 160 + i * 14));
    assert.ok(Math.max(...heights) > 55); assert.equal(jungleMountains(s, 150), 0);
    assert.deepEqual(heights, Array.from({ length: 30 }, (_, i) => jungleMountains(s, 160 + i * 14)));
  }
  let cragged = 0;
  for (let s = -3000; s < 3000; s += 7) {
    for (const u of [-140, -120, 40, 80, 120, 200, 320, 460]) {
      assert.ok(Math.abs(jungleMountains(s + .001, u) - jungleMountains(s - .001, u)) < .02);
      assert.ok(Math.abs(jungleCrags(s + .001, u) - jungleCrags(s - .001, u)) < .02);
      if (jungleCrags(s, u) > 4) cragged++;
    }
  }
  assert.ok(cragged > 60);
});

test('jungle drive stays grounded and within the verges', () => {
  const car = new DrivingController(jungleDrivingRoute);
  for (let i = 0; i < 10200; i++) {
    car.update(1 / 60, { forward: true, left: i >= 7200 && i < 8600, right: i >= 8600 });
    assert.ok(car.u >= -8.8 && car.u <= 8.8);
    assert.ok(Math.abs(car.car.position.y - jungleHeight(car.s, car.u) - .13) < .0001);
  }
  assert.ok(car.distance > 3000);
  car.reset(); for (let i = 0; i < 300; i++) car.update(1 / 60, { brake: true });
  assert.ok(car.speed < -2);
});

test('jungle chunks keep scenery off the road, build the river and dispose cleanly', () => {
  const overhead = new Set(['emergent-crowns', 'lianas', 'liana-leaves', 'marker-posts', 'marker-caps']);
  for (const index of [-3, 0, 7]) {
    const chunk = new JungleChunk(index), names = new Set(), position = new THREE.Vector3(), matrix = new THREE.Matrix4();
    const road = Array.from({ length: CHUNK_LENGTH + 21 }, (_, i) => { const s = chunk.start - 10 + i; return [roadX(s), -(s - chunk.start)]; });
    chunk.group.traverse(object => {
      names.add(object.name);
      if (!object.isInstancedMesh || overhead.has(object.name)) return;
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
        const distance = Math.min(...road.map(([x, z]) => Math.hypot(position.x - x, position.z - z)));
        assert.ok(distance > 8.3, `${object.name} instance ${i} in chunk ${index} sits ${distance.toFixed(1)} m from the road centerline`);
        assert.ok(Number.isFinite(position.y));
      }
    });
    for (const name of ['jungle-floor', 'jungle-river', 'river-mist', 'jungle-road', 'jungle-canopy', 'emergent-crowns', 'palm-fronds', 'ferns', 'mossy-boulders']) assert.ok(names.has(name), `${name} missing from chunk ${index}`);
    assert.equal(names.has('cascade-foam'), chunk.lips.some(lip => lip.drop >= .6));
    assert.ok(chunk.terrain.geometry.attributes.position.count > 3000);
    chunk.dispose();
  }
  const scene = new THREE.Scene(), world = new JungleWorld(scene);
  let disposed = 0;
  world.update(24);
  for (const chunk of world.chunks.values()) for (const g of chunk.owned) g.addEventListener('dispose', () => disposed++);
  for (const s of [24, 148, 1025, 10000, -300, -1100]) {
    world.update(s); world.animate(12);
    assert.equal(world.chunks.size, 9); assert.equal(scene.children.length, 9); assert.equal(waterClock.time.value, 12);
    for (const [index, chunk] of world.chunks) assert.equal(chunk.group.position.z, world.origin - index * CHUNK_LENGTH);
  }
  world.dispose(); assert.equal(scene.children.length, 0); assert.ok(disposed >= 50);
});

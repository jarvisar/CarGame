import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHUNK_LENGTH } from '../src/world/route.js';
import { CITY_STEP, CITY_COLUMN_COUNT, KERB, cityColumns, cityVertex, cityHeight, cityGroundHeight, cityRoadHeight, pavementHeight, cityDrivingRoute,
  quayOffset, QUAY_NEAR, QUAY_FAR, QUAY_WALL, RIVER_LEVEL, RIVER_BED, FAR_BANK, FAR_BANK_TOP, farBankHeight, blockBoundary, blockAt, crossStreetAt, onCrossStreet,
  STREET_HALF_WIDTH, BANDS } from '../src/world/city-route.js';
import { CityWorld, CityChunk, lightning } from '../src/world/city.js';
import { Rainfall } from '../src/world/rainfall.js';
import { DrivingController } from '../src/vehicle.js';

test('city terrain stays ordered, continuous, level under the road, and lower toward the camera', () => {
  for (let s = -10000; s < 10000; s += 13) {
    const columns = cityColumns(s);
    assert.equal(columns.length, CITY_COLUMN_COUNT);
    for (let col = 1; col < columns.length; col++) assert.ok(columns[col] > columns[col - 1] + .5, `columns cross at ${s}, ${col}`);
    for (const u of [-KERB, 0, KERB]) assert.equal(cityHeight(s, u), cityRoadHeight(s));
    // The quay wanders inside its range, and the wall drops from the promenade to the river bed.
    const q = quayOffset(s);
    assert.ok(q <= -QUAY_NEAR && q >= -QUAY_FAR, `quay out of range at ${s}`);
    assert.equal(cityGroundHeight(s, q), pavementHeight(s)); assert.ok(Math.abs(cityGroundHeight(s, q - QUAY_WALL) - RIVER_BED) < 1e-9);
    assert.equal(cityGroundHeight(s, (q + FAR_BANK) / 2), RIVER_BED);
    assert.ok(RIVER_LEVEL > RIVER_BED && RIVER_LEVEL < pavementHeight(s) - 2, 'the water stays well below the promenade');
    assert.ok(farBankHeight(s) > RIVER_LEVEL + 1.8);
    // Nothing on the near side rises into the line of sight to the road.
    for (const u of [-9, -15, -30, -60, -100, -140, -200, -400]) assert.ok(cityGroundHeight(s, u) - cityRoadHeight(s) < 1 - u * .1, `near side blocks the road at ${s}, ${u}`);
    for (const u of [-300, -135, -128, -60, -8, 9, 30, 120, 300, 520]) assert.ok(Math.abs(cityGroundHeight(s + .001, u) - cityGroundHeight(s - .001, u)) < .05, `height jump at ${s}, ${u}`);
    // The pavements stand one kerb above the road on both sides.
    for (const side of [-1, 1]) assert.ok(Math.abs(cityGroundHeight(s, side * 9) - cityRoadHeight(s) - .15) < 1e-9);
  }
  for (let chunk = -20; chunk < 40; chunk++) {
    const rows = CHUNK_LENGTH / CITY_STEP;
    for (let col = 0; col < CITY_COLUMN_COUNT; col++) assert.deepEqual(cityVertex(chunk * rows, col), cityVertex((chunk - 1) * rows + rows, col));
  }
  assert.deepEqual(cityDrivingRoute.bounds(0), [-5.9, 5.9]);
});

test('blocks tile the boulevard with cross streets on terrain rows', () => {
  for (let s = -6000; s < 6000; s += 5) {
    const block = blockAt(s);
    assert.ok(s >= blockBoundary(block) && s < blockBoundary(block + 1), `wrong block at ${s}`);
    assert.ok(blockBoundary(block) % CITY_STEP === 0, 'boundaries sit on terrain rows');
    assert.ok(blockBoundary(block + 1) - blockBoundary(block) >= 56 && blockBoundary(block + 1) - blockBoundary(block) <= 160);
    const street = crossStreetAt(s);
    assert.ok(street.center === blockBoundary(block) || street.center === blockBoundary(block + 1));
    const onStreet = Math.abs(s - street.center) < STREET_HALF_WIDTH;
    assert.equal(onCrossStreet(s, 30), onStreet);
    assert.equal(onCrossStreet(s, 3), false);
    if (!onStreet) assert.equal(onCrossStreet(s, -12), false);
  }
  assert.ok(BANDS.every((band, k) => band.back > band.front + 10 && (!k || band.front > BANDS[k - 1].back)));
});

test('city driving stays between the kerbs and a route swap restores the saved place', () => {
  const car = new DrivingController(cityDrivingRoute);
  for (let i = 0; i < 7200; i++) {
    car.update(1 / 60, { forward: true });
    assert.ok(Math.abs(car.u) < 5.91);
    assert.ok(Math.abs(car.car.position.y - cityHeight(car.s, car.u) - .13) < .0001);
  }
  assert.ok(car.distance > 3000);
  for (const side of ['left', 'right']) {
    const wanderer = new DrivingController(cityDrivingRoute);
    for (let i = 0; i < 3600; i++) {
      wanderer.update(1 / 60, { forward: true, [side]: true });
      assert.ok(Math.abs(wanderer.u) <= 5.9001 && Number.isFinite(wanderer.car.position.y));
    }
  }
  const saved = { s: car.s, distance: car.distance };
  car.setRoute(cityDrivingRoute, saved);
  assert.equal(car.s, saved.s); assert.equal(car.distance, saved.distance); assert.equal(car.speed, 0);
});

test('city chunks carry buildings, a river and street furniture, and the world streams and releases cleanly', () => {
  const scene = new THREE.Scene(), world = new CityWorld(scene);
  world.update(420); scene.updateMatrixWorld(true);
  assert.equal(scene.getObjectByName('city-storm-effects').children.length, 2);
  const names = new Set();
  for (const chunk of world.chunks.values()) {
    chunk.group.traverse(object => { if (object.name) names.add(object.name); });
    const blocks = chunk.group.getObjectByName('city-blocks'), river = chunk.group.getObjectByName('city-river'), skyline = chunk.group.getObjectByName('city-skyline');
    assert.ok(blocks && river && skyline, `chunk ${chunk.index} is missing its buildings, river or skyline`);
    // Nothing in the skyline stands on the camera's side of the road.
    const towers = skyline.geometry.attributes.position;
    for (let i = 0; i < towers.count; i++) assert.ok(towers.getX(i) - cityDrivingRoute.position(-(towers.getZ(i) - chunk.start), 0).x > 150);
    assert.ok(blocks.castShadow && !skyline.castShadow && skyline.userData.ambientOcclusion === false);
    // Every building stands on its footing and no building reaches the road.
    const positions = blocks.geometry.attributes.position, lowest = Math.min(...Array.from({ length: positions.count }, (_, i) => positions.getY(i)));
    assert.ok(lowest > RIVER_LEVEL, 'a building sank into the river');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i) - chunk.start;
      const s = -z, roadX = cityDrivingRoute.position(s, 0).x;
      assert.ok(Math.abs(x - roadX) > KERB + .5, `building on the road at ${s}`);
    }
    // The river lies on its level plane.
    const water = river.geometry.attributes.position;
    for (let i = 0; i < water.count; i++) assert.ok(Math.abs(water.getY(i) - RIVER_LEVEL) < 1e-6);
    for (const name of ['street-lamps', 'quay-railings', 'parked-cars', 'city-trunks']) {
      const mesh = chunk.group.getObjectByName(name);
      assert.ok(mesh?.isInstancedMesh && mesh.count > 0, `${name} missing from chunk ${chunk.index}`);
    }
  }
  for (const name of ['city-ground', 'city-road', 'kerbs', 'lit-windows', 'puddles', 'traffic-signals', 'benches', 'city-boxes', 'manholes', 'city-crowns']) assert.ok(names.has(name), `${name} never appears`);
  // Streaming keeps the resident window and disposes what leaves it.
  const before = world.chunks.size;
  world.update(420 + CHUNK_LENGTH * 3);
  assert.equal(world.chunks.size, before);
  assert.ok(![...world.chunks.keys()].includes(Math.floor(420 / CHUNK_LENGTH) - 3));
  world.update(-8200); assert.equal(world.chunks.size, before);
  world.dispose();
  assert.equal(scene.children.length, 0);
});

test('rain wraps around the car, pauses with the clock, and lightning is rare and brief', () => {
  const rain = new Rainfall(), anchor = { x: 12, y: 24, z: -400 };
  rain.update(1, anchor, 0);
  const first = Array.from(rain.geometry.attributes.position.array.slice(0, 300));
  rain.update(1, anchor, 0);
  assert.deepEqual(Array.from(rain.geometry.attributes.position.array.slice(0, 300)), first, 'the same clock gives the same rain');
  rain.update(1.5, anchor, 0);
  const later = rain.geometry.attributes.position.array;
  assert.notDeepEqual(Array.from(later.slice(0, 30)), first);
  for (let i = 0; i < later.length; i += 3) {
    assert.ok(Math.abs(later[i]) <= 150 && Math.abs(later[i + 1]) <= 100 && Math.abs(later[i + 2]) <= 180, 'a drop left the volume');
  }
  // Drops fall: the same drop is lower half a second later, unless it wrapped.
  let fell = 0;
  for (let i = 1; i < 300; i += 3) if (later[i] < first[i]) fell++;
  assert.ok(fell > 80);
  assert.equal(rain.points.position.z, anchor.z + 1024 - 1024);
  rain.dispose();
  let lit = 0, peak = 0;
  for (let t = 0; t < 600; t += .05) { const f = lightning(t); if (f > .05) lit++; peak = Math.max(peak, f); }
  assert.ok(lit > 0 && lit < 600 / .05 * .02, `lightning lit ${lit} samples`);
  assert.ok(peak <= 1.5);
});

test('a city chunk keeps its draw calls and triangles within the budget of the other routes', () => {
  let calls = 0, triangles = 0;
  for (const index of [0, 1, 2]) {
    const chunk = new CityChunk(index);
    chunk.group.traverse(object => {
      if (!object.isMesh) return;
      calls++;
      triangles += object.geometry.attributes.position.count / 3 * (object.isInstancedMesh ? object.count : 1);
    });
    chunk.dispose();
  }
  assert.ok(calls / 3 < 40, `${calls / 3} draw calls per chunk`);
  assert.ok(triangles / 3 < 40000, `${triangles / 3} triangles per chunk`);
});

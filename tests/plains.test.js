import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHUNK_LENGTH } from '../src/world/route.js';
import { PLAINS_STEP, PLAINS_COLUMNS, PLAINS_COLUMN_COUNT, plainsVertex, plainsRowStep, plainsHeight, plainsGroundHeight, plainsRoadHeight, plainsDrivingRoute,
  plainsCreekAt, creekCenterS, creekDistance, CREEK_SPACING, CREEK_WATER_HALF_WIDTH, fieldAt, fieldRowAt, fieldBoundary, fieldBands, ROAD_RESERVE,
  stockPondAt, pondsNear, distantRise } from '../src/world/plains-route.js';
import { PlainsWorld, PlainsChunk } from '../src/world/plains.js';
import { CoastalWorld } from '../src/world/environment.js';
import { DrivingController } from '../src/vehicle.js';

test('plains terrain stays ordered, continuous, flat under the road and below the camera line of sight', () => {
  for (let col = 1; col < PLAINS_COLUMN_COUNT; col++) assert.ok(PLAINS_COLUMNS[col] > PLAINS_COLUMNS[col - 1]);
  for (let s = -10000; s < 10000; s += 13) {
    for (const u of [-7, 0, 7]) assert.equal(plainsHeight(s, u), plainsRoadHeight(s));
    // The near side eases down toward the camera; nothing there may rise into the line of sight to the road.
    for (const u of [-30, -60, -110, -180, -260, -400]) assert.ok(plainsGroundHeight(s, u) - plainsRoadHeight(s) < -u * .55, `near side blocks the road at ${s}, ${u}`);
    for (const u of [-300, -90, -30, -10.8, 9, 30, 90, 300, 520]) assert.ok(Math.abs(plainsGroundHeight(s + .001, u) - plainsGroundHeight(s - .001, u)) < .05, `height jump at ${s}, ${u}`);
    // A drainage ditch runs beside the road on both sides, except where the creek channel cuts through it.
    if (Math.abs(s - plainsCreekAt(s).center) > 40) for (const side of [-1, 1]) assert.ok(plainsGroundHeight(s, side * 10.8) < plainsRoadHeight(s) - .4 && plainsGroundHeight(s, side * 10.8) > plainsRoadHeight(s) - 1.6);
    // The far rises close the horizon in the third-person view, and only there.
    assert.equal(distantRise(s, 250), 0);
  }
  for (let chunk = -20; chunk < 40; chunk++) {
    const rows = CHUNK_LENGTH / PLAINS_STEP;
    for (let col = 0; col < PLAINS_COLUMN_COUNT; col++) assert.deepEqual(plainsVertex(chunk * rows, col), plainsVertex((chunk - 1) * rows + rows, col));
    // Row refinement around a creek must land back on whole rows by the next chunk.
    let row = chunk * rows, steps = 0;
    while (row < (chunk + 1) * rows) { row += plainsRowStep(row); steps++; }
    assert.equal(row, (chunk + 1) * rows); assert.ok(steps >= rows && steps <= rows * 2);
  }
  for (const s of [-10000, -1024, 0, 256, 10000]) {
    const heights = Array.from({ length: 20 }, (_, i) => distantRise(s, 300 + i * 15));
    assert.ok(Math.max(...heights) > 14);
  }
});

test('the creek crosses under a bridge with a level channel, banks that hold the water, and a road that keeps its deck', () => {
  for (let index = -12; index <= 12; index++) {
    const creek = plainsCreekAt(420 + index * CREEK_SPACING);
    assert.equal(creek.index, index); assert.equal(creek.center, 420 + index * CREEK_SPACING);
    assert.ok(creek.level < plainsRoadHeight(creek.center) - 1.5);
    for (const u of [-380, -160, -40, -9, 0, 9, 40, 160, 380, 540]) {
      const center = creekCenterS(creek, u);
      assert.ok(Math.abs(center - creek.center) < 130, `the creek wanders too far at ${u}`);
      // Channel floor under the water, waterline inside the water ribbon, banks above it.
      assert.ok(plainsGroundHeight(center, u) < creek.level - .8, `dry channel at ${index}, ${u}`);
      for (const d of [-CREEK_WATER_HALF_WIDTH, CREEK_WATER_HALF_WIDTH]) assert.ok(plainsGroundHeight(center + d, u) < creek.level, `water ribbon edge floats at ${index}, ${u}`);
      for (const d of [-9, 9]) assert.ok(plainsGroundHeight(center + d, u) > creek.level + .3, `bank under water at ${index}, ${u}`);
    }
    // Driving sees the deck; the channel is only in the terrain.
    for (const s of [creekCenterS(creek, 0) - 3, creekCenterS(creek, 0), creekCenterS(creek, 0) + 3]) {
      assert.equal(plainsHeight(s, 0), plainsRoadHeight(s));
      assert.ok(plainsGroundHeight(s, 0) < creek.level);
      assert.deepEqual(plainsDrivingRoute.bounds(s), [-4.8, 4.8]);
    }
    assert.deepEqual(plainsDrivingRoute.bounds(creek.center + 80), [-11.5, 11.5]);
  }
  for (let s = -5000; s < 5000; s += 7) {
    // The creek keeps to its own crossing: no other point of the road is ever within reach of it.
    if (Math.abs(s - plainsCreekAt(s).center) > 40) assert.ok(creekDistance(s, 0) > 20);
  }
});

test('fields tile the plain as a stable patchwork whose boundaries follow the terrain facets', () => {
  for (let s = -6000; s < 6000; s += 5) {
    const row = fieldRowAt(s);
    assert.ok(s >= fieldBoundary(row) && s < fieldBoundary(row + 1), `wrong field row at ${s}`);
    assert.ok(fieldBoundary(row) % PLAINS_STEP === 0, 'row boundaries sit on terrain rows');
    for (const side of [-1, 1]) {
      const bands = fieldBands(row, side);
      assert.equal(bands[0], ROAD_RESERVE);
      for (let k = 1; k < bands.length; k++) {
        assert.ok(bands[k] > bands[k - 1] + 12, `bands too close in row ${row}`);
        assert.ok(PLAINS_COLUMNS.includes(bands[k]), 'band edges sit on terrain columns');
      }
      const field = fieldAt(s, side * 30);
      assert.equal(field.row, row); assert.equal(field.band, 0); assert.equal(field.side, side);
      assert.ok(['wheat', 'stubble', 'ploughed', 'pasture', 'hay'].includes(field.kind));
      assert.deepEqual(fieldAt(s, side * 30), field);
    }
    assert.equal(fieldAt(s, 5), null);
  }
  const kinds = new Set();
  for (let row = -40; row < 40; row++) for (const side of [-1, 1]) for (let band = 0; band < 4; band++) kinds.add(fieldAt(fieldBoundary(row) + 1, side * (fieldBands(row, side)[band] + 1)).kind);
  assert.equal(kinds.size, 5, 'a long drive shows every crop');
});

test('stock ponds are level basins in the fields, clear of the road and the creek', () => {
  let count = 0;
  for (let index = -40; index < 40; index++) for (const side of [-1, 1]) {
    const pond = stockPondAt(index, side);
    if (!pond) continue;
    count++;
    assert.ok(Math.abs(pond.u) > 60 && Math.abs(pond.u) < 200);
    assert.ok(creekDistance(pond.s, pond.u) > pond.radius + 20);
    const level = pond.rim - .55;
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const inside = plainsGroundHeight(pond.s + Math.cos(angle) * pond.radius * .75, pond.u + Math.sin(angle) * pond.radius * .75);
      const shore = plainsGroundHeight(pond.s + Math.cos(angle) * pond.radius * 1.1, pond.u + Math.sin(angle) * pond.radius * 1.1);
      assert.ok(inside < level - .1, `pond ${index} water floats at its edge`);
      assert.ok(shore > level + .15, `pond ${index} leaks over its bank`);
    }
    assert.ok(pondsNear(pond.s).some(other => other.s === pond.s && other.u === pond.u));
  }
  assert.ok(count > 20 && count < 60);
});

test('plains driving stays grounded and a route swap restores the saved place', () => {
  const car = new DrivingController(plainsDrivingRoute);
  for (let i = 0; i < 7200; i++) {
    car.update(1 / 60, { forward: true });
    assert.ok(Math.abs(car.u) < 4.9);
    assert.ok(Math.abs(car.car.position.y - plainsHeight(car.s, car.u) - .13) < .0001);
  }
  assert.ok(car.distance > 3000);
  for (const side of ['left', 'right']) {
    const wanderer = new DrivingController(plainsDrivingRoute);
    for (let i = 0; i < 3600; i++) {
      wanderer.update(1 / 60, { forward: true, [side]: true });
      assert.ok(Math.abs(wanderer.u) <= 11.5001 && Number.isFinite(wanderer.car.position.y));
    }
  }
  const saved = { s: car.s, distance: car.distance };
  car.setRoute(plainsDrivingRoute, saved);
  assert.equal(car.s, saved.s); assert.equal(car.distance, saved.distance); assert.equal(car.speed, 0);
});

test('plains scenery stands on the rendered facets and the world streams and releases cleanly', () => {
  const scene = new THREE.Scene(), world = new PlainsWorld(scene);
  world.update(420); scene.updateMatrixWorld(true);
  const ground = [...world.chunks.values()].map(chunk => chunk.group.getObjectByName('plains-fields'));
  const ray = new THREE.Raycaster();
  for (const chunk of world.chunks.values()) {
    for (const name of ['fence-posts', 'hay-bales', 'plains-trunks', 'utility-poles']) {
      chunk.group.traverse(object => {
        if (object.name !== name || !object.isInstancedMesh) return;
        const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
        for (let i = 0; i < Math.min(object.count, 12); i++) {
          object.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); position.z += chunk.group.position.z;
          ray.set(new THREE.Vector3(position.x, position.y + 60, position.z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObjects(ground, false)[0];
          assert.ok(hit, `${name} off the terrain`);
          // Trunks are sunk a little so no root shows on a creek bank's steeper facets.
          assert.ok(position.y - hit.point.y > (name === 'plains-trunks' ? -.6 : -.2) && position.y - hit.point.y < 6, `${name} floats or sinks: ${position.y - hit.point.y}`);
        }
      });
    }
  }
  assert.ok([...world.chunks.values()].some(chunk => chunk.group.getObjectByName('creek-water')), 'the creek is built');
  assert.ok([...world.chunks.values()].some(chunk => chunk.group.getObjectByName('creek-bridge')), 'the bridge is built');
  // The shader draws furrows and headlands from a per-vertex attribute: every
  // terrain vertex carries one, and the worked fields carry rows while the
  // road reserve and the pastures do not.
  for (const mesh of ground) {
    const furrow = mesh.geometry.attributes.furrow;
    assert.equal(furrow.count, mesh.geometry.attributes.position.count);
    let worked = 0, flat = 0;
    for (let i = 0; i < furrow.count; i++) {
      assert.ok(Number.isFinite(furrow.getX(i)) && furrow.getY(i) >= 0 && furrow.getY(i) < .3 && furrow.getZ(i) >= 0);
      if (furrow.getY(i) > 0) worked++; else flat++;
    }
    assert.ok(worked > 0 && flat > 0, 'a chunk has both worked fields and unworked ground');
  }
  // The fringe is present in every chunk, throws no shadow, and stays out of
  // the ambient occlusion prepass.
  for (const chunk of world.chunks.values()) {
    let stalks = 0;
    chunk.group.traverse(object => {
      if (object.name !== 'field-fringe') return;
      stalks += object.count;
      assert.equal(object.castShadow, false); assert.equal(object.userData.ambientOcclusion, false);
    });
    assert.ok(stalks > 20, 'stalks fringe the fields');
  }
  let disposed = 0;
  for (const chunk of world.chunks.values()) for (const source of chunk.owned) source.addEventListener('dispose', () => disposed++);
  for (const s of [250, 1025, 9000, -300]) {
    world.update(s); assert.equal(world.chunks.size, 9); assert.equal(scene.children.length, 9);
    assert.ok(Math.abs(-s + world.origin) <= 1024);
  }
  world.dispose(); assert.equal(scene.children.length, 0); assert.ok(disposed > 30);
  for (const World of [CoastalWorld, PlainsWorld]) { const other = new World(scene); other.update(24); other.dispose(); }
  assert.equal(scene.children.length, 0);
  const chunk = new PlainsChunk(3);
  assert.ok(chunk.group.getObjectByName('plains-fields').geometry.attributes.position.count / 3 < 4000, 'terrain stays within the shared budget');
  chunk.dispose();
});

test('every plains asset is built from real geometry, so no part is silently missing', async () => {
  const { plainsDiscoveryAssets } = await import('../src/world/plains-discovery-assets.js');
  const { plainsTrees, baleGeometry, squareBaleGeometry, cowGeometry, rushGeometry, stalkGeometry, crowGeometry } = await import('../src/world/plains-assets.js');
  // A colour passed where a segment count belongs yields an empty geometry that
  // merges away without complaint, which is how the turbines lost their towers.
  const expected = { barn: 400, silo: 900, farmhouse: 400, windmillTower: 900, windmillRotor: 600,
    tractor: 400, grainElevator: 1500, turbineTower: 200, turbineRotor: 300, shed: 200, box: 24 };
  for (const [name, geometry] of Object.entries(plainsDiscoveryAssets)) {
    const count = geometry.attributes.position.count;
    assert.ok(count >= expected[name], `${name} has ${count} vertices, expected at least ${expected[name]}`);
    for (let i = 0; i < count * 3; i++) assert.ok(Number.isFinite(geometry.attributes.position.array[i]), `${name} has a non-finite vertex`);
  }
  // The tower must be tall enough to carry its own nacelle, and the nacelle must
  // sit at the top of it rather than in the air.
  const tower = plainsDiscoveryAssets.turbineTower;
  tower.computeBoundingBox();
  assert.ok(tower.boundingBox.max.y > 38 && tower.boundingBox.min.y < .6, 'the turbine tower must reach the ground and the hub');
  let lowest = Infinity;
  for (let i = 1; i < tower.attributes.position.count * 3; i += 3) lowest = Math.min(lowest, tower.attributes.position.array[i]);
  assert.ok(lowest < .6, 'the turbine tower must stand on the ground');
  for (const list of Object.values(plainsTrees)) for (const variant of list) {
    // Trunk limbs overlap at their joints, so the bark is one connected solid.
    // A conifer is a single bare stem, so the floor is one closed cylinder.
    assert.ok(variant.bark.attributes.position.count >= 30, 'a tree needs a trunk');
    variant.bark.computeBoundingBox(); variant.leaves.computeBoundingBox();
    assert.ok(variant.bark.boundingBox.min.y < -.05, 'the trunk must reach below the ground it stands on');
    assert.ok(variant.bark.boundingBox.max.y > variant.leaves.boundingBox.min.y, 'the trunk must reach into its crown');
  }
  for (const geometry of [baleGeometry, squareBaleGeometry, cowGeometry, rushGeometry, stalkGeometry, crowGeometry]) assert.ok(geometry.attributes.position.count > 12);
});

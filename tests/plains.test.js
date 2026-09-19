import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHUNK_LENGTH } from '../src/world/route.js';
import { PLAINS_STEP, PLAINS_COLUMNS, PLAINS_COLUMN_COUNT, plainsVertex, plainsRowStep, plainsHeight, plainsGroundHeight, plainsRoadHeight, plainsDrivingRoute,
  plainsCreekAt, creekCenterS, creekDistance, CREEK_SPACING, CREEK_WATER_HALF_WIDTH, fieldAt, fieldRowAt, fieldBoundary, fieldBands, ROAD_RESERVE,
  stockPondAt, pondsNear, distantRise, farmGate } from '../src/world/plains-route.js';
import { PlainsWorld, PlainsChunk } from '../src/world/plains.js';
import { plainsDiscoveries, plainsDiscoveryClears } from '../src/world/plains-discoveries.js';
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
  // Both fringes are present across the drive, throw no shadow, and stay out
  // of the ambient occlusion prepass.
  const fringes = { 'grass-fringe': 0, 'wheat-fringe': 0 };
  for (const chunk of world.chunks.values()) {
    let stalks = 0;
    chunk.group.traverse(object => {
      if (!(object.name in fringes)) return;
      fringes[object.name] += object.count; stalks += object.count;
      assert.equal(object.castShadow, false); assert.equal(object.userData.ambientOcclusion, false);
    });
    assert.ok(stalks > 20, 'stalks fringe the fields');
  }
  assert.ok(fringes['grass-fringe'] > 20 && fringes['wheat-fringe'] > 20, 'the green fields and the grain fields each grow their own fringe');
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

test('the cow wears its patches proud of its hide, so no two faces flicker against each other', async () => {
  const { cowGeometry } = await import('../src/world/plains-assets.js');
  // Two faces of different colours on one plane have no stable depth order,
  // so the renderer picks between them per pixel and per frame: the cow's
  // back patch once ended exactly level with its back and blinked there.
  const position = cowGeometry.attributes.position, color = cowGeometry.attributes.color, count = position.count / 3;
  const corners = i => [0, 1, 2].map(k => [position.getX(i * 3 + k), position.getY(i * 3 + k), position.getZ(i * 3 + k)]);
  const plane = triangle => {
    const [a, b, c] = triangle, u = b.map((v, k) => v - a[k]), v = c.map((w, k) => w - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n), unit = n.map(value => value / length);
    return { unit, offset: unit.reduce((sum, value, k) => sum + value * a[k], 0) };
  };
  const span = (triangle, k) => [Math.min(...triangle.map(p => p[k])), Math.max(...triangle.map(p => p[k]))];
  const triangles = Array.from({ length: count }, (_, i) => corners(i));
  const shades = Array.from({ length: count }, (_, i) => color.getX(i * 3));
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
    if (Math.abs(shades[i] - shades[j]) < 1e-6) continue;
    const a = plane(triangles[i]), b = plane(triangles[j]);
    const dot = a.unit.reduce((sum, value, k) => sum + value * b.unit[k], 0);
    if (Math.abs(Math.abs(dot) - 1) > 1e-6) continue;
    if (Math.abs(a.offset - (dot > 0 ? b.offset : -b.offset)) > 1e-6) continue;
    const axis = a.unit.map(Math.abs).indexOf(Math.max(...a.unit.map(Math.abs)));
    const overlap = [0, 1, 2].filter(k => k !== axis).every(k => {
      const [low, high] = span(triangles[i], k), [start, end] = span(triangles[j], k);
      return low < end - 1e-4 && start < high - 1e-4;
    });
    assert.ok(!overlap, `two differently shaded faces share a plane on ${'xyz'[axis]} at ${a.offset.toFixed(3)}`);
  }
});

test('no two fence posts stand in the same spot, where their faces would flicker', () => {
  const scene = new THREE.Scene(), world = new PlainsWorld(scene);
  let checked = 0;
  for (const s of [420, 3960, 9102, 21692]) {
    world.update(s);
    for (const chunk of world.chunks.values()) {
      const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), seen = new Set();
      chunk.group.traverse(object => {
        if (object.name !== 'fence-posts' || !object.isInstancedMesh) return;
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix);
          position.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
          const key = `${position.x.toFixed(2)},${position.y.toFixed(2)},${position.z.toFixed(2)}/${scale.y.toFixed(2)}`;
          assert.ok(!seen.has(key), `two posts share ${key} in chunk ${chunk.index}`);
          seen.add(key); checked++;
        }
      });
    }
  }
  world.dispose();
  assert.ok(checked > 400, 'the drive must actually carry fences to check');
});

test('a gabled building is closed from both ends, not open from one of them', async () => {
  const { plainsDiscoveryAssets, plainsDiscoveryMaterial } = await import('../src/world/plains-discovery-assets.js');
  // The two ends of a roof have to be wound to face out of the building.
  // Wound the same way round, one of them is a back face, the renderer culls
  // it, and the roof stands over a gable you see the far wall through.
  const ends = { barn: 6, farmhouse: 4.8, shed: 3.9, grainElevator: 6.4 };
  for (const [name, height] of Object.entries(ends)) {
    const mesh = new THREE.Mesh(plainsDiscoveryAssets[name], plainsDiscoveryMaterial);
    mesh.updateMatrixWorld();
    for (const from of [-60, 60]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(0, height, from), new THREE.Vector3(0, 0, from > 0 ? -1 : 1));
      assert.ok(ray.intersectObject(mesh, false).length > 0, `${name} has no wall facing z=${from} at ${height}`);
    }
  }
});

test('every plains asset is built from real geometry, so no part is silently missing', async () => {
  const { plainsDiscoveryAssets } = await import('../src/world/plains-discovery-assets.js');
  const { plainsTrees, baleGeometry, squareBaleGeometry, cowGeometry, rushGeometry, stalkGeometry, wheatGeometry, crowGeometry } = await import('../src/world/plains-assets.js');
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
    // Every crown vertex carries a finite baked shade: a bake that read past
    // the end of an indexed tier once left whole faces black.
    const colors = variant.leaves.attributes.color;
    assert.equal(colors.count, variant.leaves.attributes.position.count, 'one colour per crown vertex');
    for (let i = 0; i < colors.array.length; i++) assert.ok(Number.isFinite(colors.array[i]) && colors.array[i] > .4, `crown colour ${i} is ${colors.array[i]}`);
  }
  for (const geometry of [baleGeometry, squareBaleGeometry, cowGeometry, rushGeometry, stalkGeometry, wheatGeometry, crowGeometry]) assert.ok(geometry.attributes.position.count > 12);
  // Wheat carries its pale ear in its vertex colours, which a per-instance
  // gold multiplies; without them every stalk would be one flat tone.
  const grain = wheatGeometry.attributes.color;
  assert.equal(grain.count, wheatGeometry.attributes.position.count);
  const shades = new Set(); for (let i = 0; i < grain.count; i++) shades.add(grain.getX(i).toFixed(3));
  assert.ok(shades.size >= 2, 'the ear must be a different tone from the straw');
});

test('a farmyard wears an outline with no straight run in it, and fades into the field it stands in', () => {
  // The first chunk whose bare earth is one compact patch: a farm's yard
  // rather than a track running across the fields.
  let yard = null;
  for (let index = 0; index < 120 && !yard; index++) {
    const chunk = new PlainsChunk(index), mesh = chunk.group.getObjectByName('farm-tracks');
    const dirt = mesh && mesh.geometry.attributes, points = [];
    for (let i = 0; dirt && i < dirt.position.count; i++) {
      points.push({ x: dirt.position.getX(i), z: dirt.position.getZ(i), color: [dirt.color.getX(i), dirt.color.getY(i), dirt.color.getZ(i)] });
    }
    const centre = k => points.reduce((sum, p) => sum + p[k], 0) / points.length;
    if (points.length) {
      const x = centre('x'), z = centre('z');
      if (points.every(p => Math.hypot(p.x - x, p.z - z) < 22)) yard = { chunk, points, x, z };
    }
    if (!yard) chunk.dispose();
  }
  assert.ok(yard, 'no farmyard in the first fifteen kilometres');
  // Walk the patch's boundary: the edges that belong to one triangle only.
  const key = p => `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`, spot = new Map(), edges = new Map(), neighbours = new Map();
  for (const p of yard.points) if (!spot.has(key(p))) spot.set(key(p), p);
  for (let i = 0; i < yard.points.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = key(yard.points[i + k]), b = key(yard.points[i + (k + 1) % 3]), id = a < b ? `${a}|${b}` : `${b}|${a}`;
    edges.set(id, (edges.get(id) ?? 0) + 1);
  }
  for (const [id, count] of edges) {
    if (count !== 1) continue;
    for (const [a, b] of [id.split('|'), id.split('|').reverse()]) neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
  }
  assert.ok(neighbours.size > 12, 'the yard needs an outline to test');
  for (const [, ends] of neighbours) assert.equal(ends.length, 2, 'the outline must be one closed loop');
  const loop = [[...neighbours.keys()][0]];
  for (let previous = null, at = loop[0]; ;) {
    const step = neighbours.get(at).find(other => other !== previous);
    if (step === loop[0]) break;
    loop.push(step); previous = at; at = step;
  }
  assert.equal(loop.length, neighbours.size, 'the outline must close on itself');
  const ring = loop.map(id => spot.get(id));
  // A yard worn by the traffic round it turns at nearly every step. The
  // bare rectangle this replaced ran straight down four long sides.
  const straight = ring.filter((p, i) => {
    const a = ring[(i + ring.length - 1) % ring.length], c = ring[(i + 1) % ring.length];
    const turn = Math.atan2(c.z - p.z, c.x - p.x) - Math.atan2(p.z - a.z, p.x - a.x);
    return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) < .035;
  }).length;
  assert.ok(straight * 3 < ring.length, `${straight} of ${ring.length} steps round the yard run straight on`);
  // The rim is drawn in the crop's own colour, so the yard has no edge to
  // see; the middle of it is a different earth altogether.
  const field = yard.chunk.group.getObjectByName('plains-fields').geometry.attributes;
  const beside = p => {
    let best = Infinity, color = null;
    for (let i = 0; i < field.position.count; i++) {
      const d = (field.position.getX(i) - p.x) ** 2 + (field.position.getZ(i) - p.z) ** 2;
      if (d < best) { best = d; color = [field.color.getX(i), field.color.getY(i), field.color.getZ(i)]; }
    }
    return color;
  };
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const middle = yard.points.reduce((best, p) =>
    Math.hypot(p.x - yard.x, p.z - yard.z) < Math.hypot(best.x - yard.x, best.z - yard.z) ? p : best);
  const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
  const crops = ring.map(beside);
  const rim = mean(crops.map((crop, i) => gap(ring[i].color, crop))), core = mean(crops.map(crop => gap(middle.color, crop)));
  assert.ok(rim * 2 < core, `the rim stands ${rim.toFixed(2)} from the crop's colour and the middle of the yard only ${core.toFixed(2)}`);
  // And the ground between the two is neither: a yard laid in one flat tone
  // has an edge wherever it stops, however its outline runs.
  const tones = new Set(yard.points.map(p => p.color.map(value => value.toFixed(2)).join()));
  assert.ok(tones.size > 20, `the yard is laid in ${tones.size} tones`);
  yard.chunk.dispose();
});

test('most field gates are only gates, so a track worn out into a field and stopping is something to come upon', () => {
  const span = 200000, rows = [];
  for (let row = fieldRowAt(0); fieldBoundary(row) < span; row++) for (const side of [-1, 1]) {
    const gate = farmGate(row, side);
    if (gate) rows.push({ row, side, gate });
  }
  const worn = rows.filter(({ gate }) => gate.worn);
  // The roadside keeps its gates and its mailboxes; what became rare is the
  // bare earth running away from them into a field and petering out.
  assert.ok(span / rows.length < 700, `a field gate only every ${Math.round(span / rows.length)} m`);
  assert.ok(span / worn.length > 1100, `a track off the road every ${Math.round(span / worn.length)} m`);
  // And the chunk draws what the route decided: bare earth behind the gates
  // that are used, and none at all behind the gates that are not.
  const behind = ({ row, side, gate }) => {
    const chunk = new PlainsChunk(Math.floor(gate.s / CHUNK_LENGTH));
    const mesh = chunk.group.getObjectByName('farm-tracks'), found = [];
    const p = chunk.ground(gate.s, side * (ROAD_RESERVE + 8));
    for (let i = 0; mesh && i < mesh.geometry.attributes.position.count; i++) {
      const dirt = mesh.geometry.attributes.position;
      found.push(Math.hypot(dirt.getX(i) - p.x, dirt.getZ(i) - p.z));
    }
    chunk.dispose();
    return Math.min(...found, Infinity);
  };
  // Gates well clear of any compound, so nothing else can lay earth near them.
  const lone = list => list.filter(({ gate }) => Math.abs(gate.s) > 2000 && Math.abs(gate.s) < 60000
    && plainsDiscoveryClears(gate.s, gate.side * 30, plainsDiscoveries(gate.s - 400, gate.s + 400), 60)).slice(0, 6);
  for (const gate of lone(worn)) assert.ok(behind(gate) < 6, `no track behind a worn gate at ${gate.gate.s}`);
  for (const gate of lone(rows.filter(({ gate }) => !gate.worn))) assert.ok(behind(gate) > 12, `a track behind a gate that has none at ${gate.gate.s}`);
  assert.ok(worn.length > rows.length * .2, 'some gates must still be driven through');
});

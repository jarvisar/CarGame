import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CARS, CAR_IDS, DEFAULT_CAR, carMeters, carStats } from '../src/cars.js';
import { createCar, DrivingController } from '../src/vehicle.js';
import { TRAFFIC_MODELS } from '../src/traffic-models.js';
import { JOURNEYS } from '../src/journeys.js';

const straightRoute = {
  frame: () => ({ angle: 0, scale: 1 }),
  position: (s, u) => ({ x: u, y: 0, z: -s }),
  height: () => 0,
  bounds: () => [-100, 100],
};
const flatOut = (id, seconds = 90) => {
  const car = new DrivingController(straightRoute, {}, id);
  for (let i = 0; i < 60 * seconds; i++) car.update(1 / 60, { forward: true });
  return car;
};

test('every car builds a solid, steerable model', () => {
  for (const id of CAR_IDS) {
    const model = createCar(id);
    assert.equal(model.wheels.length, 4, `${id} needs four wheels`);
    assert.equal(model.wheels.filter(wheel => wheel.front).length, 2, `${id} needs two steered wheels`);
    assert.equal(model.nightLights.length, 2, `${id} needs head and tail lamps`);
    let meshes = 0;
    model.car.traverse(object => {
      if (!object.isMesh) return;
      meshes++;
      const position = object.geometry.attributes.position;
      assert.ok(position.count > 0, `${id} has an empty mesh`);
      assert.ok([...position.array].every(Number.isFinite), `${id} has a broken mesh`);
    });
    assert.ok(meshes >= 8, `${id} is missing bodywork`);
    // Wheels rest on the ground the car is placed on.
    const box = new THREE.Box3().setFromObject(model.car);
    assert.ok(Math.abs(box.min.y) < .05, `${id} floats or sinks: ${box.min.y}`);
    model.disposeModel();
  }
});

test('the coastal wagon keeps the original handling and every car stays close to it', () => {
  const base = carStats(DEFAULT_CAR);
  assert.equal(base.topSpeed, 28); assert.equal(base.acceleration, 11.3); assert.equal(base.braking, 20);
  assert.equal(base.grip, 1); assert.equal(base.offRoad, 15);
  for (const id of CAR_IDS) {
    if (id === 'sports') continue;
    const stats = carStats(id);
    assert.ok(Math.abs(stats.topSpeed / base.topSpeed - 1) < .1, `${id} top speed is too far from the original`);
    assert.ok(Math.abs(stats.acceleration / base.acceleration - 1) < .15, `${id} acceleration is too far from the original`);
    assert.ok(Math.abs(stats.grip - 1) < .12, `${id} handling is too far from the original`);
  }
  // The chooser-only coupe is the one car allowed to feel quick.
  const sports = carStats('sports');
  assert.ok(sports.topSpeed > base.topSpeed * 1.13 && sports.topSpeed < base.topSpeed * 1.25);
  assert.ok(sports.acceleration > base.acceleration * 1.15);
});

test('each car settles at its own top speed, and the coupe is the quickest', () => {
  const reached = Object.fromEntries(CAR_IDS.map(id => [id, flatOut(id).speed]));
  for (const id of CAR_IDS) {
    const { topSpeed } = carStats(id);
    assert.ok(Math.abs(reached[id] - topSpeed) < .35, `${id} settled at ${reached[id]}, not ${topSpeed}`);
  }
  assert.equal(Object.entries(reached).sort((a, b) => b[1] - a[1])[0][0], 'sports');
  assert.ok(reached.sports > reached.auto + 4);
  // Distinct, but a whole fleet within a few miles an hour of each other.
  const speeds = CAR_IDS.filter(id => id !== 'sports').map(id => reached[id]);
  assert.ok(Math.max(...speeds) - Math.min(...speeds) < 3);
  assert.ok(new Set(CAR_IDS.map(id => carStats(id).topSpeed)).size >= 8, 'the fleet should not share top speeds');
});

test('acceleration and braking separate the fleet in the expected order', () => {
  const toSpeed = (id, target) => {
    const car = new DrivingController(straightRoute, {}, id);
    let ticks = 0;
    while (car.speed < target && ticks < 60 * 60) { car.update(1 / 60, { forward: true }); ticks++; }
    return ticks;
  };
  const sprint = Object.fromEntries(['sports', 'hatchback', 'auto', 'van'].map(id => [id, toSpeed(id, 20)]));
  assert.ok(sprint.sports < sprint.hatchback, 'the coupe should out-accelerate the hatchback');
  assert.ok(sprint.hatchback < sprint.auto, 'the hatchback should out-accelerate the wagon');
  assert.ok(sprint.auto < sprint.van, 'the wagon should out-accelerate the van');
  const stoppingDistance = id => {
    const car = flatOut(id, 60);
    car.speed = 20; car.update(0, {});
    const start = car.distance;
    while (car.speed > .5) car.update(1 / 60, { brake: true });
    return car.distance - start;
  };
  assert.ok(stoppingDistance('sports') < stoppingDistance('pickup'));
});

test('choosing a car keeps the drive going and swaps the model in the scene', () => {
  const scene = new THREE.Scene();
  const car = new DrivingController(straightRoute, { s: 400 }, 'auto');
  scene.add(car.car);
  for (let i = 0; i < 300; i++) car.update(1 / 60, { forward: true });
  const { s, u, distance } = car, previous = car.car;
  car.setCar('sports');
  assert.equal(car.carId, 'sports');
  assert.equal(car.s, s); assert.equal(car.u, u); assert.equal(car.distance, distance);
  assert.equal(previous.parent, null); assert.equal(car.car.parent, scene);
  assert.equal(scene.children.filter(child => child.isGroup).length, 1);
  assert.equal(car.stats.topSpeed, carStats('sports').topSpeed);
  // A slower car cannot inherit a faster one's speed.
  car.speed = 33; car.setCar('van');
  assert.ok(car.speed <= carStats('van').topSpeed);
  assert.equal(car.spec.width, CARS.van.shape.width);
});

const palette = car => {
  const colors = new Set();
  car.car.traverse(object => { if (object.isMesh) colors.add(object.material.color.getHexString()); });
  return [...colors].sort().join(' ');
};

test('a chosen car keeps its own paint and kit on every route', () => {
  for (const id of CAR_IDS.filter(id => id !== 'auto')) {
    const car = new DrivingController(straightRoute, {}, id), own = palette(car);
    for (const journey of Object.keys(JOURNEYS)) { car.setAppearance(journey); assert.equal(palette(car), own, `${id} changed with the scenery`); }
  }
  // Route Match is the one that still dresses for the scenery.
  const matching = new DrivingController(straightRoute, {}, 'auto'), paints = new Set();
  for (const journey of Object.keys(JOURNEYS)) { matching.setAppearance(journey); paints.add(palette(matching)); }
  assert.equal(paints.size, 4);
});

test('the coupe stays in the chooser, and traffic keeps its own five shapes', () => {
  assert.ok(CARS.sports, 'the chooser needs a sports car');
  assert.ok(!TRAFFIC_MODELS.some(spec => spec.name === 'sports'), 'the coupe must not join traffic');
  assert.ok(!Object.values(JOURNEYS).some(data => data.car === 'sports'), 'no route may default to the coupe');
  assert.equal(DEFAULT_CAR, 'auto');
  for (const id of CAR_IDS) {
    assert.equal(carMeters(id).length, 3);
    for (const { level } of carMeters(id)) assert.ok(level >= 6 && level <= 100, `${id} meter out of range`);
  }
  // The coupe leads every meter; nothing else leads all three.
  for (const [index, meter] of carMeters('sports').entries()) {
    assert.ok(CAR_IDS.every(id => carMeters(id)[index].level <= meter.level), `${meter.label} should top out at the coupe`);
  }
});

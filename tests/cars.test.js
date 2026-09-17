import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CARS, CAR_IDS, DEFAULT_CAR, ROUTE_PAINT, carMeters, carStats } from '../src/cars.js';
import { createCar, DrivingController } from '../src/vehicle.js';
import { TRAFFIC_MODELS } from '../src/traffic-models.js';
import { JOURNEYS } from '../src/journeys.js';
import { PAINTS, isPaint, loadPaints, savePaints, paintName, shownPaint } from '../src/car-paint.js';

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

// The two chooser-only cars are the ones allowed to break the tourer's mould.
const RACERS = ['sports', 'formula'];

test('the coastal wagon keeps the original handling and every car stays close to it', () => {
  const base = carStats(DEFAULT_CAR);
  assert.equal(base.topSpeed, 28); assert.equal(base.acceleration, 11.3); assert.equal(base.braking, 20);
  assert.equal(base.grip, 1); assert.equal(base.offRoad, 15);
  for (const id of CAR_IDS) {
    if (RACERS.includes(id)) continue;
    const stats = carStats(id);
    assert.ok(Math.abs(stats.topSpeed / base.topSpeed - 1) < .1, `${id} top speed is too far from the original`);
    assert.ok(Math.abs(stats.acceleration / base.acceleration - 1) < .15, `${id} acceleration is too far from the original`);
    assert.ok(Math.abs(stats.grip - 1) < .12, `${id} handling is too far from the original`);
  }
  // The coupe is allowed to feel quick, and the racer quicker again.
  const sports = carStats('sports'), formula = carStats('formula');
  assert.ok(sports.topSpeed > base.topSpeed * 1.13 && sports.topSpeed < base.topSpeed * 1.25);
  assert.ok(sports.acceleration > base.acceleration * 1.15);
  assert.ok(formula.topSpeed > sports.topSpeed * 1.15, 'the racer should clear the coupe by a wide margin');
  assert.ok(formula.acceleration > sports.acceleration * 1.25 && formula.braking > sports.braking);
  assert.ok(formula.grip > sports.grip, 'slicks should turn in harder than the coupe');
  assert.ok(formula.offRoad < base.offRoad * .7, 'and should be hopeless off the tarmac');
});

test('each car settles at its own top speed, and the racer is the quickest', () => {
  const reached = Object.fromEntries(CAR_IDS.map(id => [id, flatOut(id).speed]));
  for (const id of CAR_IDS) {
    const { topSpeed } = carStats(id);
    assert.ok(Math.abs(reached[id] - topSpeed) < .35, `${id} settled at ${reached[id]}, not ${topSpeed}`);
  }
  // Drag rises with the square of speed, so a car only reaches the figure on
  // its card if it has the power to push through its own wake.
  const order = Object.entries(reached).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  assert.deepEqual(order.slice(0, 2), ['formula', 'sports']);
  assert.ok(reached.formula > reached.sports + 6);
  assert.ok(reached.sports > reached.auto + 4);
  // Distinct, but a whole fleet within a few miles an hour of each other.
  const speeds = CAR_IDS.filter(id => !RACERS.includes(id)).map(id => reached[id]);
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
  const sprint = Object.fromEntries(['formula', 'sports', 'hatchback', 'auto', 'van'].map(id => [id, toSpeed(id, 20)]));
  assert.ok(sprint.formula < sprint.sports, 'the racer should out-accelerate the coupe');
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
  assert.ok(stoppingDistance('formula') < stoppingDistance('sports'));
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

test('the racers stay in the chooser, and traffic keeps its own five shapes', () => {
  for (const id of RACERS) {
    assert.ok(CARS[id], `the chooser needs the ${id} car`);
    assert.ok(!TRAFFIC_MODELS.some(spec => spec.name === CARS[id].shape.name), `${id} must not join traffic`);
    assert.ok(!Object.values(JOURNEYS).some(data => data.car === id), `no route may default to ${id}`);
  }
  assert.equal(DEFAULT_CAR, 'auto');
  for (const id of CAR_IDS) {
    assert.equal(carMeters(id).length, 3);
    for (const { level } of carMeters(id)) assert.ok(level >= 6 && level <= 100, `${id} meter out of range`);
  }
  // The meters are scaled for the road fleet, so the racer pegs all three and
  // the coupe leads everything that is still an ordinary tourer.
  assert.ok(carMeters('formula').every(({ level }) => level === 100));
  for (const [index, meter] of carMeters('sports').entries()) {
    const road = CAR_IDS.filter(id => id !== 'formula');
    assert.ok(road.every(id => carMeters(id)[index].level <= meter.level), `${meter.label} should top out at the coupe`);
  }
});

test('the racer is an open-wheeler, not a road car with new numbers', () => {
  const formula = createCar('formula'), wagon = createCar('coast');
  const bounds = model => { const box = new THREE.Box3().setFromObject(model.car); return box.max.clone().sub(box.min); };
  const racer = bounds(formula), tourer = bounds(wagon);
  assert.ok(racer.z > tourer.z, 'the racer should be the longer car');
  assert.ok(racer.y < tourer.y * .6, 'and much lower');
  assert.equal(CARS.formula.shape.name, 'formula');
  assert.ok(Math.abs(racer.x - CARS.formula.shape.width) < .1, 'its exposed wheels set the collision width');
  formula.disposeModel(); wagon.disposeModel();
});

test('a car keeps the colour it was painted, on every route and after a swap', () => {
  const blue = '#2f4a6d';
  const car = new DrivingController(straightRoute, {}, 'sports', blue);
  assert.ok(palette(car).includes(blue.slice(1)), 'the chosen colour should reach the model');
  for (const journey of Object.keys(JOURNEYS)) { car.setAppearance(journey); assert.ok(palette(car).includes(blue.slice(1))); }
  // The default car dresses for the scenery until it is painted, and then holds.
  car.setCar('auto');
  const scenic = new Set();
  for (const journey of Object.keys(JOURNEYS)) { car.setAppearance(journey); scenic.add(palette(car)); }
  assert.equal(scenic.size, 4);
  car.setPaint(blue);
  const painted = new Set();
  for (const journey of Object.keys(JOURNEYS)) { car.setAppearance(journey); painted.add(palette(car)); }
  assert.equal(painted.size, 1);
  assert.ok([...painted][0].includes(blue.slice(1)));
  // Back to the factory finish is back to the route's own colours.
  car.setPaint(null);
  car.setAppearance('desert');
  assert.ok(palette(car).includes(ROUTE_PAINT.desert.slice(1)));
  // Every other car can be painted too, without losing its shape.
  for (const id of CAR_IDS) {
    car.setCar(id, { paint: blue });
    assert.ok(palette(car).includes(blue.slice(1)), `${id} ignored its paint`);
    assert.equal(car.paintColor, blue);
  }
});

test('the paint counter offers usable colours and only stores real ones', () => {
  assert.ok(PAINTS.length >= 8);
  for (const { name, color } of PAINTS) {
    assert.ok(name && isPaint(color), `${name} is not a usable swatch`);
    assert.equal(paintName(color), name);
  }
  assert.equal(new Set(PAINTS.map(paint => paint.color)).size, PAINTS.length, 'no two swatches may share a colour');
  assert.equal(paintName('#010203'), null, 'a mixed colour has no catalogue name');
  for (const value of ['red', '#fff', '#12345g', '', null, 42]) assert.equal(isPaint(value), false);
  // An unpainted car shows the finish it left the factory in.
  assert.equal(shownPaint('sports', {}), CARS.sports.paint);
  assert.equal(shownPaint('sports', { sports: '#123456' }), '#123456');
});

test('stored paint survives a reload, and junk in storage is dropped', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  savePaints({ sports: '#2F4A6D', formula: '#123456' }, storage);
  assert.deepEqual(loadPaints(storage), { sports: '#2f4a6d', formula: '#123456' });
  // Cars that no longer exist, bad colours and broken JSON never reach a model.
  savePaints({ sports: '#2f4a6d', ghost: '#ffffff', van: 'chartreuse' }, storage);
  assert.deepEqual(loadPaints(storage), { sports: '#2f4a6d' });
  store.set('coastline-paint', '{ not json');
  assert.deepEqual(loadPaints(storage), {});
  // Storage is optional: a browser that refuses it still drives.
  const refuses = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadPaints(refuses), {});
  savePaints({ sports: '#2f4a6d' }, refuses);
});

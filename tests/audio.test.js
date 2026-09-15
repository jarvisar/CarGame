import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveSoundModel } from '../src/audio/model.js';
import { createNoiseBuffer } from '../src/audio/synthesis.js';
import { DriveAudio } from '../src/audio.js';
import { DrivingController } from '../src/vehicle.js';

function settle(model, telemetry, seconds = 2, hz = 60) {
  let result;
  for (let i = 0; i < seconds * hz; i++) result = model.update(telemetry, 1 / hz);
  return result;
}

test('engine responds to load separately from speed and quiets down when coasting', () => {
  const model = new DriveSoundModel();
  const loaded = settle(model, { speed: 12, throttle: 1 });
  const coast = settle(model, { speed: 12 });
  assert.ok(loaded.engineLevel > coast.engineLevel * 1.5);
  assert.ok(loaded.engineCutoff > coast.engineCutoff * 1.5);
  assert.equal(loaded.roadLevel, coast.roadLevel);
  const stopped = settle(model, { speed: 0 });
  assert.ok(stopped.rpm < 825);
  assert.equal(stopped.roadLevel + stopped.roughLevel + stopped.windLevel, 0);
});

test('sound gears shift without hunting and reverse has its own bounded range', () => {
  const model = new DriveSoundModel();
  const first = settle(model, { speed: 7.4, throttle: 1 });
  const second = settle(model, { speed: 7.6, throttle: 1 });
  assert.equal(first.gear, 1); assert.equal(second.gear, 2);
  assert.ok(second.rpm < first.rpm - 400);
  for (let i = 0; i < 300; i++) assert.equal(model.update({ speed: i % 2 ? 7.4 : 7.6 }, 1 / 60).gear, 2);
  assert.equal(settle(model, { speed: 4.8 }).gear, 1);
  const reverse = settle(model, { speed: -7, throttle: 1 });
  assert.equal(reverse.gear, -1); assert.ok(reverse.rpm > 1800 && reverse.rpm < 2800);
});

test('surface texture blends in only when moving off road', () => {
  const model = new DriveSoundModel();
  const road = model.update({ speed: 14 });
  const shoulder = model.update({ speed: 14, offRoad: .5 });
  const rough = model.update({ speed: 14, offRoad: 1 });
  assert.equal(road.roughLevel, 0);
  assert.ok(rough.roughLevel > shoulder.roughLevel && shoulder.roughLevel > 0);
  assert.ok(rough.roadLevel < shoulder.roadLevel && shoulder.roadLevel < road.roadLevel);
  assert.equal(model.update({ speed: 0, offRoad: 1 }).roughLevel, 0);
});

test('audio model handles invalid telemetry and variable frame delivery', () => {
  for (const telemetry of [{}, { speed: NaN, throttle: Infinity }, { speed: -1000, offRoad: -1 }]) {
    for (const value of Object.values(new DriveSoundModel().update(telemetry, NaN))) assert.ok(Number.isFinite(value));
  }
  const low = settle(new DriveSoundModel(), { speed: 12, throttle: .5 }, 3, 30);
  const high = settle(new DriveSoundModel(), { speed: 12, throttle: .5 }, 3, 144);
  assert.ok(Math.abs(low.rpm - high.rpm) < 1);
  assert.ok(Math.abs(low.load - high.load) < .001);
});

test('vehicle reports keyboard, reverse, analog, touch and reset effort', () => {
  const car = new DrivingController();
  car.update(1 / 60, { forward: .4 });
  assert.equal(car.audioTelemetry.throttle, .4);
  car.speed = 10; car.update(1 / 60, { brake: .7 });
  assert.equal(car.audioTelemetry.brake, .7); assert.equal(car.audioTelemetry.throttle, 0);
  car.speed = -3; car.update(1 / 60, { brake: .6 });
  assert.equal(car.audioTelemetry.throttle, .6); assert.equal(car.audioTelemetry.brake, 0);
  car.update(1 / 60, { forward: 1, handbrake: true });
  assert.equal(car.audioTelemetry.throttle, 0); assert.equal(car.audioTelemetry.brake, 1);
  car.reset();
  assert.equal(car.audioTelemetry.speed + car.audioTelemetry.throttle + car.audioTelemetry.brake, 0);
  car.update(1 / 60, { touchDrive: { amount: .5, heading: car.heading, along: 1, across: 0 } });
  assert.ok(car.audioTelemetry.throttle > .9);
  car.update(1 / 60, { touchDrive: { amount: 0 } });
  assert.ok(car.audioTelemetry.brake > 0);
});

test('stereo noise is deterministic, decorrelated and has a continuous loop join', () => {
  const context = {
    sampleRate: 8000,
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: i => data[i] };
    },
  };
  const a = createNoiseBuffer(context), b = createNoiseBuffer(context);
  const left = a.getChannelData(0), right = a.getChannelData(1);
  assert.deepEqual(left, b.getChannelData(0));
  let ll = 0, rr = 0, lr = 0, steps = 0;
  for (let i = 1; i < left.length; i++) {
    ll += left[i] ** 2; rr += right[i] ** 2; lr += left[i] * right[i];
    steps += (left[i] - left[i - 1]) ** 2;
  }
  assert.ok(Math.abs(lr / Math.sqrt(ll * rr)) < .15);
  assert.ok(Math.abs(left[0] - left.at(-1)) < 4 * Math.sqrt(steps / left.length));
});

test('unsupported audio fails cleanly and leaves sound disabled', async () => {
  const original = globalThis.window;
  globalThis.window = {};
  try {
    const audio = new DriveAudio();
    await assert.rejects(audio.toggle(), /unavailable/);
    assert.equal(audio.enabled, false); assert.equal(audio.context, null);
    await audio.dispose(); await audio.dispose();
  } finally { if (original === undefined) delete globalThis.window; else globalThis.window = original; }
});

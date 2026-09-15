import test from 'node:test';
import assert from 'node:assert/strict';
import { PixelDensity } from '../src/pixel-density.js';

function frames(density, hz, seconds, start = 0, active = true) {
  let changes = 0;
  for (let i = 0; i < hz * seconds; i++) if (density.update(start + i * 1000 / hz, active)) changes++;
  return changes;
}

test('native density is retained at 60 Hz and faster, including normal clock jitter', () => {
  for (const hz of [59.94, 60, 90, 120]) {
    const density = new PixelDensity();
    assert.equal(frames(density, hz, 30), 0);
    assert.equal(density.cap, 3);
  }
});

test('sustained low FPS chooses an intermediate density after warmup and retains it on recovery', () => {
  for (const [hz, expected] of [[1, 1], [30, 2], [50, 2.5], [59, 2.75]]) {
    const density = new PixelDensity();
    assert.equal(frames(density, hz, 6), 0);
    assert.equal(density.cap, 3);
    assert.equal(frames(density, hz, 2, 6000), 1);
    assert.equal(density.cap, expected);
    density.reset();
    assert.equal(frames(density, 120, 30, 12000), 0);
    assert.equal(density.cap, expected);
  }
});

test('continued low FPS can reduce further, but stops at 1x', () => {
  const density = new PixelDensity();
  assert.ok(frames(density, 30, 60) > 1);
  assert.equal(density.cap, 1);
  assert.equal(frames(density, 10, 30, 60000), 0);
  assert.equal(density.cap, 1);
});

test('reductions use the actual device density, and do not upscale low-density screens', () => {
  for (const [native, expected] of [[.8, 3], [1, 3], [1.5, 1.25], [2, 1.75]]) {
    const density = new PixelDensity();
    for (let i = 0; i < 400; i++) density.update(i * 20, true, Math.min(native, density.cap));
    assert.equal(density.cap, expected);
  }
});

test('startup work and a single hitch do not reduce density', () => {
  const density = new PixelDensity();
  frames(density, 10, 3);
  frames(density, 60, 5, 3000);
  frames(density, 60, 15, 8250);
  assert.equal(density.cap, 3);
});

test('paused, hidden and transition intervals are excluded and restart the grace period', () => {
  const density = new PixelDensity();
  frames(density, 30, 6);
  density.update(6000, false);
  assert.equal(frames(density, 30, 6, 60000), 0);
  density.reset(); // Resize or visibility event without an intervening animation frame.
  assert.equal(frames(density, 60, 15, 120000), 0);
  assert.equal(density.cap, 3);
});

// Graphics quality: what each level renders, how a device's starting level is
// guessed, and the adaptive controller that keeps the frame rate near the
// display's refresh rate.
//
// Only renderer settings change between levels. Scenery, lighting, animation
// and the number of streamed chunks are identical at every level, so a route
// looks like itself on every device; it is drawn at a different resolution,
// with a coarser sun shadow, and with or without the soft ambient shading.
// Nothing here changes the shader light counts, which would make the browser
// recompile every program mid-drive.

export const QUALITY_LEVELS = [
  { id: 'high', label: 'High', summary: 'Full resolution · soft shading · sharp shadows', density: 3, shadowMap: 2048, ambientOcclusion: true, antialias: true },
  { id: 'balanced', label: 'Balanced', summary: 'Slightly softer resolution · soft shading', density: 2, shadowMap: 1536, ambientOcclusion: true, antialias: true },
  { id: 'smooth', label: 'Smooth', summary: 'Lower resolution · no soft shading', density: 1.5, shadowMap: 1024, ambientOcclusion: false, antialias: true },
  { id: 'basic', label: 'Basic', summary: 'Lowest resolution · for older phones', density: 1, shadowMap: 1024, ambientOcclusion: false, antialias: false },
];
const WORST = QUALITY_LEVELS.length - 1;
export const levelIndex = id => QUALITY_LEVELS.findIndex(level => level.id === id);

// Measure over windows long enough to average a stutter, and ignore the first
// moments after any change while buffers, shaders and streaming settle.
const WINDOW_MS = 1500, SETTLE_MS = 2000, FIRST_SETTLE_MS = 4000;
// 59.5 would read a 59.94 Hz display as slow; 0.92 leaves room for that and for
// the odd dropped frame without reacting to a single hitch.
const SLOW = .92, FAST = .97;
const SLOW_WINDOWS = 2, FAST_WINDOWS = 4;
// A step down that changes almost nothing means something other than the scene
// is setting the pace: a capped display, a busy CPU, or a throttled browser.
const WORTHWHILE = 1.04;

const STORAGE_KEY = 'coastline.graphics';

function readStored(storage) {
  try { return JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') ?? {}; }
  catch { return {}; }
}
function writeStored(storage, value) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* private mode, quota, or no storage */ }
}
function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// A first guess from what the browser will tell us. Deliberately cautious on
// touch devices: the controller below raises the level within a few seconds
// when the device turns out to be quick, which looks better than starting too
// high and stuttering through the first corner.
export function detectLevel(hints = {}) {
  const nav = hints.navigator ?? globalThis.navigator ?? {};
  // A coarse primary pointer covers phones and tablets, including the tablets
  // that report themselves as desktops; a touchscreen laptop still has a fine
  // primary pointer and is left alone.
  const coarsePointer = hints.coarsePointer ?? Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
  const mobile = hints.mobile ?? (nav.userAgentData?.mobile === true || coarsePointer);
  if (!mobile) return 0;
  const cores = hints.cores ?? nav.hardwareConcurrency ?? 0;
  // Safari reports no deviceMemory at all, so absent is treated as "unknown"
  // rather than "small"; getting it wrong costs a few seconds of adapting.
  const memory = hints.memory ?? nav.deviceMemory ?? 0;
  if (cores >= 6 && (memory === 0 || memory >= 4)) return 1;
  if (cores >= 4 && memory !== 0 && memory < 2) return 3;
  if (cores >= 4) return 2;
  return 3;
}

export class Graphics {
  constructor({ storage = defaultStorage(), ambientOcclusion = null, detect = detectLevel } = {}) {
    const stored = readStored(storage);
    this.storage = storage;
    this.listeners = new Set();
    this.detected = detect();
    const storedLevel = levelIndex(stored.level);
    this.level = storedLevel === -1 ? this.detected : storedLevel;
    this.mode = QUALITY_LEVELS.some(level => level.id === stored.mode) ? stored.mode : 'auto';
    if (this.mode !== 'auto') this.level = levelIndex(this.mode);
    // `?ao=0` sets soft shading for this visit, ahead of the level's own answer
    // and of a remembered choice. It can still be switched back on.
    this.ambientOcclusionOverride = ambientOcclusion ?? (typeof stored.ambientOcclusion === 'boolean' ? stored.ambientOcclusion : null);
    // Never probe above the level a downgrade settled on, so quality ratchets
    // one way and the picture cannot flicker between two levels all drive.
    this.ceiling = 0;
    this.target = 60;
    this.cascade = null;
    this.suspend(FIRST_SETTLE_MS);
  }

  get auto() { return this.mode === 'auto'; }
  get levelId() { return QUALITY_LEVELS[this.level].id; }
  get settings() {
    const level = QUALITY_LEVELS[this.level];
    return { ...level, ambientOcclusion: this.ambientOcclusionOverride ?? level.ambientOcclusion };
  }
  // Antialiasing belongs to the WebGL context, which cannot be reconfigured
  // without rebuilding it, so it follows the level this page started on.
  get antialias() { return QUALITY_LEVELS[this.level].antialias; }

  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  // `reason` is 'auto' when the controller decided on its own, so the game can
  // say so rather than letting the picture change without explanation.
  announce(reason) { for (const listener of this.listeners) listener(this.settings, reason, this); }

  save() {
    writeStored(this.storage, { mode: this.mode, level: this.levelId, ambientOcclusion: this.ambientOcclusionOverride });
  }

  setMode(mode) {
    const index = levelIndex(mode);
    if (mode !== 'auto' && index === -1) return false;
    this.mode = mode === 'auto' ? 'auto' : mode;
    // A fresh choice clears an adaptive history and any soft-shading override,
    // so the level the player picked is the level they get.
    this.ceiling = 0; this.cascade = null; this.target = 60;
    this.ambientOcclusionOverride = null;
    if (index !== -1) this.level = index;
    this.suspend();
    this.save();
    this.announce('mode');
    return true;
  }

  toggleAmbientOcclusion() {
    const enabled = !this.settings.ambientOcclusion;
    this.ambientOcclusionOverride = enabled === QUALITY_LEVELS[this.level].ambientOcclusion ? null : enabled;
    this.suspend();
    this.save();
    this.announce('ambient-occlusion');
    return enabled;
  }

  // A new route is a different amount of work, so allow one level better than
  // the last one settled on. Lifting the ceiling a step at a time keeps route
  // hopping from walking the whole ladder up and back down. The measured
  // target is kept: the display's own limit did not change with the route.
  relax() {
    this.ceiling = Math.max(0, this.ceiling - 1);
    this.cascade = null;
    this.suspend();
  }

  // Pause measuring: after a change, and whenever the drive is not running.
  suspend(settle = SETTLE_MS) {
    this.settle = settle; this.startedAt = null; this.windowStart = null;
    this.frames = 0; this.slow = 0; this.fast = 0;
  }

  // One sample per displayed frame. `active` is false while paused, hidden or
  // changing route, when frame times say nothing about how the scene performs.
  sample(timestamp, active) {
    if (!this.auto) return false;
    if (!active) { this.startedAt = null; this.windowStart = null; this.frames = 0; return false; }
    this.startedAt ??= timestamp;
    if (timestamp - this.startedAt < this.settle) return false;
    if (this.windowStart === null) { this.windowStart = timestamp; this.frames = 0; return false; }
    this.frames++;
    const elapsed = timestamp - this.windowStart;
    if (elapsed < WINDOW_MS) return false;
    const fps = this.frames * 1000 / elapsed;
    this.windowStart = timestamp; this.frames = 0;
    this.fps = fps;
    return this.judge(fps);
  }

  judge(fps) {
    if (fps < this.target * SLOW) {
      this.fast = 0;
      if (++this.slow < SLOW_WINDOWS) return false;
      this.slow = 0;
      if (this.cascade && fps < this.cascade.fps * WORTHWHILE) {
        // Giving up detail did not buy frames. Take it back and measure
        // against the rate this device actually delivers.
        const level = this.cascade.level;
        this.cascade = null;
        this.target = Math.max(24, fps);
        this.ceiling = level;
        return this.change(level);
      }
      if (this.level < WORST) {
        this.cascade ??= { level: this.level, fps };
        return this.change(this.level + 1);
      }
      this.cascade = null;
      this.target = Math.max(24, fps);
      return false;
    }
    this.slow = 0;
    if (fps < this.target * FAST) { this.fast = 0; this.cascade = null; return false; }
    this.cascade = null;
    if (++this.fast < FAST_WINDOWS || this.level <= this.ceiling) return false;
    this.fast = 0;
    return this.change(this.level - 1);
  }

  change(level) {
    const next = Math.max(0, Math.min(WORST, level));
    if (next === this.level) return false;
    if (next > this.level) this.ceiling = next;
    this.level = next;
    this.suspend();
    this.save();
    this.announce('auto');
    return true;
  }
}

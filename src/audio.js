import { DriveSoundModel } from './audio/model.js';
import { createSoundGraph } from './audio/synthesis.js';

const AMBIENCE = {
  coast: { low: 440, high: 2400, bed: .14, swell: .16, air: .025, wash: .14 },
  desert: { low: 620, high: 1350, bed: .07, swell: .09, air: .015, wash: .05 },
  snow: { low: 350, high: 2200, bed: .055, swell: .065, air: .02, wash: .075 },
  jungle: { low: 300, high: 3600, bed: .06, swell: .05, air: .03, wash: .06 },
  plains: { low: 380, high: 2600, bed: .06, swell: .07, air: .022, wash: .06 },
  city: { low: 260, high: 4300, bed: .05, swell: .035, air: .07, wash: .075 },
};

// One lazily created graph, controlled by smoothed parameters. No sound assets
// or additional UI; muted/paused contexts sleep after their fade finishes.
export class DriveAudio {
  constructor() {
    this.enabled = false; this.context = null; this.graph = null; this.journey = 'coast';
    this.paused = false; this.hidden = false; this.disposed = false;
    this.model = new DriveSoundModel(); this.targets = new WeakMap();
    this.revision = 0; this.lastUpdate = -Infinity; this.suspendTimer = null;
  }
  get audible() { return this.enabled && !this.paused && !this.hidden && !this.disposed; }
  target(param, value, seconds = .12) {
    if (Math.abs((this.targets.get(param) ?? Infinity) - value) < .0001) return;
    param.setTargetAtTime(value, this.context.currentTime, seconds); this.targets.set(param, value);
  }
  setJourney(id) {
    this.journey = Object.hasOwn(AMBIENCE, id) ? id : 'coast';
    this.reset();
  }
  reset() { this.model.reset(); this.lastUpdate = -Infinity; }
  async toggle() {
    if (this.disposed) return false;
    const revision = ++this.revision;
    this.enabled = !this.enabled;
    try {
      if (this.enabled) { this.ensureContext(); await this.wake(); }
      this.syncOutput();
    } catch (error) {
      if (revision === this.revision) { this.enabled = false; this.syncOutput(); }
      throw error;
    }
    return this.enabled;
  }
  ensureContext() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Web Audio is unavailable');
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      try { this.graph = createSoundGraph(ctx); this.context = ctx; }
      catch (error) { void ctx.close().catch(() => {}); throw error; }
      this.update({}, 1 / 60, true);
    }
  }
  async wake() {
    clearTimeout(this.suspendTimer); this.suspendTimer = null;
    if (this.audible && this.context && this.context.state !== 'running') await this.context.resume();
  }
  // Trusted input also retries contexts interrupted by a mobile OS or browser.
  unlock() {
    if (!this.audible || !this.context || this.context.state === 'running') return;
    void this.wake().then(() => this.syncOutput()).catch(() => {});
  }
  syncOutput() {
    if (!this.graph || this.disposed) return;
    this.target(this.graph.master, this.audible ? .48 : 0, this.audible ? .16 : .065);
    clearTimeout(this.suspendTimer); this.suspendTimer = null;
    if (!this.audible && this.context.state === 'running') {
      this.suspendTimer = setTimeout(() => {
        if (!this.audible && !this.disposed) {
          this.graph.master.setValueAtTime(0, this.context.currentTime);
          void this.context.suspend().catch(() => {});
        }
      }, 750);
    }
  }
  setPaused(value) { this.paused = Boolean(value); this.syncOutput(); this.unlock(); }
  setHidden(value) { this.hidden = Boolean(value); this.syncOutput(); this.unlock(); }
  update(telemetry, dt, force = false) {
    if (!this.graph || this.disposed) return;
    const state = this.model.update(telemetry, this.paused ? 0 : dt); this.state = state;
    const now = this.context.currentTime;
    if (!force && (this.context.state !== 'running' || now - this.lastUpdate < 1 / 30)) return;
    this.lastUpdate = now;
    const g = this.graph, set = (param, value, seconds) => this.target(param, value, seconds);
    set(g.engine.frequency, state.rpm / 30, .055); set(g.body.frequency, state.rpm / 60, .09);
    set(g.engineLevel, state.engineLevel); set(g.engineFilter, state.engineCutoff, .18);
    set(g.bodyLevel, .018 + state.load * .012);
    set(g.combustion.level, .02 + state.load * .045); set(g.combustion.frequency, 430 + state.load * 600);
    set(g.road.level, state.roadLevel); set(g.road.frequency, 380 + state.motion * 900, .25);
    set(g.rough.level, state.roughLevel); set(g.roughPulse, state.roughLevel * .2); set(g.roughMod.frequency, 12 + state.motion * 31);
    set(g.rough.frequency, this.journey === 'snow' ? 650 : this.journey === 'desert' ? 1350 : this.journey === 'jungle' ? 820 : this.journey === 'plains' ? 1150 : this.journey === 'city' ? 1050 : 1000, .8);
    set(g.wind.level, state.windLevel, .4); set(g.wind.frequency, 900 + state.motion * 1700, .4);
    // Unequal, overlapping cycles give surf and gusts a less repetitive rhythm.
    const swell = Math.pow(.5 + .5 * Math.sin(now * .47 + .6 * Math.sin(now * .113)), 2);
    const gust = .5 + .3 * Math.sin(now * .23) + .2 * Math.sin(now * .61 + 2);
    // Insects and birdsong pulse faster than surf or gusts.
    const chirr = .5 + .35 * Math.sin(now * 1.9) + .15 * Math.sin(now * 5.3 + 1);
    // Evening crickets ride on the prairie wind.
    const prairie = gust * .7 + chirr * .3;
    // Steady rain, heavier in the gusts.
    const rain = .62 + gust * .38;
    const envelope = this.journey === 'coast' ? swell : this.journey === 'jungle' ? chirr : this.journey === 'plains' ? prairie : this.journey === 'city' ? rain : gust, profile = AMBIENCE[this.journey];
    set(g.bed.level, profile.bed + envelope * profile.swell, .8);
    set(g.bed.frequency, profile.low, .8);
    set(g.air.level, profile.air + Math.pow(envelope, 1.5) * profile.wash, 1);
    set(g.air.frequency, profile.high * (.8 + envelope * .4), 1);
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; this.enabled = false; ++this.revision;
    clearTimeout(this.suspendTimer); this.graph?.dispose();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.graph = null; this.context = null;
  }
}

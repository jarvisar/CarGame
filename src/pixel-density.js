// Try native density up to 3x, then retain reductions for this page session.
// Two slow windows avoid reacting to a single hitch or oscillating between sizes.
export class PixelDensity {
  constructor() { this.cap = 3; this.reset(); }
  reset(grace = 3000) { this.startedAt = null; this.windowStart = null; this.frames = 0; this.slowWindows = 0; this.grace = grace; }
  update(timestamp, active, ratio = this.cap) {
    if (this.cap === 1) return false;
    if (!active || ratio <= 1) { this.reset(); return false; }
    this.startedAt ??= timestamp;
    if (timestamp - this.startedAt < this.grace) return false;
    if (this.windowStart === null) { this.windowStart = timestamp; return false; }
    this.frames++;
    const elapsed = timestamp - this.windowStart;
    if (elapsed < 2000) return false;
    const fps = this.frames * 1000 / elapsed;
    // Small tolerance for 59.94 Hz displays and animation timestamp rounding.
    this.slowWindows = fps < 59.5 ? this.slowWindows + 1 : 0;
    this.windowStart = timestamp; this.frames = 0;
    if (this.slowWindows < 2) return false;
    // Pixel count grows with density squared. Estimate a cheaper density from
    // the observed FPS, rounded down to quarter steps, then measure again.
    this.cap = Math.max(1, Math.floor(ratio * Math.sqrt(fps / 60) * 4) / 4);
    this.reset(1000); this.startedAt = timestamp;
    return true;
  }
}

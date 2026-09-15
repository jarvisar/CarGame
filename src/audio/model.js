const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = value => Number.isFinite(value) ? value : 0;
const damp = (from, to, dt, seconds) => from + (to - from) * (1 - Math.exp(-dt / seconds));

// Sound-only automatic gearing. Different up/down thresholds avoid hunting
// between gears; physics and the controls remain independent of this model.
export class DriveSoundModel {
  constructor() { this.reset(); }
  reset() { this.gear = 0; this.rpm = 820; this.load = 0; this.shift = 0; this.reverse = false; }
  update(telemetry = {}, delta = 1 / 60) {
    const dt = clamp(finite(delta), 0, .1);
    const signedSpeed = clamp(finite(telemetry.speed), -40, 40);
    const speed = Math.abs(signedSpeed), reverse = signedSpeed < -.3;
    const throttle = clamp(finite(telemetry.throttle), 0, 1);
    const brake = clamp(finite(telemetry.brake), 0, 1);
    const thresholds = [7.5, 14.5, 22];
    if (speed < .5 || reverse !== this.reverse) { this.gear = 0; this.shift = 0; }
    this.reverse = reverse;
    this.shift = Math.max(0, this.shift - dt);
    if (!reverse && this.shift === 0) {
      const previousGear = this.gear;
      if (this.gear < 3 && speed > thresholds[this.gear]) this.gear++;
      else if (this.gear > 0 && speed < thresholds[this.gear - 1] - 2.5) this.gear--;
      if (this.gear !== previousGear) this.shift = .3;
    }
    const clutch = this.shift > 0 ? .75 : 1;
    const targetRpm = clamp(820 + speed * (reverse ? 205 : [230, 145, 105, 80][this.gear]) + throttle * 220, 820, 3900);
    this.rpm = damp(this.rpm, targetRpm, dt, this.shift ? .12 : .2);
    this.load = damp(this.load, throttle * (1 - brake) * clutch, dt, .16);
    const motion = clamp(speed / 28, 0, 1);
    const offRoad = clamp(finite(telemetry.offRoad), 0, 1);
    return {
      rpm: this.rpm, load: this.load, gear: reverse ? -1 : this.gear + 1, motion,
      engineLevel: (.085 + this.load * .075 + motion * .018) * clutch,
      engineCutoff: 380 + this.load * 950 + motion * 400,
      roadLevel: Math.pow(motion, .85) * .18 * (1 - offRoad * .65),
      roughLevel: Math.sqrt(motion) * offRoad * .17,
      windLevel: Math.pow(motion, 1.7) * .12,
    };
  }
}

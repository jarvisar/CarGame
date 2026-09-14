// Quiet synthesized surf and a soft engine hum; no downloaded audio assets.
export class DriveAudio {
  constructor() { this.enabled = false; this.context = null; this.journey = 'coast'; }
  setJourney(id) { this.journey = id; }
  async toggle() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext(); const ctx = this.context;
      this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
      this.engine = ctx.createOscillator(); this.engine.type = 'triangle';
      this.engineGain = ctx.createGain(); this.engineGain.gain.value = .026;
      this.engine.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate); const data = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .025) / 1.025; data[i] = previous * 4; }
      const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
      const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 750; this.windFilter = lowpass;
      this.surfGain = ctx.createGain(); this.surfGain.gain.value = .11;
      noise.connect(lowpass); lowpass.connect(this.surfGain); this.surfGain.connect(this.master); noise.start();
    }
    await this.context.resume(); this.enabled = !this.enabled; return this.enabled;
  }
  update(speed, time, paused) {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.enabled && !paused ? .7 : 0, now, .15);
    this.engine.frequency.setTargetAtTime(34 + Math.abs(speed) * 2.1, now, .12);
    this.engineGain.gain.setTargetAtTime(.018 + Math.abs(speed) * .0012, now, .12);
    const desert = this.journey === 'desert';
    this.windFilter.frequency.setTargetAtTime(desert ? 1150 : 750, now, .5);
    this.surfGain.gain.setTargetAtTime(desert ? .06 + Math.sin(time * .19) * .014 : .095 + Math.sin(time * .33) * .03, now, .3);
  }
}

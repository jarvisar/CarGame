// Longer stereo noise with a seamless join, shared by all the noise layers.
export function createNoiseBuffer(ctx, seed = 0x71ca9) {
  const length = Math.ceil(ctx.sampleRate * 12), overlap = Math.ceil(ctx.sampleRate * .15);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  let state = seed >>> 0;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel), tail = new Float32Array(overlap);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length + overlap; i++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      const white = (state >>> 0) / 2147483648 - 1;
      b0 = .99765 * b0 + white * .099046;
      b1 = .963 * b1 + white * .2965164;
      b2 = .57 * b2 + white * 1.0526913;
      const sample = (b0 + b1 + b2 + white * .1848) * .18;
      if (i < length) data[i] = sample; else tail[i - length] = sample;
    }
    // The tail follows the last sample naturally, then blends into the start.
    for (let i = 0; i < overlap; i++) {
      const phase = i / (overlap - 1) * Math.PI / 2;
      data[i] = tail[i] * Math.cos(phase) + data[i] * Math.sin(phase);
    }
  }
  return buffer;
}

export function createSoundGraph(ctx) {
  const nodes = [], sources = [];
  const keep = node => { nodes.push(node); return node; };
  const gain = (value, destination) => {
    const node = keep(ctx.createGain()); node.gain.value = value;
    node.connect(destination); return node;
  };
  const filter = (type, frequency, destination, q = .65) => {
    const node = keep(ctx.createBiquadFilter()); node.type = type; node.frequency.value = frequency; node.Q.value = q;
    node.connect(destination); return node;
  };
  const oscillator = (frequency, destination) => {
    const node = keep(ctx.createOscillator()); node.frequency.value = frequency;
    node.connect(destination); node.start(); sources.push(node); return node;
  };
  const master = gain(0, ctx.destination);
  const compressor = keep(ctx.createDynamicsCompressor());
  compressor.threshold.value = -18; compressor.knee.value = 12; compressor.ratio.value = 3;
  compressor.attack.value = .006; compressor.release.value = .24; compressor.connect(master);
  const highpass = filter('highpass', 28, compressor, .7);
  const bus = filter('lowpass', 6000, highpass);
  const pink = createNoiseBuffer(ctx);
  const noiseLayer = (type, frequency, low, offset, rate = 1) => {
    const level = gain(0, bus);
    const shape = filter(type, frequency, level);
    const cut = filter('highpass', low, shape);
    const source = keep(ctx.createBufferSource()); source.buffer = pink; source.loop = true; source.playbackRate.value = rate;
    source.connect(cut); source.start(0, offset); sources.push(source);
    return { level: level.gain, frequency: shape.frequency };
  };
  const engineLevel = gain(0, bus);
  const engineFilter = filter('lowpass', 420, engineLevel);
  const pulse = gain(1, engineFilter);
  const flutterDepth = gain(.025, pulse.gain);
  oscillator(8.7, flutterDepth);
  const engine = oscillator(820 / 30, pulse);
  // Rounded four-cylinder firing pulses, with harmonics audible on small speakers.
  const harmonics = new Float32Array([0, 1, .52, .3, .18, .12, .08, .055, .035, .02, .01]);
  engine.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(harmonics.length), harmonics));
  const bodyLevel = gain(.018, bus);
  const body = oscillator(820 / 60, bodyLevel);
  const combustion = noiseLayer('bandpass', 550, 150, 1.7);
  const road = noiseLayer('bandpass', 650, 130, 3.1);
  const rough = noiseLayer('bandpass', 1000, 160, 5.6);
  const roughPulse = gain(0, rough.level);
  const roughMod = oscillator(17, roughPulse);
  const wind = noiseLayer('lowpass', 1900, 300, 7.3);
  const bed = noiseLayer('lowpass', 440, 100, 0, .83);
  const air = noiseLayer('bandpass', 2300, 600, 8.9, .91);
  return {
    master: master.gain, engine, engineLevel: engineLevel.gain, engineFilter: engineFilter.frequency,
    body, bodyLevel: bodyLevel.gain, combustion, road, rough, roughPulse: roughPulse.gain, roughMod, wind, bed, air,
    nodeCount: nodes.length, sourceCount: sources.length,
    dispose() { for (const source of sources) source.stop(); for (const node of nodes) node.disconnect(); },
  };
}

import * as THREE from 'three';
import { randomAt } from './route.js';

const WIDTH = 300, HEIGHT = 200, DEPTH = 360, COUNT = 1900;
const wrap = (value, extent) => value - Math.floor(value / extent) * extent - extent / 2;

// Rain in a world-anchored volume, built like the alpine snowfall: one draw
// call of points, wrapped around the car. Each point is masked to a thin
// vertical streak instead of a soft disc, falls ten times faster, and leans a
// little with the wind. Nearer drops draw longer; the distant ones thin out
// into a grey veil.
export class Rainfall {
  constructor() {
    const positions = new Float32Array(COUNT * 3), sizes = [], opacity = [];
    this.seeds = new Float32Array(COUNT * 5);
    for (let i = 0; i < COUNT; i++) {
      this.seeds.set([randomAt(i, 64) * WIDTH, randomAt(i, 65) * HEIGHT, randomAt(i, 66) * DEPTH, 21 + randomAt(i, 67) * 9, randomAt(i, 68) * Math.PI * 2], i * 5);
      sizes.push(.75 + randomAt(i, 69) ** 2 * 1.4);
      opacity.push(.16 + randomAt(i, 70) * .3);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('dropSize', new THREE.Float32BufferAttribute(sizes, 1));
    this.geometry.setAttribute('dropOpacity', new THREE.Float32BufferAttribute(opacity, 1));
    this.material = new THREE.PointsMaterial({ color: '#d5dee6', size: 1, transparent: true,
      opacity: .9, depthWrite: false, sizeAttenuation: false, toneMapped: false });
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float dropSize; attribute float dropOpacity;
        varying float vDropAlpha;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('gl_PointSize = size;', `
        gl_PointSize = size * dropSize * 12.0 * clamp(430.0 / max(80.0, -mvPosition.z), 0.7, 1.5);
        vec3 edge = abs(position) / vec3(${WIDTH / 2}.0, ${HEIGHT / 2}.0, ${DEPTH / 2}.0);
        vDropAlpha = dropOpacity * (1.0 - smoothstep(0.72, 1.0, max(edge.x, max(edge.y, edge.z))));
      `);
      shader.fragmentShader = 'varying float vDropAlpha;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 d = gl_PointCoord - vec2(0.5);
        // A streak: narrow across, fading toward both ends, leaning with the wind.
        float across = abs(d.x + d.y * 0.16);
        if (across > 0.07) discard;
        float along = 1.0 - smoothstep(0.28, 0.5, abs(d.y));
        diffuseColor.a *= (1.0 - smoothstep(0.02, 0.07, across)) * along * vDropAlpha;
      `);
    };
    this.material.customProgramCacheKey = () => 'city-rain-streaks-v1';
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'falling-rain'; this.points.frustumCulled = false;
  }
  update(time, anchor, origin) {
    this.points.position.set(anchor.x, anchor.y, anchor.z + origin);
    const positions = this.geometry.attributes.position;
    const gust = Math.sin(time * .31) * 1.2 + Math.sin(time * .07) * .8;
    for (let i = 0; i < COUNT; i++) {
      const n = i * 5, phase = this.seeds[n + 4];
      positions.setXYZ(i,
        wrap(this.seeds[n] + time * (2.6 + gust) - anchor.x, WIDTH),
        wrap(this.seeds[n + 1] - time * this.seeds[n + 3] - anchor.y, HEIGHT),
        wrap(this.seeds[n + 2] + time * .9 + Math.sin(time * .5 + phase) * .6 - anchor.z, DEPTH));
    }
    positions.needsUpdate = true;
  }
  dispose() { this.points.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

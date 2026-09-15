import * as THREE from 'three';
import { randomAt } from './route.js';

const WIDTH = 300, HEIGHT = 200, DEPTH = 360, COUNT = 1350;
// Floor also wraps negative world coordinates, without two floating-point remainders per axis.
const wrap = (value, extent) => value - Math.floor(value / extent) * extent - extent / 2;

// Soft circular flakes in a world-anchored volume. A single draw call supplies
// fine distant snow and a few larger foreground flakes without image assets.
export class Snowfall {
  constructor() {
    const positions = new Float32Array(COUNT * 3), sizes = [], opacity = [];
    this.seeds = new Float32Array(COUNT * 6);
    for (let i = 0; i < COUNT; i++) {
      this.seeds.set([randomAt(i, 54) * WIDTH, randomAt(i, 55) * HEIGHT,
        randomAt(i, 56) * DEPTH, 2.4 + randomAt(i, 57) * 3.4,
        randomAt(i, 58) * Math.PI * 2, .7 + randomAt(i, 59) * 1.1], i * 6);
      sizes.push(.95 + randomAt(i, 60) ** 2.4 * 3.2);
      opacity.push(.36 + randomAt(i, 61) * .52);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('flakeSize', new THREE.Float32BufferAttribute(sizes, 1));
    this.geometry.setAttribute('flakeOpacity', new THREE.Float32BufferAttribute(opacity, 1));
    this.material = new THREE.PointsMaterial({ color: '#e1edf9', size: 1, transparent: true,
      opacity: .85, depthWrite: false, sizeAttenuation: false, toneMapped: false });
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float flakeSize; attribute float flakeOpacity;
        varying float vFlakeAlpha;\n` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('gl_PointSize = size;', `
        // Orthographic projection keeps world scale fixed; depth still makes
        // nearby snow feel larger and more distinct than the distant flurry.
        gl_PointSize = size * flakeSize * clamp(430.0 / max(80.0, -mvPosition.z), 0.65, 1.65);
        vec3 edge = abs(position) / vec3(${WIDTH / 2}.0, ${HEIGHT / 2}.0, ${DEPTH / 2}.0);
        vFlakeAlpha = flakeOpacity * (1.0 - smoothstep(0.78, 1.0, max(edge.x, max(edge.y, edge.z))));
      `);
      shader.fragmentShader = 'varying float vFlakeAlpha;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float radius = length(gl_PointCoord - vec2(0.5));
        if (radius > 0.5) discard;
        diffuseColor.a *= (1.0 - smoothstep(0.1, 0.5, radius)) * vFlakeAlpha;
      `);
    };
    this.material.customProgramCacheKey = () => 'soft-alpine-snow-v1';
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'falling-snow'; this.points.frustumCulled = false;
  }
  update(time, anchor, origin) {
    this.points.position.set(anchor.x, anchor.y, anchor.z + origin);
    const positions = this.geometry.attributes.position;
    for (let i = 0; i < COUNT; i++) {
      const n = i * 6, phase = this.seeds[n + 4], sway = this.seeds[n + 5];
      positions.setXYZ(i,
        wrap(this.seeds[n] + time * .8 + Math.sin(time * .55 + phase) * sway * 2.1 - anchor.x, WIDTH),
        wrap(this.seeds[n + 1] - time * this.seeds[n + 3] - anchor.y, HEIGHT),
        wrap(this.seeds[n + 2] + time * .28 + Math.cos(time * .37 + phase) * sway - anchor.z, DEPTH));
    }
    positions.needsUpdate = true;
  }
  dispose() { this.points.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

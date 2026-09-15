import * as THREE from 'three';
import { registerChunkResources } from './chunk-resources.js';
import { waterClock } from './water.js';

// Value noise wrapped at 64 units, shared by the river and cascades,
// so patterns never jump when the floating origin rebases.
const noise = /* glsl */`
  float jungleHash(vec2 p) { p = mod(p, 64.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float jungleNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(jungleHash(cell), jungleHash(cell + vec2(1.0, 0.0)), f.x),
      mix(jungleHash(cell + vec2(0.0, 1.0)), jungleHash(cell + vec2(1.0)), f.x), f.y);
  }
`;

// Turquoise water with streaks drifting downstream, bank-edge foam, and white
// churn wherever the mesh marks turbulence. Coordinates are route (s, across).
export function createRiverMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: .05 });
  material.onBeforeCompile = shader => {
    shader.uniforms.jungleTime = waterClock.time;
    shader.vertexShader = 'attribute vec3 riverCoord; varying vec3 vRiver;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRiver = riverCoord;');
    shader.fragmentShader = 'uniform float jungleTime; varying vec3 vRiver;\n' + noise + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float flow = vRiver.x * 0.16 - jungleTime * 0.9;
      float lane = vRiver.y * 2.4;
      float streak = jungleNoise(vec2(flow, lane)) * 0.6 + jungleNoise(vec2(flow * 2.1 + 7.3, lane * 1.8 + 3.1)) * 0.4;
      float ripple = smoothstep(0.5, 0.8, streak);
      float edge = smoothstep(0.55, 1.0, abs(vRiver.y)) * smoothstep(0.35, 0.8, jungleNoise(vec2(flow * 1.6, lane * 2.7 + 11.0)));
      float churn = vRiver.z * (0.5 + 0.5 * smoothstep(0.3, 0.75, jungleNoise(vec2(vRiver.x * 0.45 - jungleTime * 2.4, lane * 1.9 + 5.0))));
      float white = clamp(ripple * 0.2 + edge * 0.5 + churn, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.99, 0.97), white);
    `);
  };
  material.customProgramCacheKey = () => 'jungle-river-v1';
  return material;
}

// Foam sheets and spray. foamCoord is (flow, across, feather): streaks move
// along the flow coordinate, and feather fades the sheet out at its edges.
export function createFoamMaterial(mist = false) {
  const material = new THREE.MeshBasicMaterial({ color: mist ? '#e4f1ea' : '#f4fcf7', transparent: true, opacity: mist ? .3 : .88,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  material.onBeforeCompile = shader => {
    shader.uniforms.jungleTime = waterClock.time;
    shader.vertexShader = 'attribute vec3 foamCoord; varying vec3 vFoam;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoam = foamCoord;');
    shader.fragmentShader = 'uniform float jungleTime; varying vec3 vFoam;\n' + noise + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', mist ? `
      #include <color_fragment>
      float drift = jungleNoise(vec2(vFoam.x * 0.35 + jungleTime * 0.08, vFoam.y * 1.2 + jungleTime * 0.03));
      diffuseColor.a *= smoothstep(0.35, 0.75, drift) * vFoam.z;
    ` : `
      #include <color_fragment>
      float streak = jungleNoise(vec2(vFoam.x * 3.0 - jungleTime * 1.6, vFoam.y * 4.5)) * 0.6
        + jungleNoise(vec2(vFoam.x * 7.0 - jungleTime * 2.3 + 4.0, vFoam.y * 9.0 + 2.0)) * 0.4;
      diffuseColor.a *= smoothstep(0.28, 0.62, streak) * vFoam.z;
    `);
  };
  material.customProgramCacheKey = () => `jungle-foam-${mist ? 'mist' : 'sheet'}-v1`;
  return material;
}

export const riverMaterial = createRiverMaterial();
export const foamMaterial = createFoamMaterial();
export const mistMaterial = createFoamMaterial(true);
registerChunkResources('jungle-water', { riverMaterial, foamMaterial, mistMaterial });

import * as THREE from 'three';

// One shared clock, no per-frame geometry uploads. The phase is periodic over
// 4096 m, so floating-origin rebases do not make the water jump.
export const waterClock = { time: { value: 0 }, origin: { value: 0 } };
const declarations = /* glsl */`
  uniform float coastTime;
  uniform float coastOrigin;
  varying vec2 vWaterCoord;
  float waterHash(vec2 p) {
    // Wrap lattice coordinates so noise shares the floating-origin period.
    p = mod(p, 64.0);
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float waterNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(waterHash(cell), waterHash(cell + vec2(1.0, 0.0)), f.x),
      mix(waterHash(cell + vec2(0.0, 1.0)), waterHash(cell + vec2(1.0)), f.x), f.y);
  }
  float swell(vec2 p) {
    vec2 q = p * 0.0015339807879;
    return sin(q.x * 83.0 + q.y * 29.0 - coastTime * 1.1)
      + 0.45 * sin(q.x * 47.0 - q.y * 53.0 - coastTime * 0.73);
  }
`;

export function createWaterMaterial(lake = false) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .58, metalness: .08 });
  material.onBeforeCompile = shader => {
    shader.uniforms.coastTime = waterClock.time; shader.uniforms.coastOrigin = waterClock.origin;
    shader.vertexShader = declarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 waterWorld = modelMatrix * vec4(position, 1.0);
      vWaterCoord = vec2(waterWorld.x, waterWorld.z - coastOrigin);
      transformed.y += swell(vWaterCoord) * ${lake ? '0.045' : '0.19'};
    `);
    shader.fragmentShader = declarations + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 q = vWaterCoord * 0.0015339807879;
      vec2 drift = vWaterCoord / 64.0 + vec2(-coastTime * 0.013, coastTime * 0.007);
      float bend = waterNoise(drift * 2.0);
      float detail = waterNoise(drift * 4.0 + vec2(19.3, 7.1));
      // Distort the crests and break them into uneven patches instead of
      // intersecting regularly spaced sine bands (which read as a grid).
      float phase = q.x * 183.0 + q.y * 41.0 - coastTime * 1.3
        + (bend - 0.5) * 9.0 + (detail - 0.5) * 2.2;
      float wave = sin(phase);
      float crestPatch = waterNoise(drift * 8.0 + vec2(bend * 1.7, 11.6));
      float glint = pow(max(0.0, wave), 18.0) * smoothstep(0.38, 0.73, crestPatch);
      diffuseColor.rgb *= 0.97 + 0.035 * swell(vWaterCoord);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.79, 0.94, 0.91), glint * ${lake ? '0.14' : '0.22'});
    `);
  };
  material.customProgramCacheKey = () => `coast-water-${lake ? 'lake' : 'ocean'}-v2`;
  return material;
}

export function createSurfMaterial(moving = false) {
  const material = new THREE.MeshBasicMaterial({ color: '#eafaf1', transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.coastTime = waterClock.time; shader.uniforms.coastOrigin = waterClock.origin;
    shader.vertexShader = declarations + `
      ${moving ? 'attribute vec3 surfFlow; varying float vSurfFade;' : ''}
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      ${moving ? `
        vec4 baseWorld = modelMatrix * vec4(position, 1.0);
        vec2 baseCoord = vec2(baseWorld.x, baseWorld.z - coastOrigin);
        float localPhase = waterNoise(baseCoord / 64.0 + vec2(5.7, 21.3));
        float progress = fract(coastTime * 0.16 + surfFlow.z + localPhase * 0.55);
        transformed.xz += surfFlow.xy * progress * 10.0;
        vSurfFade = sin(progress * 3.14159265);
      ` : ''}
      vec4 waterWorld = modelMatrix * vec4(transformed, 1.0);
      vWaterCoord = vec2(waterWorld.x, waterWorld.z - coastOrigin);
      transformed.y += swell(vWaterCoord) * 0.19;
    `);
    shader.fragmentShader = declarations + (moving ? 'varying float vSurfFade;\n' : '') + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float foamPatch = waterNoise(vWaterCoord / 8.0 + vec2(-coastTime * 0.06, coastTime * 0.04));
      diffuseColor.a *= ${moving ? 'vSurfFade *' : ''} (0.25 + 0.7 * smoothstep(0.2, 0.8, foamPatch));
    `);
  };
  material.customProgramCacheKey = () => `coast-surf-${moving ? 'rolling' : 'wash'}-v2`;
  return material;
}

export function animateWater(time, origin) {
  waterClock.time.value = time;
  waterClock.origin.value = ((origin % 4096) + 4096) % 4096;
}

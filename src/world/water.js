import * as THREE from 'three';

// One shared clock, no per-frame geometry uploads. The phase is periodic over
// 4096 m, so floating-origin rebases do not make the water jump.
export const waterClock = { time: { value: 0 }, origin: { value: 0 } };
const declarations = /* glsl */`
  uniform float coastTime;
  uniform float coastOrigin;
  varying vec2 vWaterCoord;
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
      float wave = sin(q.x * 183.0 + q.y * 41.0 - coastTime * 1.3 + sin(q.y * 21.0) * 1.4);
      float glint = pow(max(0.0, wave), 32.0) * smoothstep(0.1, 0.8, sin(q.y * 197.0 + q.x * 23.0));
      diffuseColor.rgb *= 0.97 + 0.035 * swell(vWaterCoord);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.79, 0.94, 0.91), glint * ${lake ? '0.14' : '0.22'});
    `);
  };
  material.customProgramCacheKey = () => `coast-water-${lake ? 'lake' : 'ocean'}-v1`;
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
        float progress = fract(coastTime * 0.16 + surfFlow.z);
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
      diffuseColor.a *= ${moving ? 'vSurfFade *' : ''} (0.65 + 0.3 * sin(vWaterCoord.y * 0.0015339807879 * 118.0 + coastTime * 1.7));
    `);
  };
  material.customProgramCacheKey = () => `coast-surf-${moving ? 'rolling' : 'wash'}-v1`;
  return material;
}

export function animateWater(time, origin) {
  waterClock.time.value = time;
  waterClock.origin.value = ((origin % 4096) + 4096) % 4096;
}

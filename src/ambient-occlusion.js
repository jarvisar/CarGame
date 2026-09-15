import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// A small, independent AO buffer keeps the normal scene's antialiasing,
// tone mapping and unlit effects intact. No full-resolution color buffers.
export class AmbientOcclusion {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.enabled = true;
    this.size = new THREE.Vector2();
    this.hidden = [];
    this.normalResolutionScale = 2;
    this.pass = new GTAOPass(scene, camera, 1, 1, undefined,
      { samples: 12, radius: 2.4, thickness: 2, distanceFallOff: 1, scale: 1 },
      { samples: 16, radius: 5, rings: 2, depthPhi: 1, normalPhi: 4, lumaPhi: 1 });
    this.pass.output = GTAOPass.OUTPUT.Off;
    // A fixed sampling orientation avoids crawling screen-space grain. These
    // passes have no temporal accumulation to average randomized pixels away.
    for (const material of [this.pass.gtaoMaterial, this.pass.pdMaterial]) {
      material.fragmentShader = material.fragmentShader.replace(
        'textureLod(tNoise, noiseUv, 0.0)', 'textureLod(tNoise, vec2(0.5), 0.0)');
    }
    // Orthographic rays are parallel; the stock shader assumes perspective.
    this.pass.gtaoMaterial.fragmentShader = this.pass.gtaoMaterial.fragmentShader.replace(
      'vec3 viewDir = normalize(-viewPos.xyz);',
      'vec3 viewDir = PERSPECTIVE_CAMERA == 1 ? normalize(-viewPos.xyz) : vec3(0.0, 0.0, 1.0);');
    // AO and packed normals only need eight bits per channel.
    for (const target of [this.pass.normalRenderTarget, this.pass.gtaoRenderTarget, this.pass.pdRenderTarget]) {
      target.texture.type = THREE.UnsignedByteType;
    }
    this.material = new THREE.ShaderMaterial({
      name: 'Soft ambient occlusion',
      uniforms: {
        tAO: { value: this.pass.gtaoMap },
        tDepth: { value: this.pass.depthTexture },
        tNormal: { value: this.pass.normalTexture },
        aoSize: { value: new THREE.Vector2(1, 1) },
        inverseProjection: { value: new THREE.Matrix4() },
        intensity: { value: .48 },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        fogNear: { value: scene.fog.near },
        fogFar: { value: scene.fog.far },
      },
      defines: { PERSPECTIVE_CAMERA: 0 },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tAO;
        uniform sampler2D tDepth;
        uniform sampler2D tNormal;
        uniform vec2 aoSize;
        uniform mat4 inverseProjection;
        uniform float intensity;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float fogNear;
        uniform float fogFar;
        varying vec2 vUv;
        vec3 viewPosition(vec2 uv, float depth) {
          vec4 position = inverseProjection * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
          return position.xyz / position.w;
        }
        float surfaceAO(float depth) {
          vec3 center = viewPosition(vUv, depth);
          vec3 normal = unpackRGBToNormal(texture2D(tNormal, vUv).rgb);
          vec2 pixel = vUv * aoSize - 0.5;
          vec2 base = floor(pixel), fraction = fract(pixel);
          float shade = 0.0, weightSum = 0.0;
          // Upscale using only samples on this surface. Ordinary bilinear
          // filtering drags dark background pixels over moving silhouettes.
          for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
            vec2 offset = vec2(float(x), float(y));
            vec2 uv = (clamp(base + offset, vec2(0.0), aoSize - 1.0) + 0.5) / aoSize;
            float sampleDepth = texture2D(tDepth, uv).r;
            vec3 sampleNormal = unpackRGBToNormal(texture2D(tNormal, uv).rgb);
            float planeDistance = abs(dot(viewPosition(uv, sampleDepth) - center, normal));
            float sameSurface = (1.0 - smoothstep(0.05, 0.3, planeDistance))
              * smoothstep(0.8, 0.98, dot(normal, sampleNormal)) * (1.0 - step(1.0, sampleDepth));
            vec2 weights = mix(1.0 - fraction, fraction, offset);
            float weight = weights.x * weights.y * sameSurface;
            shade += (texture2D(tAO, uv).r - 1.0) * weight;
            weightSum += weight;
          }
          // Thin features with no matching coarse sample stay unoccluded;
          // fade weak support smoothly instead of popping to a dark neighbor.
          return 1.0 + shade / max(weightSum, 0.2);
        }
        void main() {
          float depth = texture2D(tDepth, vUv).r;
          #if PERSPECTIVE_CAMERA == 1
            float distance = -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
          #else
            float distance = -orthographicDepthToViewZ(depth, cameraNear, cameraFar);
          #endif
          float visibility = 1.0 - smoothstep(fogNear, fogFar, distance);
          float ao = depth >= 1.0 ? 1.0 : surfaceAO(depth);
          // Preserve the sky and fade shading with the scene's existing fog.
          float shade = depth >= 1.0 ? 1.0 : mix(1.0, ao, intensity * visibility);
          gl_FragColor = vec4(vec3(shade), 1.0);
        }
      `,
      blending: THREE.MultiplyBlending, transparent: true, premultipliedAlpha: true,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(camera) {
    const { renderer, scene, pass } = this;
    // Keep renderer.info meaningful across the scene and postprocessing draws.
    const autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    if (autoReset) renderer.info.reset();
    const autoClear = renderer.autoClear;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const matrixWorldAutoUpdate = scene.matrixWorldAutoUpdate;
    const target = renderer.getRenderTarget();
    try {
      renderer.render(scene, camera);
      if (!this.enabled) return;

      renderer.getDrawingBufferSize(this.size);
      const scale = Math.min(.5, 640 / Math.max(this.size.x, this.size.y));
      const width = Math.max(1, Math.round(this.size.x * scale));
      const height = Math.max(1, Math.round(this.size.y * scale));
      pass.camera = camera;
      if (pass.width !== width || pass.height !== height) pass.setSize(width, height);
      // Finer depth/normal coverage reduces contact-edge popping as the camera
      // moves. The costly AO sampling and denoising stay at the smaller size.
      const normalWidth = width * this.normalResolutionScale, normalHeight = height * this.normalResolutionScale;
      if (pass.normalRenderTarget.width !== normalWidth || pass.normalRenderTarget.height !== normalHeight) {
        pass.normalRenderTarget.setSize(normalWidth, normalHeight);
      }
      const perspective = camera.isPerspectiveCamera ? 1 : 0;
      for (const material of [pass.gtaoMaterial, this.material]) {
        if (material.defines.PERSPECTIVE_CAMERA !== perspective) {
          material.defines.PERSPECTIVE_CAMERA = perspective;
          material.needsUpdate = true;
        }
      }
      this.material.uniforms.cameraNear.value = camera.near;
      this.material.uniforms.aoSize.value.set(width, height);
      this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      this.material.uniforms.cameraFar.value = camera.far;
      this.material.uniforms.fogNear.value = scene.fog.near;
      this.material.uniforms.fogFar.value = scene.fog.far;
      // Foam, mist, flakes and other overlays must not become opaque AO casters.
      scene.traverseVisible(object => {
        if (!object.isMesh) return;
        const material = object.material;
        if (Array.isArray(material) ? material.every(item => !item.depthWrite) : !material.depthWrite) {
          this.hidden.push(object);
          object.visible = false;
        }
      });
      renderer.shadowMap.autoUpdate = false;
      // The color pass already updated every transform. AO uses the same pose.
      scene.matrixWorldAutoUpdate = false;
      pass.render(renderer, null, null);
      renderer.setRenderTarget(target);
      renderer.autoClear = false;
      this.quad.render(renderer);
    } finally {
      for (const object of this.hidden) object.visible = true;
      this.hidden.length = 0;
      renderer.setRenderTarget(target);
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      scene.matrixWorldAutoUpdate = matrixWorldAutoUpdate;
      renderer.autoClear = autoClear;
      renderer.info.autoReset = autoReset;
    }
  }

  dispose() {
    this.pass.dispose();
    // These two materials are not disposed by GTAOPass in the current release.
    this.pass.gtaoMaterial.dispose();
    this.pass.blendMaterial.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

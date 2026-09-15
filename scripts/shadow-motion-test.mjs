import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${process.env.TEST_URL || 'http://127.0.0.1:5173'}/?ao=0`);
  await page.waitForFunction(() => window.__coastline);
  await page.evaluate(() => window.__coastline.action('pause'));
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { default: stockShadowShader } = await import('/node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js');
    const { fitSunShadow } = await import('/src/shadows.js');
    // Use the game's renderer constructor so this exercises its shader setup.
    const renderer = new window.__coastline.rendering.renderer.constructor(); renderer.setSize(960, 600);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('white');
    scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, .5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .65; sun.shadow.bias = -.0003; sun.shadow.radius = 2;
    scene.add(sun, sun.target);
    const material = new THREE.MeshStandardMaterial({ color: 'white' });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), material); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 1.4), material); box.position.y = 1; box.castShadow = true; scene.add(box);
    const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 1200);
    const offset = new THREE.Vector3(-8, 12, 10), sunOffset = new THREE.Vector3(-145, 230, 95);
    const points = [];
    for (let x = .8; x < 2.4; x += .04) for (let z = -1.8; z < .9; z += .04) points.push(new THREE.Vector3(x, 0, z));
    const measure = baseline => {
      const receiver = material.clone();
      if (baseline) receiver.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', stockShadowShader);
      };
      receiver.customProgramCacheKey = () => baseline ? 'stock-shadow-motion' : 'stable-shadow-motion';
      ground.material = receiver;
      const frames = [], gl = renderer.getContext();
      for (let frame = 0; frame < 32; frame++) {
        const target = new THREE.Vector3(frame * .017, 0, frame * -.011);
        camera.position.copy(target).add(offset); camera.lookAt(target);
        sun.position.copy(target).add(sunOffset); sun.target.position.copy(target);
        fitSunShadow(camera, sun); renderer.render(scene, camera);
        const pixels = new Uint8Array(960 * 600 * 4); gl.readPixels(0, 0, 960, 600, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        frames.push(points.map(point => {
          const p = point.clone().project(camera), x = (p.x * .5 + .5) * 960 - .5, y = (p.y * .5 + .5) * 600 - .5;
          const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
          const sample = (dx, dy) => pixels[((iy + dy) * 960 + ix + dx) * 4] / 255;
          return (1 - fy) * ((1 - fx) * sample(0, 0) + fx * sample(1, 0)) + fy * ((1 - fx) * sample(0, 1) + fx * sample(1, 1));
        }));
      }
      let change = 0;
      for (let f = 1; f < frames.length; f++) for (let p = 0; p < points.length; p++) change += Math.abs(frames[f][p] - frames[f - 1][p]);
      receiver.dispose();
      return change / ((frames.length - 1) * points.length);
    };
    const baseline = measure(true), revised = measure(false);
    scene.traverse(object => object.geometry?.dispose()); material.dispose(); renderer.dispose();
    return { baseline, revised, reduction: 1 - revised / baseline };
  });
  console.log(JSON.stringify(result, null, 2));
  await mkdir('.artifacts/shadows', { recursive: true });
  await writeFile('.artifacts/shadows/motion.json', JSON.stringify(result, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(result.reduction > .3, 'sunlight shadow edges should fluctuate at least 30% less while panning with AO disabled');
} finally { await browser.close(); }

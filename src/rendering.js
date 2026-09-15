import * as THREE from 'three';
import { fitSunShadow } from './shadows.js';

export function createRendering(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .94;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#b8dfe0'); scene.fog = new THREE.Fog('#c2e2db', 460, 860);
  const sky = new THREE.HemisphereLight('#e4f2f5', '#617149', 1.45); scene.add(sky);
  const sun = new THREE.DirectionalLight('#fff1db', 2.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 650; sun.shadow.normalBias = .65; sun.shadow.bias = -.0003; sun.shadow.radius = 2;
  scene.add(sun); scene.add(sun.target);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200);
  const follow = new THREE.Vector3(); const target = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3(-220, 245, 260);
  const sunOffset = new THREE.Vector3(-110, 240, 100);
  const views = [{ height: 235, label: 'Scenic view' }, { height: 165, label: 'Medium view' }, { height: 115, label: 'Close view' }];
  let initialized = false; let view = 1; let viewHeight = views[view].height; let previousOrigin = 0;
  let snowy = false;
  const lookAhead = new THREE.Vector3(-24, 0, -46);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    const width = window.innerWidth, height = window.innerHeight;
    const aspect = width / height;
    const size = viewHeight * (aspect < 1 ? 1.12 : 1);
    camera.left = -size * aspect / 2; camera.right = size * aspect / 2; camera.top = size / 2; camera.bottom = -size / 2; camera.updateProjectionMatrix();
    if (initialized) fitSunShadow(camera, sun);
  }
  function update(car, dt, origin) {
    const originShift = origin - previousOrigin; follow.z += originShift; previousOrigin = origin;
    if (!initialized) { follow.copy(car.position); initialized = true; }
    follow.lerp(car.position, 1 - Math.exp(-dt * (reducedMotion ? 8 : 3)));
    const nextHeight = THREE.MathUtils.damp(viewHeight, views[view].height, 4, dt);
    if (Math.abs(nextHeight - viewHeight) > .01) { viewHeight = nextHeight; resize(); }
    // Shorten the look-ahead in close view so the car stays onscreen in portrait layouts.
    const framing = Math.min(1, viewHeight / 165);
    target.copy(follow).addScaledVector(lookAhead, framing);
    if (snowy) { target.y -= 14 * framing; target.z += 18 * framing; }
    if (window.innerWidth < window.innerHeight) target.x += 16 * framing;
    // Fixed ocean-side azimuth and ~36° elevation preserve the reference's miniature view.
    camera.position.copy(target).add(cameraOffset); camera.lookAt(target);
    sun.position.copy(target).add(sunOffset); sun.target.position.copy(target);
    fitSunShadow(camera, sun);
  }
  // Zoom only changes the projection; resizing the canvas every zoom frame reallocates its buffers.
  window.addEventListener('resize', () => { renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); renderer.setSize(window.innerWidth, window.innerHeight); resize(); }); resize();
  function setJourney(id) {
    snowy = id === 'snow';
    if (id === 'snow') {
      scene.background.set('#111f2b'); scene.fog.color.set('#243949'); scene.fog.near = 340; scene.fog.far = 760;
      sky.color.set('#91afca'); sky.groundColor.set('#2b3b4c'); sky.intensity = .72;
      sun.color.set('#bbd1ea'); sun.intensity = 1.16; sunOffset.set(-170, 190, -80);
      renderer.toneMappingExposure = .91;
      return;
    }
    const desert = id === 'desert';
    scene.fog.near = 460; scene.fog.far = 860;
    scene.background.set(desert ? '#dfb399' : '#b8dfe0'); scene.fog.color.set(desert ? '#dab49b' : '#c2e2db');
    sky.color.set(desert ? '#e5d8d0' : '#e4f2f5'); sky.groundColor.set(desert ? '#79635a' : '#617149');
    sky.intensity = desert ? 1.27 : 1.45;
    sun.color.set(desert ? '#ffe0bc' : '#fff1db'); sun.intensity = desert ? 2.45 : 2.5;
    sunOffset.set(...(desert ? [-170, 150, 120] : [-110, 240, 100]));
    renderer.toneMappingExposure = desert ? .92 : .94;
  }
  return { renderer, scene, camera, update, resize, setJourney, get viewLabel() { return views[view].label; }, toggleView() { view = (view + 1) % views.length; return views[view].label; }, snap() { initialized = false; } };
}

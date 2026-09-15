import * as THREE from 'three';
import { fitSunShadow, stabilizeShadowFiltering } from './shadows.js';
import { PixelDensity } from './pixel-density.js';
import { ThirdPersonCamera } from './third-person-camera.js';
import { AmbientOcclusion } from './ambient-occlusion.js';

export function createRendering(canvas) {
  stabilizeShadowFiltering();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const density = new PixelDensity();
  let canvasWidth, canvasHeight, pixelRatio;
  function resizeCanvas() {
    const width = window.innerWidth, height = window.innerHeight, ratio = Math.min(window.devicePixelRatio, density.cap);
    if (width === canvasWidth && height === canvasHeight && ratio === pixelRatio) return;
    // Update size and density together: setPixelRatio followed by setSize allocates twice.
    renderer.setDrawingBufferSize(width, height, ratio);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvasWidth = width; canvasHeight = height; pixelRatio = ratio;
  }
  resizeCanvas();
  function recordFrame(timestamp, active) {
    if (density.update(timestamp, active, pixelRatio)) resizeCanvas();
  }
  document.addEventListener('visibilitychange', () => density.reset());
  window.addEventListener('blur', () => density.reset());
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
  const thirdPerson = new ThirdPersonCamera();
  const ambientOcclusion = new AmbientOcclusion(renderer, scene, camera);
  ambientOcclusion.enabled = new URLSearchParams(window.location.search).get('ao') !== '0';
  const follow = new THREE.Vector3(); const target = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3(-220, 245, 260);
  const cameraRight = new THREE.Vector3(cameraOffset.z, 0, -cameraOffset.x).normalize();
  const framingOffset = new THREE.Vector3();
  const touchScreen = window.matchMedia('(any-pointer: coarse)');
  const sunOffset = new THREE.Vector3(-110, 240, 100);
  const views = [{ height: 235, label: 'Scenic view' }, { height: 165, label: 'Medium view' }, { height: 115, label: 'Close view' }, { height: 75, label: 'Extra close view' }, { height: 115, label: 'Third-person view', thirdPerson: true }];
  const activeCamera = () => views[view].thirdPerson ? thirdPerson.camera : camera;
  let initialized = false; let view = touchScreen.matches ? 2 : 1; let viewHeight = views[view].height; let previousOrigin = 0;
  let snowy = false;
  let journey = 'coast';
  const fogProfiles = {
    coast: { color: '#b9def3', near: 600, far: 1150, thirdNear: 170, thirdFar: 300 },
    desert: { color: '#dab49b', near: 460, far: 860, thirdNear: 210, thirdFar: 350 },
    snow: { color: '#243949', near: 340, far: 760, thirdNear: 190, thirdFar: 330 },
    jungle: { color: '#9ab89a', near: 320, far: 780, thirdNear: 110, thirdFar: 250 },
  };
  function updateFog() {
    const profile = fogProfiles[journey];
    // Keep the miniature views' atmosphere; fade only distant third-person scenery.
    // Matching the sky exactly lets fully faded terrain disappear without a seam.
    if (views[view].thirdPerson) {
      scene.fog.color.copy(scene.background);
      scene.fog.near = profile.thirdNear; scene.fog.far = profile.thirdFar;
    } else {
      scene.fog.color.set(profile.color);
      scene.fog.near = profile.near; scene.fog.far = profile.far;
    }
  }
  const lookAhead = new THREE.Vector3(-24, 0, -46);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    const width = window.innerWidth, height = window.innerHeight;
    const aspect = width / height;
    const size = viewHeight * (aspect < 1 ? 1.12 : 1);
    camera.left = -size * aspect / 2; camera.right = size * aspect / 2; camera.top = size / 2; camera.bottom = -size / 2; camera.updateProjectionMatrix();
    thirdPerson.resize(aspect);
    if (initialized) fitSunShadow(activeCamera(), sun, journey === 'jungle' ? sun.target.position.y : 0, previousOrigin);
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
    if (touchScreen.matches || window.innerWidth < window.innerHeight) {
      // Ease the desktop framing slightly toward center without changing vertical look-ahead.
      const lateralOffset = framingOffset.copy(target).sub(follow).dot(cameraRight);
      target.addScaledVector(cameraRight, -lateralOffset * .30);
    }
    // Fixed ocean-side azimuth and ~36° elevation preserve the reference's miniature view.
    camera.position.copy(target).add(cameraOffset); camera.lookAt(target);
    if (views[view].thirdPerson) { thirdPerson.update(car, dt); target.copy(car.position); }
    sun.position.copy(target).add(sunOffset); sun.target.position.copy(target);
    fitSunShadow(activeCamera(), sun, journey === 'jungle' ? sun.target.position.y : 0, origin);
  }
  // Zoom only changes the projection; resizing the canvas every zoom frame reallocates its buffers.
  window.addEventListener('resize', () => { density.reset(); resizeCanvas(); resize(); }); resize();
  function setJourney(id) {
    journey = fogProfiles[id] ? id : 'coast';
    snowy = id === 'snow';
    if (id === 'snow') {
      scene.background.set('#111f2b'); updateFog();
      sky.color.set('#91afca'); sky.groundColor.set('#2b3b4c'); sky.intensity = .72;
      sun.color.set('#bbd1ea'); sun.intensity = 1.16; sunOffset.set(-170, 190, -80);
      renderer.toneMappingExposure = .91;
      return;
    }
    if (id === 'jungle') {
      // Light filtered through a canopy: a weak, green-tinted sun almost
      // overhead, so the emergent crowns shade the road, and a strong green bounce.
      scene.background.set('#a9c4a2'); updateFog();
      sky.color.set('#c4dcb0'); sky.groundColor.set('#2f4d28'); sky.intensity = 1.75;
      sun.color.set('#eef2c4'); sun.intensity = 1.35; sunOffset.set(-55, 245, 40);
      renderer.toneMappingExposure = .9;
      return;
    }
    const desert = id === 'desert';
    // Clear coastal daylight: blue sky fill and a near-neutral sun keep the
    // ocean cyan and separate warm rock faces from cool, deeper shadows.
    scene.background.set(desert ? '#dfb399' : '#b5dff5'); updateFog();
    sky.color.set(desert ? '#e5d8d0' : '#c4e5ff'); sky.groundColor.set(desert ? '#79635a' : '#365544');
    sky.intensity = desert ? 1.27 : 1.12;
    sun.color.set(desert ? '#ffe0bc' : '#fff4df'); sun.intensity = desert ? 2.45 : 2.85;
    sunOffset.set(...(desert ? [-170, 150, 120] : [-145, 230, 95]));
    renderer.toneMappingExposure = desert ? .92 : 1.02;
  }
  setJourney('coast');
  return { renderer, scene, ambientOcclusion, render() { ambientOcclusion.render(activeCamera()); }, toggleAO() { ambientOcclusion.enabled = !ambientOcclusion.enabled; density.reset(); return ambientOcclusion.enabled; }, get camera() { return activeCamera(); }, update, resize, recordFrame, setJourney, get viewLabel() { return views[view].label; }, toggleView() { view = (view + 1) % views.length; updateFog(); thirdPerson.snap(); return views[view].label; }, snap() { initialized = false; thirdPerson.snap(); } };
}

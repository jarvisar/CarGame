import * as THREE from 'three';
import { fitSunShadow } from './shadows.js';
import { PixelDensity } from './pixel-density.js';
import { ThirdPersonCamera } from './third-person-camera.js';

export function createRendering(canvas) {
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
  const follow = new THREE.Vector3(); const target = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3(-220, 245, 260);
  const cameraRight = new THREE.Vector3(cameraOffset.z, 0, -cameraOffset.x).normalize();
  const framingOffset = new THREE.Vector3();
  const sunOffset = new THREE.Vector3(-110, 240, 100);
  const views = [{ height: 235, label: 'Scenic view' }, { height: 165, label: 'Medium view' }, { height: 115, label: 'Close view' }, { height: 115, label: 'Third-person view' }];
  const activeCamera = () => view === 3 ? thirdPerson.camera : camera;
  let initialized = false; let view = 1; let viewHeight = views[view].height; let previousOrigin = 0;
  let snowy = false;
  const lookAhead = new THREE.Vector3(-24, 0, -46);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    const width = window.innerWidth, height = window.innerHeight;
    const aspect = width / height;
    const size = viewHeight * (aspect < 1 ? 1.12 : 1);
    camera.left = -size * aspect / 2; camera.right = size * aspect / 2; camera.top = size / 2; camera.bottom = -size / 2; camera.updateProjectionMatrix();
    thirdPerson.resize(aspect);
    if (initialized) fitSunShadow(activeCamera(), sun);
  }
  function update(car, dt, origin, touchActive = false) {
    const originShift = origin - previousOrigin; follow.z += originShift; previousOrigin = origin;
    if (!initialized) { follow.copy(car.position); initialized = true; }
    follow.lerp(car.position, 1 - Math.exp(-dt * (reducedMotion ? 8 : 3)));
    const nextHeight = THREE.MathUtils.damp(viewHeight, views[view].height, 4, dt);
    if (Math.abs(nextHeight - viewHeight) > .01) { viewHeight = nextHeight; resize(); }
    // Shorten the look-ahead in close view so the car stays onscreen in portrait layouts.
    const framing = Math.min(1, viewHeight / 165);
    target.copy(follow).addScaledVector(lookAhead, framing);
    if (snowy) { target.y -= 14 * framing; target.z += 18 * framing; }
    if (window.innerWidth < window.innerHeight) {
      // Keep the car just right of center at every portrait zoom, preserving vertical look-ahead.
      const lateralOffset = framingOffset.copy(target).sub(follow).dot(cameraRight);
      const portraitOffset = -.08 * (camera.right - camera.left);
      target.addScaledVector(cameraRight, portraitOffset - lateralOffset);
    }
    // Fixed ocean-side azimuth and ~36° elevation preserve the reference's miniature view.
    camera.position.copy(target).add(cameraOffset); camera.lookAt(target);
    if (view === 3) { thirdPerson.update(car, dt, touchActive); target.copy(car.position); }
    sun.position.copy(target).add(sunOffset); sun.target.position.copy(target);
    fitSunShadow(activeCamera(), sun);
  }
  // Zoom only changes the projection; resizing the canvas every zoom frame reallocates its buffers.
  window.addEventListener('resize', () => { density.reset(); resizeCanvas(); resize(); }); resize();
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
    scene.fog.near = desert ? 460 : 540; scene.fog.far = desert ? 860 : 1050;
    scene.background.set(desert ? '#dfb399' : '#b4dbe7'); scene.fog.color.set(desert ? '#dab49b' : '#bbd9de');
    sky.color.set(desert ? '#e5d8d0' : '#d3eaf6'); sky.groundColor.set(desert ? '#79635a' : '#405e52');
    sky.intensity = desert ? 1.27 : 1.12;
    sun.color.set(desert ? '#ffe0bc' : '#fff0d5'); sun.intensity = desert ? 2.45 : 2.7;
    sunOffset.set(...(desert ? [-170, 150, 120] : [-145, 230, 95]));
    renderer.toneMappingExposure = desert ? .92 : .97;
  }
  setJourney('coast');
  return { renderer, scene, get camera() { return activeCamera(); }, update, resize, recordFrame, setJourney, get viewLabel() { return views[view].label; }, toggleView() { view = (view + 1) % views.length; thirdPerson.snap(); return views[view].label; }, snap() { initialized = false; thirdPerson.snap(); } };
}

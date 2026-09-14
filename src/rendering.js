import * as THREE from 'three';

export function createRendering(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .94;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#b8dfe0'); scene.fog = new THREE.Fog('#c2e2db', 460, 860);
  scene.add(new THREE.HemisphereLight('#e4f2f5', '#617149', 1.45));
  const sun = new THREE.DirectionalLight('#fff1db', 2.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -160; sun.shadow.camera.right = 160; sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 650; sun.shadow.normalBias = .65; sun.shadow.bias = -.0003; sun.shadow.radius = 2;
  scene.add(sun); scene.add(sun.target);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1200);
  const follow = new THREE.Vector3(); const target = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3(-220, 245, 260);
  let initialized = false; let view = 0; let viewHeight = 235; let previousOrigin = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    const width = window.innerWidth, height = window.innerHeight;
    renderer.setSize(width, height);
    const aspect = width / height;
    const size = viewHeight * (aspect < 1 ? 1.12 : 1);
    camera.left = -size * aspect / 2; camera.right = size * aspect / 2; camera.top = size / 2; camera.bottom = -size / 2; camera.updateProjectionMatrix();
  }
  function update(car, dt, origin) {
    const originShift = origin - previousOrigin; follow.z += originShift; previousOrigin = origin;
    // Fixed ocean-side azimuth and ~36° elevation preserve the reference's miniature view.
    target.copy(car.position).add(new THREE.Vector3(-24, 0, -46));
    if (window.innerWidth < window.innerHeight) target.x += 16;
    if (!initialized) { follow.copy(target); initialized = true; }
    follow.lerp(target, 1 - Math.exp(-dt * (reducedMotion ? 8 : 3)));
    camera.position.copy(follow).add(cameraOffset); camera.lookAt(follow);
    const nextHeight = THREE.MathUtils.damp(viewHeight, view === 0 ? 235 : 165, 4, dt);
    if (Math.abs(nextHeight - viewHeight) > .01) { viewHeight = nextHeight; resize(); }
    sun.position.copy(follow).add(new THREE.Vector3(-110, 240, 100)); sun.target.position.copy(follow);
  }
  window.addEventListener('resize', resize); resize();
  return { renderer, scene, camera, update, resize, toggleView() { view = 1 - view; return view === 0 ? 'The scenic view' : 'A little closer'; }, snap() { initialized = false; } };
}

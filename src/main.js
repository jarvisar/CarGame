import './style.css';
import { createRendering } from './rendering.js';
import { CoastalWorld } from './world/environment.js';
import { DrivingController } from './vehicle.js';
import { Input } from './input.js';
import { DriveAudio } from './audio.js';

const $ = selector => document.querySelector(selector);
let paused = false, started = false, time = 0, lastTime = 0, accumulator = 0, hudTime = 0;
let toastTimer; let sceneReady = false;
const toast = message => { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2200); };

async function boot() {
  try {
    const rendering = createRendering($('#scene'));
    const { renderer, scene, camera } = rendering;
    const world = new CoastalWorld(scene); const vehicle = new DrivingController(); const audio = new DriveAudio();
    scene.add(vehicle.car); world.update(vehicle.s);
    function start() { if (paused) return; if (!started) { started = true; $('#welcome').classList.add('hidden'); } }
    function setPaused(value) {
      paused = value; input.clear(); accumulator = 0;
      $('#pause-overlay').hidden = !paused; $('#pause').setAttribute('aria-pressed', String(paused)); $('#pause').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
      if (paused) $('#resume').focus(); else $('#pause').blur();
    }
    async function action(name) {
      if (name === 'drive') start();
      if (name === 'pause') setPaused(!paused);
      if (name === 'reset') { vehicle.reset(); rendering.snap(); toast('Back on the open road'); }
      if (name === 'view') toast(rendering.toggleView());
      if (name === 'sound') {
        try {
          const enabled = await audio.toggle(); $('#sound').setAttribute('aria-pressed', String(enabled));
          $('#sound').setAttribute('aria-label', enabled ? 'Turn sound off' : 'Turn sound on'); $('#sound').title = `${enabled ? 'Turn sound off' : 'Turn sound on'} (M)`;
          toast(enabled ? 'A little ocean, a little engine' : 'Enjoy the quiet');
        } catch { toast('Sound is unavailable in this browser'); }
      }
    }
    const input = new Input(action);
    for (const name of ['pause', 'reset', 'view', 'sound']) $(`#${name}`).addEventListener('click', () => action(name));
    $('#start').addEventListener('click', () => { start(); toast(window.matchMedia('(pointer: coarse)').matches ? 'Hold ↑ to wander down the coast' : 'W / ↑ to accelerate · S / ↓ to brake'); });
    $('#resume').addEventListener('click', () => setPaused(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (started) setPaused(true); input.clear(); audio.update(0, time, true); } lastTime = 0; accumulator = 0; });
    window.addEventListener('blur', () => { if (started) setPaused(true); });
    $('#scene').addEventListener('webglcontextlost', event => { event.preventDefault(); setPaused(true); toast('Graphics paused. Reload to restore the coast.'); });
    function updateHud() {
      const kmh = Math.round(Math.abs(vehicle.speed) * 3.6);
      $('#speed').textContent = String(kmh).padStart(2, '0'); $('#speed-fill').style.width = `${kmh / 101 * 100}%`;
      $('#distance').textContent = (vehicle.distance / 1000).toFixed(1);
      $('#gear').textContent = vehicle.speed < -.3 ? 'TAKING A STEP BACK' : Math.abs(vehicle.u) > 5.5 ? 'A LITTLE OFF THE PATH' : kmh > 2 ? 'NO HURRY AT ALL' : 'READY WHEN YOU ARE';
    }
    function frame(timestamp) {
      const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, .1) : 1 / 60; lastTime = timestamp;
      if (!paused) {
        time += dt; accumulator += dt;
        const controls = started ? input.state : {};
        // Fixed simulation steps keep acceleration and handling consistent across frame rates.
        while (accumulator >= 1 / 60) { vehicle.update(1 / 60, controls); accumulator -= 1 / 60; }
        world.update(vehicle.s); vehicle.car.position.z = vehicle.groundedPosition.z + world.origin;
        rendering.update(vehicle.car, dt, world.origin); world.animate(time);
      }
      audio.update(vehicle.speed, time, paused);
      hudTime += dt; if (hudTime > .1) { updateHud(); hudTime = 0; }
      renderer.render(scene, camera);
      if (!sceneReady) { sceneReady = true; $('#loading').classList.add('loaded'); }
      requestAnimationFrame(frame);
    }
    rendering.update(vehicle.car, 1, world.origin); updateHud();
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    requestAnimationFrame(frame);
    // Development-only inspection surface for automated driving and streaming checks.
    if (import.meta.env.DEV) window.__coastline = { vehicle, world, rendering, input, action, get paused() { return paused; }, get started() { return started; } };
  } catch (error) { console.error('Could not start Coastline:', error); $('#loading').classList.add('loaded'); $('#error').hidden = false; }
}
boot();

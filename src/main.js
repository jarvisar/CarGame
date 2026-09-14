import './style.css';
import './journey.css';
import { createRendering } from './rendering.js';
import { JOURNEYS } from './journeys.js';
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
    let journey = 'coast';
    let world = new JOURNEYS.coast.World(scene);
    let changingJourney = false, journeyWasPaused = false;
    const savedJourneys = {};
    const vehicle = new DrivingController(); const audio = new DriveAudio();
    const journeyDialog = $('#journey-dialog');
    scene.add(vehicle.car); world.update(vehicle.s);
    function start() { if (paused) return; if (!started) { started = true; $('#welcome').classList.add('hidden'); } }
    function setPaused(value) {
      paused = value; input.clear(); accumulator = 0;
      $('#pause-overlay').hidden = !paused; $('#pause').setAttribute('aria-pressed', String(paused)); $('#pause').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
      if (paused) $('#resume').focus(); else $('#pause').blur();
    }
    function updateJourneyUi() {
      const data = JOURNEYS[journey];
      document.body.dataset.journey = journey;
      $('.location-title').textContent = data.label;
      $('.location svg text').textContent = data.routeNumber;
      $('#weather-copy').textContent = data.weather; $('#temperature').textContent = data.temperature;
      $('#welcome p').textContent = data.introduction; $('#pause-overlay p').textContent = data.breather;
      $('#scene').setAttribute('aria-label', data.canvas);
      document.querySelector('meta[name="theme-color"]').content = journey === 'desert' ? '#efc692' : '#c2e7e8';
      document.querySelectorAll('button[data-journey]').forEach(button => button.setAttribute('aria-current', String(button.dataset.journey === journey)));
    }
    function openJourneys() {
      if (changingJourney || journeyDialog.open) return;
      journeyWasPaused = paused; setPaused(true); $('#pause-overlay').hidden = true;
      journeyDialog.showModal();
    }
    async function changeJourney(id) {
      if (changingJourney || !JOURNEYS[id]) return;
      if (id === journey) { journeyDialog.close(); return; }
      if (!journeyDialog.open) journeyWasPaused = paused;
      changingJourney = true; paused = true; input.clear(); accumulator = 0;
      $('#journey-transition').classList.add('active'); journeyDialog.close();
      $('#pause-overlay').hidden = true;
      savedJourneys[journey] = { s: vehicle.s, distance: vehicle.distance };
      let nextWorld;
      try {
        await new Promise(resolve => setTimeout(resolve, 320));
        nextWorld = new JOURNEYS[id].World(scene);
        nextWorld.update(savedJourneys[id]?.s ?? 24);
        if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
        else renderer.compile(scene, camera);
        world.dispose(); world = nextWorld; journey = id;
        vehicle.setRoute(JOURNEYS[id].route, savedJourneys[id]);
        rendering.setJourney(id); audio.setJourney(id); updateJourneyUi();
        vehicle.car.position.z = vehicle.groundedPosition.z + world.origin;
        rendering.snap(); rendering.update(vehicle.car, 1, world.origin); world.animate(time);
        updateHud(); renderer.render(scene, camera);
        toast(`Welcome to ${JOURNEYS[id].title}`);
      } catch (error) {
        if (nextWorld && nextWorld !== world) nextWorld.dispose();
        console.error('Could not change journey:', error); toast('That road is unavailable. Try again.');
      } finally {
        input.clear(); accumulator = 0; lastTime = 0; changingJourney = false;
        setPaused(journeyWasPaused || document.hidden);
        $('#journey-transition').classList.remove('active');
      }
    }
    async function action(name) {
      if (changingJourney) return;
      if (name === 'journey') { openJourneys(); return; }
      if (name === 'drive') start();
      if (name === 'pause') setPaused(!paused);
      if (name === 'reset') { vehicle.reset(); rendering.snap(); toast('Back on the open road'); }
      if (name === 'view') toast(rendering.toggleView());
      if (name === 'sound') {
        try {
          const enabled = await audio.toggle(); $('#sound').setAttribute('aria-pressed', String(enabled));
          $('#sound').setAttribute('aria-label', enabled ? 'Turn sound off' : 'Turn sound on'); $('#sound').title = `${enabled ? 'Turn sound off' : 'Turn sound on'} (M)`;
          toast(enabled ? JOURNEYS[journey].sound : 'Enjoy the quiet');
        } catch { toast('Sound is unavailable in this browser'); }
      }
    }
    const input = new Input(action);
    $('#change-journey').addEventListener('click', openJourneys);
    $('#close-journeys').addEventListener('click', () => journeyDialog.close());
    journeyDialog.addEventListener('close', () => { if (!changingJourney) setPaused(journeyWasPaused || document.hidden); });
    journeyDialog.addEventListener('click', event => {
      if (event.target !== journeyDialog) return;
      const rect = journeyDialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) journeyDialog.close();
    });
    document.querySelectorAll('button[data-journey]').forEach(button => button.addEventListener('click', () => changeJourney(button.dataset.journey)));
    for (const name of ['pause', 'reset', 'view', 'sound']) $(`#${name}`).addEventListener('click', () => action(name));
    $('#start').addEventListener('click', () => { start(); toast(window.matchMedia('(pointer: coarse)').matches ? 'Hold ↑ to wander down the road' : 'W / ↑ to accelerate · S / ↓ to brake'); });
    $('#resume').addEventListener('click', () => setPaused(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (journeyDialog.open || changingJourney) journeyWasPaused = true; if (started) setPaused(true); input.clear(); audio.update(0, time, true); } lastTime = 0; accumulator = 0; });
    window.addEventListener('blur', () => { if (journeyDialog.open || changingJourney) journeyWasPaused = true; if (started) setPaused(true); });
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
    rendering.update(vehicle.car, 1, world.origin); updateHud(); updateJourneyUi();
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    requestAnimationFrame(frame);
    // Development-only inspection surface for automated driving and streaming checks.
    if (import.meta.env.DEV) window.__coastline = { vehicle, get world() { return world; }, rendering, input, action, changeJourney, get journey() { return journey; }, get changingJourney() { return changingJourney; }, get paused() { return paused; }, get started() { return started; } };
  } catch (error) { console.error('Could not start Coastline:', error); $('#loading').classList.add('loaded'); $('#error').hidden = false; }
}
boot();

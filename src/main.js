import './style.css';
import './journey.css';
import './ui.css';
import { createRendering } from './rendering.js';
import { JOURNEYS } from './journeys.js';
import { DrivingController } from './vehicle.js';
import { Input } from './input.js';
import { touchDrivingInput } from './touch-stick.js';
import { DriveAudio } from './audio.js';
import { FrameClock } from './timing.js';
import { setupControlHelp, controlHelpDismissed } from './control-help.js';

setupControlHelp();

const $ = selector => document.querySelector(selector);
const mileageFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let paused = false, started = false, time = 0, hudTime = 0;
const frameClock = new FrameClock();
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
      paused = value; input.clear(); frameClock.suspend();
      $('#pause-overlay').hidden = !paused; $('#pause').setAttribute('aria-pressed', String(paused)); $('#pause').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
      if (paused) $('#resume').focus(); else $('#pause').blur();
    }
    function updateJourneyUi() {
      const data = JOURNEYS[journey];
      document.body.dataset.journey = journey;
      $('.location-title').textContent = data.label;
      $('.location svg text').textContent = data.routeNumber;
      $('#weather-copy').textContent = data.weather; $('#temperature').textContent = data.temperature;
      $('#welcome p').textContent = data.introduction; $('#pause-overlay .eyebrow').textContent = data.label;
      $('#scene').setAttribute('aria-label', data.canvas);
      document.querySelector('meta[name="theme-color"]').content = { coast: '#c2e7e8', desert: '#efc692', snow: '#111d30' }[journey];
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
      changingJourney = true; paused = true; input.clear(); frameClock.suspend();
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
        vehicle.setNight(id === 'snow');
        rendering.setJourney(id); audio.setJourney(id); updateJourneyUi();
        vehicle.render(1, world.origin);
        rendering.snap(); rendering.update(vehicle.car, 1, world.origin); world.animate(time, vehicle);
        updateHud(); renderer.render(scene, camera);
        toast(`${JOURNEYS[id].title} selected`);
      } catch (error) {
        if (nextWorld && nextWorld !== world) nextWorld.dispose();
        console.error('Could not change journey:', error); toast('That road is unavailable. Try again.');
      } finally {
        input.clear(); frameClock.reset(); changingJourney = false;
        setPaused(journeyWasPaused || document.hidden);
        $('#journey-transition').classList.remove('active');
      }
    }
    async function action(name) {
      if (changingJourney) return;
      if (name === 'journey') { openJourneys(); return; }
      if (name === 'drive') start();
      if (name === 'pause') setPaused(!paused);
      if (name === 'reset') { vehicle.reset(); frameClock.reset(); vehicle.render(1, world.origin); rendering.snap(); rendering.update(vehicle.car, 0, world.origin); world.animate(time, vehicle); toast('Car reset to the road'); }
      if (name === 'view') { toast(rendering.toggleView()); updateViewUi(); }
      if (name === 'sound') {
        try {
          const enabled = await audio.toggle(); $('#sound').setAttribute('aria-pressed', String(enabled));
          $('#sound').setAttribute('aria-label', enabled ? 'Turn sound off' : 'Turn sound on'); $('#sound').title = `${enabled ? 'Turn sound off' : 'Turn sound on'} (M)`;
          toast(enabled ? JOURNEYS[journey].sound : 'Sound off');
        } catch { toast('Sound is unavailable in this browser'); }
      }
    }
    const input = new Input(action, connected => {
      toast(connected ? controlHelpDismissed() ? 'Controller connected' : 'Controller connected · RT / R2 to drive' : 'Controller disconnected');
      if (!connected && started && !paused) setPaused(true);
    });
    $('#change-journey').addEventListener('click', openJourneys);
    $('#close-journeys').addEventListener('click', () => journeyDialog.close());
    journeyDialog.addEventListener('close', () => { if (!changingJourney) setPaused(journeyWasPaused || document.hidden); });
    journeyDialog.addEventListener('click', event => {
      if (event.target !== journeyDialog) return;
      const rect = journeyDialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) journeyDialog.close();
    });
    document.querySelectorAll('button[data-journey]').forEach(button => button.addEventListener('click', () => changeJourney(button.dataset.journey)));
    for (const name of ['pause', 'reset', 'view', 'sound']) $(`#${name}`).addEventListener('click', event => {
      if (name === 'pause' && event.pointerType === 'touch') return;
      action(name);
    });
    // A secondary finger may not synthesize a click while the stick is held.
    $('#pause').addEventListener('pointerup', event => {
      if (event.pointerType === 'touch') { event.preventDefault(); action('pause'); }
    });
    $('#start').addEventListener('click', () => { start(); if (!controlHelpDismissed()) toast(input.gamepad.connected ? 'Left stick to steer · RT / R2 gas · LT / L2 brake' : window.matchMedia('(any-pointer: coarse)').matches ? 'Drag the stick where you want to go · release to stop' : 'W / ↑ to accelerate · S / ↓ to brake'); });
    $('#resume').addEventListener('click', () => setPaused(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (journeyDialog.open || changingJourney) journeyWasPaused = true; if (started) setPaused(true); input.clear(); audio.update(0, time, true); } frameClock.suspend(); });
    window.addEventListener('blur', () => { if (journeyDialog.open || changingJourney) journeyWasPaused = true; if (started) setPaused(true); });
    $('#scene').addEventListener('webglcontextlost', event => { event.preventDefault(); setPaused(true); toast('Graphics paused. Reload to restart the game.'); });
    function updateHud() {
      // Physics uses meters and seconds; convert only the displayed measurements.
      const mph = Math.round(Math.abs(vehicle.speed) * 3600 / 1609.344);
      $('#speed').textContent = String(mph).padStart(2, '0'); $('#speed-fill').style.width = `${Math.min(Math.abs(vehicle.speed) / 28, 1) * 100}%`;
      $('#distance').textContent = mileageFormat.format(vehicle.distance / 1609.344);
      $('#gear').textContent = vehicle.speed < -.3 ? 'REVERSE' : Math.abs(vehicle.u) > 5.5 ? 'OFF ROAD' : mph > 1 ? 'DRIVING' : 'READY';
    }
    function updateViewUi() {
      $('#view').title = `${rendering.viewLabel} · Change camera (V)`;
      $('#view').setAttribute('aria-label', `${rendering.viewLabel}. Change camera`);
    }
    const simulate = dt => {
      const state = started ? input.state : {};
      if (state.touchStick) state.touchDrive = touchDrivingInput(state.touchStick, camera, vehicle.route, vehicle.s, vehicle.u);
      vehicle.update(dt, state);
    };
    function frame(timestamp) {
      input.gamepad.update({ blocked: document.hidden || !document.hasFocus() || journeyDialog.open || changingJourney, paused });
      frameClock.tick(timestamp, !paused, simulate);
      const dt = frameClock.dt;
      if (!paused) {
        time += dt;
        world.update(vehicle.s); vehicle.render(frameClock.alpha, world.origin);
        rendering.update(vehicle.car, dt, world.origin); world.animate(time, vehicle);
      }
      audio.update(vehicle.speed, time, paused);
      hudTime += dt; if (hudTime > .1) { updateHud(); hudTime = 0; }
      renderer.render(scene, camera);
      if (!sceneReady) { sceneReady = true; $('#loading').classList.add('loaded'); }
      requestAnimationFrame(frame);
    }
    vehicle.render(1, world.origin); rendering.update(vehicle.car, 1, world.origin); updateHud(); updateJourneyUi(); updateViewUi();
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    requestAnimationFrame(frame);
    // Development-only inspection surface for automated driving and streaming checks.
    if (import.meta.env.DEV) window.__coastline = { vehicle, get world() { return world; }, rendering, input, action, changeJourney, get journey() { return journey; }, get changingJourney() { return changingJourney; }, get paused() { return paused; }, get started() { return started; } };
  } catch (error) { console.error('Could not start Coastline:', error); $('#loading').classList.add('loaded'); $('#error').hidden = false; }
}
boot();

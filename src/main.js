import './style.css';
import './journey.css';
import './ui.css';
import './layout.css';
import { createRendering } from './rendering.js';
import { JOURNEYS } from './journeys.js';
import { SEED, journeyStart } from './world/route.js';
import { ChunkWorker } from './world/chunk-source.js';
import { DrivingController } from './vehicle.js';
import { Traffic } from './traffic.js';
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
  let chunkWorker;
  try {
    const rendering = createRendering($('#scene'));
    const { renderer, scene } = rendering;
    let needsRender = true;
    window.addEventListener('resize', () => { needsRender = true; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) needsRender = true; });
    let journey = 'coast';
    chunkWorker = new ChunkWorker();
    let world = new JOURNEYS.coast.World(scene, chunkWorker.source('coast'));
    let changingJourney = true, journeyWasPaused = false;
    const savedJourneys = Object.fromEntries(Object.entries(JOURNEYS).map(([id, data]) => [id, journeyStart(Number(data.routeNumber))]));
    const vehicle = new DrivingController(JOURNEYS.coast.route, savedJourneys.coast); const audio = new DriveAudio();
    const journeyDialog = $('#journey-dialog');
    scene.add(vehicle.car);
    const traffic = new Traffic(scene, vehicle.route, vehicle.s);
    function start() { if (paused || changingJourney) return; if (!started) { started = true; $('#welcome').classList.add('hidden'); } }
    function setPaused(value) {
      paused = value; input.clear(); frameClock.suspend();
      audio.setPaused(paused);
      $('#pause-overlay').hidden = !paused; $('#pause').setAttribute('aria-pressed', String(paused)); $('#pause').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
      if (paused) $('#resume').focus(); else $('#pause').blur();
    }
    function updateJourneyUi() {
      const data = JOURNEYS[journey];
      document.body.dataset.journey = journey;
      $('.location-title').textContent = data.label;
      $('.location svg text').textContent = data.routeNumber;
      $('#welcome .eyebrow').lastChild.textContent = ` ${data.label}`;
      $('#welcome p').textContent = data.introduction; $('#pause-overlay .eyebrow').textContent = data.label;
      $('#scene').setAttribute('aria-label', data.canvas);
      document.querySelector('meta[name="theme-color"]').content = { coast: '#c2e7e8', desert: '#efc692', snow: '#111d30' }[journey];
      document.querySelectorAll('button[data-journey]').forEach(button => button.setAttribute('aria-current', String(button.dataset.journey === journey)));
    }
    function openJourneys() {
      if (changingJourney || journeyDialog.open) return;
      journeyWasPaused = paused; setPaused(true); $('#pause-overlay').hidden = true;
      journeyDialog.showModal();
      journeyDialog.querySelector(`[data-journey="${journey}"]`).focus();
    }
    async function changeJourney(id) {
      if (changingJourney || !JOURNEYS[id]) return;
      if (id === journey) { journeyDialog.close(); return; }
      if (!journeyDialog.open) journeyWasPaused = paused;
      changingJourney = true; paused = true; input.clear(); frameClock.suspend();
      audio.setPaused(true);
      $('#journey-transition').classList.add('active'); journeyDialog.close();
      $('#pause-overlay').hidden = true;
      savedJourneys[journey] = { s: vehicle.s, distance: vehicle.distance };
      let nextWorld;
      try {
        await new Promise(resolve => setTimeout(resolve, 320));
        nextWorld = new JOURNEYS[id].World(scene, chunkWorker.source(id));
        await nextWorld.chunkSource.prepare(savedJourneys[id].s);
        nextWorld.update(savedJourneys[id].s);
        if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, rendering.camera);
        else renderer.compile(scene, rendering.camera);
        world.dispose(); world = nextWorld; journey = id;
        vehicle.setRoute(JOURNEYS[id].route, savedJourneys[id]);
        vehicle.setAppearance(id);
        vehicle.setNight(id === 'snow');
        traffic.reset(vehicle.route, vehicle.s, id); traffic.render(1, world.origin);
        rendering.setJourney(id); audio.setJourney(id); updateJourneyUi();
        vehicle.render(1, world.origin);
        rendering.snap(); rendering.update(vehicle.car, 1, world.origin); world.animate(time, vehicle);
        updateHud(); renderer.render(scene, rendering.camera);
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
      if (name === 'fullscreen') { await toggleFullscreen(); return; }
      if (changingJourney) return;
      if (journeyDialog.open) {
        if (name === 'menuClose') journeyDialog.close();
        if (name === 'menuNext' || name === 'menuPrevious') {
          const cards = [...journeyDialog.querySelectorAll('[data-journey]')];
          const index = cards.indexOf(document.activeElement);
          cards[(index + (name === 'menuNext' ? 1 : cards.length - 1)) % cards.length].focus();
        }
        if (name === 'menuConfirm' && journeyDialog.contains(document.activeElement)) document.activeElement.click();
        return;
      }
      if (name === 'nextJourney') {
        const journeys = Object.keys(JOURNEYS);
        await changeJourney(journeys[(journeys.indexOf(journey) + 1) % journeys.length]);
        return;
      }
      if (name === 'journey') { openJourneys(); return; }
      if (name === 'drive') start();
      if (name === 'pause') setPaused(!paused);
      if (name === 'reset') { vehicle.reset(); traffic.clearNear(vehicle); traffic.render(1, world.origin); audio.reset(); frameClock.reset(); vehicle.render(1, world.origin); rendering.snap(); rendering.update(vehicle.car, 0, world.origin); world.animate(time, vehicle); needsRender = true; toast('Car reset to the road'); }
      if (name === 'view') {
        toast(rendering.toggleView()); updateViewUi();
        rendering.update(vehicle.car, 0, world.origin, input.touchStick.pointer !== null);
        needsRender = true;
      }
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
    $('#next-journey').addEventListener('click', event => {
      if (event.pointerType !== 'touch') action('nextJourney');
    });
    let fullscreenPending = false;
    function updateFullscreenUi() {
      const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      $('#fullscreen').setAttribute('aria-pressed', String(active));
      $('#fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
      $('#fullscreen').title = `${active ? 'Exit' : 'Enter'} fullscreen (F / LB / L1)`;
    }
    async function toggleFullscreen() {
      if (fullscreenPending) return;
      fullscreenPending = true;
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          await (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
        } else {
          const request = document.documentElement.requestFullscreen ?? document.documentElement.webkitRequestFullscreen;
          if (!request) { toast('Fullscreen is unavailable in this browser'); return; }
          await request.call(document.documentElement);
        }
      } catch {
        toast('To enter fullscreen, tap the fullscreen button or press F');
      } finally { fullscreenPending = false; updateFullscreenUi(); }
    }
    document.addEventListener('fullscreenchange', updateFullscreenUi);
    document.addEventListener('webkitfullscreenchange', updateFullscreenUi);
    $('#fullscreen').addEventListener('click', event => {
      if (event.pointerType !== 'touch') action('fullscreen');
    });
    $('#fullscreen').addEventListener('pointerup', event => {
      if (event.pointerType === 'touch') { event.preventDefault(); action('fullscreen'); }
    });
    $('#next-journey').addEventListener('pointerup', event => {
      if (event.pointerType === 'touch') { event.preventDefault(); action('nextJourney'); }
    });
    $('#close-journeys').addEventListener('click', () => journeyDialog.close());
    journeyDialog.addEventListener('close', () => { if (!changingJourney) setPaused(journeyWasPaused || document.hidden); });
    journeyDialog.addEventListener('click', event => {
      if (event.target !== journeyDialog) return;
      const rect = journeyDialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) journeyDialog.close();
    });
    document.querySelectorAll('button[data-journey]').forEach(button => button.addEventListener('click', () => changeJourney(button.dataset.journey)));
    for (const name of ['pause', 'reset', 'view', 'sound']) $(`#${name}`).addEventListener('click', event => {
      if (['pause', 'view'].includes(name) && event.pointerType === 'touch') return;
      action(name);
    });
    // A secondary finger may not synthesize a click while the stick is held.
    for (const name of ['pause', 'view']) $(`#${name}`).addEventListener('pointerup', event => {
      if (event.pointerType === 'touch') { event.preventDefault(); action(name); }
    });
    $('#start').addEventListener('click', () => { start(); if (!controlHelpDismissed()) toast(input.gamepad.connected ? 'Left stick to steer · RT / R2 gas · LT / L2 brake' : window.matchMedia('(any-pointer: coarse)').matches ? 'Drag the stick where you want to go · release to stop' : 'W / ↑ to accelerate · S / ↓ to brake'); });
    $('#resume').addEventListener('click', () => setPaused(false));
    document.addEventListener('visibilitychange', () => { audio.setHidden(document.hidden); if (document.hidden) { if (journeyDialog.open || changingJourney) journeyWasPaused = true; if (started) setPaused(true); input.clear(); } frameClock.suspend(); });
    window.addEventListener('blur', () => { audio.setHidden(true); if (journeyDialog.open || changingJourney) journeyWasPaused = true; if (started) setPaused(true); });
    window.addEventListener('focus', () => audio.setHidden(document.hidden));
    window.addEventListener('pointerdown', () => audio.unlock(), { capture: true, passive: true });
    window.addEventListener('keydown', () => audio.unlock(), { capture: true });
    window.addEventListener('pagehide', event => { audio.setHidden(true); if (!event.persisted) { chunkWorker.dispose(); void audio.dispose().catch(() => {}); } });
    window.addEventListener('pageshow', () => { audio.setHidden(document.hidden); needsRender = true; });
    $('#scene').addEventListener('webglcontextlost', event => { event.preventDefault(); setPaused(true); toast('Graphics paused. Reload to restart the game.'); });
    $('#scene').addEventListener('webglcontextrestored', () => { needsRender = true; });
    const hud = { speed: $('#speed'), fill: $('#speed-fill'), distance: $('#distance'), gear: $('#gear') };
    function updateHud() {
      // Physics uses meters and seconds; convert only the displayed measurements.
      const mph = Math.round(Math.abs(vehicle.speed) * 3600 / 1609.344);
      const speed = String(mph).padStart(2, '0'), distance = mileageFormat.format(vehicle.distance / 1609.344);
      const gear = vehicle.speed < -.3 ? 'REVERSE' : Math.abs(vehicle.u) > 5.5 ? 'OFF ROAD' : mph > 1 ? 'DRIVING' : 'READY';
      // Replacing unchanged text still invalidates layout, including while paused.
      if (hud.speed.textContent !== speed) hud.speed.textContent = speed;
      if (hud.distance.textContent !== distance) hud.distance.textContent = distance;
      if (hud.gear.textContent !== gear) hud.gear.textContent = gear;
      hud.fill.style.width = `${Math.min(Math.abs(vehicle.speed) / 28, 1) * 100}%`;
    }
    function updateViewUi() {
      $('#view').title = `${rendering.viewLabel} · Change camera (V)`;
      $('#view').setAttribute('aria-label', `${rendering.viewLabel}. Change camera`);
    }
    const simulate = dt => {
      const state = started ? input.state : {};
      if (state.touchStick) state.touchDrive = touchDrivingInput(state.touchStick, rendering.camera, vehicle.route, vehicle.s, vehicle.u, world.origin);
      vehicle.update(dt, state);
      traffic.update(dt, vehicle);
    };
    function frame(timestamp) {
      input.gamepad.update({ blocked: document.hidden || !document.hasFocus() || changingJourney, paused, menu: journeyDialog.open });
      frameClock.tick(timestamp, !paused, simulate);
      const dt = frameClock.dt;
      if (!paused) {
        time += dt;
        world.update(vehicle.s); vehicle.render(frameClock.alpha, world.origin);
        traffic.render(frameClock.alpha, world.origin);
        rendering.update(vehicle.car, dt, world.origin, input.touchStick.pointer !== null); world.animate(time, vehicle);
      }
      audio.update(vehicle.audioTelemetry, dt);
      hudTime += dt; if (hudTime > .1) { updateHud(); hudTime = 0; }
      rendering.recordFrame(timestamp, !paused && !document.hidden && document.hasFocus() && !changingJourney);
      // Paused water, traffic and shadows are unchanged. Keep polling input
      // and fading audio, but only redraw the frozen canvas when invalidated.
      if (!document.hidden && (!paused || needsRender)) {
        renderer.render(scene, rendering.camera); needsRender = false;
        if (!sceneReady) { sceneReady = true; $('#loading').classList.add('loaded'); }
      }
      requestAnimationFrame(frame);
    }
    await world.chunkSource.prepare(vehicle.s);
    world.update(vehicle.s);
    vehicle.render(1, world.origin); traffic.render(1, world.origin); rendering.update(vehicle.car, 1, world.origin); updateHud(); updateJourneyUi(); updateViewUi();
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, rendering.camera);
    else renderer.compile(scene, rendering.camera);
    changingJourney = false;
    requestAnimationFrame(frame);
    // Development-only inspection surface for automated driving and streaming checks.
    if (import.meta.env.DEV) window.__coastline = { seed: SEED, chunkWorker, vehicle, traffic, audio, get world() { return world; }, rendering, input, action, changeJourney, get journey() { return journey; }, get changingJourney() { return changingJourney; }, get paused() { return paused; }, get started() { return started; } };
  } catch (error) { chunkWorker?.dispose(); console.error('Could not start Coastline:', error); $('#loading').classList.add('loaded'); $('#error').hidden = false; }
}
boot();

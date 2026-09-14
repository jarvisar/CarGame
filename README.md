# Coastline

A small, endless coastal drive built with Three.js. The fixed orthographic camera, miniature car, turquoise water, faceted cliffs, and evergreen hills take their visual direction from the supplied reference.

The scenery includes animated ocean swells, rolling shoreline breakers, sea-stack foam, broad sandy coves, occasional arched viaducts over tidal inlets, sheltered inland ponds, rocky mountain ridges, mixed pine and broadleaf groves, wildflowers, and small flocks of gliding gulls. The first bridge appears about 330 feet ahead of the starting point; the first pond lies just beyond it inland.

Small hillside scree clusters, grass tufts, and beach pebble drifts add detail between the larger trees and rocks; the additions stream with the Pacific Coast scenery. Ocean highlights form irregular, curved wavelets, with varied foam along the shoreline.

Use **Change Route** in the top bar to choose **Pacific Coast** or **Red Rock Desert**. The desert road winds along the bottom of a sandy canyon under warm early-evening light. Broad sandstone shelves, steep orange cliffs, recessed bays, lower saddles, and large flat-topped mesas frame the road. Fractured rock shoulders, rockfall slopes, eroded spires, and a shallow gravel wash complete the terrain. Joshua trees, yuccas, agaves, barrel cacti, and sparse scrub dot the valley. Both journeys use the same fixed camera angle, car scale, and zoom options. The chooser pauses driving, and each journey remembers your position and distance for the current page session; you return stationary on the road. Escape or the close button dismisses the chooser without changing journeys.

The third journey, **Midnight Alpine**, winds along a snowy mountain ledge at night. Pointed mountains rise to the right of the road, with irregular rocky flanks, snowy summits, and lower saddles between peaks. A steep drop falls away to the left. Snow-covered pines, guardrails, amber lamps, working headlights, light snowfall, and occasional summit relay huts complete the scene. It retains the same camera angle, car scale, and forgiving controls. Snow animation pauses with the drive, and night lighting is removed when returning to either daytime journey.

The desert also includes small branching trees with rounded leafy crowns, clustered scrub and straw-colored grass, and broad fractured sandstone slabs surrounded by stone chips. These reference-inspired details grow in scattered pockets along the valley and upper ledges, using deterministic instancing and keeping the asphalt clear.

The slope below the road descends gradually through broad spurs, gullies, and uneven snow-covered shoulders. Local pockets flatten directly into the terrain on both sides, with small groups of pines growing on those shelves. These variations use continuous world-space height functions, so the terrain connects across chunks while retaining the overall summit shape.

## Run

Requires Node.js 22.12+ or 24+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`, then `npm run preview`.

## Controls

The interface uses US English, miles per hour (mph), miles, and Fahrenheit (°F). Driving physics and world geometry use meters internally; displayed measurements are converted to US units.

- **W / ↑:** accelerate
- **S / ↓:** brake, then reverse
- **A D / ← →:** steer
- **Space:** strong brake
- **V:** cycle through medium (default), close, and scenic orthographic views. Medium matches the previous closer view; close adds another zoom level.
- **R:** return to the road at the current location
- **N:** switch to the next scene, cycling through all routes while preserving each route’s progress
- **P / Escape:** pause / resume
- **M:** optional synthesized ocean and engine sound

On touch devices, tap **Let’s drive**, then drag the right-side virtual joystick toward the direction you want the car to move **on screen**. Up moves toward the top of the screen, regardless of the car's previous heading. Drag farther for more speed; release to stop. Camera orientation and terrain slope are accounted for, while roadside limits still apply. This directional driving mode only applies to the touch joystick; keyboard and physical controller steering retain their existing behavior and can start a drive directly. Leaving the tab pauses the drive.

Driving controls and the combined area/distance/speed readout stay hidden on menus and pause screens. During a drive, the three-line readout sits in the bottom-left corner and the joystick sits at the bottom right. Short landscape screens hide repeated control help and compact the toolbar. Safe-area insets and available viewport height govern panel sizing; long menu and installation content scrolls inside its panel.

### Controllers

Basic support uses the browser's [Gamepad API](https://w3c.github.io/gamepad/) for connected USB/Bluetooth controllers and handheld controls exposed as a gamepad. Press a controller button after opening the page if it has not been detected yet.

- **Left stick / D-pad:** steer (stick has a small deadzone).
- **RT / R2:** gas; **LT / L2:** brake, then reverse. Analog triggers support partial pressure.
- **Bottom face button (Xbox A / PlayStation Cross):** gas fallback.
- **Right face button (Xbox B / PlayStation Circle):** brake/reverse fallback.
- **Start / Menu / Options:** pause or resume.
- **Left face button (Xbox X / PlayStation Square):** change view.
- **Top face button (Xbox Y / PlayStation Triangle):** reset to the road.

The touch joystick hides while a controller is detected and returns when it disconnects. Disconnecting during a drive pauses the game. Release held controls before resuming after a menu or focus change. Journey selection still uses touch or mouse. Standard browser mappings work best; unmapped devices use the same button indices as a rough fallback, with no device-specific remapping. AYN Thor compatibility depends on its controls being exposed to the browser as a gamepad; it has not been tested on physical hardware.

## Implementation

- `src/world/route.js`: continuous road, coastline, height functions, and deterministic terrain samples.
- `src/world/environment.js`: nine streamed 128 m chunks; faceted terrain and ocean, road ribbons, and instanced vegetation and rocks. Chunks work in either direction and dispose their unique GPU resources on removal. A floating origin keeps rendering coordinates small on long drives.
- `src/world/water.js`: shared GPU animation for swell, wave highlights, shoreline breakers, and rock wash. Global phases preserve wave continuity through chunk changes and floating-origin rebases.
- `src/world/landmarks.js`: bridges with solid arch walls, decks, and balustrades; pond surfaces clipped to streaming chunks. Terrain basins and ravines are generated by the route height functions, while the car samples the bridge deck separately.
- `src/world/birds.js`: small instanced gull flocks with gliding motion and intermittent wingbeats, driven by the simulation clock so they pause with the scene.
- `src/world/desert-route.js`, `src/world/desert.js`: continuous canyon profiles with adaptive terrain columns along both walls, deterministic rock formations, a dry wash, and instanced rockfall and desert plants. Shared global boundary samples and the same nine-chunk streaming budget as the coast keep the valley seamless and bounded.
- `src/world/snow-route.js`, `src/world/snow.js`: continuous mountain masses and ledge terrain, slope-dependent snow cover, instanced alpine scenery, seven pooled nearby lamp lights, one headlight beam, and a fixed pool of snow particles. Mountain summits and chunk borders use deterministic world coordinates, including reverse travel and floating-origin changes.
- `src/journeys.js`, `src/journey.css`: journey definitions and chooser styling. Switching updates environment lighting, HUD labels, and optional wind ambience while retaining the existing camera setup.
- `src/vehicle.js`: small procedural car, fixed-step arcade driving, steering smoothing, gentle heading assistance, slope alignment, and soft roadside limits. Position, orientation, body lean, steering, and wheels interpolate between physics steps before the camera follows the car.
- `src/timing.js`: 60 Hz physics with display-rate rendering via `requestAnimationFrame`, including high-refresh and variable-refresh displays. Actual frame delivery depends on the browser, system settings, and available GPU/CPU performance. Pausing preserves interpolation progress; resets and journey changes discard old poses.
- `src/rendering.js`: fixed isometric camera, three zoom levels (165-unit medium default, 115-unit close, 235-unit scenic), lighting, fog, and shadows. Zoom changes the projection without reallocating the canvas buffers.
- `src/input.js`, `src/gamepad.js`, `src/audio.js`, `src/main.js`: keyboard/touch/controller input, optional synthesized sound, and scene lifecycle.

Geometry, colors, and lighting provide the environment without external texture or model assets. System fonts keep the app self-contained with no runtime network dependencies. Instanced scenery follows [Three.js instancing guidance](https://threejs.org/docs/pages/InstancedMesh.html).

Run `npm test` for deterministic generation, continuity, driving, and streaming checks.

With the development server running, `npm run test:responsive` audits menu, driving, pause and route-chooser layouts across 23 phone/tablet/desktop viewport sizes, plus notched screens, controller mode, dismissed help and expanded install instructions. It checks panel overlaps, reachable primary actions, target sizes, overflow, the three-line readout and right-side joystick. Reports and screenshots are saved in `.artifacts/responsive/`. These checks use Chrome emulation, not physical devices. Set `TEST_URL` to override the default development URL.

With the development server running, `node scripts/us-units-test.mjs` checks speed and mileage conversions, US number formatting, the speed bar, Fahrenheit temperatures, and saved mileage across all routes. Set `TEST_URL` to use a server other than `http://127.0.0.1:5173`.

`npm run test:controller` checks simulated controller detection, driving, pause/resume, modal isolation, disconnect/reconnect, and touch-control visibility in Chrome. Set `TEST_URL` to use a development server other than `http://127.0.0.1:5173`.

With the development server running, `npm run test:browser` checks keyboard/touch controls and streaming in Chrome, and `npm run test:scenery` checks landmarks, bounded GPU resources, visible water animation, and frozen animation while paused. These browser scripts use the installed Windows Chrome executable. Screenshots and reports are written to `.artifacts/`.

`npm run test:journeys` checks desktop/mobile selection, Escape dismissal, paused input, position restoration, unchanged camera settings, desert driving, and repeated switching without retained world geometry.

`npm run test:snow` checks the third journey on desktop and mobile, keyboard and touch driving, fixed camera settings, night effects across chunk and origin changes, paused snowfall, saved journey progress, and restoration of daytime lighting. These headless Chrome checks use software rendering; they do not measure performance on physical mobile hardware.

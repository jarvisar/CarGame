# Coastline

A small, endless coastal drive built with Three.js. The fixed orthographic camera, miniature car, turquoise water, faceted cliffs, and evergreen hills take their visual direction from the supplied reference.

The scenery includes animated ocean swells, rolling shoreline breakers, sea-stack foam, broad sandy coves, occasional arched viaducts over tidal inlets, sheltered inland ponds, rocky mountain ridges, mixed pine and broadleaf groves, wildflowers, and small flocks of gliding gulls.

Every page load generates a fresh world seed, changing the road bends, elevations, terrain details, and scenery across all four journeys. Each journey starts on its own randomly chosen stretch of road with zero mileage. Driving back or switching journeys preserves the same scenery and session progress; Reset returns the car to the road locally. Reload to generate a new drive. To revisit or share a particular world, add an unsigned 32-bit seed to the URL, for example `?seed=4817`; that seed reproduces the world and starting locations.

Small hillside scree clusters, grass tufts, and beach pebble drifts add detail between the larger trees and rocks; the additions stream with the Pacific Coast scenery. Ocean highlights form irregular, curved wavelets, with varied foam along the shoreline.

Coastal gulls have slightly larger, brighter silhouettes. Their offshore loops cruise above the local sea-stack crowns with room for wingbeats and gentle bobbing.

The Pacific scene takes its cliffs, hills, and mountains from the reference image. Warm sunlit slabs, cool shaded planes, and dark recessed fractures color the cliff walls, which carry deeper buttress relief, a damp band along the toe, and a dusty bare lip where the crown is exposed. Behind the road, a chain of overlapping peaks forms one ridge with summits and saddles; in some stretches the hillside rises straight behind the roadside terrace, in others it opens into rolling knolls before the ridge. Bare rock follows the summits and cohesive patches on the flanks, with half-buried outcrops breaking through the turf, straw-tinted sun-facing slopes, and dense fir groves on the uplands above a looser mix of firs and broadleaf crowns near the road. Ponds and viaduct inlets sit on sheltered shelves where the ridge eases off. Deeper blue water with stronger facets, taller warm and grey sea stacks, and the existing feathered breakers, gulls, and fallen slabs complete the scene. Terrain still uses 1,376 triangles per chunk, vegetation samples the visible terrain mesh so it sits on the ground, and these visual changes preserve the road, driving limits, and camera.

Use **Change Route** in the top bar to choose **Pacific Coast**, **Red Rock Desert**, **Midnight Alpine**, or **Emerald Jungle**. The desert road winds along the bottom of a sandy canyon under warm early-evening light. Broad sandstone shelves, steep orange cliffs, recessed bays, lower saddles, and large flat-topped mesas frame the road. Fractured rock shoulders, rockfall slopes, eroded spires, and a shallow gravel wash complete the terrain. Joshua trees, yuccas, agaves, barrel cacti, and sparse scrub dot the valley. Both journeys use the same fixed camera angle, car scale, and zoom options. The chooser pauses driving, and each journey remembers your position and distance for the current page session; you return stationary on the road. Escape or the close button dismisses the chooser without changing journeys.

The third journey, **Midnight Alpine**, winds above a broad mountain lake at night. Three overlapping mountain ranges rise behind the roadside peaks, with irregular summits, deep saddles, and distant slopes fading into blue mist. Snow-laden firs, guardrails, warm lamps, working headlights, light snowfall, and occasional summit relay huts complete the scene. Timber trestle bridges with planked decks, braced bents, and snow-topped railings carry the road over stream gullies that run diagonally down the mountainside. The view frames more of the lake below the road while retaining the camera angle and driving controls. Night effects pause with the drive and are removed when returning to a daytime journey.

The fourth journey, **Emerald Jungle**, follows a turquoise river through dense, humid rainforest. The river and road share a descending valley: every pool connects to a lower one downstream, with no upward resets. Broad pools narrow over uneven rocky lips into small waterfalls, foam, and spray. Fine currents and wakes around partly submerged stones animate the clear water, with lily pads at sheltered edges. A lower foreground bank keeps the river visible. The opposite bank alternates planted slopes with uneven groups of broad rock faces and broken shelves; guardrails appear only where a steep cliff approaches the road. Occasional hillside creeks pass through culverts and fall from the gorge wall. Faceted broadleaf trees, palms, banana plants, ferns, bamboo, mossy boulders, and fallen logs fill the forest. Buttressed giants have short ascending branches tucked beneath wide crowns, with hanging lianas. Green canopy light, forested crags, distant peaks, and drifting mist complete the valley. Number keys 1–4 also jump straight to a route.

Each journey has a matching car in the same miniature style: coral with a cream surfboard on the coast, sage green with a rear spare tire in the desert, pale blue with a dark roof box in the mountains, and mustard yellow with jerry cans and a rolled tarp on the roof rack in the jungle. Handling stays the same across all four.

The desert also includes small branching trees with rounded leafy crowns, clustered scrub and straw-colored grass, and broad fractured sandstone slabs surrounded by stone chips. These reference-inspired details grow in scattered pockets along the valley and upper ledges, using deterministic instancing and keeping the asphalt clear.

The foreground has two staggered belts of low sandstone benches, rocky hollows, and open sandy slopes. The left canyon edge alternates between exposed scarps and broad erosion fans that blend into the valley floor. A shallow, wandering gravel wash varies in width and depth. Fractured outcrops, larger branching Joshua trees, and pockets of yuccas and scrub fill the near slopes, with sparse plants on mesa caps. Scenery samples the rendered terrain triangles to stay grounded across slopes and chunk boundaries; all features regenerate consistently from the world's seed.

A muted gray-blue river meanders beside the desert road, narrowing into small runs and widening into pools, with higher water and an almost-still surface. Pale, sandy shallows deepen into subdued reflective water, and a thin wet-sand margin follows the actual shoreline. Finer bank geometry and explicit river boundaries prevent water spreading into unrelated hollows behind the mesas. Occasional weathered wooden bridges have sun-faded planks with uneven ends, stout posts, simple ranch-style rails, small sandstone abutments, and splayed supports. Shingle, driftwood, rushes, and low bush pockets follow the banks. The river only reshapes the valley floor; the existing canyon walls, mesas, and foreground landforms retain their geometry. Its faint, slow shimmer pauses with the drive. Cars stay on the deck at crossings and away from the river's edge.

Between crossings the river bends away from projecting left-side rock shoulders, leaving a varying sandy strip beside the ledge. Its meanders and pool widths vary independently, and alternating shallow shelves give the two banks different slopes. Rock-clearance samples use continuous world coordinates, so the bends remain smooth across chunks and reverse travel.

The bluff below the road and the peaks above it drop in stacked rock strata: flat snow shelves between near-vertical dark risers that drift and dip along the route, so each shelf and riser renders as a single plane, with spurs, gullies, and uneven snow-covered shoulders between them. Firs gather in small groves on those shelves. Local pockets flatten directly into the terrain on both sides, with small groups of pines growing on those shelves. These variations use continuous world-space height functions, so the terrain connects across chunks while retaining the overall summit shape.

The lake has a level surface, sheltered coves, fractured shore ice, subtle moonlit ripples, and drifting mist. Small timber cabins with glowing windows sit among fir groves along the snowy shore. Trees have irregular drooping branches with uneven snow cover, and sculpted snowbanks frame the asphalt. Soft, round snowflakes vary in size, depth, drift, and fall speed and remain anchored in the world as the car moves.

## Run

Requires Node.js 22.12+ or 24+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build, run `npm run build`, then `npm run preview`.

## Desktop app

Windows, Linux (including the Steam Deck), and macOS builds wrap this same web build in Electron; nothing in `src/` changes. `npm run electron:dev` opens the game in a desktop window with hot reload, `npm run electron:build` packages it for the current OS, and pushing a `v*` tag builds installers for all three platforms on GitHub Actions. `npm run test:electron` checks the desktop shell against the current web build. See [ELECTRON.md](ELECTRON.md) for options, Steam Deck setup, and how the wrapper stays in sync with the web app.

## Controls

The interface uses US English, miles per hour (mph), miles, and Fahrenheit (°F). Driving physics and world geometry use meters internally; displayed measurements are converted to US units.

- **W / ↑:** accelerate
- **S / ↓:** brake, then reverse
- **A D / ← →:** steer
- **Space:** strong brake
- **V / View button:** cycle through medium (default), close, third-person, and scenic views. Third-person uses perspective and follows behind the car as you steer.
- **R:** return to the road at the current location
- **N:** switch to the next scene, cycling through all routes while preserving each route’s progress
- **1–4:** jump straight to a route by its number
- **P / Escape:** pause / resume
- **M:** toggle driving sound and route ambience.
- **F:** toggle fullscreen (also available via the fullscreen icon on touchscreens).

On touch devices, tap **Let’s drive**, then drag the right-side virtual joystick toward the direction you want the car to move **on screen**. Up moves toward the top of the screen, regardless of the car's previous heading. Drag farther for more speed; release to stop. Camera orientation and terrain slope are accounted for, while roadside limits still apply. This directional driving mode only applies to the touch joystick; keyboard and physical controller steering retain their existing behavior and can start a drive directly. Leaving the tab pauses the drive.

Driving controls and the combined area/distance/speed readout stay hidden on menus and pause screens. During a drive, the three-line readout sits in the bottom-left corner and the joystick sits at the bottom right. Short landscape screens hide repeated control help and compact the toolbar. Safe-area insets and available viewport height govern panel sizing; long menu and installation content scrolls inside its panel.

Third-person view uses car-style touch controls: push up to accelerate, left/right to steer, and down to brake or reverse. Release to stop. The camera follows turns smoothly while driving and softens terrain bumps; the other views retain screen-direction joystick controls. A second finger can tap View while driving.

### Controllers

Basic support uses the browser's [Gamepad API](https://w3c.github.io/gamepad/) for connected USB/Bluetooth controllers and handheld controls exposed as a gamepad. Press a controller button after opening the page if it has not been detected yet.

- **Left stick / D-pad:** steer (stick has a small deadzone).
- **RT / R2:** gas; **LT / L2:** brake, then reverse. Analog triggers support partial pressure.
- **Bottom face button (Xbox A / PlayStation Cross):** gas fallback.
- **Right face button (Xbox B / PlayStation Circle):** brake/reverse fallback.
- **Start / Menu / Options:** pause or resume.
- **Left face button (Xbox X / PlayStation Square):** change view.
- **Top face button (Xbox Y / PlayStation Triangle):** reset to the road.
- **RB / R1 (right shoulder):** next scene, including while paused.
- **Select / Back / View:** open the scenery chooser. Use the D-pad or stick to highlight a route, A / Cross to select, and B / Circle or Select to close.
- **LB / L1 (left shoulder):** toggle fullscreen. Browsers may require a tap on the fullscreen icon or the F key to enter fullscreen; controller requests are handled without interrupting the game if denied.

The touch joystick, View/Reset/Next toolbar, Pause button, and Change Route button hide while a controller is detected and returns when it disconnects. Disconnecting during a drive pauses the game. Release held controls before resuming after a menu or focus change. Use Change Route on touchscreens, or RB / R1 to cycle scenes on a controller. The Change Route chooser remains available for selecting a specific route. Standard browser mappings work best; unmapped devices use the same button indices as a rough fallback, with no device-specific remapping. AYN Thor compatibility depends on its controls being exposed to the browser as a gamepad; it has not been tested on physical hardware.

## Implementation

- `src/world/generation.js`, `src/world/route.js`: a fresh session seed (or explicit URL seed), seeded road curves and starting locations, continuous coastline and height functions, and deterministic terrain samples within each world.
- `src/world/environment.js`: nine streamed 128 m chunks; faceted terrain and ocean, road ribbons, and instanced vegetation and rocks. Chunks work in either direction and dispose their unique GPU resources on removal. A floating origin keeps rendering coordinates small on long drives.
- `src/world/chunk-source.js`, `chunk-worker.js`, `chunk-transfer.js`: one Web Worker builds initial views and prepares the next chunks in both directions. Chunk-owned geometry and instance buffers transfer to the renderer; named shared resources preserve the existing materials, shaders, and instancing. The scene retains nine chunks, with at most two additional chunks of CPU data cached during driving. Evicted chunks can supply that reverse-travel cache while releasing their GPU resources. Cancelled requests are discarded on route changes, and unavailable workers or sudden jumps to unprepared locations use the existing synchronous builders.
- `src/world/coastal-assets.js`: shared faceted firs, cypress crowns and branches, sea-stack variants, and a spatially indexed sampler for grounding scenery on the terrain mesh.
- `src/world/water.js`: shared GPU animation for swell, wave highlights, shoreline breakers, and rock wash. Global phases preserve wave continuity through chunk changes and floating-origin rebases.
- `src/world/landmarks.js`: bridges with solid arch walls, decks, and balustrades; pond surfaces clipped to streaming chunks. Terrain basins and ravines are generated by the route height functions, while the car samples the bridge deck separately.
- `src/world/birds.js`: small instanced gull flocks with gliding motion and intermittent wingbeats, driven by the simulation clock so they pause with the scene.
- `src/world/desert-route.js`, `src/world/desert.js`, `src/world/desert-river.js`: continuous canyon profiles with adaptive terrain columns along both walls, deterministic rock formations, a roadside river with wooden crossings, a dry wash, and instanced rockfall and desert plants. Finer valley samples and terrain-clipped water preserve the outer canyon mesh. Shared global boundary samples and the same nine-chunk streaming budget as the coast keep the valley seamless and bounded.
- `src/world/snow-route.js`, `src/world/snow.js`: continuous mountains, three distant ranges, a lake basin, slope-dependent snow cover, and instanced alpine scenery. World-space gullies beneath timber trestles are carved only into the scenery height, so the car keeps sampling the flat deck while road ribbons, guardrails, and lamps stop at the abutments. Seven nearby lamp lights, two cabin lights, soft lamp halos, and a headlight beam stay bounded while driving. Mountain summits and chunk borders use deterministic world coordinates, including reverse travel and floating-origin changes.
- `src/world/alpine-lake.js`, `src/world/alpine-pines.js`, `src/world/alpine-cabins.js`, `src/world/snowfall.js`: animated lake water and mist, shore ice, irregular snow-laden fir branches, instanced cabin details, and soft world-anchored flakes. Procedural geometry and shaders provide these details without external assets or additional shadow maps.
- `src/journeys.js`, `src/journey.css`: journey definitions and chooser styling. Switching updates environment lighting, HUD labels, and optional wind ambience while retaining the existing camera setup.
- `src/vehicle.js`: small procedural car, fixed-step arcade driving, steering smoothing, gentle heading assistance, slope alignment, and soft roadside limits. Position, orientation, body lean, steering, and wheels interpolate between physics steps before the camera follows the car.
- `src/world/jungle-route.js`, `src/world/jungle.js`: a continuous watershed with a positive grade and bounded pool-height variation, ensuring every step descends downstream. The jungle road follows the same grade smoothly. Pool widths, uneven lips, bank outcrops, side streams, and rock wakes are deterministic in world space. Extra terrain rows resolve waterfall sills and plunge basins. Scenery samples the rendered terrain mesh; the same nine-chunk streaming budget and worker transfer apply.
- `src/world/jungle-assets.js`, `src/world/jungle-water.js`: lobed broadleaf and umbrella crowns with sunlit tops, buttressed emergent trunks, leaning palms with creased fronds, banana plants, bamboo clumps, lily pads, leafy vine strands, columnar cliff rock, ferns, broad leaves, grass tufts, boulders with baked moss, and shaders for the flowing turquoise river, falling water, cascade foam, spray, and valley mist.
- `src/traffic.js`, `src/traffic-models.js`: sparse traffic in both directions on all four routes, with hatchbacks, sedans, wagons, pickups, and vans in random paint colors. Six reused vehicles cover roughly a kilometer of road. Simple braking and rectangle collisions slow the player and separate overlapping cars; traffic pauses and rebases with the world.
- `src/timing.js`: 60 Hz physics with display-rate rendering via `requestAnimationFrame`, including high-refresh and variable-refresh displays. Actual frame delivery depends on the browser, system settings, and available GPU/CPU performance. Pausing preserves interpolation progress; resets and journey changes discard old poses.
- `src/rendering.js`, `src/third-person-camera.js`: three isometric zoom levels (165-unit medium default, 115-unit close, 235-unit scenic), a perspective third-person camera, lighting, fog, and shadows. Zoom changes the projection without reallocating the canvas buffers.
- `src/input.js`, `src/gamepad.js`, `src/main.js`: keyboard/touch/controller input and scene lifecycle.
- `src/audio.js`, `src/audio/`: optional procedural audio with a rounded engine tone, throttle/coasting response, gentle automatic gear changes, speed-dependent tire and wind noise, and softer snow or grittier off-road texture. Stereo surf, canyon wind, and alpine gusts use different profiles and slow overlapping swells. One reusable Web Audio graph fades on mute, pause, and focus loss, then suspends to save processing; sound stays off until enabled with the speaker button or M. No audio downloads or new dependencies.

Geometry, colors, and lighting provide the environment without external texture or model assets. System fonts keep the app self-contained with no runtime network dependencies. Instanced scenery follows [Three.js instancing guidance](https://threejs.org/docs/pages/InstancedMesh.html).

Fixed car body parts share draw calls, and flat foam and lake mist use [single-pass transparency](https://threejs.org/docs/pages/Material.html#forceSinglePass). Coastal terrain vertices and desert column profiles are reused during chunk construction; those temporary caches are released afterward. Paused scenes redraw after a resize, reset, or canvas restoration while controller polling and audio fades continue. Scenery detail, shadows, and driving physics retain their existing settings.

Rendering starts at the device's native pixel density, capped at **3×**. After a three-second grace period, two consecutive two-second windows below the 60 FPS target lower the cap based on measured FPS, rounded down to **0.25× steps**, with a **1× minimum**. For example, 3× at 50 FPS tries 2.5×; at 30 FPS it tries 2×. It allows one second to settle after each adjustment, measures again, and can reduce further if needed. A small tolerance (59.5 FPS threshold) avoids downgrading normal 59.94 Hz displays. Pauses, hidden/unfocused tabs, and route transitions do not count; resizing restarts the grace period. Reductions last for the page session to prevent oscillation; reloading tries higher density again. Devices below 1× retain their native density. This reduces rendering cost when the device struggles, but cannot guarantee 60 FPS if other work is the bottleneck.

Matching road markings draw together within each chunk, and each pair of car lamps shares a material and body batch. Snowfall uses floor-based coordinate wrapping to avoid repeated remainder operations for every flake. HUD text changes only when its displayed value changes. Canvas resizing updates size and pixel ratio together and skips duplicate viewport events, avoiding unnecessary buffer allocation during mobile viewport changes.

Run `npm test` for deterministic generation, continuity, driving, and streaming checks.

With the development server running, `npm run test:worker` checks worker-built initial views, forward/reverse streaming and origin rebases, bounded caches, obsolete requests, and fallback when workers are unavailable. It compares transferred chunks against synchronous generation pixel-for-pixel and records main-thread assembly timings in `.artifacts/worker/`. Set `TEST_URL` to override the development URL. Node tests also compare geometry buffers, transforms, shared resources, animation, and disposal across the worker boundary. `node scripts/pwa-test.mjs` verifies the production worker's seed and offline availability at root and subdirectory deployments. Workers keep generation off the main thread; graphics uploads/rendering still run there, and the separate worker bundle adds an initial download that the PWA caches.

With the development server running, `node scripts/performance-test.mjs` checks that all routes stop rendering while paused, redraw after resize/reset, and resume normally. It also checks idle HUD updates and duplicate resize events, and compares flat effects pixel-for-pixel against two-pass rendering. Reports go to `.artifacts/performance/`; set `TEST_URL` to override the development URL. Browser checks use software rendering and do not measure physical mobile GPU performance.

`node scripts/pixel-density-test.mjs` checks native densities 1×/2×/3×, stable 60 FPS delivery, intermediate density selection, one canvas resize per adjustment, preserved camera projection, rotation, and pause/resume integration. Frame samples are controlled so software GPU speed does not determine the test outcome. Reports go to `.artifacts/pixel-density/`; `TEST_URL` overrides the development URL. Node tests cover repeated reductions, the 1× floor, actual device density, startup/hitch tolerance, and excluded intervals.

With the development server running, `npm run test:generation` checks fresh worlds on reload, repeatable URL seeds across all four journeys, grounded spawns, regenerated chunk consistency, and saved progress. Reports and screenshots go to `.artifacts/generation/`. Set `TEST_URL` to override the development URL. The Node suite uses a repeatable seed by default; set `TEST_WORLD_SEED` to run it against another world.

With the development server running, `npm run test:audio` checks sound activation, throttle response, pause/resume, rapid toggles, focus loss, route changes, and cleanup in Chrome. It also renders the actual audio graph offline to check headroom and fades, saving a report and three short WAV previews to `.artifacts/audio/`. Set `TEST_URL` to override the development URL. Browser emulation does not replace listening on physical phone speakers or headphones.

With the development server running, `npm run test:responsive` audits menu, driving, pause and route-chooser layouts across 23 phone/tablet/desktop viewport sizes, plus notched screens, controller mode, dismissed help and expanded install instructions. It checks panel overlaps, reachable primary actions, target sizes, overflow, the three-line readout and right-side joystick. Reports and screenshots are saved in `.artifacts/responsive/`. These checks use Chrome emulation, not physical devices. Set `TEST_URL` to override the default development URL.

With the development server running, `node scripts/us-units-test.mjs` checks speed and mileage conversions, US number formatting, the speed bar, Fahrenheit temperatures, and saved mileage across all routes. Set `TEST_URL` to use a server other than `http://127.0.0.1:5173`.

`npm run test:controller` checks simulated controller detection, driving, pause/resume, modal isolation, disconnect/reconnect, and touch-control visibility in Chrome. Set `TEST_URL` to use a development server other than `http://127.0.0.1:5173`.

With the development server running, `npm run test:browser` checks keyboard/touch controls and streaming in Chrome, and `npm run test:scenery` checks landmarks, bounded GPU resources, visible water animation, and frozen animation while paused. These browser scripts use the installed Windows Chrome executable. Screenshots and reports are written to `.artifacts/`.

`npm run test:journeys` checks desktop/mobile selection, Escape dismissal, paused input, position restoration, unchanged camera settings, desert driving, and repeated switching without retained world geometry.

With the development server running, `node scripts/desert-river-test.mjs` checks the wooden crossings, forward/reverse driving, bounded streaming through origin changes, water animation and pause, route cleanup, and desktop/phone views with two world seeds. Screenshots and its report go to `.artifacts/desert-river/`; `TEST_URL` overrides the development URL. These browser checks use software rendering.

`npm run test:snow` checks the third journey on desktop and mobile, keyboard and touch driving, fixed camera settings, night effects across chunk and origin changes, paused snowfall, saved journey progress, and restoration of daytime lighting. These headless Chrome checks use software rendering; they do not measure performance on physical mobile hardware.

`npm run test:jungle` checks the fourth journey: four route cards, the jungle car and theme, keyboard driving and reverse, nine streamed chunks with river, cascade, and canopy meshes through origin shifts and reverse travel, animated water that freezes while paused, saved progress, restored coastal lighting, and touch driving on a phone viewport.

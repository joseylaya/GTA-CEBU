# District Zero — Phase 1 source of truth

**Status:** Historical Phase 1 specification. The City Stories update adds optional activities, cash, reputation, and upgrades beyond this scope. The camera remains a **third-person free-look/orbit camera**.  
**Updated:** 2026-09-17  
**Platform:** Desktop browser, WebGL 2, keyboard and mouse  
**Stack:** VS Code, GPT-5.6 Sol, Node.js, Vite, Three.js  
**Folder:** `/Users/fdc-josemarie-nc-web/Documents/Workspace/me/GTA-CEBU` (internal folder name; public game content remains original).

## Vision and hard boundary

Build an original, blocky 3D **free-roam** urban sandbox. The player can walk, jump, look around, drive three cars, encounter pedestrians and traffic, attract and escape police, and save/resume. There are **no errands, missions, objectives, checkpoints, mission markers, or story progression** in Phase 1. The requested Roblox-like feel means readable chunky characters, bright low-poly forms, and direct controls; it does not authorize copying Roblox assets or branding. GTA: San Andreas is a control/genre reference, not a source of content.

The loop is explore → drive/interact → respond to the world → escape police → save/resume. Prioritize responsive controls and reliability over map size.

## Strict Phase 1 scope

| System | Requirement |
| --- | --- |
| District | One original blockout, currently 240 × 180 game units: roads, sidewalks, buildings, plazas, perimeter, and simple lighting. No interiors or expansion. |
| Player | One blocky third-person avatar; WASD camera-relative movement, Shift sprint, Space jump, smooth acceleration/deceleration, collision, 200 maximum health, safe respawn. |
| Camera | **Third-person free-look/orbit camera:** mouse movement rotates yaw and pitch around the player while keeping the avatar in focus. Click the game to capture the cursor for continuous movement; mouse-over orbit works without capture. Right mouse temporarily shifts to an over-the-shoulder aim view. Clamp pitch and shorten camera distance near buildings. Walking follows camera direction. In cars, camera gradually recenters after mouse movement stops. |
| Cars | Three drivable parked cars; W/S throttle/reverse, **A left / D right**, Space handbrake, E enter/exit, safe exit position, speed display, bounded collision damage. Three simple ambient cars. |
| Population | Roughly 8–15 pedestrians and no more than two active police. Wander/flee and investigate/chase/search behaviors. |
| Wanted | 0–2 levels. Witnessed theft/gunfire/assault can raise heat; heat decays after loss of sight. Clear wanted on death or at zero heat. |
| Combat | One simple ranged action, finite ammo/reload, hit response, and crime reporting. No inventory or gore. |
| Health | 200 maximum. Police contact damage currently 4 per second; collision damage currently 3 with a one-second cooldown. On death restore health and respawn safely. Tune with playtests. |
| Save/load | One browser localStorage save plus backup; safe on-foot position, health, ammo. Reject save while driving/wanted. Validate load and reset transient state. Migrate version-1 health from the former 100 maximum. |
| UI | Start/pause menu, free-roam panel, health, wanted, ammo, vehicle speed, minimap, interaction prompt, save/load feedback. No errand panel. |
| Delivery | npm install from lockfile, development server, and production build. No account, backend, or deployment in Phase 1. |

**Non-goals:** errands/missions, multiplayer, accounts, avatar marketplace, monetization, full city, interiors, story, radio, shops, economy, advanced physics, mobile controls, consoles, and publishing. Do not build dormant frameworks for these.

## Originality and assets

Do not copy GTA: San Andreas or Roblox maps, names, characters, logos, avatars, missions, UI art, music, proprietary code, or recognizable vehicle designs. Use original procedural geometry or imports with verified licenses. Record source, license, attribution, and use in the asset register before importing. Review generated assets for resemblance/provenance. Obtain appropriate legal review before public release.

## Architecture

`index.html` owns semantic menus/HUD, `style.css` owns presentation, `src/world.js` builds the district and collision model, and `src/game.js` owns game state, input, camera, actors, wanted, save, and render loop. JavaScript objects own authoritative state; Three.js meshes display it. X/Z is the ground plane, Y is height. Use time-based updates under `requestAnimationFrame` and cap large frame deltas. Avoid a general-purpose engine. Split `game.js` into input/camera, actors, wanted, save, and UI modules only when further changes make it hard to inspect.

Use stable IDs, descriptive camelCase names, uppercase fixed configuration values, and simple data structures. Never serialize Three.js objects or DOM nodes. The UI reads game state. Avoid per-frame full-world queries that grow with content. Add dependencies only for a measured need. Keep collision and sight checks consistent with the same authored solids.

## Controls and state flows

| Mode | Controls |
| --- | --- |
| On foot | WASD camera-relative move; Shift sprint; Space jump; move mouse to orbit; click game to capture cursor; hold right mouse to aim over shoulder; E enter car; left click fire; R reload. |
| Driving | W/S throttle/reverse; A left; D right; Space handbrake; E exit below safe speed; move mouse to orbit. |
| System | Esc pause/resume and release cursor; F5 save; F9 load. |

Player mode is OnFoot, Driving, or Paused. Car state is Available or Occupied. Entry requires a nearby, nearly stopped, unoccupied car and a grounded player. On entry, hide the avatar, control the car, and align camera behind it. Exit requires low speed and a clear place on either side; otherwise remain in the car and show feedback. Death forces safe on-foot respawn and clears police. Clear held keys and mouse-look on focus loss or pause.

Mouse movement orbits the camera continuously whenever the pointer is over gameplay or captured. Clicking the canvas requests pointer lock where supported; the first click captures, and later left clicks fire. Esc or pause releases capture. Right mouse is **aim mode**, not the camera-look switch: while held, move the camera closer and slightly over the right shoulder, turn the avatar toward the view, and aim at screen center. Releasing right mouse returns to normal orbit. Pitch must not flip under or over the map. The camera should move toward the player when a building blocks its line, then return to its normal distance. In cars, settle behind the car only after mouse movement stops, without a sudden turn. Test A/D from behind each car in forward and reverse.

On-foot velocity should interpolate toward input and rest. Car steering input should interpolate rather than snap. Vehicle collision damage must have a cooldown so holding throttle against a wall cannot drain all health in a second.

## AI, crime, and wanted

Pedestrians use Idle/Wander → Flee → Wander. Traffic follows authored road nodes. Police use Investigate → Chase when the player is visible nearby, Search around last known position, then Return/Despawn when heat clears. Cap police at two. Stuck police should not prevent wanted decay after genuine sight loss.

Conceptual crime event: type, severity, position, witnessed, time. A nearby pedestrian or police with line of sight may witness vehicle theft, gunfire, or assault. Rate-limit repeated events. Heat determines level 0/1/2. Heat persists while police see the player and falls after sight is broken. The wanted HUD reads this state. No scripted mission crime remains.

## Save schema

Version 2: `{version:2, time, player:{x,z,health,ammo,reserve}}`. Storage keys: `districtZeroSave` and `districtZeroBackup`. Validate finite coordinates, walkable bounds, and bounded health/ammo before applying. Loading creates a fresh transient world, places the player on foot, and clears wanted, occupancy, traffic, and police state. Version 1 can migrate player fields and double old health to the new 200 maximum; ignore its removed `completed` field. Corrupt saves show a message without destroying the current session. New Game must work even if storage is unavailable.

## Performance and reliability

Record the reference CPU, GPU, browser, resolution, and settings. Aim for 60 FPS average at 1080p and avoid sustained drops below 30 FPS in the busiest block after warmup. Keep population and shadow cost bounded. A 30-minute session should have no crash, soft lock, invisible player, or stuck input. Handle WebGL startup failure with a useful message before declaring Phase 1 complete.

## Workflow for VS Code, Git, and AI agents

Use `npm ci`, `npm run dev`, and `npm run build` from the project folder. Commit source and lockfile; ignore `node_modules`, `dist`, caches, and logs. Keep the main branch playable and use small `codex/<feature>` branches when using Git. Do not commit credentials or unlicensed media.

GPT-5.6 Sol and other agents must read this document first. For each change, identify the requirement and smallest acceptance check, inspect existing code, implement the smallest coherent change, run build, and verify in the browser. Report exactly what was tested. Do not reintroduce errands or objective UI. Do not silently change controls/save schema. Put larger ideas in a Phase 2 backlog.

## Milestones and definition of done

| Milestone | Gate |
| --- | --- |
| M0 — Browser foundation | Local development and production build succeed; original district opens without console errors. |
| M1 — Controls and cars | Walk/drive all streets; mouse orbit and right-mouse shoulder aim work; wall avoidance works; A/D is correct in every car; ten entry/exit cycles each; no stuck camera/input. |
| M2 — Living district | Pedestrians, traffic, witnessed crime, capped police pursuit, escape, health, combat, and respawn work reliably. |
| M3 — Persistence and QA | Save/reload after browser restart; old/corrupt saves handled; 30-minute play and measured FPS pass; asset audit complete. |

Phase 1 is done only when free roam, movement/jump, camera, all three cars, safe exit, wanted/escape, combat, 200-health survival/respawn, save/load, UI, production build, originality, and reliability/performance gates pass. Current code is a playable prototype; manual control and endurance tests remain required.

## Test checklist

- Start New Game with no save; pause/resume; lose browser focus; ensure held keys and look release.
- Walk in every direction while rotating the view; verify camera-relative WASD and smooth start/stop.
- Move mouse left/right/up/down without holding a button; verify orbit and stable avatar focus. Click to capture cursor, repeat continuous turns, then Esc to release. Hold right mouse for shoulder aim; release to return to normal view.
- Stand near buildings and orbit so a wall comes between camera and avatar; camera should shorten rather than clip through.
- Enter each car; drive forward/reverse; verify A left/D right from follow view; handbrake; exit at rest; reject exit at speed or wall.
- Test pedestrians/traffic routes, witnessed/unwitnessed crime, police cap, lost sight, heat decay, and clearing.
- Shoot/reload; check ammo bounds. Take repeated hits/collisions; verify 200 maximum and crash cooldown.
- Save on foot; reject save while driving/wanted; reload after browser restart; load version 1; corrupt save and verify safe failure.
- Build production bundle; inspect console; measure FPS at 1080p; complete 30-minute session.

## Risks and Phase 2 boundary

Pointer lock may vary by browser; keep mouse-over orbit as fallback. A camera ray may miss a new imported obstacle unless its mesh joins the camera collision list. Simple police movement may stick; add recovery and sight-loss handling. Tune high health after timed playtesting so danger remains meaningful. Version save data and retain backup. Review low-poly art for originality.

Phase 2 may consider larger maps, activities, improved physics, interiors, gamepad/mobile controls, multiplayer, or publishing. Errands/missions are **not** an automatic Phase 2 item; add them only if the user explicitly requests them later.

Technical references: [Three.js installation](https://threejs.org/manual/en/installation.html) and [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html). Pin dependencies through `package-lock.json`.

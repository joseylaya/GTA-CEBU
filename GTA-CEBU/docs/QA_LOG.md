# QA log

## 2026-09-17 — Third-person free-look camera

- Mouse movement now changes camera yaw/pitch without holding right mouse. Clicking gameplay requests cursor capture; right mouse temporarily shifts to shoulder aim. The camera keeps the player in focus and shortens against building meshes.
- Added a short delay before the car camera eases behind the vehicle after free look stops.
- JavaScript syntax checks and the production build passed in staging. In the browser, New Game showed the third-person player view; horizontal and vertical mouse drags visibly orbited the camera while keeping the avatar in frame. No console errors were recorded. The drag tool also sends a left click after cursor capture, so it fired one shot during the vertical check; this was test input, not a camera fault.
- Right-button shoulder aim, manual mouse-only movement without a held button, obstacle shortening at every building, and longer play sessions still need hands-on checks.

## 2026-09-17 — Free-roam controls update

- Removed errand/mission state, objective markers, mission HUD, and mission save fields from the current game.
- Changed driving steering so A turns left and D turns right from the follow view; smoothed steering input and on-foot velocity.
- Added right-button mouse-look with yaw/pitch and pointer-lock request, plus behind-car camera easing after look release.
- Raised maximum health from 100 to 200, reduced close police damage, and rate-limited crash damage. Version-1 saves scale health on load.
- Production build passed after these changes. The target-folder browser rendered the free-roam HUD with 200 health and no console errors. New Game and legacy version-1 Continue displayed 200 health; a version-2 save showed “Game saved.” A right-click on the canvas caused no browser error.
- Continuous held mouse movement and A/D steering still need a manual play check because the available browser test controls send clicks/keypresses, not a held right-button mouse movement or sustained simultaneous keys.

## 2026-09-17 — Initial browser prototype

- `npm run build`: passed with Vite 8.3.0 and Three.js 0.186.0.
- Opened local game in browser; title/menu and 3D district rendered.
- Started a new game; third-person avatar, HUD, cars, buildings, NPCs, and minimap rendered.
- Paused through Esc; Save Game enabled Continue/Load; Load Game restored the view without a visible error.
- Browser console initially reported a removed Three.js shadow constant; source changed to `PCFShadowMap`. Recheck after next reload.
- The former mission playthrough check is superseded by free roam. All car enter/exit paths, wanted escape, 30-minute session, FPS measurement, and production-host preview remain unverified.

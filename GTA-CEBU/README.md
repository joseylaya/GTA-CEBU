# District Zero — City Stories

An original 3D city sandbox for desktop browsers, set in a stylized Cebu IT Park. Explore streets and landmarks, take optional courier runs, passenger fares, and street circuits, earn cash and reputation, upgrade a car at the garage, and evade police. The district includes mapped building footprints, office towers, shops, Garden Bloc, trees, a locally styled shuttle, market stalls, pedestrians, traffic, a day and night cycle, simple synthesized audio, and shared player presence and chat.

## Run locally

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`. The Node server provides both the Vite development game and the live player/chat endpoints. Open the game in two browser windows to join the same district locally.

## Cebu IT Park map

The streets, building footprints, parks, mapped trees, and named points of interest come from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under the [Open Database License](https://opendatacommons.org/licenses/odbl/1.0/). The source snapshot is in [`src/data/it-park.json`](src/data/it-park.json), with a downloadable copy at `/data/cebu-it-park.json`. The conversion script is [`tools/import-it-park.py`](tools/import-it-park.py); pass it an OSM XML extract from the source URL recorded in the snapshot's `meta.source` field to regenerate both copies.

The game draws stylized façades, approximate heights where OSM has no height, additional roadside greenery, and activity markers. Named building entrances, ground-floor glass shopfronts, and street signs make the district easier to recognize. The full map labels named streets and mapped businesses, while the location HUD includes a nearby well-known shop. Store names and approximate building associations come from the OSM snapshot. [Starbucks' store list](https://starbucks.ph/stores) confirms its Central Bloc, eBloc 2, and i2 sites; [Ayala Malls' merchant listing](https://ayalamalls.giftaway.ph/card/ayalamalls) confirms Chowking at Central Bloc on I. Villa Street. The Chowking map point is placed on that side of the mall. Storefront positions and appearances are illustrative; this remains a playable interpretation of the area, not a survey accurate model or a live business directory. Saves from the earlier fictional map keep progress but start at The Walk on this map.

The HUD uses a circular radar centered on the player, a compact status display, and a separate full district map. The city uses textured road, pavement, grass, and window surfaces, softer tree crowns, rounded vehicle bodies, and daylight tone mapping. These are stylized rendering improvements; detailed character animations and realistic vehicle models still require suitable rigged assets.

The [Downtown City MegaKit by Quaternius](https://quaternius.com) supplies planters, bollards, manhole covers, and rooftop details. Its building prefabs remain in the local source pack but are excluded from the browser build: stretching them to fit mapped footprints distorted their façades. The source pack's `License_Standard.txt` grants CC0 1.0. Run `python3 tools/prepare-megakit.py` (requires ffmpeg) to regenerate the four used props in `public/models/megakit/`. Named Cebu landmarks keep their mapped shapes and labels.

Pedestrians and traffic are generated locally in the browser; they do not use a paid NPC service. A fixed pool of 35 pedestrians follows the player's part of the district, with nine moving traffic vehicles. NPCs use the four animated women from Quaternius' supplied [CC0 character pack](https://creativecommons.org/publicdomain/zero/1.0/). They follow sampled footways and roadside pavements, turn or cross at mapped street junctions, travel toward named building entrances, pause inside, and occasionally walk or stop with a friend. Building interiors are represented by a short visit rather than rendered rooms. Distant pedestrians are hidden and reused as the player travels.

The local player uses Henry from the [Quaternius Pirate Kit](https://quaternius.com/packs/piratekit.html). His rigged model includes idle, walk, run, jump, punch, hit, and death animations. Run `python3 tools/prepare-pirate-characters.py` to copy his glTF from `3d-assets/` into `public/models/pirates/`. The pack page lists the Pirate Kit as CC0. Pedestrians and the taxi passenger use the animated women character pack described above. The previous Meshy model remains in `3d-assets/` but is no longer loaded. The built-in character appears if a model fails to load. Existing customization colors still apply to the fallback character and multiplayer profile; Henry's outfit remains fixed.

For Vercel, the project includes `vercel.json` and `api/ws.js`. The production browser client uses a WebSocket function and Redis to share players across function instances. Connect an Upstash for Redis resource through the Vercel Marketplace so the project receives `REDIS_URL`, then deploy with `vercel deploy --prod`. This project is configured for the Singapore function region to stay close to the Redis resource. A deployed build without `REDIS_URL` shows the game but multiplayer stays offline. `.vercelignore` excludes the 3D source packs; only the models referenced from `public/models/` ship to players.

For another Node host, run `npm run build` followed by `HOST=0.0.0.0 PORT=5173 npm start` behind an HTTPS reverse proxy. The Node server provides the original single-process multiplayer backend; the Vercel deployment uses its separate shared backend.

## Controls

WASD move/drive (A left, D right in cars), Shift sprint, Space jump/handbrake, E interact or enter/exit, move mouse to orbit the camera, and click the game to capture the cursor. On foot, press 1 for fists, 2 for the pistol, or Q to switch; left click to punch or fire, hold right mouse to aim over the shoulder, and press R to reload the pistol. Esc pauses, F5 saves, and F9 loads. Press Enter to expand chat, type a message, and press Enter to send. Choose a display name on the start screen. Use **Customize Character** in the start or pause menu to select a top, hairstyle, and colors. The **Settings** panel saves mouse sensitivity, audio volume, HUD size, and key bindings in this browser. Click an emoji in the expanded chat panel to show a mood above your character for eight seconds. Hold **V** to talk on voice chat once it is enabled, or press **T** to toggle open mic. Colored street markers start activities; the blue marker is the garage. Active jobs display a road route on the minimap, a direction cue, distance, and a destination beam.

Type `ROCKETMAN`, `JUMPJET`, or `OHDUDE` during play without opening chat. `ROCKETMAN` equips a jetpack on the character: WASD moves, Space rises, Ctrl descends, and E removes it (even in the air). Typing `ROCKETMAN` again also removes it. `JUMPJET` spawns and boards a vertical takeoff jet. It starts in hover mode: W rises, S descends, and Up/Down arrows move slowly. Press Numpad 8 or B to switch to forward flight, where W accelerates, S brakes, A/D turns, and Up/Down adjust altitude. Press Numpad 2 or B to return to hover for landing. `OHDUDE` spawns and boards a helicopter: W rises, S descends, Up/Down moves, and A/D turns. Space/Ctrl also rise/descend in aircraft; Shift boosts speed. Press E to leave an aircraft after landing and slowing down. The aircraft are original simplified game meshes. Flights are local gameplay and their position and visible flight mode are shared with other online players.

During an active police pursuit, ground officers can only hit players near street level. Above 8 m, a police helicopter with a pilot joins the pursuit and can fire when it closes in. It withdraws when the player lands or loses the wanted level.

Phase 2 multiplayer currently shares player positions, names, appearance, temporary mood emotes, chat, and proximity voice. Other players appear as avatars or vehicles, and chat messages briefly appear above their characters. Appearance is saved in the browser and updated for other players while connected. Activities, police, health, cash, and saves remain local to each browser. The live Vercel backend uses Redis for presence and cross-instance event delivery, with a 32-player cap and no accounts or chat history.

## Proximity voice chat

Voice chat is off until the player asks for it. Click the microphone pill in the chat panel to grant microphone access, then hold **V** to talk; releasing V stops transmission. Press **T** or click **OPEN MIC OFF** to leave the mic on without holding V. Press T again to return to push to talk. Enter opens chat. Clicking the microphone pill while voice is running mutes or unmutes your microphone. Open mic pauses when the browser window loses focus or the tab is hidden. V and T are ignored while typing in chat or another field. Declining the microphone, having no microphone, or opening the game over plain HTTP leaves the game running normally with an explanation on the pill.

Audio travels directly between browsers over WebRTC; it never passes through the game server, Redis, or local storage, and nothing is recorded. Only the WebRTC handshake (offers, answers, and ICE candidates) uses the multiplayer connection, and the server delivers each handshake message to its single addressed recipient rather than broadcasting it. On Vercel that routing uses one Redis channel per player, so a signal never reaches an unrelated function instance.

Voices are positional. Each remote player's audio is attached to that player's character in the scene, through a single `AudioListener` on the game camera, so a player on your left is heard on your left. Volume is full within 5 m, falls linearly to silence at 30 m, and connections are only held for players within 60 m. Those values live in [`src/voice/voiceConfig.js`](src/voice/voiceConfig.js). A small microphone badge appears over a speaking player's nameplate, driven by the audio actually arriving rather than by the existence of a connection. The chat panel lists nearby players with individual **Mute** and **Unmute** buttons; muting silences only that player's voice and leaves them connected and synchronised. Mute choices are kept in this browser, keyed by player id, which the server assigns per session.

### Playing with a friend over Tailscale

Voice connects directly between browsers, which works for most pairs but fails when both sides sit behind restrictive NAT. Rather than paying for a relay service, [Tailscale](https://tailscale.com/download) puts both machines on one flat private network where a direct connection always succeeds. It is free for personal use and needs no payment details.

Both of you install Tailscale and sign in -- either to the same account, or send a device-share invite from the admin console. Enable **MagicDNS** and **HTTPS Certificates** under [DNS in the admin console](https://login.tailscale.com/admin/dns); the certificate is what lets the browser grant a microphone at all. Then:

```bash
npm run dev      # in one terminal
npm run share    # in another
```

`npm run share` prints an `https://<machine>.<tailnet>.ts.net/` URL to send your friend. It is a real certificate, so the microphone prompt behaves normally, and only devices on your tailnet can reach it. `npm run share:stop` takes it down again. The helper is [`tools/share-tailnet.sh`](tools/share-tailnet.sh), and [`vite.config.js`](vite.config.js) allows the tailnet hostname through Vite's host check.

This is for playing with people you invite, not for public players; for those you still need either direct connectivity or a TURN relay.

Microphone access needs a secure context: `localhost` during development, HTTPS in production. By default the browser uses public STUN servers, which is enough for most home and office networks.

### Relay servers for restrictive networks

A minority of player pairs -- both behind symmetric NAT, typically mobile data or corporate networks -- cannot reach each other directly and need a TURN relay. The game asks its own server for relay credentials at `/api/turn` just before opening voice connections, so nothing long-lived is ever compiled into the browser bundle. With no relay configured the endpoint returns plain STUN and voice still works for everyone who does not need relaying.

To enable relaying with Cloudflare, create a TURN key in the Cloudflare dashboard and set these **server side** (note they are deliberately not prefixed `VITE_`, so they never reach the browser):

```bash
CLOUDFLARE_TURN_KEY_ID=<turn key id>
CLOUDFLARE_TURN_API_TOKEN=<that key's api token>
TURN_TTL_SECONDS=7200          # optional, 600-86400, default 7200
CLOUDFLARE_TURN_ENDPOINT=<url> # optional, only if the API path changes
```

On Vercel, add them under Project Settings then Environment Variables, and redeploy. The server mints credentials that expire after `TURN_TTL_SECONDS`, caches them until shortly before expiry so the provider's API is not called per player, and renews them during long sessions. A credential scraped from a running page stops working within hours, which is what keeps a stolen credential from being billed to your account. The minting code is [`api/_turn.js`](api/_turn.js), shared by both backends.

For a different provider, or a self-hosted [coturn](https://github.com/coturn/coturn), replace the minting function in that one file; nothing else changes. A fixed configuration can also be supplied at build time instead, though it is public once compiled in:

```bash
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=<username>
VITE_TURN_CREDENTIAL=<credential>
# or, for full control:
VITE_ICE_SERVERS='[{"urls":"turn:turn.example.com:3478","username":"u","credential":"c"}]'
```

Voice chat is verified on Chrome and Edge; the implementation is standards-based, so Firefox and Safari support can be improved from here. Voice is Phase 1: no phone calls, radio, vehicle channels, party voice, or recording.

The [Phase 1 source of truth](docs/PHASE_1_SOURCE_OF_TRUTH.md) records the original free-roam prototype scope. The current activity and progression update supersedes its former prohibition on activities, economy, and upgrades. The game is still a work in progress; the activity update has not been playtested.

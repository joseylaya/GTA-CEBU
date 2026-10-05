# Combat audio

Generated from `ogg-files/` with ffmpeg. Effects are mono Opus in an Ogg
container, trimmed of leading silence; there is no music track any more (it cost frames), so everything here is a short effect rather than
decoded. The source WAVs total 123 MB; what ships here is 5.9 MB.

Anything missing falls back to the synthesised sound, so a name with no file
still makes a noise.

## What each file is, and where it came from

| File                | Source            | Used for                          |
|---------------------|-------------------|-----------------------------------|
| `fire-pistol.ogg`   | `pistol.wav`      | sidearm; also the magnum, pitched down |
| `fire-smg.ogg`      | `cg1.wav`         | machine pistol; also the arc emitter, pitched up |
| `fire-rifle.ogg`    | `rifle.wav`       | pulse rifle; also the railgun, pitched down |
| `fire-shotgun.ogg`  | `shotgun.wav`     | scatter ray                       |
| `melee-knife.ogg`   | `attack_1.ogg`    | blade swing (one of two)          |
| `melee-knife-2.ogg` | `attack_2.ogg`    | blade swing (one of two)          |
| `hit.ogg`           | `hit_1.ogg`       | you land a shot                   |
| `kill.ogg`          | `bell.ogg`        | you eliminate someone             |
| `death.ogg`         | `hurt.ogg`        | you are eliminated                |
| `footstep.ogg`      | `02-footstep.ogg` | footfalls, pitched up when sprinting |

Still synthesised, because the pack has no recording for them:
`weapon-switch`, `reload`, `headshot`. Drop a file in with that name and it is
picked up automatically.

## Playback notes

Recordings are longer than the weapons that fire them — the rifle sample runs
1.9 s against a 120 ms cooldown. Each weapon therefore has a `hold` in
`WEAPON_SAMPLE` (`src/game.js`): the tail is faded at that point instead of
being left to stack a dozen overlapping copies. Adjust `hold` if a weapon
sounds either clipped or muddy in sustained fire.

Every shot also gets a small random pitch shift, so one sample does not sound
looped.

## Regenerating

    ffmpeg -i ogg-files/<in> -ac 1 -ar 48000 \
      -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.004" \
      -c:a libopus -b:a 72k public/audio/<name>.ogg      # effects

    ffmpeg -i ogg-files/<in> -ac 2 -ar 48000 -c:a libopus -b:a 88k \

No dynamic normalisation on effects: it pumps on short transients and flattens
the attack, which is the punch of a gunshot.

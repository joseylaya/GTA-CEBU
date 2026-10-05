// The one weapon table. It lives under src/ so the browser can import it and
// api/_ffa.js re-exports it for the server, because the previous arrangement --
// a hand-maintained copy in the client -- is exactly what left the magnum and
// the arc emitter unable to fire: they existed on the server, the client's copy
// had no entry, and every trigger pull bailed out at the lookup.
//
// Do not import this from the client via api/_ffa.js: the dev server answers
// /api/* with the API router, so that import 404s the whole game module.
// Headshot damage is a share of the 100-point health bar, set per weapon:
// the sniper and the sidearm kill outright, the rifle takes 80, and everything
// else takes half. Headshots ignore range falloff, so these are flat at any
// distance. The bazooka has no headshot at all -- a rocket resolves as a blast.
export const FFA_WEAPONS = Object.freeze({
  // A headshot kills outright, so the sidearm rewards precision over volume.
  pistol:  { damage:30, head:100, magazine:12, reserve:36, cooldown:300, reload:1050, range:55 },
  smg:     { damage:17, head:50,  magazine:30, reserve:90, cooldown:86,  reload:1900, range:45 },
  rifle:   { damage:25, head:80,  magazine:30, reserve:90, cooldown:120, reload:2200, range:75 },
  shotgun: { damage:80, head:50,  magazine:6,  reserve:24, cooldown:850, reload:650,  range:22 },
  // A hit anywhere is fatal: 100 health, so 110 leaves no survivors.
  sniper:  { damage:110,head:200, magazine:5,  reserve:20, cooldown:1100,reload:2700, range:140 },
  // Heavy sidearm: hits hard, few rounds, punishes a miss.
  magnum:  { damage:55, head:50,  magazine:6,  reserve:24, cooldown:480, reload:1500, range:65 },
  // Energy repeater: very fast, weak per shot, short reach.
  arc:     { damage:12, head:50,  magazine:40, reserve:120,cooldown:62,  reload:2100, range:38 },
  // Supply-drop only. A direct hit is fatal outright and the blast reaches
  // anyone standing near the impact, so it is never a loadout choice and never
  // sits in the armoury -- `dropOnly` is what keeps it out of both, on the
  // server as well as in the menus. Three rockets, one in the tube.
  bazooka: { damage:150,head:150, magazine:1,  reserve:2,  cooldown:1500,reload:2600, range:90,
             dropOnly:true, rocket:true, blastRadius:12, blastDamage:110 }
});

// Everything a player may actually choose. Anything flagged dropOnly has to be
// earned from a crate, so the pickers and the server's loadout check both read
// this rather than the full table.
export const FFA_LOADOUTS = Object.freeze(
  Object.keys(FFA_WEAPONS).filter(name => !FFA_WEAPONS[name].dropOnly));

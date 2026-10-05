// Shared by the renderer and both multiplayer backends.
export const MAP_ID='cebu-it-park-osm-2026-09';
export const WORLD={halfX:350,halfZ:440,origin:{lat:10.33005,lon:123.9069}};
export const SPAWN={x:-87.64,z:186.88};

// Where a supply crate may land. Chosen offline from the road network in
// src/data/it-park.json -- each one is the midpoint of a drivable segment at
// least 14m long, so a crate always lands on open tarmac rather than inside a
// building, and they sit at least 90m apart so consecutive drops are not all in
// the same street. Shared, because the server picks the zone and every client
// has to draw the aircraft flying to the same place.
export const FFA_DROP_ZONES=[
  {x:-71.8,z:52.1},{x:241.7,z:302.7},{x:-131.5,z:380.5},{x:-213.8,z:153.9},
  {x:-262.6,z:302.0},{x:128.4,z:353.4},{x:-55.7,z:252.9},{x:32.0,z:105.7},
  {x:-288.7,z:-68.9},{x:69.8,z:-398.6},{x:119.6,z:-13.0},{x:114.8,z:-137.8},
  {x:261.9,z:179.5},{x:4.1,z:-333.6}
];

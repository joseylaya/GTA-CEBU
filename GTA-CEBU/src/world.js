import * as THREE from 'three';
// Three's file cache is off by default, so every loader fetched the same
// texture again: the MegaKit buildings share one texture set, and a single
// 2MB normal map was being pulled six times. Turning it on de-duplicates every
// request by URL across every loader in the app.
THREE.Cache.enabled=true;
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD, district, driveSegments, nearestRoad, polygonCenter, projectOnSegment, landmarks } from './geography.js';
import { places, placeStyle } from './places.js';
export { WORLD };
export const solids=[],solidMeshes=[];
const cells=new Map(),CELL=32,geometry=new THREE.BoxGeometry(1,1,1);
const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
export function box(parent,x,y,z,w,h,d,material,cast=true){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=cast;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
export function insidePolygon(x,z,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function addSolid(s){solids.push(s);for(let x=Math.floor((s.x-s.w/2)/CELL);x<=Math.floor((s.x+s.w/2)/CELL);x++)for(let z=Math.floor((s.z-s.d/2)/CELL);z<=Math.floor((s.z+s.d/2)/CELL);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(s);}}
for(const b of district.buildings){const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);addSolid({x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2,w:Math.max(...xs)-Math.min(...xs),d:Math.max(...zs)-Math.min(...zs),points:b.points,name:b.name});}
export function collides(x,z,r=1){
  if(x-r< -WORLD.halfX+1||x+r>WORLD.halfX-1||z-r< -WORLD.halfZ+1||z+r>WORLD.halfZ-1)return true;
  const candidates=new Set();for(let cx=Math.floor((x-r)/CELL);cx<=Math.floor((x+r)/CELL);cx++)for(let cz=Math.floor((z-r)/CELL);cz<=Math.floor((z+r)/CELL);cz++)for(const s of cells.get(cx+','+cz)||[])candidates.add(s);
  for(const s of candidates){if(Math.abs(x-s.x)>=s.w/2+r||Math.abs(z-s.z)>=s.d/2+r)continue;if(!s.points||insidePolygon(x,z,s.points))return true;for(let i=0;i<s.points.length;i++){const a=s.points[i],b=s.points[(i+1)%s.points.length],q=projectOnSegment({x,z},{x:a[0],z:a[1]},{x:b[0],z:b[1]});if(Math.hypot(x-q.x,z-q.z)<r)return true;}}
  return false;
}
export function lineBlocked(ax,az,bx,bz){const steps=Math.ceil(Math.hypot(bx-ax,bz-az)/2);for(let i=1;i<steps;i++)if(collides(ax+(bx-ax)*i/steps,az+(bz-az)*i/steps,.1))return true;return false;}
// A razor-sharp 90-degree edge is what makes an extrusion read as a box. A small
// bevel catches the light along every corner and softens the silhouette; the
// negative offset keeps the footprint exactly where the OSM polygon put it, so
// collision and street alignment are unaffected.
function polygonMesh(points,height,materials,bevel=.22){const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelOffset:-bevel,bevelSegments:1,curveSegments:1});geo.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geo,materials);mesh.receiveShadow=true;mesh.castShadow=height>1;return mesh;}
function ribbon(vertices,a,b,width,y){const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.01)return;const nx=-dz/length*width/2,nz=dx/length*width/2,p=[[a.x+nx,y,a.z+nz],[a.x-nx,y,a.z-nz],[b.x+nx,y,b.z+nz],[b.x-nx,y,b.z-nz]];for(const i of [0,2,1,1,2,3])vertices.push(...p[i]);}
function drawRibbons(scene,vertices,material){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/12,vertices[i+2]/12);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;scene.add(mesh);}
function roadJunctions(scene,segments,material,extra,y){
  const points=new Map();for(const s of segments)for(const p of [s.a,s.b]){const key=p.x.toFixed(2)+','+p.z.toFixed(2);points.set(key,{x:p.x,z:p.z,r:Math.max(points.get(key)?.r||0,(s.width+extra)/2)});}
  const mesh=new THREE.InstancedMesh(new THREE.CircleGeometry(1,12),material,points.size),dummy=new THREE.Object3D();let index=0;
  for(const p of points.values()){dummy.position.set(p.x,y,p.z);dummy.rotation.x=-Math.PI/2;dummy.scale.set(p.r,p.r,1);dummy.updateMatrix();mesh.setMatrixAt(index++,dummy.matrix);}
  mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;scene.add(mesh);
}
function sign(parent,text,x,y,z,width,color='#f4d18a',target=null){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#122c34';ctx.fillRect(0,0,1024,128);ctx.fillStyle=color;ctx.fillRect(0,117,1024,11);ctx.font='700 49px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,61,980);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width/8),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(x,y,z);if(target)mesh.lookAt(target.x,y,target.z);parent.add(mesh);return mesh;
}
function boundaryNear(points,target){let best=null;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],q=projectOnSegment(target,{x:a[0],z:a[1]},{x:b[0],z:b[1]}),d=Math.hypot(q.x-target.x,q.z-target.z);if(!best||d<best.distance)best={...q,distance:d,length:Math.hypot(a[0]-b[0],a[1]-b[1]),a,b};}return best;}
function streetTarget(place){
  const p={x:place.point[0],z:place.point[1]};
  if(!place.street)return nearestRoad(p);
  let best=null;for(const s of driveSegments.filter(s=>s.name===place.street)){const q=projectOnSegment(p,s.a,s.b),d=Math.hypot(q.x-p.x,q.z-p.z);if(!best||d<best.distance)best={...q,distance:d};}
  return best||nearestRoad(p);
}
function entrance(scene,front,target,label,width,style){
  const outward=new THREE.Vector2(target.x-front.x,target.z-front.z).normalize();
  if(!Number.isFinite(outward.x))return;
  const group=new THREE.Group();group.position.set(front.x+outward.x*.4,0,front.z+outward.y*.4);group.rotation.y=Math.atan2(outward.x,outward.y);scene.add(group);
  const w=Math.min(width,Math.max(2.6,front.length*.7)),dark=mat(0x172d32),metal=mat(0x829396,.5),glass=new THREE.MeshStandardMaterial({color:0x81b6bd,metalness:.25,roughness:.15,transparent:true,opacity:.77}),warm=new THREE.MeshBasicMaterial({color:0xe1bb7b});
  box(group,0,1.55,.02,w,3.1,.14,dark,false);
  box(group,0,1.45,.13,w-0.32,2.6,.06,warm,false);
  box(group,-w*.25,1.42,.25,w*.48,2.55,.08,glass,false);box(group,w*.25,1.42,.25,w*.48,2.55,.08,glass,false);
  for(const x of [-w/2,0,w/2])box(group,x,1.55,.32,.07,3.1,.1,metal,false);
  box(group,0,2.8,.32,w,.09,.12,metal,false);box(group,0,.18,.8,w+.7,.18,1.2,mat(0x9c9c8d),false);
  box(group,0,3.35,.48,w+.45,.3,1.25,mat(style?.background||0x304750),false);
  const c=document.createElement('canvas');c.width=1024;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle=style?.background||'#18333b';ctx.fillRect(0,0,1024,160);ctx.fillStyle=style?.foreground||'#f3e1b4';ctx.font='bold 68px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,512,80,940);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,1.02),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));panel.position.set(0,3.54,1.11);group.add(panel);
  // A curved glass canopy on steel columns, the way these lobbies actually look
  // from the forecourt. The curve is real geometry -- a cylinder segment -- so
  // the silhouette is not another box.
  const reach=Math.max(3.4,w*.42);
  const canopyGeo=new THREE.CylinderGeometry(reach,reach,w+1.8,20,1,true,0,Math.PI*.42);
  canopyGeo.rotateZ(Math.PI/2);
  const canopyMat=new THREE.MeshStandardMaterial({color:0x9fb6c2,metalness:.72,roughness:.16,
    side:THREE.DoubleSide,transparent:true,opacity:.72});
  const canopy=new THREE.Mesh(canopyGeo,canopyMat);
  // Pivot so the shell springs from the facade and sweeps out over the entrance.
  canopy.position.set(0,4.1,.3);canopy.rotation.y=Math.PI/2;canopy.rotation.x=-Math.PI*.30;
  group.add(canopy);
  const steel=mat(0x7d8b90,.45);
  for(const dir of [-1,1]){
    // Column plus the diagonal brace that carries the canopy edge.
    const column=new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,4.5,10),steel);
    column.position.set(dir*(w/2+.5),2.25,reach*.72);group.add(column);
    const brace=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,reach*1.05,6),steel);
    brace.position.set(dir*(w/2+.5),3.5,reach*.36);brace.rotation.x=Math.PI/2.6;group.add(brace);
  }
  // Paved forecourt, so the entrance does not sit straight on grass.
  const apron=new THREE.Mesh(new THREE.PlaneGeometry(w+5,reach*1.9),
    new THREE.MeshStandardMaterial({color:0xb9b7ad,roughness:.92}));
  apron.rotation.x=-Math.PI/2;apron.position.set(0,.03,reach*.85);group.add(apron);
}
function surfaceTexture(base,variation){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');
  c.fillStyle=base;c.fillRect(0,0,128,128);
  let seed=7919;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1800;i++){const shade=Math.round(random()*variation);c.fillStyle=`rgba(${shade},${shade},${shade},${.035+random()*.055})`;c.fillRect(random()*128,random()*128,1+random()*3,1+random()*3);}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
// --- Facades -----------------------------------------------------------
// The footprints and heights are real OpenStreetMap data, so the buildings are
// already the right shape. What made them read as toys was the surface: every
// one of the 140 shared a single window texture and took its colour from its
// index in an array, so a 164m glass tower looked like a corner shop.
//
// These build one texture per building type instead, tiled to a real floor
// height. ExtrudeGeometry's side UVs are already in metres, so repeat is set
// in metres and every building scales correctly without per-building work.
//
// Each style also renders a second, emissive-only copy with the windows lit, so
// the district can come alive after dark.
// Colours are matched to photographs of the real Cebu IT Park rather than
// invented. Two references were used (viewed for colour only, nothing traced or
// copied): a daytime drone view of the Jose Maria Del Mar side by Patrick Roque,
// and a night view over Garden Bloc by Martin Michlmayr, both CC BY-SA 4.0 on
// Wikimedia Commons.
//
// What those photos actually show, and what the old palette got wrong:
//  - The towers are DARK. Charcoal, bronze and blue-grey curtain wall, framed
//    by mid-grey concrete. An earlier pass read them as white, which came from
//    a single bright midday drone shot; at street level and at night they are
//    clearly dark glass, and white made the district look like polystyrene.
//  - Glass dominates. Concrete is the frame around it, not the main surface.
//  - At night the towers are mostly DARK with a scatter of lit windows. The
//    bright element in a night view is the street, not the buildings.
const FLOOR_HEIGHT={office:3.7,apartment:3.05,retail:4.4,plain:3.2};
// Fraction of windows lit after dark, and the colour of that light.
const NIGHT_LIGHT={
  office:   {density:.26,warm:'#ffe6b4',cool:'#dceaf2'},
  apartment:{density:.22,warm:'#ffce82',cool:'#ffe6b8'},
  retail:   {density:.55,warm:'#ffe0a8',cool:'#fff0cc'},
  plain:    {density:.18,warm:'#ffd79a',cool:'#ffe6b8'}
};

function facadeCanvas(style,lit){
  const floors=4,canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=64*floors;
  const c=canvas.getContext('2d'),W=256;
  const night=NIGHT_LIGHT[style];
  c.fillStyle=lit?'#000':({office:'#6b767b',apartment:'#8b897f',retail:'#6d7476',plain:'#787e79'})[style];
  c.fillRect(0,0,W,canvas.height);
  let seed=style.length*7919+13;
  const rnd=()=>((seed=seed*1103515245+12345&0x7fffffff)/0x7fffffff);
  for(let floor=0;floor<floors;floor++){
    const y=floor*64;
    if(style==='office'){
      // A continuous glazing ribbon between bright slab edges: the single most
      // recognisable thing about this skyline.
      const glassTop=y+8,glassH=48;
      if(lit){
        // Individual bays, never a full-width bar. Lighting the whole floor edge
        // to edge turned every tower into a blazing white stripe, which is the
        // opposite of the reference photos: there the towers are mostly dark and
        // the street carries the light.
        for(let bay=0;bay<8;bay++){
          if(rnd()>=night.density)continue;
          const x=bay*32+3;
          c.fillStyle=rnd()<.3?night.warm:night.cool;
          // Only part of the bay's height, so it reads as a room not a strip.
          const top=glassTop+4+Math.floor(rnd()*6),h=glassH-10-Math.floor(rnd()*6);
          c.fillRect(x,top,26,Math.max(10,h));
        }
      }else{
        c.fillStyle='#3a4e5a';c.fillRect(0,glassTop,W,glassH);          // blue-grey glass
        c.fillStyle='#55707e';c.fillRect(0,glassTop,W,14);               // sky reflection
        c.fillStyle='#5d666a';c.fillRect(0,y,W,6);                       // slab edge, thin
        c.fillStyle='#454d51';c.fillRect(0,y+6,W,2);
        c.fillStyle='#4e585c';c.fillRect(0,y+56,W,8);                    // spandrel
        for(let m=0;m<8;m++){c.fillStyle='#3b464c';c.fillRect(m*32,glassTop,2,glassH);}
      }
    }else if(style==='apartment'){
      for(let col=0;col<3;col++){
        const x=col*85+14;
        if(lit){if(rnd()<night.density){c.fillStyle=rnd()<.5?night.warm:night.cool;c.fillRect(x+4,y+10,40,24);}}
        else{
          c.fillStyle='#232d33';c.fillRect(x+2,y+8,44,28);
          c.fillStyle='#374a52';c.fillRect(x+2,y+8,44,9);
          c.fillStyle='#8b8880';c.fillRect(x-6,y+36,58,7);
          c.fillStyle='#6d6a63';c.fillRect(x-6,y+41,58,2);
        }
      }
      if(!lit){c.fillStyle='#78756d';c.fillRect(0,y+55,W,8);}
    }else if(style==='retail'){
      if(lit){if(rnd()<night.density){c.fillStyle=night.warm;c.fillRect(8,y+20,240,30);}}
      else{
        c.fillStyle='#1e2a31';c.fillRect(8,y+18,240,34);
        c.fillStyle='#31474f';c.fillRect(8,y+18,240,10);
        c.fillStyle='#767c7c';c.fillRect(0,y,W,10);
        c.fillStyle='#636a6a';c.fillRect(0,y+54,W,9);
        for(let m=0;m<5;m++){c.fillStyle='#6d7679';c.fillRect(m*52+8,y+18,3,34);}
      }
    }else{
      for(let col=0;col<3;col++){
        const x=col*85+22;
        if(lit){if(rnd()<night.density){c.fillStyle=night.warm;c.fillRect(x+3,y+14,30,22);}}
        else{
          c.fillStyle='#28353b';c.fillRect(x,y+12,36,26);
          c.fillStyle='#7b7f7a';c.fillRect(x-3,y+9,42,3);
        }
      }
      if(!lit){c.fillStyle='#6f736e';c.fillRect(0,y+55,W,8);}
    }
  }
  const t=new THREE.CanvasTexture(canvas);
  t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;
  t.repeat.set(1/8,1/(FLOOR_HEIGHT[style]*4));
  return t;
}

// Subtle only. The real district is this monochrome; strong tints would undo
// the point of matching the photographs.
const FACADE_TINTS={
  // No pure white: 0xffffff leaves the texture at full brightness, which is
  // what kept turning the district into polystyrene.
  office:[0xb4bfc4,0x93a3ac,0xa8907a],
  apartment:[0xada79a,0x9c9a90,0xb0b5b1],
  retail:[0xa8adad,0x969b9b,0xa39a8c],
  plain:[0xa9a89e,0x97998f,0xa2a8a3]
};
const facadeMaterials=new Map();
const facadeMaps=new Map();
function facadeMaterial(style,tint=0){
  const key=`${style}:${tint}`;
  if(facadeMaterials.has(key))return facadeMaterials.get(key);
  // The textures are the expensive part, so build them once per style and share
  // them across that style's tints.
  if(!facadeMaps.has(style))facadeMaps.set(style,{map:facadeCanvas(style,false),lit:facadeCanvas(style,true)});
  const maps=facadeMaps.get(style);
  const material=new THREE.MeshStandardMaterial({
    map:maps.map,
    emissiveMap:maps.lit,
    color:new THREE.Color(FACADE_TINTS[style][tint%FACADE_TINTS[style].length]),
    emissive:new THREE.Color(0xffffff),
    emissiveIntensity:0,
    // Glass is a dielectric, not a metal. High metalness tints the reflection by
    // the base colour, so a near-black base swallowed the sky and the towers came
    // out matte black. Low metalness keeps the specular reflection white, which
    // is what makes curtain wall look like glass.
    roughness:style==='office'?.19:.72,
    metalness:style==='office'?.06:.04,
    envMapIntensity:style==='office'?1.0:.7
  });
  facadeMaterials.set(key,material);
  return material;
}
// Stable per building, so a block does not reshuffle itself on every load.
function facadeTint(building){
  const key=String(building.id??building.name??'');
  let hash=0;for(let i=0;i<key.length;i++)hash=(hash*31+key.charCodeAt(i))>>>0;
  return hash%3;
}
// Which surface a building wears, from the OSM tag and its height. The tag is
// free data that was previously ignored entirely.
function facadeStyleFor(building){
  const kind=building.kind,h=building.height||0;
  if(kind==='apartments'||kind==='residential')return 'apartment';
  if(kind==='retail'||kind==='commercial'&&h<14)return 'retail';
  if(kind==='office'||kind==='hotel'||kind==='commercial'||h>=25)return 'office';
  return h<7?'retail':'plain';
}
// Windows light up after dark. Driven by the same daylight value the sky uses.
export function setFacadeNight(amount){
  const lit=Math.max(0,Math.min(1,amount));
  for(const material of facadeMaterials.values())material.emissiveIntensity=lit*1.35;
}

// The kit has three fully modelled buildings -- ledges, mullions, glass and fake
// interiors behind the windows. An extruded polygon can never look like that, so
// wherever a real footprint is close to a model's proportions, the flat shell is
// swapped for the model. The shell stays in the scene, hidden, because it is
// what bullets and collision already use.
const KIT_BUILDINGS=[
  {file:'Building_Large_2',      w:20.6,h:28,d:16.6},
  {file:'Building_Medium_2_001', w:15.1,h:25,d:13.1},
  {file:'Building_Small_1',      w:12.5,h:17,d:14.5}
];
const KIT_LIMIT=22;   // capped: each model is a dozen draw calls
function placeKitBuildings(scene,extruded){
  const loader=new GLTFLoader();
  // Candidates: mid-rise, roughly rectangular, and big enough to host a model.
  const candidates=[];
  for(const [b,mesh] of extruded){
    const h=b.height;
    if(h<13||h>34)continue;
    const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);
    const w=Math.max(...xs)-Math.min(...xs),d=Math.max(...zs)-Math.min(...zs);
    if(w<11||d<11||w>34||d>34)continue;
    const ratio=Math.max(w,d)/Math.min(w,d);
    if(ratio>1.9)continue;                 // long slabs would distort a model
    candidates.push({b,mesh,w,d,h,centre:polygonCenter(b.points)});
  }
  candidates.sort((a,c)=>c.h-a.h);
  const chosen=candidates.slice(0,KIT_LIMIT);
  if(!chosen.length)return Promise.resolve([]);
  return Promise.all(KIT_BUILDINGS.map(spec=>new Promise(resolve=>{
    loader.load(`/models/megakit/${spec.file}.gltf`,gltf=>{
      const mine=chosen.filter((_,i)=>i%KIT_BUILDINGS.length===KIT_BUILDINGS.indexOf(spec));
      for(const site of mine){
        const copy=gltf.scene.clone(true);
        // Align the model's long side with the footprint's long side.
        const turn=(site.w>=site.d)===(spec.w>=spec.d)?0:Math.PI/2;
        const fitW=turn?spec.d:spec.w,fitD=turn?spec.w:spec.d;
        // Scale to sit inside the footprint, then respect the real height.
        const scale=Math.min(site.w/fitW,site.d/fitD,site.h/spec.h);
        copy.scale.setScalar(scale);
        copy.position.set(site.centre.x,0,site.centre.z);
        copy.rotation.y=turn;
        copy.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
        scene.add(copy);
        // Hide the flat shell but leave it for collision and bullet stops.
        site.mesh.visible=false;
      }resolve(true);
    },undefined,error=>{console.warn('MegaKit building unavailable:',spec.file,error);resolve(false);});
  })));
}

function loadMegaKit(scene){
  const loader=new GLTFLoader(),base='/models/megakit/';
  const place=(asset,x,y,z,scale=1,turn=0)=>{
    const copy=asset.clone(true);copy.position.set(x,y,z);copy.scale.setScalar(scale);copy.rotation.y=turn;
    copy.traverse(child=>{if(child.isMesh){child.castShadow=scale>1;child.receiveShadow=true;}});
    scene.add(copy);return copy;
  };
  const tasks=[];
  tasks.push(new Promise(resolve=>loader.load(base+'Prop_Planter_Single.gltf',gltf=>{
    let count=0;for(const [index,s] of driveSegments.entries()){
      if(index%17!==0||count>=16)continue;
      const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<25)continue;
      const side=index%2?1:-1,x=(s.a.x+s.b.x)/2-(s.b.z-s.a.z)/length*(s.width/2+3)*side,z=(s.a.z+s.b.z)/2+(s.b.x-s.a.x)/length*(s.width/2+3)*side;
      if(collides(x,z,1.5))continue;
      place(gltf.scene,x,.08,z,1.3,index*.7);addSolid({x,z,w:2.6,d:2.6});count++;
    }
    resolve(true);
  },undefined,error=>{
    console.warn('MegaKit planters unavailable:',error);resolve(false);
  })));
  tasks.push(new Promise(resolve=>loader.load(base+'Prop_Bollard.gltf',gltf=>{
    let count=0;for(const [index,s] of driveSegments.entries()){
      if(index%19!==0||count>=24)continue;
      const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<18)continue;
      const side=index%2?1:-1,x=(s.a.x+s.b.x)/2-(s.b.z-s.a.z)/length*(s.width/2+1.2)*side,z=(s.a.z+s.b.z)/2+(s.b.x-s.a.x)/length*(s.width/2+1.2)*side;
      if(collides(x,z,.5))continue;place(gltf.scene,x,.08,z,1.15);count++;
    }
    resolve(true);
  },undefined,error=>{
    console.warn('MegaKit bollards unavailable:',error);resolve(false);
  })));
  tasks.push(new Promise(resolve=>loader.load(base+'Prop_ManholeCover.gltf',gltf=>{
    let count=0;for(const [index,s] of driveSegments.entries()){
      if(index%23!==0||count>=18||s.width<7)continue;
      const x=(s.a.x+s.b.x)/2,z=(s.a.z+s.b.z)/2;if(collides(x,z,1))continue;
      place(gltf.scene,x,.11,z,1.15,index*.3);count++;
    }
    resolve(true);
  },undefined,error=>{
    console.warn('MegaKit street details unavailable:',error);resolve(false);
  })));
  tasks.push(new Promise(resolve=>loader.load(base+'Prop_ACUnit.gltf',gltf=>{
    for(const b of district.buildings.filter(b=>!b.name&&b.height>10).slice(0,12)){
      const center=polygonCenter(b.points);if(insidePolygon(center.x,center.z,b.points))place(gltf.scene,center.x,b.height+.12,center.z,2,b.id%6);
    }
    resolve(true);
  },undefined,error=>{
    console.warn('MegaKit rooftop details unavailable:',error);resolve(false);
  })));
  return Promise.all(tasks);
}
// The Cebu I.T. Park entrance arch on Jose Maria Del Mar Avenue: the most
// recognisable structure in the district and the thing people photograph. It is
// deliberately not built from boxes -- the face is a single extruded profile
// with three real arched openings cut through it, so the curves are geometry
// rather than a texture.
function buildItParkArch(scene){
  // HEIGHT must clear the crown of the central opening. At 9.6 the arch head
  // (springing 6.2 + radius 5.5 = 11.7) poked out through the top of the wall,
  // which leaves the hole open-ended and collapses the whole face to a slab.
  const SPAN=27,HEIGHT=11.8,DEPTH=2.4;
  const pierW=4.6,sideW=3.4,openW=11;
  const face=new THREE.Shape();
  face.moveTo(-SPAN/2,0);face.lineTo(SPAN/2,0);face.lineTo(SPAN/2,HEIGHT);face.lineTo(-SPAN/2,HEIGHT);face.closePath();

  // Central carriageway opening: straight jambs into a semicircular head.
  const centre=new THREE.Path();
  const cH=4.0,cR=openW/2;   // crown lands at 9.5, leaving a 2.3m spandrel
  centre.moveTo(-cR,0);centre.lineTo(-cR,cH);
  centre.absarc(0,cH,cR,Math.PI,0,true);
  centre.lineTo(cR,0);centre.closePath();
  face.holes.push(centre);

  // Two footway openings either side, same treatment at a smaller scale.
  for(const dir of [-1,1]){
    const x=dir*(cR+pierW*.5+sideW*.5+.6),r=sideW/2,h=3.2;   // crown at 4.9
    const side=new THREE.Path();
    side.moveTo(x-r,0);side.lineTo(x-r,h);
    side.absarc(x,h,r,Math.PI,0,true);
    side.lineTo(x+r,0);side.closePath();
    face.holes.push(side);
  }

  const stone=new THREE.MeshStandardMaterial({color:0xf3efe4,roughness:.82,metalness:.02});
  const tile=new THREE.MeshStandardMaterial({color:0xa8402c,roughness:.68,metalness:.02});
  const trimM=new THREE.MeshStandardMaterial({color:0xe6dfcd,roughness:.75});

  // bevelOffset must stay at 0 here. A negative offset (used on the buildings to
  // keep their footprints exactly on the OSM polygon) silently fills any hole in
  // the shape, which turned this arch into a solid slab.
  const geo=new THREE.ExtrudeGeometry(face,{depth:DEPTH,bevelEnabled:true,bevelThickness:.1,bevelSize:.1,bevelOffset:0,bevelSegments:1,curveSegments:14});
  geo.translate(0,0,-DEPTH/2);
  const arch=new THREE.Group();
  arch.add(new THREE.Mesh(geo,stone));

  // Red tiled roof: a shallow gable that overhangs, as in the photograph.
  for(const dir of [-1,1]){
    const slope=new THREE.Mesh(new THREE.BoxGeometry(SPAN+2.6,.26,2.0),tile);
    // Pivot each slope about the ridge so the two halves actually meet.
    slope.position.set(0,HEIGHT+.62+Math.sin(.36)*.95,dir*Math.cos(.36)*.95);
    slope.rotation.x=-dir*.36;
    arch.add(slope);
  }
  const ridge=new THREE.Mesh(new THREE.BoxGeometry(SPAN+2.8,.26,.44),tile);
  ridge.position.set(0,HEIGHT+.62+Math.sin(.36)*1.9,0);arch.add(ridge);
  // A cornice under the roof so it does not float.
  const cornice=new THREE.Mesh(new THREE.BoxGeometry(SPAN+1.2,.5,DEPTH+.9),trimM);
  cornice.position.set(0,HEIGHT+.3,0);arch.add(cornice);

  // Pier caps, also tiled.
  for(const dir of [-1,1]){
    const cap=new THREE.Mesh(new THREE.BoxGeometry(pierW+1.6,.6,DEPTH+1.4),tile);
    cap.position.set(dir*(SPAN/2-pierW/2),HEIGHT+1.5,0);arch.add(cap);
  }

  // The green roundel, on both faces.
  for(const dir of [-1,1]){
    const disc=new THREE.Mesh(new THREE.CircleGeometry(.92,24),new THREE.MeshStandardMaterial({color:0x3fae49,roughness:.5}));
    disc.position.set(-2.4,HEIGHT-1.5,dir*(DEPTH/2+.02));
    if(dir<0)disc.rotation.y=Math.PI;
    arch.add(disc);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.92,1.12,24),trimM);
    ring.position.copy(disc.position);ring.rotation.copy(disc.rotation);
    arch.add(ring);
  }

  // Recessed panels along the spandrel, the detail that reads at a distance.
  for(let i=-4;i<=4;i++){
    if(Math.abs(i)<3)continue;   // the carriageway opening spans +/-5.5m
    for(const dir of [-1,1]){
      const panel=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,.12),trimM);
      panel.position.set(i*2.35,HEIGHT-2.3,dir*(DEPTH/2+.01));
      arch.add(panel);
    }
  }

  // Place it across the southern entrance, square to the carriageway.
  // Snap to the centre of the carriageway. Placing it by eye put it 7m off the
  // centreline of a 10m road, so the traffic ran through a pier.
  const road=nearestRoad({x:292,z:-417});
  const heading=road?Math.atan2(road.segment.b.x-road.segment.a.x,road.segment.b.z-road.segment.a.z):0;
  const at=road?{x:road.x,z:road.z}:{x:292,z:-417};
  arch.position.set(at.x,0,at.z);
  arch.rotation.y=heading;
  arch.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
  scene.add(arch);
  sign(arch,'CEBU I.T. PARK',-.2,HEIGHT-1.5,DEPTH/2+.06,7.6,'#2f6f3a');

  // Only the piers block movement; you drive and walk through the openings.
  for(const dir of [-1,1]){
    const px=at.x+Math.cos(heading)*dir*(SPAN/2-pierW/2);
    const pz=at.z-Math.sin(heading)*dir*(SPAN/2-pierW/2);
    addSolid({x:px,z:pz,w:pierW,d:DEPTH+.6});
  }
  return arch;
}

export function createDistrict(scene){
  // Extruded shells, kept so MegaKit models can replace the ones they fit.
  const extruded=new Map();
  scene.background=new THREE.Color(0x92b6b5);scene.fog=new THREE.Fog(0x92b6b5,230,1000);
  const ambient=new THREE.HemisphereLight(0xe4f1f2,0x52694f,2);scene.add(ambient);const sun=new THREE.DirectionalLight(0xffe4b4,2.4);sun.position.set(-260,480,160);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-450,right:450,top:490,bottom:-490,near:1,far:1100});sun.shadow.bias=-.0003;scene.add(sun);
  const pavement=new THREE.MeshStandardMaterial({map:surfaceTexture('#b8b8ad',55),roughness:1});
  const asphalt=new THREE.MeshStandardMaterial({map:surfaceTexture('#465158',50),roughness:.98});
  const grassTexture=surfaceTexture('#748d68',80);grassTexture.repeat.set(44,55);
  const grass=new THREE.MeshStandardMaterial({map:grassTexture,roughness:1});
  const roof=mat(0x4d5457),trim=mat(0x304750),bark=mat(0x796047),leaf=mat(0xffffff);
  box(scene,0,-.6,0,WORLD.halfX*2+30,1,WORLD.halfZ*2+30,grass,false);
  for(const park of district.parks){const mesh=polygonMesh(park.points,.12,mat(park.name==='Garden Bloc'?0x729966:0x819970));mesh.position.y=-.04;scene.add(mesh);}
  const streetVertices=[],walkVertices=[],lineVertices=[];
  for(const s of driveSegments){ribbon(walkVertices,s.a,s.b,s.width+5,.035);ribbon(streetVertices,s.a,s.b,s.width,.075);const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,length=Math.hypot(dx,dz);if(s.width>=8)for(let d=2;d<length-2;d+=10){const end=Math.min(length-1,d+3.5);ribbon(lineVertices,{x:s.a.x+dx*d/length,z:s.a.z+dz*d/length},{x:s.a.x+dx*end/length,z:s.a.z+dz*end/length},.17,.095);}}
  drawRibbons(scene,walkVertices,pavement);roadJunctions(scene,driveSegments,pavement,5,.036);
  drawRibbons(scene,streetVertices,asphalt);roadJunctions(scene,driveSegments,asphalt,0,.076);
  drawRibbons(scene,lineVertices,mat(0xe2d8ae));
  // Facades now come from the building's own OSM type, not its array index.
  for(const [index,b] of district.buildings.entries()){
    const h=b.height,center=polygonCenter(b.points);
    const mesh=polygonMesh(b.points,h,[roof,facadeMaterial(facadeStyleFor(b),facadeTint(b))]);scene.add(mesh);solidMeshes.push(mesh);
    extruded.set(b,mesh);
    // A tower's base is shops and lobbies, not more curtain wall. Give anything
    // tall a short retail podium, pushed out slightly so it reads as a separate
    // volume instead of z-fighting with the shaft above it.
    if(h>=24){
      const lip=b.points.map(([x,z])=>[center.x+(x-center.x)*1.035,center.z+(z-center.z)*1.035]);
      const podium=polygonMesh(lip,Math.min(7.5,h*.22),[roof,facadeMaterial('retail',facadeTint(b))]);
      // Lift a hair so its underside is not coplanar with the tower's own base.
      podium.position.y=.02;scene.add(podium);
    }
    const road=nearestRoad(center),front=boundaryNear(b.points,road),normal=new THREE.Vector2(road.x-front.x,road.z-front.z).normalize();
    if(b.name&&landmarks.some(p=>p.name===b.name))entrance(scene,front,road,b.name,Math.min(13,Math.max(6,front.length*.6)));
    if(b.name&&h>15)box(scene,center.x,h+.7,center.z,5,1.4,4,trim);
    if(b.name==='The Pyramid'){const pyramid=new THREE.Mesh(new THREE.ConeGeometry(12,14,4),new THREE.MeshStandardMaterial({color:0x769baf,metalness:.3,roughness:.3}));pyramid.position.set(center.x,h+7,center.z);pyramid.rotation.y=Math.PI/4;scene.add(pyramid);}
    if(b.name==='Avída Towers Riala'||b.name==='Avida Towers Cebu'){
      let count=0;const desired=b.name.includes('Riala')?5:2;
      for(let z=center.z-65;z<center.z+70&&count<desired;z+=42)for(let x=center.x-50;x<center.x+60&&count<desired;x+=40){if(![[-12,-12],[12,-12],[-12,12],[12,12]].every(([dx,dz])=>insidePolygon(x+dx,z+dz,b.points)))continue;box(scene,x,h+37+count*2,z,23,74+count*4,25,facadeMaterial('apartment',facadeTint(b)));count++;}
    }
  }
  // Rooftops. Seen from a tower window or the air, every roof was a bare grey
  // plane; the real ones carry plant rooms, chillers, water tanks and a parapet.
  // Instanced so a few hundred boxes cost one draw call each.
  const roofKit=district.buildings.filter(b=>b.height>=14);
  if(roofKit.length){
    const place=new THREE.Object3D();
    const plantMat=mat(0x6e7477),tankMat=mat(0x878c8b),parapetMat=mat(0x5a6164);
    const units=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),plantMat,roofKit.length*3);
    const tanks=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,8),tankMat,roofKit.length);
    let u=0,t=0;
    for(const b of roofKit){
      const c=polygonCenter(b.points);
      const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);
      const halfW=Math.max(2,(Math.max(...xs)-Math.min(...xs))/2),halfD=Math.max(2,(Math.max(...zs)-Math.min(...zs))/2);
      const seed=Math.abs(Math.floor(c.x*13+c.z*7));
      // Keep the clutter well inside the footprint so nothing overhangs an edge.
      const inset=.45;
      for(let k=0;k<3;k++){
        const r1=((seed+k*97)%100)/100,r2=((seed+k*57)%100)/100,r3=((seed+k*31)%100)/100;
        const w=1.6+r1*3.2,d=1.4+r2*2.6,h=1.1+r3*1.9;
        place.position.set(c.x+(r1-.5)*halfW*inset*2,b.height+h/2,c.z+(r2-.5)*halfD*inset*2);
        place.scale.set(w,h,d);place.rotation.set(0,r3*1.57,0);place.updateMatrix();
        units.setMatrixAt(u++,place.matrix);
      }
      const rt=((seed*7)%100)/100;
      const tr=.9+rt*.7,th=1.8+rt*1.4;
      place.position.set(c.x-(rt-.5)*halfW*.7,b.height+th/2,c.z+(rt-.5)*halfD*.7);
      place.scale.set(tr,th,tr);place.rotation.set(0,0,0);place.updateMatrix();
      tanks.setMatrixAt(t++,place.matrix);
      // A low parapet: the lip that stops a roof reading as a cut-off box.
      // Inset properly and lift clear of the roof cap. At 0.995 the parapet wall
      // was within millimetres of the facade and its underside was exactly on
      // the roof, so both z-fought and shimmered.
      const lip=b.points.map(([x,z])=>[c.x+(x-c.x)*.965,c.z+(z-c.z)*.965]);
      const parapet=polygonMesh(lip,.9,[parapetMat,parapetMat],0);
      parapet.position.y=b.height+.04;scene.add(parapet);
    }
    place.rotation.set(0,0,0);
    units.castShadow=tanks.castShadow=true;scene.add(units,tanks);
  }
  const signedBuildings=new Map(),storeFronts=[];
  const shopKinds=new Set(['cafe','coffee','restaurant','fast_food','food_court','bakery','convenience','pharmacy','bank','supermarket']);
  for(const place of places.filter(p=>shopKinds.has(p.kind)).sort((a,b)=>placeStyle(b.name,b.kind).priority-placeStyle(a.name,a.kind).priority)){
    const b=place.building?district.buildings.find(b=>b.name===place.building):district.buildings.find(b=>insidePolygon(...place.point,b.points));if(!b)continue;
    const style=placeStyle(place.name,place.kind),count=signedBuildings.get(b.id)||0,max=b.name==='Ayala Malls Central Bloc'?5:b.name?3:2;
    if(count>=max||storeFronts.length>=55)continue;
    const road=streetTarget(place),front=boundaryNear(b.points,road);
    if(front.length<3||storeFronts.some(p=>p.building===b.id&&Math.hypot(p.x-front.x,p.z-front.z)<8))continue;
    entrance(scene,front,road,place.name,Math.min(style.priority>=8?8:6,front.length*.65),style);
    signedBuildings.set(b.id,count+1);storeFronts.push({building:b.id,x:front.x,z:front.z});
  }
  const streetSigns=new Set();
  for(const s of [...driveSegments].sort((a,b)=>Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z)-Math.hypot(a.b.x-a.a.x,a.b.z-a.a.z))){
    if(streetSigns.has(s.name)||!s.name||s.name==='Access lane'||s.kind==='service')continue;
    const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<25)continue;
    const dx=(s.b.x-s.a.x)/length,dz=(s.b.z-s.a.z)/length;
    for(const side of [1,-1]){
      const x=(s.a.x+s.b.x)/2-dz*(s.width/2+3)*side,z=(s.a.z+s.b.z)/2+dx*(s.width/2+3)*side;
      if(collides(x,z,1.2))continue;
      box(scene,x,2.25,z,.14,4.5,.14,mat(0x334b50),false);
      sign(scene,s.name,x,4.4,z,Math.min(8,Math.max(5,s.name.length*.38)),'#fff2c9',{x:x+dz,y:4.4,z:z-dx});
      streetSigns.add(s.name);break;
    }
  }
  const treePositions=district.trees.filter(([x,z])=>{const road=nearestRoad({x,z});return !collides(x,z,.6)&&(!road||road.distance>road.segment.width/2+3.5);});
  for(const [index,s] of driveSegments.entries()){
    const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<24||s.kind==='service')continue;
    for(let t=9;t<length;t+=15){const side=index%2?1:-1,x=s.a.x+(s.b.x-s.a.x)*t/length-(s.b.z-s.a.z)/length*(s.width/2+5.2)*side,z=s.a.z+(s.b.z-s.a.z)*t/length+(s.b.x-s.a.x)/length*(s.width/2+5.2)*side,road=nearestRoad({x,z});if(!collides(x,z,1.4)&&road.distance>road.segment.width/2+4&&!treePositions.some(p=>Math.hypot(p[0]-x,p[1]-z)<6))treePositions.push([x,z]);}
  }
  // Planting, matched to what the district actually has: broadleaf street trees
  // (acacia and narra) along the roads, and coconut palms clustered near the
  // malls and open ground. Two spheres on a stick read as a lollipop from any
  // angle, so the broadleaf canopies are built from several offset lobes and
  // every tree gets its own height, lean and shade of green.
  const dummy=new THREE.Object3D();
  const isPalm=(x,z)=>{let h=Math.floor(Math.abs(x*7.3+z*3.1))%10;return h<3;};
  const broad=treePositions.filter(([x,z])=>!isPalm(x,z));
  const palms=treePositions.filter(([x,z])=>isPalm(x,z));
  const LOBES=4,FRONDS=7;
  const LEAF_GREENS=[0x3f6b46,0x4a7a4e,0x56885a,0x39603f,0x628f5e,0x2f5538];
  const PALM_GREENS=[0x4c7a48,0x578650,0x426b41];

  // Broadleaf: tapered trunk, canopy built from overlapping lobes.
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.46,1,7),bark,broad.length);
  const crowns=new THREE.InstancedMesh(new THREE.SphereGeometry(1,7,5),leaf,broad.length*LOBES);
  broad.forEach(([x,z],i)=>{
    // Deterministic per-tree variation, so the park looks the same every load.
    const r1=((i*2654435761)%1000)/1000,r2=((i*40503)%1000)/1000,r3=((i*97)%1000)/1000;
    const height=5.2+r1*3.4,lean=(r2-.5)*.14,spread=2.1+r3*1.1;
    dummy.position.set(x,height/2,z);dummy.scale.set(1,height,1);
    dummy.rotation.set(lean,r1*6.28,lean*.6);dummy.updateMatrix();
    trunks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<LOBES;j++){
      const a=(j/LOBES)*6.28+r2*6.28,ring=j===0?0:spread*.52;
      dummy.position.set(x+Math.cos(a)*ring+lean*height,height+(j===0?spread*.72:spread*.34)-(j?r3*.5:0),z+Math.sin(a)*ring);
      const size=j===0?spread:spread*(.62+((i+j)%3)*.1);
      dummy.scale.set(size,size*(j===0?.86:.74),size);
      dummy.rotation.set(0,a,0);dummy.updateMatrix();
      crowns.setMatrixAt(i*LOBES+j,dummy.matrix);
      crowns.setColorAt(i*LOBES+j,new THREE.Color(LEAF_GREENS[(i+j)%LEAF_GREENS.length]));
    }
    addSolid({x,z,w:.7,d:.7});
  });
  dummy.rotation.set(0,0,0);
  trunks.castShadow=crowns.castShadow=true;scene.add(trunks,crowns);

  // Palms: a bare leaning trunk with fronds radiating and drooping from the top.
  if(palms.length){
    const palmTrunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.30,1,6),bark,palms.length);
    const frondGeo=new THREE.SphereGeometry(1,5,3);frondGeo.scale(1,.12,.34);
    const fronds=new THREE.InstancedMesh(frondGeo,leaf,palms.length*FRONDS);
    palms.forEach(([x,z],i)=>{
      const r1=((i*2654435761)%1000)/1000,r2=((i*40503)%1000)/1000;
      const height=7.5+r1*4.5,lean=(r2-.5)*.2;
      dummy.position.set(x+lean*height*.5,height/2,z);
      dummy.scale.set(1,height,1);dummy.rotation.set(lean,0,lean*.5);dummy.updateMatrix();
      palmTrunks.setMatrixAt(i,dummy.matrix);
      const topX=x+lean*height,topZ=z;
      for(let j=0;j<FRONDS;j++){
        const a=(j/FRONDS)*6.28+r1*6.28,len=2.5+r2*1.1;
        // Push each frond out along its own bearing and let it droop.
        dummy.position.set(topX+Math.cos(a)*len*.52,height-.25-(j%2)*.3,topZ+Math.sin(a)*len*.52);
        dummy.scale.set(len,len,len);
        dummy.rotation.set(.34+(j%3)*.12,-a,0);dummy.updateMatrix();
        fronds.setMatrixAt(i*FRONDS+j,dummy.matrix);
        fronds.setColorAt(i*FRONDS+j,new THREE.Color(PALM_GREENS[(i+j)%PALM_GREENS.length]));
      }
      addSolid({x,z,w:.6,d:.6});
    });
    dummy.rotation.set(0,0,0);
    palmTrunks.castShadow=fronds.castShadow=true;scene.add(palmTrunks,fronds);
  }
  const metal=mat(0x354e54),wood=mat(0xb1946c),warm=new THREE.MeshBasicMaterial({color:0xffe3a1});let furniture=0;
  for(const s of driveSegments){const length=Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z);if(length<35)continue;const dx=(s.b.x-s.a.x)/length,dz=(s.b.z-s.a.z)/length,x=(s.a.x+s.b.x)/2-dz*(s.width/2+2),z=(s.a.z+s.b.z)/2+dx*(s.width/2+2);if(collides(x,z,1)||furniture++>55)continue;box(scene,x,3.5,z,.16,7,.16,metal);box(scene,x+dz*.65,7,z-dx*.65,1.8,.2,.6,warm,false);if(furniture%3===0){const bench=box(scene,x-dx*3,.7,z-dz*3,2.8,.22,.85,wood);bench.rotation.y=-Math.atan2(dz,dx);}}
  const garden=landmarks.find(p=>p.name==='Garden Bloc');if(garden){const lawn=district.parks.find(p=>p.name==='Garden Bloc');let stalls=0;for(let x=garden.x-30;x<=garden.x+30;x+=12){const z=garden.z+8;if(!insidePolygon(x,z,lawn.points)||collides(x,z,4))continue;const kiosk=box(scene,x,1.1,z,5,2.2,3,wood);solidMeshes.push(kiosk);addSolid({x,z,w:5,d:3});box(scene,x,2.5,z,6,.3,4,mat(stalls++%2?0xc58b55:0x4b9b86));sign(scene,'GARDEN EATS',x,2.3,z+1.6,4.7,'#ffe1a7');}}
  const buildingAssetsReady=placeKitBuildings(scene,extruded);
  // Clipped hedges. On I. Villa Street and most of the park the centre of the
  // carriageway carries a continuous low hedge, with more of it along the kerbs.
  // It is the most recognisable thing at street level and the district looked
  // bare without it. One instanced mesh, so the whole lot is a single draw call.
  {
    const units=[],step=2.1;
    for(const road of driveSegments){
      if(road.kind==='service'||road.walk)continue;
      const dx=road.b.x-road.a.x,dz=road.b.z-road.a.z,length=Math.hypot(dx,dz);
      if(length<26)continue;
      const ux=dx/length,uz=dz/length,nx=-uz,nz=ux;
      // Leave the last few metres at each end clear so junctions stay open.
      const from=7,to=length-7;
      const median=road.width>=12;   // 38 avenues, not 143 streets
      for(let t=from;t<to;t+=step){
        const cx=road.a.x+ux*t,cz=road.a.z+uz*t;
        if(median){
          units.push({x:cx,z:cz,a:Math.atan2(ux,uz),w:.7,h:.58,kerb:true});
        }
        // Verges sit just beyond the kerb on both sides.
        if(road.width<10)continue;   // no verge planting on side streets
        for(const side of [-1,1]){
          const vx=cx+nx*(road.width/2+2.0)*side,vz=cz+nz*(road.width/2+2.0)*side;
          if(collides(vx,vz,.7))continue;
          units.push({x:vx,z:vz,a:Math.atan2(ux,uz),w:.8,h:.48});
        }
      }
    }
    if(units.length){
      // Thin evenly if there are too many. spreadOut lives in game.js, and a
      // stride is fine here: hedges are laid along lines, so every Nth unit
      // still gives continuous planting rather than clumps.
      const LIMIT=4200;
      const capped=units.length>LIMIT
        ? units.filter((_,i)=>i%Math.ceil(units.length/LIMIT)===0)
        : units;
      const hedgeGeo=new THREE.BoxGeometry(1,1,1);
      const hedgeMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95});
      const hedges=new THREE.InstancedMesh(hedgeGeo,hedgeMat,capped.length);
      const greens=[0x3f7a3a,0x4a8a41,0x36702f,0x55964a];
      const shape=new THREE.Object3D();
      capped.forEach((u,i)=>{
        // Vary height and length a little so it reads as planting, not a wall.
        const jitter=((i*2654435761)%1000)/1000;
        shape.position.set(u.x,u.h/2*(0.85+jitter*.3),u.z);
        shape.rotation.set(0,u.a,0);
        shape.scale.set(u.w*(.94+jitter*.12),u.h*(.85+jitter*.3),step*1.34);
        shape.updateMatrix();
        hedges.setMatrixAt(i,shape.matrix);
        hedges.setColorAt(i,new THREE.Color(greens[i%greens.length]));
      });
      hedges.castShadow=hedges.receiveShadow=true;
      scene.add(hedges);
      // Concrete kerb carrying the median planting.
      const kerbs=capped.filter(u=>u.kerb);
      if(kerbs.length){
        const kerbMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),
          mat(0xbdbcb2,.95),kerbs.length);
        kerbs.forEach((u,i)=>{
          shape.position.set(u.x,.11,u.z);
          shape.rotation.set(0,u.a,0);
          shape.scale.set(u.w+.55,.22,step*1.34);
          shape.updateMatrix();kerbMesh.setMatrixAt(i,shape.matrix);
        });
        kerbMesh.receiveShadow=true;scene.add(kerbMesh);
      }
    }
  }
  buildItParkArch(scene);
  const propAssetsReady=loadMegaKit(scene);
  return {sun,ambient,assetsReady:Promise.all([buildingAssetsReady,propAssetsReady])};
}

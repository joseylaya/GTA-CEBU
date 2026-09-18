import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { WORLD, createDistrict, collides, lineBlocked, box, solids, solidMeshes, insidePolygon } from './world.js';
import { createJetpackMesh, createAircraftMesh, animateAircraft } from './flight.js';
import { createMultiplayer } from './multiplayer.js';
import { VoiceChatManager } from './voice/VoiceChatManager.js';
import { APPEARANCE_OPTIONS, STYLE_OPTIONS, normalizeAppearance } from './appearance.js';
import { settings, saveSettings, keyLabel } from './settings.js';
import { district, driveSegments, nearestRoad, routePoints, landmarks, landmark, trafficLoop, SPAWN, MAP_ID } from './geography.js';
import { featuredPlaces, placeStyle } from './places.js';
import { pedestrianNodes, pedestrianSpots, pedestrianEntrances, pedestrianPath, closestPedestrianNode } from './pedestrian-lanes.js';

const $=id=>document.getElementById(id);
const canvas=$('game'), mini=$('minimap'), ctx=mini.getContext('2d');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const scene=new THREE.Scene();const {sun,ambient}=createDistrict(scene);
scene.updateMatrixWorld(true);
const camera=new THREE.PerspectiveCamera(62,1,.1,1400);
const raycaster=new THREE.Raycaster();
const cameraRaycaster=new THREE.Raycaster();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const MAX_HEALTH=200;
const material=color=>new THREE.MeshStandardMaterial({color,roughness:1});
const mats={skin:material(0xd6a884),hair:material(0x242d33),shirt:material(0xe6a74c),pants:material(0x253b49),police:material(0x305775),dark:material(0x1d3039),glass:material(0x87b4be),wheel:material(0x1e262b),white:material(0xf0eee1),blue:material(0x4f91a0)};
const clothingMaterials=Object.fromEntries(Object.entries(APPEARANCE_OPTIONS).map(([part,choices])=>[part,choices.map(([,color])=>material(color))]));
let appearance=normalizeAppearance(null);
try{appearance=normalizeAppearance(JSON.parse(localStorage.getItem('districtZeroAppearance')||'null'));}catch{}
let keys=new Set(),pointer={x:.5,y:.5},aiming=false,hadPointerLock=false,pointerLockUnavailable=!canvas.requestPointerLock,lastLookAt=0,camYaw=.7,camPitch=.55,toastTimer=0,worldTime=9*60;
let playing=false,paused=true, player, cars=[],aircraft=[],traffic=[],peds=[],police=[],policeHelicopter=null,wanted={heat:0,level:0,last:{x:0,z:0}};
const POLICE_GROUND_REACH=4,POLICE_AIR_RESPONSE_HEIGHT=8;
let cheatBuffer='',cheatTime=0;
const characterTemplates=new Map();
const PIRATE_CHARACTERS=['Henry','Anne','Mako','Captain_Barbarossa','Sharky'];
let characterChoice='Henry';
try{const savedCharacter=localStorage.getItem('districtZeroCharacter');if(PIRATE_CHARACTERS.includes(savedCharacter))characterChoice=savedCharacter;}catch{}
let cash=150,streetRep=0,engineLevel=0,job=null,completedJobs=0,lastUiHealth=MAX_HEALTH,lastDamageFlash=0;
const combatEffects=[],fallenBodies=[];
const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;
const glowContext=glowCanvas.getContext('2d'),glowGradient=glowContext.createRadialGradient(64,64,4,64,64,64);
glowGradient.addColorStop(0,'rgba(255,255,255,1)');glowGradient.addColorStop(.25,'rgba(255,255,255,.75)');glowGradient.addColorStop(1,'rgba(255,255,255,0)');
glowContext.fillStyle=glowGradient;glowContext.fillRect(0,0,128,128);
const glowTexture=new THREE.CanvasTexture(glowCanvas);
let audioContext,engineTone,engineGain,masterGain;
const daySky=new THREE.Color(0xaac5cf),nightSky=new THREE.Color(0x283c55);
function setupAudio(){
  try{
    if(audioContext){audioContext.resume();return;}
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    audioContext=new AudioContextClass();engineTone=audioContext.createOscillator();engineGain=audioContext.createGain();masterGain=audioContext.createGain();
    masterGain.gain.value=settings.volume;masterGain.connect(audioContext.destination);
    engineTone.type='sawtooth';engineTone.frequency.value=42;engineGain.gain.value=0;
    engineTone.connect(engineGain).connect(masterGain);engineTone.start();
  }catch{audioContext=null;engineTone=null;engineGain=null;masterGain=null;}
}
function cue(frequency=660){
  if(!audioContext)return;
  const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
  oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,now);oscillator.frequency.exponentialRampToValueAtTime(frequency*1.3,now+.12);
  gain.gain.setValueAtTime(.08,now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);
  oscillator.connect(gain).connect(masterGain);oscillator.start(now);oscillator.stop(now+.2);
}
function gunSound(){
  if(!audioContext)return;
  const now=audioContext.currentTime,length=Math.floor(audioContext.sampleRate*.14);
  const buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),samples=buffer.getChannelData(0);
  for(let i=0;i<length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/length,2);
  const noise=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
  noise.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(2400,now);filter.frequency.exponentialRampToValueAtTime(350,now+.13);
  gain.gain.setValueAtTime(.34,now);gain.gain.exponentialRampToValueAtTime(.001,now+.14);
  noise.connect(filter).connect(gain).connect(masterGain);noise.start(now);noise.stop(now+.14);
  const thump=audioContext.createOscillator(),thumpGain=audioContext.createGain();
  thump.type='triangle';thump.frequency.setValueAtTime(140,now);thump.frequency.exponentialRampToValueAtTime(48,now+.11);
  thumpGain.gain.setValueAtTime(.3,now);thumpGain.gain.exponentialRampToValueAtTime(.001,now+.12);
  thump.connect(thumpGain).connect(masterGain);thump.start(now);thump.stop(now+.12);
}
function addCombatEffect(mesh,duration,kind){
  const now=performance.now();scene.add(mesh);combatEffects.push({mesh,born:now,until:now+duration,kind});
}
function glowAt(position,color,size,duration,kind='glow'){
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
  sprite.position.copy(position);sprite.scale.set(size,size,1);addCombatEffect(sprite,duration,kind);
}
function safePoint(point,r=2){
  if(!collides(point.x,point.z,r))return {x:point.x,z:point.z};
  for(let radius=2;radius<35;radius+=2)for(let i=0;i<16;i++){const x=point.x+Math.cos(i*Math.PI/8)*radius,z=point.z+Math.sin(i*Math.PI/8)*radius;if(!collides(x,z,r))return {x,z};}
  return {...SPAWN};
}
const stop=name=>safePoint(landmark(name).roadPoint,3);
const hubs=[
  {kind:'courier',label:'THE WALK · COURIER',...safePoint(landmark('The Walk').entrance,3),color:0xf2be63},
  {kind:'taxi',label:'CENTRAL BLOC · FARES',...stop('Ayala Malls Central Bloc'),color:0x65d2c1},
  {kind:'race',label:'IT PARK CIRCUIT',...stop('eBloc 1 Tower'),color:0xd786e8},
  {kind:'garage',label:'DISTRICT GARAGE',...stop('Globe Telecom Tower'),color:0x78a9ef}
];
const jobRoutes={
  courier:['TGU Tower','HM Tower','Ayala Malls Central Bloc','eBloc 3 Tower'].map(stop),
  taxi:['Ayala Malls Central Bloc','38 Park Avenue','Calyx Centre','eBloc 1 Tower'].map(stop),
  race:['eBloc 1 Tower','38 Park Avenue','Garden Bloc','eBloc 3 Tower','Calyx Centre','The Walk','Globe Telecom Tower'].map(stop)
};
const hubMeshes=[];
let objectiveMesh,taxiPassenger;
const carSpawns=[
  {...stop('The Walk'),h:1,c:0xeea947},
  {...stop('Ayala Malls Central Bloc'),h:1,c:0x74a5b6,type:'shuttle'},
  {...stop('Garden Bloc'),h:1,c:0xc47f75}
];
const trafficRoutes=[
  trafficLoop(['The Walk','HM Tower','Garden Bloc','Ayala Malls Central Bloc']),
  trafficLoop(['Ayala Malls Central Bloc','eBloc 1 Tower','38 Park Avenue','Globe Telecom Tower']),
  trafficLoop(['Calyx Centre','eBloc 3 Tower','Garden Bloc','The Walk'])
];
const PEDESTRIAN_COUNT=35;
const sidewalkSpots=pedestrianSpots;
let crowdRefresh=0;
function pedestrianSpot(around,index,minimum=13,maximum=115){
  const nearby=sidewalkSpots.filter(p=>{const d=dist(p,around);return d>minimum&&d<maximum;});
  const choices=nearby.length?nearby:sidewalkSpots;
  if(!choices.length)return safePoint(SPAWN,1);
  for(let attempt=0;attempt<24;attempt++){
    const point=choices[(index*37+attempt*53+Math.floor(Math.random()*choices.length))%choices.length];
    if(!peds.some(p=>p.alive&&dist(p,point)<2.6))return {x:point.x,z:point.z,node:point.id};
  }
  const point=choices[index%choices.length];return {x:point.x,z:point.z,node:point.id};
}
function setPedestrianRoute(p,requestedEntrance=null){
  const start=pedestrianNodes[p.node]||closestPedestrianNode(p);if(!start)return;
  p.node=start.id;
  const options=requestedEntrance?[requestedEntrance]:[...pedestrianEntrances].sort(()=>Math.random()-.5);
  for(const entrance of options){
    const d=dist(p,entrance.point);if(!requestedEntrance&&(d<25||d>190))continue;
    const path=pedestrianPath(start.id,entrance.node.id);
    if(path&&path.length>2){p.route=path.slice(1);if(dist(p,start)>.7)p.route.unshift(start.id);p.entrance=entrance;p.wait=Math.random()*1.5;return;}
  }
  // If this pavement component has no reachable entrance, stroll along it.
  let target=start;for(let i=0;i<12;i++){const ids=target.edges;if(!ids.length)break;target=pedestrianNodes[ids[Math.floor(Math.random()*ids.length)]];}
  if(target===start&&start.edges.length)target=pedestrianNodes[start.edges[0]];
  const path=pedestrianPath(start.id,target.id);p.route=path?.slice(1)||[];if(dist(p,start)>.7)p.route.unshift(start.id);p.entrance=null;p.wait=1+Math.random()*2;
}

function avatar(color=mats.shirt,policeLook=false,look=null){
  const g=new THREE.Group();
  const torso=box(g,0,2.05,0,1.05,1.3,.62,color);
  const head=box(g,0,3.02,.04,.72,.74,.72,mats.skin);
  const hair=box(g,0,3.47,0,.76,.18,.78,policeLook?mats.dark:mats.hair);
  const capBill=box(g,0,3.42,.52,.82,.09,.42,mats.hair,false);capBill.visible=false;
  const hood=box(g,0,2.95,-.28,.91,.96,.28,color);hood.visible=false;
  const jacketTrim=[box(g,-.28,2.05,.34,.09,1.25,.05,mats.white,false),box(g,.28,2.05,.34,.09,1.25,.05,mats.white,false)];jacketTrim.forEach(item=>item.visible=false);
  const arms=[],armMeshes=[];
  for(const x of [-.72,.72]){
    const shoulder=new THREE.Group();shoulder.position.set(x,2.62,0);
    armMeshes.push(box(shoulder,0,-.55,0,.36,1.17,.43,policeLook?color:mats.skin));
    g.add(shoulder);arms.push(shoulder);
  }
  box(g,-.17,3.09,.43,.1,.1,.04,mats.dark,false);box(g,.17,3.09,.43,.1,.1,.04,mats.dark,false);
  box(g,0,2.79,.43,.27,.055,.04,mats.dark,false);
  const legs=[],legMeshes=[];
  for(const x of [-.29,.29]) {const pivot=new THREE.Group();pivot.position.set(x,1.38,0);legMeshes.push(box(pivot,0,-.55,0,.39,1.1,.45,mats.pants));g.add(pivot);legs.push(pivot);}
  if(policeLook)box(g,0,2.4,-.34,.3,.16,.06,mats.white,false);
  g.userData={legs,head,torso,hair,capBill,hood,jacketTrim,arms,armMeshes,legMeshes};
  if(look)applyAppearance(g,look);
  return g;
}
function applyAppearance(mesh,look){
  const chosen=normalizeAppearance(look),parts=mesh.userData;
  parts.head.material=clothingMaterials.skin[chosen.skin];parts.hair.material=clothingMaterials.hair[chosen.hair];parts.torso.material=clothingMaterials.shirt[chosen.shirt];
  parts.hood.material=clothingMaterials.shirt[chosen.shirt];parts.hood.visible=chosen.top===1;parts.jacketTrim.forEach(item=>item.visible=chosen.top===2);
  parts.hair.scale.y=chosen.haircut===1 ? .42 : .18;parts.hair.position.y=chosen.haircut===1 ? 3.58 : 3.47;
  parts.capBill.material=clothingMaterials.hair[chosen.hair];parts.capBill.visible=chosen.haircut===2;
  parts.armMeshes.forEach(arm=>arm.material=clothingMaterials.skin[chosen.skin]);parts.legMeshes.forEach(leg=>leg.material=clothingMaterials.pants[chosen.pants]);
}
function attachCharacterModel(mesh,name){
  const source=characterTemplates.get(name);
  if(!source)return;
  if(mesh.userData.characterName===name)return;
  if(mesh.userData.characterVisual){
    mesh.remove(mesh.userData.characterVisual);
    mesh.userData.characterMixer?.stopAllAction();
  }
  const originalMeshes=[];mesh.traverse(child=>{if(child.isMesh)originalMeshes.push(child);});
  const visual=cloneSkeleton(source.scene),bounds=new THREE.Box3().setFromObject(visual);
  const height=Math.max(.1,bounds.max.y-bounds.min.y),scale=3.35/height;
  visual.scale.setScalar(scale);visual.position.y=-bounds.min.y*scale;
  visual.traverse(child=>{if(child.name?.startsWith('Weapon_'))child.visible=false;if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
  mesh.add(visual);
  originalMeshes.forEach(part=>{if(!mesh.userData.gun?.getObjectById(part.id)&&!mesh.userData.jetpack?.getObjectById(part.id))part.visible=false;});
  const mixer=new THREE.AnimationMixer(visual),actions=new Map(source.animations.map(clip=>[clip.name,mixer.clipAction(clip)]));
  mesh.userData.characterVisual=visual;mesh.userData.characterMixer=mixer;mesh.userData.characterActions=actions;mesh.userData.characterName=name;
  playCharacter(mesh,'Idle',0);
}
function playCharacter(mesh,name,fade=.16){
  const data=mesh.userData,action=data.characterActions?.get(name);
  if(!action||data.characterAction===name)return;
  const previous=data.characterActions.get(data.characterAction);
  if(previous)previous.fadeOut(fade);
  action.reset().setEffectiveWeight(1).fadeIn(fade).play();
  action.setLoop(['Punch','HitReact','Jump','Death'].includes(name)?THREE.LoopOnce:THREE.LoopRepeat,Infinity);
  action.clampWhenFinished=true;data.characterAction=name;
}
function animateRemoteCharacter(mesh,state,dt){
  const data=mesh.userData;
  if(data.characterMixer){
    playCharacter(mesh,state.animation);
    data.characterMixer.update(dt);
    // The pirate kit has no firearm animation. Pose its right shoulder after
    // the mixer so aiming remains visible without replacing the walk cycle.
    const shoulder=data.characterVisual?.getObjectByName('UpperArm.R');
    if(shoulder&&state.weapon==='pistol'){
      shoulder.rotation.x-=(state.aiming||state.attacking)? .9 : .12;
    }
  }else{
    const stride=state.animation==='Run'?.75:state.animation==='Walk'?.4:0;
    const swing=Math.sin(performance.now()*(state.animation==='Run'?.016:.011))*stride;
    data.legs[0].rotation.x=swing;data.legs[1].rotation.x=-swing;
  }
  const armBlend=1-Math.exp(-dt*24);
  const leftTarget=state.weapon==='fists'&&state.attacking&&state.attackArm===0?-1.4:0;
  const rightTarget=state.weapon==='pistol'?(state.aiming||state.attacking?-1.2:-.12):state.attacking&&state.attackArm===1?-1.4:0;
  data.arms[0].rotation.x+=(leftTarget-data.arms[0].rotation.x)*armBlend;
  data.arms[1].rotation.x+=(rightTarget-data.arms[1].rotation.x)*armBlend;
  if(data.gun)data.gun.visible=state.weapon==='pistol';
}
function attachCharacterGun(mesh){
  const gun=new THREE.Group();
  box(gun,0,0,.22,.25,.22,.72,mats.dark,false);
  box(gun,0,-.18,-.04,.21,.38,.22,mats.dark,false);
  box(gun,0,.15,-.02,.31,.08,.36,mats.white,false);
  gun.position.set(0,-1.1,.25);mesh.userData.arms[1].add(gun);
  mesh.userData.gun=gun;
  return gun;
}
const characterLoader=new GLTFLoader();
for(const name of PIRATE_CHARACTERS)characterLoader.load(`/models/pirates/Characters_${name}.gltf`,gltf=>{
  characterTemplates.set(name,gltf);
  if(player&&player.character===name)attachCharacterModel(player.mesh,name);
  multiplayer?.refreshCharacters?.();
},undefined,error=>console.warn(`Pirate character ${name} unavailable; using built-in character.`,error));
const womenNames=['Female_Casual','Female_Dress','Female_Alternative','Female_TankTop'];
const womenTemplates=new Map(),womenLoader=new FBXLoader();
function attachWomanModel(mesh,name){
  const source=womenTemplates.get(name);if(!source||mesh.userData.characterVisual)return;
  const originalMeshes=[];mesh.traverse(child=>{if(child.isMesh)originalMeshes.push(child);});
  const visual=cloneSkeleton(source),bounds=new THREE.Box3().setFromObject(visual),height=Math.max(.1,bounds.max.y-bounds.min.y),scale=3.35/height;
  visual.scale.setScalar(scale);visual.position.y=-bounds.min.y*scale;
  visual.traverse(child=>{if(child.isMesh){child.castShadow=false;child.receiveShadow=true;}});
  mesh.add(visual);originalMeshes.forEach(part=>part.visible=false);
  const mixer=new THREE.AnimationMixer(visual),actions=new Map(source.animations.map(clip=>[clip.name.split('_').at(-1).replace('Standing','Idle'),mixer.clipAction(clip)]));
  mesh.userData.characterVisual=visual;mesh.userData.characterMixer=mixer;mesh.userData.characterActions=actions;mesh.userData.womanVisual=true;
  playCharacter(mesh,'Idle',0);
}
for(const name of womenNames)womenLoader.load(`/models/women/${name}.fbx`,source=>{
  womenTemplates.set(name,source);
  for(const ped of peds)if(ped.variant===name)attachWomanModel(ped.mesh,name);
  if(taxiPassenger&&name==='Female_Casual')attachWomanModel(taxiPassenger,name);
},undefined,error=>console.warn(`Women NPC model ${name} unavailable; using built-in character.`,error));

function carMesh(color,type='sedan'){
  const g=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color,metalness:.25,roughness:.48});
  const curved=new RoundedBoxGeometry(1,1,1,3,.16);
  const body=new THREE.Mesh(curved,paint);body.position.set(0,.75,0);body.scale.set(2.9,.76,5);body.castShadow=true;body.receiveShadow=true;g.add(body);
  const cabin=new THREE.Mesh(curved,paint);cabin.position.set(0,1.36,-.25);cabin.scale.set(2.35,.72,2.7);cabin.castShadow=true;cabin.receiveShadow=true;g.add(cabin);
  box(g,0,1.38,1.13,2.1,.56,.06,mats.glass,false);
  box(g,0,1.38,-1.62,2.1,.56,.06,mats.glass,false);
  for(const x of [-1.47,1.47])for(const z of [-1.55,1.55]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.49,.49,.24,10),mats.wheel);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.43,z);wheel.castShadow=true;g.add(wheel);
  }
  for(const x of [-.9,.9]) {box(g,x,.8,2.52,.42,.2,.07,mats.white,false);box(g,x,.8,-2.52,.38,.2,.07,material(0xa83734),false);}
  if(type==='shuttle'){
    const trim=material(0xf3d271);
    box(g,0,1.77,-.2,2.55,.18,3.25,trim);
    box(g,0,1.25,-2.56,1.7,.38,.08,mats.dark,false);
    for(const x of [-1.48,1.48])box(g,x,1.08,-.15,.09,.16,4.5,trim,false);
  }
  return g;
}

function beacon(x,z,color,label){
  const group=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.35,.16,6,24),new THREE.MeshBasicMaterial({color}));
  ring.rotation.x=Math.PI/2;ring.position.y=.24;group.add(ring);
  const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,3,6),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55}));pillar.position.y=1.6;group.add(pillar);
  const sign=document.createElement('canvas');sign.width=256;sign.height=64;
  const c=sign.getContext('2d');c.fillStyle='#10242b';c.fillRect(0,0,256,64);c.strokeStyle=`#${color.toString(16).padStart(6,'0')}`;c.lineWidth=5;c.strokeRect(2,2,252,60);c.fillStyle='#ffffff';c.font='bold 24px sans-serif';c.textAlign='center';c.fillText(label,128,40);
  const texture=new THREE.CanvasTexture(sign);texture.colorSpace=THREE.SRGBColorSpace;
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(5,1.25),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));panel.position.y=3.3;group.add(panel);
  group.position.set(x,0,z);scene.add(group);return group;
}
hubs.forEach(h=>hubMeshes.push(beacon(h.x,h.z,h.color,h.label)));
objectiveMesh=beacon(0,0,0xffe28a,'DESTINATION');objectiveMesh.visible=false;
const objectiveBeam=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,15,16,1,true),new THREE.MeshBasicMaterial({color:0xffdf78,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}));
objectiveBeam.position.y=7.5;objectiveMesh.add(objectiveBeam);
const objectiveHalo=new THREE.Mesh(new THREE.TorusGeometry(1.4,.12,8,28),new THREE.MeshBasicMaterial({color:0xffe7a2}));
objectiveHalo.rotation.x=Math.PI/2;objectiveHalo.position.y=8;objectiveMesh.add(objectiveHalo);
taxiPassenger=avatar(material(0xf1cb72));attachWomanModel(taxiPassenger,'Female_Casual');taxiPassenger.position.set(jobRoutes.taxi[0].x,0,jobRoutes.taxi[0].z);taxiPassenger.visible=false;scene.add(taxiPassenger);
const multiplayer=createMultiplayer({
  scene,avatar:look=>avatar(mats.shirt,false,look),applyAppearance,attachCharacter:(mesh,name)=>attachCharacterModel(mesh,name),attachWeapon:attachCharacterGun,animateCharacter:animateRemoteCharacter,carMesh,canvas,
  isPlaying:()=>playing&&!paused,
  getAppearance:()=>appearance,
  getCharacter:()=>characterChoice,
  getPlayerPosition:()=>!player?null:player.inAircraft?
    {x:player.inAircraft.x,z:player.inAircraft.z,y:player.inAircraft.y,h:player.inAircraft.h,inCar:false,flight:player.inAircraft.kind}:
    player.inCar?{x:player.inCar.x,z:player.inCar.z,y:0,h:player.inCar.h,inCar:true,flight:null}:
    {x:player.x,z:player.z,y:player.y,h:player.h,inCar:false,flight:player.jetpack?'jetpack':null},
  getPlayerAnimation:()=>{
    if(!player)return null;
    const attacking=performance.now()<player.attackUntil;
    const pace=Math.hypot(player.vx,player.vz);
    return {
      animation:player.inCar||player.inAircraft||player.jetpack&&player.y>.15?'Idle':player.y>.15?'Jump':attacking&&player.weapon==='fists'?'Punch':pace>11?'Run':pace>.8?'Walk':'Idle',
      weapon:player.weapon,aiming:aiming&&!player.inCar&&!player.inAircraft,
      attacking,attackArm:player.attackArm
    };
  }
});
// Proximity voice chat. It reuses the multiplayer player ids, player objects
// and connection; the microphone is only opened when the player asks for it.
const voice=new VoiceChatManager({
  network:multiplayer,
  camera,
  getAudioContext:()=>audioContext,
  isEnteringCheat:()=>cheatBuffer.length>=2&&performance.now()-cheatTime<1800,
  isRebinding:()=>!!waitingForBinding,
  notify:message=>toast(message)
});
function drawStylePreview(){
  const canvas=$('style-preview'),c=canvas.getContext('2d'),color=(part)=>`#${APPEARANCE_OPTIONS[part][appearance[part]][1].toString(16).padStart(6,'0')}`;
  c.clearRect(0,0,120,160);c.fillStyle='#263d43';c.fillRect(0,0,120,160);
  c.fillStyle='#17272c';c.fillRect(17,140,86,5);
  c.fillStyle=color('pants');c.fillRect(39,100,18,40);c.fillRect(63,100,18,40);
  c.fillStyle=color('shirt');c.fillRect(35,57,50,48);c.fillRect(21,60,14,42);c.fillRect(85,60,14,42);
  c.fillStyle=color('skin');c.fillRect(21,87,14,15);c.fillRect(85,87,14,15);c.fillRect(43,25,34,35);
  c.fillStyle=color('hair');c.fillRect(42,20,36,appearance.haircut===1?13:8);
  if(appearance.haircut===2)c.fillRect(70,27,18,5);
  if(appearance.top===1){c.fillStyle=color('shirt');c.fillRect(39,26,5,28);c.fillRect(76,26,5,28);}
  if(appearance.top===2){c.fillStyle='#e5e6db';c.fillRect(56,61,3,42);c.fillRect(62,61,3,42);}
  c.fillStyle='#243039';c.fillRect(51,43,4,4);c.fillRect(65,43,4,4);c.fillRect(55,53,10,2);
}
for(const [part,choices] of [...Object.entries(STYLE_OPTIONS).map(([key,values])=>[key,values.map(value=>[value])]),...Object.entries(APPEARANCE_OPTIONS)]){
  const label=document.createElement('label');label.textContent=part.toUpperCase();
  const select=document.createElement('select');select.id=`appearance-${part}`;
  choices.forEach(([name],index)=>{const option=document.createElement('option');option.value=index;option.textContent=name;select.append(option);});
  select.value=appearance[part];
  select.addEventListener('change',()=>{
    appearance=normalizeAppearance({...appearance,[part]:Number(select.value)});
    try{localStorage.setItem('districtZeroAppearance',JSON.stringify(appearance));}catch{}
    if(player)applyAppearance(player.mesh,appearance);
    drawStylePreview();
  });
  label.append(select);$('appearance-options').append(label);
}
drawStylePreview();
$('character-choice').value=characterChoice;
$('character-choice').addEventListener('change',()=>{
  characterChoice=PIRATE_CHARACTERS.includes($('character-choice').value)?$('character-choice').value:'Henry';
  try{localStorage.setItem('districtZeroCharacter',characterChoice);}catch{}
  if(player){player.character=characterChoice;attachCharacterModel(player.mesh,characterChoice);}
  multiplayer.refreshCharacters?.();
  toast(`Character selected · ${characterChoice.replaceAll('_',' ')}`);
});
$('customizeBtn').onclick=()=>{$('district-map-panel').hidden=true;$('customize-panel').hidden=!$('customize-panel').hidden;};
const bindingNames={forward:'Move forward',back:'Move back',left:'Move left',right:'Move right',sprint:'Sprint',jump:'Jump / handbrake',interact:'Interact',reload:'Reload',fists:'Equip fists',pistol:'Equip pistol',switchWeapon:'Switch weapon',chat:'Open chat'};
let waitingForBinding=null;
function down(action){return keys.has(settings.bindings[action])||(action==='sprint'&&settings.bindings.sprint==='ShiftLeft'&&keys.has('ShiftRight'));}
function matchKey(event,action){return event.code===settings.bindings[action];}
function applySettings(){
  $('app').style.setProperty('--hud-scale',settings.hudScale);
  $('sensitivity-value').textContent=settings.sensitivity.toFixed(1)+'×';
  $('volume-value').textContent=Math.round(settings.volume*100)+'%';
  $('hud-size-value').textContent=Math.round(settings.hudScale*100)+'%';
  $('chat-key-label').textContent=keyLabel(settings.bindings.chat);
  if(masterGain)masterGain.gain.value=settings.volume;
}
function renderBindings(){
  const host=$('key-bindings');host.replaceChildren();
  for(const [action,label] of Object.entries(bindingNames)){
    const button=document.createElement('button');button.type='button';
    button.className='binding-button';button.textContent=label+' · '+(waitingForBinding===action?'PRESS A KEY':keyLabel(settings.bindings[action]));
    button.setAttribute('aria-label',label+' key: '+keyLabel(settings.bindings[action]));
    button.onclick=()=>{waitingForBinding=action;renderBindings();};
    host.append(button);
  }
}
for(const [id,key] of [['sensitivity-setting','sensitivity'],['volume-setting','volume'],['hud-size-setting','hudScale']]){
  const control=$(id);control.value=settings[key];
  control.oninput=()=>{settings[key]=Number(control.value);applySettings();saveSettings();};
}
function openDistrictMap(){if(playing)showOverlay();$('district-map-panel').hidden=false;$('settings-panel').hidden=true;$('customize-panel').hidden=true;const map=$('district-map');drawDistrictMap(map.getContext('2d'),map.width,map.height,true);$('district-map-panel').scrollIntoView({block:'nearest'});}
$('mapBtn').onclick=openDistrictMap;$('open-map').onclick=openDistrictMap;
$('settingsBtn').onclick=()=>{$('district-map-panel').hidden=true;$('settings-panel').hidden=!$('settings-panel').hidden;$('customize-panel').hidden=true;waitingForBinding=null;renderBindings();};
applySettings();renderBindings();

function clearDynamic(){for(const a of [...cars,...aircraft,...traffic,...peds,...police,...fallenBodies])scene.remove(a.mesh);if(policeHelicopter)scene.remove(policeHelicopter.mesh);policeHelicopter=null;if(player)scene.remove(player.mesh);for(const effect of combatEffects){scene.remove(effect.mesh);effect.mesh.geometry?.dispose();effect.mesh.material.dispose();}combatEffects.length=0;fallenBodies.length=0;cars=[];aircraft=[];traffic=[];peds=[];police=[];}
function newGame(){
  clearDynamic();wanted={heat:0,level:0,last:{...SPAWN}};worldTime=9*60;cash=150;streetRep=0;engineLevel=0;completedJobs=0;job=null;objectiveMesh.visible=false;taxiPassenger.visible=false;cheatBuffer='';
  player={...safePoint(SPAWN),h:0,y:0,vy:0,vx:0,vz:0,health:MAX_HEALTH,ammo:12,reserve:24,inCar:null,inAircraft:null,jetpack:false,character:characterChoice,shotAt:0,weapon:'pistol',attackUntil:0,attackArm:0,mesh:avatar(mats.shirt,false,appearance)};
  attachCharacterGun(player.mesh);
  player.mesh.userData.jetpack=createJetpackMesh();player.mesh.userData.jetpack.visible=false;player.mesh.add(player.mesh.userData.jetpack);
  attachCharacterModel(player.mesh,characterChoice);
  player.mesh.position.set(player.x,0,player.z);scene.add(player.mesh);
  carSpawns.forEach((s,i)=>{const c={id:i,x:s.x,z:s.z,h:s.h,speed:0,steer:0,mesh:carMesh(s.c,s.type),occupied:false};c.mesh.position.set(c.x,0,c.z);c.mesh.rotation.y=c.h;scene.add(c.mesh);cars.push(c);});
  for(let i=0;i<9;i++){const route=trafficRoutes[i%trafficRoutes.length],startIndex=Math.floor(i/3*route.length/3+i*2)%route.length,start=route[startIndex],t={x:start.x,z:start.z,h:0,speed:7+i%4,route,wp:(startIndex+1)%route.length,mesh:carMesh([0x8b9b8f,0xb99473,0x7b8794,0x698a9b,0xa78264,0xc4ac83][i%6])};t.mesh.scale.set(.84,.9,.84);t.mesh.position.set(t.x,0,t.z);scene.add(t.mesh);traffic.push(t);}
  for(let i=0;i<PEDESTRIAN_COUNT;i++){
    const friend=i<12&&i%2===1?peds[i-1]:null;
    const spot=friend?pedestrianSpot(friend,i,2.7,8):pedestrianSpot(player,i,i<18?6:13,i<18?55:115);
    const look={skin:i%APPEARANCE_OPTIONS.skin.length,hair:(i*3)%APPEARANCE_OPTIONS.hair.length,shirt:(i*5)%APPEARANCE_OPTIONS.shirt.length,pants:(i*7)%APPEARANCE_OPTIONS.pants.length,top:i%3,haircut:i%3};
    const variant=womenNames[i%womenNames.length];
    const p={x:spot.x,z:spot.z,h:0,node:spot.node,route:[],entrance:null,wait:Math.random()*3,panic:0,alive:true,variant,friendGroup:i<12?Math.floor(i/2):null,socialCooldown:5+Math.random()*15,insideUntil:0,mesh:avatar(mats.shirt,false,look)};
    attachWomanModel(p.mesh,variant);
    p.mesh.scale.setScalar(.85+(i%5)*.04);p.mesh.traverse(child=>{if(child.isMesh)child.castShadow=false;});p.mesh.position.set(p.x,0,p.z);scene.add(p.mesh);peds.push(p);
    setPedestrianRoute(p,friend?.entrance);
  }
  crowdRefresh=0;
  camYaw=.7;camPitch=.55;lastUiHealth=MAX_HEALTH;player.hudUntil=performance.now()+5000;playing=true;paused=false;setupAudio();hideOverlay();multiplayer.start();toast('Find a colored street marker to start an activity.');updateUI();
}
function saveGame(){
  if(!playing)return;
  if(job){toast('Finish the current activity before saving');return;}
  if(player.inCar||player.inAircraft||player.y>1||wanted.heat>0){toast('Land, exit the vehicle, and lose the police before saving');return;}
  const data={version:4,map:MAP_ID,time:Date.now(),player:{x:player.x,z:player.z,health:player.health,ammo:player.ammo,reserve:player.reserve},progress:{cash,streetRep,engineLevel,completedJobs}};
  try{const current=localStorage.getItem('districtZeroSave');if(current)localStorage.setItem('districtZeroBackup',current);localStorage.setItem('districtZeroSave',JSON.stringify(data));refreshSaveButtons();toast('Game saved');}
  catch(e){toast('Save unavailable in this browser');console.error(e);}
}
function loadGame(){
  try{
    const raw=localStorage.getItem('districtZeroSave');if(!raw){toast('No save found');return;}
    const data=JSON.parse(raw),pos=data.player;
    if(![1,2,3,4].includes(data.version)||!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.z))throw Error('Invalid save');
    newGame();const savedPoint=data.map===MAP_ID?safePoint(pos):safePoint(SPAWN);player.x=savedPoint.x;player.z=savedPoint.z;
    const health=Number(pos.health);
    player.health=Number.isFinite(health)?clamp(data.version===1?health*2:health,1,MAX_HEALTH):MAX_HEALTH;
    player.ammo=clamp(Number(pos.ammo)||0,0,12);player.reserve=clamp(Number(pos.reserve)||0,0,60);
    if(data.version>=3&&data.progress){
      cash=clamp(Number(data.progress.cash)||0,0,999999);streetRep=clamp(Number(data.progress.streetRep)||0,0,9999);
      engineLevel=clamp(Math.floor(Number(data.progress.engineLevel)||0),0,3);completedJobs=clamp(Math.floor(Number(data.progress.completedJobs)||0),0,9999);
    }
    player.mesh.position.set(player.x,0,player.z);lastUiHealth=player.health;updateUI();toast('Game loaded');
  }catch(e){toast('Save could not be loaded');console.error(e);}
}
function refreshSaveButtons(){const has=!!localStorage.getItem('districtZeroSave');$('continueBtn').disabled=!has;$('loadBtn').disabled=!has;}
function showOverlay(){paused=true;aiming=false;multiplayer.closeChat();$('crosshair').hidden=true;if(document.pointerLockElement===canvas)document.exitPointerLock();$('overlay').hidden=false;$('resumeBtn').hidden=!playing;$('saveBtn').hidden=!playing;$('loadBtn').hidden=!playing;refreshSaveButtons();}
function hideOverlay(){paused=false;$('overlay').hidden=true;}
function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;toastTimer=3.5;}
function near(a,b,r){return dist(a,b)<r;}
function activePosition(){return player.inAircraft||player.inCar||player;}
function setObjective(point){objectiveMesh.visible=!!point;if(point)objectiveMesh.position.set(point.x,0,point.z);}
function finishJob(){
  const base={courier:120,taxi:180,race:320}[job.kind];
  const bonus=Math.round(Math.max(0,job.time)*2);const earned=base+bonus;
  cash+=earned;streetRep+=job.kind==='race'?3:1;completedJobs++;
  cue(880);
  toast(`${job.kind.toUpperCase()} COMPLETE · +₱${earned} · STREET REP +${job.kind==='race'?3:1}`);
  job=null;setObjective(null);taxiPassenger.visible=false;updateUI();
}
function startJob(kind){
  if(job){toast('Finish your current activity first');return;}
  if(wanted.level){toast('Lose the police before starting an activity');return;}
  if((kind==='taxi'||kind==='race')&&!player.inCar){toast('Get in a car to start this activity');return;}
  const time={courier:300,taxi:300,race:300}[kind];
  job={kind,index:0,time};setObjective(jobRoutes[kind][0]);taxiPassenger.visible=kind==='taxi';
  toast(`${kind.toUpperCase()} STARTED · Follow the gold marker`);updateUI();
}
function useGarage(){
  if(!player.inCar){toast('Bring a car into the garage to upgrade it');return;}
  if(Math.abs(player.inCar.speed)>1.5){toast('Stop the car before using the garage');return;}
  const price=250+engineLevel*200;
  if(engineLevel<3&&cash>=price){cash-=price;engineLevel++;cue(740);toast(`Engine upgraded to level ${engineLevel} · −₱${price}`);}
  else if(player.health<MAX_HEALTH&&cash>=60){cash-=60;player.health=MAX_HEALTH;cue(740);toast('Vehicle and health restored · −₱60');}
  else toast(engineLevel>=3?'Engine maxed out · Repairs cost ₱60':`Engine upgrade costs ₱${price}`);
  updateUI();
}
function updateJob(dt){
  if(!job)return;
  job.time-=dt;
  if(job.time<=0){toast('Activity timed out');job=null;setObjective(null);taxiPassenger.visible=false;return;}
  const point=jobRoutes[job.kind][job.index];
  if(dist(activePosition(),point)>5.5)return;
  if((job.kind==='race'||job.kind==='taxi')&&!player.inCar)return;
  job.index++;
  if(job.index>=jobRoutes[job.kind].length){finishJob();return;}
  setObjective(jobRoutes[job.kind][job.index]);
  if(job.kind==='taxi'&&job.index===1){taxiPassenger.visible=false;toast('Passenger aboard · Reach the destination');}
  else toast(`Checkpoint ${job.index}/${jobRoutes[job.kind].length}`);
}
function interact(){
  if(!playing||paused)return;
  if(player.inAircraft){exitAircraft();return;}
  if(player.jetpack){removeJetpack();return;}
  const hub=hubs.find(h=>near(activePosition(),h,5));
  if(hub){hub.kind==='garage'?useGarage():startJob(hub.kind);return;}
  if(player.inCar){exitCar();return;}
  const parked=aircraft.find(c=>!c.occupied&&c.y<2&&near(player,c,7));
  if(parked){enterAircraft(parked);return;}
  const car=cars.find(c=>near(player,c,5.2));
  if(car){enterCar(car);return;}
}
function airspaceBlocked(x,z,y,r=1){
  if(x-r<-WORLD.halfX||x+r>WORLD.halfX||z-r<-WORLD.halfZ||z+r>WORLD.halfZ)return true;
  if(y<4&&collides(x,z,r))return true;
  return district.buildings.some(b=>y<b.height+3&&insidePolygon(x,z,b.points));
}
function exitAircraft(force=false){
  const craft=player.inAircraft;if(!craft||!force&&(craft.y>2||Math.abs(craft.speed)>4)){toast('Land and slow down before exiting');return;}
  let spot=null;for(const side of [1,-1]){const x=craft.x+Math.cos(craft.h)*5*side,z=craft.z-Math.sin(craft.h)*5*side;if(!collides(x,z,1.1)){spot={x,z};break;}}
  if(!spot){toast('No clear space to exit');return;}
  craft.occupied=false;craft.speed=0;player.inAircraft=null;player.x=spot.x;player.z=spot.z;player.y=0;player.vy=0;player.mesh.position.set(player.x,0,player.z);player.mesh.visible=true;updateUI();
}
function enterAircraft(craft){
  if(craft.occupied||craft.y>2||player.y>1)return;
  craft.occupied=true;player.inAircraft=craft;player.jetpack=false;player.mesh.userData.jetpack.visible=false;player.mesh.visible=false;
  player.x=craft.x;player.z=craft.z;player.y=craft.y;camYaw=craft.h+Math.PI;camPitch=.5;updateUI();
}
function removeJetpack(){
  if(!player.jetpack)return;
  player.jetpack=false;player.mesh.userData.jetpack.visible=false;player.vy=0;
  toast(player.y>.2?'Jetpack removed · descending':'Jetpack removed');updateUI();
}
function equipJetpack(){
  if(player.jetpack){removeJetpack();return;}
  if(player.inAircraft){if(player.inAircraft.y>2){toast('Land before changing flight gear');return;}exitAircraft(true);if(player.inAircraft)return;}
  if(player.inCar)exitCar(true);
  player.jetpack=true;player.mesh.userData.jetpack.visible=true;player.vy=0;player.y=Math.max(player.y,1.2);player.mesh.position.y=player.y;
  cue(900);toast('ROCKETMAN · Space up · Ctrl down · E to remove');updateUI();
}
function spawnAircraft(kind){
  if(player.inAircraft){if(player.inAircraft.y>2){toast('Land before spawning another aircraft');return;}exitAircraft(true);if(player.inAircraft)return;}
  if(player.inCar)exitCar(true);
  let spot=null;for(let radius=8;radius<=24&&!spot;radius+=4)for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,x=player.x+Math.sin(angle)*radius,z=player.z+Math.cos(angle)*radius;
    if(!airspaceBlocked(x,z,2,4.5)){spot={x,z};break;}
  }
  if(!spot){toast('No clear space nearby for an aircraft');return;}
  player.jetpack=false;player.mesh.userData.jetpack.visible=false;player.y=0;player.vy=0;
  const mesh=createAircraftMesh(kind),craft={...spot,y:0,h:player.h,speed:0,vy:0,kind,mode:'hover',mesh,occupied:true};
  mesh.position.set(craft.x,0,craft.z);mesh.rotation.y=craft.h;scene.add(mesh);aircraft.push(craft);
  if(aircraft.length>5){const old=aircraft.find(c=>!c.occupied);if(old){scene.remove(old.mesh);aircraft.splice(aircraft.indexOf(old),1);}}
  player.inAircraft=craft;player.x=craft.x;player.z=craft.z;player.mesh.visible=false;camYaw=craft.h+Math.PI;camPitch=.5;
  cue(790);toast(kind==='jet'?'JUMPJET · W lift in hover · Numpad 8 or V for flight':'OHDUDE · W rise · S descend · ↑/↓ move');updateUI();
}
function applyCheat(code){if(code==='rocketman')equipJetpack();else if(code==='jumpjet')spawnAircraft('jet');else if(code==='ohdude')spawnAircraft('helicopter');}
function enterCar(car){
  if(car.occupied||Math.abs(car.speed)>1||dist(player,car)>5.2||player.y>0)return;
  car.occupied=true;player.inCar=car;player.mesh.visible=false;
  camYaw=car.h+Math.PI;camPitch=.44;
  updateUI();
}
function exitCar(force=false){
  const car=player.inCar;if(!car||(!force&&Math.abs(car.speed)>1.5))return;
  const sides=[1,-1];let spot=null;
  for(const s of sides){const x=car.x+Math.cos(car.h)*3.7*s,z=car.z-Math.sin(car.h)*3.7*s;if(!collides(x,z,1.1)){spot={x,z};break;}}
  if(!spot){if(!force){toast('No safe space to exit');return;}spot={...SPAWN};}
  player.x=spot.x;player.z=spot.z;player.vx=0;player.vz=0;player.mesh.position.set(player.x,0,player.z);player.mesh.visible=true;
  car.occupied=false;car.speed=0;player.inCar=null;
  updateUI();
}
function reportCrime(amount){
  const seen=peds.some(p=>p.alive&&dist(p,activePosition())<26&&!lineBlocked(p.x,p.z,activePosition().x,activePosition().z))||police.length>0;
  if(!seen)return;
  wanted.heat=clamp(wanted.heat+amount,0,100);wanted.level=wanted.heat>=60?2:1;wanted.last={x:activePosition().x,z:activePosition().z};
  while(police.length<wanted.level)spawnPolice();toast(wanted.level===2?'Wanted level 2':'Crime reported');
}
function spawnPolice(){
  const base=activePosition(),spots=driveSegments.map(s=>s.a).filter(s=>!collides(s.x,s.z,1));
  const spot=spots.sort((a,b)=>Math.abs(dist(a,base)-35)-Math.abs(dist(b,base)-35)).find(s=>!collides(s.x,s.z,1))||spots[0];
  const p={x:spot.x,z:spot.z,h:0,state:'investigate',lost:0,health:3,mesh:avatar(mats.police,true)};p.mesh.position.set(p.x,0,p.z);scene.add(p.mesh);police.push(p);
}
function setWeapon(kind){if(!playing||paused||player.inCar||player.inAircraft)return;player.weapon=kind;player.reloadingUntil=0;player.hudUntil=performance.now()+3500;player.mesh.userData.gun.visible=kind==='pistol';aiming=false;$('crosshair').hidden=true;updateUI();}
function hitCharacter(entity,damage){
  const now=performance.now();
  entity.health=(entity.health??(police.includes(entity)?3:2))-damage;
  entity.panic=6;entity.wait=0;entity.hitAt=now;entity.hitUntil=now+500;
  entity.knockX=(entity.x-player.x)/Math.max(1,dist(entity,player));
  entity.knockZ=(entity.z-player.z)/Math.max(1,dist(entity,player));
  playCharacter(entity.mesh,entity.health<=0?'Death':'HitReact',.08);
  glowAt(new THREE.Vector3(entity.x,2,entity.z),0xff202f,3.5,460,'hit');
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.88,.07,6,24),new THREE.MeshBasicMaterial({color:0xff3040,transparent:true,opacity:.9,depthWrite:false,depthTest:false}));
  ring.position.set(entity.x,2,entity.z);addCombatEffect(ring,380,'ring');
  const marker=$('hit-marker');marker.classList.remove('show');void marker.offsetWidth;marker.classList.add('show');
  reportCrime(police.includes(entity)?55:35);
  if(entity.health<=0){
    entity.alive=false;
    if(police.includes(entity))police.splice(police.indexOf(entity),1);
    fallenBodies.push({mesh:entity.mesh,born:now,until:now+850});
  }
}
function punch(){
  if(!playing||paused||player.inCar)return;
  const now=performance.now();if(now-player.shotAt<420)return;player.shotAt=now;
  player.attackArm=1-player.attackArm;player.attackUntil=now+330;
  player.h=camYaw+Math.PI;player.mesh.rotation.y=player.h;
  const forwardX=Math.sin(player.h),forwardZ=Math.cos(player.h);
  const target=[...peds.filter(p=>p.alive),...police].filter(entity=>{
    const dx=entity.x-player.x,dz=entity.z-player.z,d=Math.hypot(dx,dz);
    return d<3.2&&d>.01&&(dx*forwardX+dz*forwardZ)/d>.45&&!lineBlocked(player.x,player.z,entity.x,entity.z);
  }).sort((a,b)=>dist(a,player)-dist(b,player))[0];
  if(target){hitCharacter(target,1);cue(170);}else cue(105);
}
function shoot(){
  if(!playing||paused||player.inCar)return;
  if(player.reloadingUntil)return;
  const now=performance.now();if(now-player.shotAt<300)return;player.shotAt=now;
  if(player.ammo<=0){toast(`Press ${keyLabel(settings.bindings.reload)} to reload`);return;}player.ammo--;
  player.attackUntil=now+180;player.h=camYaw+Math.PI;player.mesh.rotation.y=player.h;
  player.mesh.userData.arms[1].rotation.x=-1.2;player.mesh.updateMatrixWorld(true);
  const ndc=(aiming||document.pointerLockElement===canvas)?new THREE.Vector2(0,0):new THREE.Vector2(pointer.x*2-1,1-pointer.y*2);raycaster.setFromCamera(ndc,camera);
  const targets=[...peds.filter(p=>p.alive),...police];const hits=raycaster.intersectObjects(targets.map(t=>t.mesh),true);
  const wall=raycaster.intersectObjects(solidMeshes,false)[0];
  const hit=hits.find(h=>h.distance<55&&h.distance<(wall?.distance??55)&&!lineBlocked(player.x,player.z,h.point.x,h.point.z));
  const start=player.mesh.userData.gun.localToWorld(new THREE.Vector3(0,0,.6));
  const end=hit?.point||wall?.point||raycaster.ray.at(40,new THREE.Vector3());
  const direction=end.clone().sub(start),length=direction.length();
  if(length>.01){
    const trace=new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,length,6),new THREE.MeshBasicMaterial({color:0xffdc85,transparent:true,opacity:.9,depthWrite:false}));
    trace.position.copy(start).addScaledVector(direction,.5);trace.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    addCombatEffect(trace,110,'trace');
  }
  const muzzle=new THREE.Mesh(new THREE.SphereGeometry(.32,8,6),new THREE.MeshBasicMaterial({color:0xffe8a2,transparent:true,opacity:1,depthWrite:false}));
  muzzle.position.copy(start);muzzle.scale.set(1,1,1.8);muzzle.lookAt(end);addCombatEffect(muzzle,105,'muzzle');
  glowAt(start,0xffa32b,2.3,140,'muzzleGlow');
  if(hit)glowAt(hit.point,0xff6329,1.35,220,'impact');
  if(hit){const entity=targets.find(t=>{let o=hit.object;while(o){if(o===t.mesh)return true;o=o.parent;}return false;});if(entity)hitCharacter(entity,1);}
  else{reportCrime(12);const marker=$('miss-marker');marker.classList.remove('show');void marker.offsetWidth;marker.classList.add('show');}
  const flash=$('shot-flash');flash.classList.remove('show');void flash.offsetWidth;flash.classList.add('show');
  camPitch=clamp(camPitch-.035,.16,1.25);
  gunSound();updateUI();
}
function attack(){if(player.inAircraft)return;if(player.weapon==='fists')punch();else shoot();}
function reload(){if(player.inCar||player.inAircraft||player.weapon!=='pistol'||player.ammo>=12||player.reserve<=0||player.reloadingUntil)return;player.reloadingUntil=performance.now()+1050;player.hudUntil=player.reloadingUntil+2000;updateUI();}

function moveWithCollision(entity,dx,dz,r){if(!collides(entity.x+dx,entity.z,r))entity.x+=dx;if(!collides(entity.x,entity.z+dz,r))entity.z+=dz;}
function updatePlayer(dt,t){
  if(player.reloadingUntil&&performance.now()>=player.reloadingUntil){
    const n=Math.min(12-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;player.reloadingUntil=0;cue(540);updateUI();
  }
  if(player.inAircraft){const c=player.inAircraft;
    const jetFlight=c.kind==='jet'&&c.mode==='flight',turn=(down('right')?1:0)-(down('left')?1:0),boost=down('sprint')?1.3:1;
    const pitch=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
    const forward=jetFlight?(down('forward')?1:0)-(down('back')?1:0):pitch;
    const top=jetFlight?64:c.kind==='jet'?17:27,accel=jetFlight?30:16;
    c.speed=clamp((c.speed+forward*accel*dt)*Math.pow(forward?.993:.945,dt*60),-top*.25,top*boost);
    c.h+=turn*dt*(jetFlight?.85:c.kind==='jet'?1.25:1.55)*(.65+Math.min(1,Math.abs(c.speed)/22)*.35);
    const manualUp=(down('jump')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')?1:0);
    const lift=jetFlight?manualUp+pitch*.65+(c.y<10?Math.min(Math.max(c.speed,0)/40,.55):0):manualUp+(down('forward')?1:0)-(down('back')?1:0);
    const climb=clamp(lift,-1,1);
    c.vy+=(climb*(jetFlight?13:c.kind==='jet'?17:13)-c.vy)*(1-Math.exp(-dt*6));
    const ny=clamp(c.y+c.vy*dt,0,110);
    if(!airspaceBlocked(c.x,c.z,ny,c.kind==='jet'?3:2.6))c.y=ny;else c.vy=0;
    const nx=c.x+Math.sin(c.h)*c.speed*dt,nz=c.z+Math.cos(c.h)*c.speed*dt;
    if(!airspaceBlocked(nx,nz,c.y,c.kind==='jet'?3:2.6)){c.x=nx;c.z=nz;}else c.speed=0;
    c.mesh.position.set(c.x,c.y,c.z);c.mesh.rotation.y=c.h;
    c.mesh.rotation.z+=(clamp(-turn*(jetFlight?.2:.12),-.2,.2)-c.mesh.rotation.z)*(1-Math.exp(-dt*3));
    c.mesh.rotation.x+=(clamp(-c.vy*.012-pitch*.07,-.18,.18)-c.mesh.rotation.x)*(1-Math.exp(-dt*3));
    player.x=c.x;player.z=c.z;player.y=c.y;player.h=c.h;
    if(performance.now()-lastLookAt>1300){const target=c.h+Math.PI,difference=Math.atan2(Math.sin(target-camYaw),Math.cos(target-camYaw));camYaw+=difference*(1-Math.exp(-dt*2.2));}
  }else if(player.inCar){const c=player.inCar;
    const gas=(down('forward')?1:0)-(down('back')?1:0);
    // Screen-facing steering: A turns left and D turns right for the car model's forward axis.
    const steer=(down('left')?1:0)-(down('right')?1:0);
    c.steer+=(steer-c.steer)*(1-Math.exp(-dt*8));
    c.speed+=gas*(19+engineLevel*3.5)*dt;c.speed*=Math.pow(down('jump')?.89:.989,dt*60);c.speed=clamp(c.speed,-10-engineLevel,29+engineLevel*5);
    if(Math.abs(c.speed)>.2)c.h+=c.steer*dt*1.5*clamp(Math.abs(c.speed)/7,.2,1)*Math.sign(c.speed);
    const nx=c.x+Math.sin(c.h)*c.speed*dt,nz=c.z+Math.cos(c.h)*c.speed*dt;
    if(!collides(nx,nz,2.25)){c.x=nx;c.z=nz;}else{
      c.speed=0;
      if(t-(c.lastCrashAt??-10)>1){player.health=clamp(player.health-3,0,MAX_HEALTH);c.lastCrashAt=t;}
    }
    c.mesh.position.set(c.x,0,c.z);c.mesh.rotation.y=c.h;player.x=c.x;player.z=c.z;
    if(!aiming&&performance.now()-lastLookAt>1400){const target=c.h+Math.PI,difference=Math.atan2(Math.sin(target-camYaw),Math.cos(target-camYaw));camYaw+=difference*(1-Math.exp(-dt*2.8));}
  }else{
    const f=(down('forward')?1:0)-(down('back')?1:0),r=(down('right')?1:0)-(down('left')?1:0),mag=Math.hypot(f,r);
    const speed=down('sprint')?16:10;
    const desiredX=mag?(-Math.sin(camYaw)*f+Math.cos(camYaw)*r)/mag*speed:0;
    const desiredZ=mag?(-Math.cos(camYaw)*f-Math.sin(camYaw)*r)/mag*speed:0;
    const blend=1-Math.exp(-dt*(mag?15:18));
    player.vx+=(desiredX-player.vx)*blend;player.vz+=(desiredZ-player.vz)*blend;
    if(player.jetpack){
      const nx=player.x+player.vx*dt,nz=player.z+player.vz*dt;
      if(!airspaceBlocked(nx,nz,player.y,1.05)){player.x=nx;player.z=nz;}
    }else moveWithCollision(player,player.vx*dt,player.vz*dt,1.05);
    if(Math.hypot(player.vx,player.vz)>.15){player.h=Math.atan2(player.vx,player.vz);player.mesh.rotation.y=player.h;
      player.mesh.userData.legs[0].rotation.x=Math.sin(t*13)*.45;player.mesh.userData.legs[1].rotation.x=-Math.sin(t*13)*.45;
    }else player.mesh.userData.legs.forEach(l=>l.rotation.x*=.8);
    if(aiming){player.h=camYaw+Math.PI;player.mesh.rotation.y=player.h;}
    if(player.jetpack){
      const climb=(down('jump')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')?1:0);
      player.vy+=(climb*(down('sprint')?17:11)-player.vy)*(1-Math.exp(-dt*7));
      const ny=clamp(player.y+player.vy*dt,0,110);if(!airspaceBlocked(player.x,player.z,ny,1.05))player.y=ny;
      player.mesh.userData.jetpack.userData.flames.forEach((flame,i)=>{flame.scale.y=.65+Math.abs(player.vy)*.04+Math.sin(t*24+i)*.08;flame.visible=player.y>.3||climb>0;});
    }else{player.vy=Math.max(-30,player.vy-32*dt);player.y=Math.max(0,player.y+player.vy*dt);if(player.y===0){player.vy=0;if(collides(player.x,player.z,1.05)){const landing=safePoint(player,1.05);player.x=landing.x;player.z=landing.z;}}}
    player.mesh.position.set(player.x,player.y,player.z);
    const attacking=performance.now()<player.attackUntil;
    const arms=player.mesh.userData.arms;
    const leftTarget=player.weapon==='fists'&&attacking&&player.attackArm===0?-1.4:0;
    const rightTarget=player.weapon==='pistol'?(player.reloadingUntil?-.55:aiming||attacking?-1.2:-.12):attacking&&player.attackArm===1?-1.4:0;
    const armBlend=1-Math.exp(-dt*24);
    arms[0].rotation.x+=(leftTarget-arms[0].rotation.x)*armBlend;
    arms[1].rotation.x+=(rightTarget-arms[1].rotation.x)*armBlend;
    arms[1].rotation.z+=((player.reloadingUntil?-.45:0)-arms[1].rotation.z)*armBlend;
  }
  if(player.mesh.userData.characterMixer){
    const pace=Math.hypot(player.vx,player.vz);
    const state=player.inCar||player.inAircraft||player.jetpack&&player.y>.15?'Idle':player.y>.15?'Jump':performance.now()<player.attackUntil&&player.weapon==='fists'?'Punch':pace>11?'Run':pace>.8?'Walk':'Idle';
    playCharacter(player.mesh,state);player.mesh.userData.characterMixer.update(dt);
  }
  if(player.health<=0){
    toast('You were injured. Returning to the district start.');player.health=MAX_HEALTH;
    job=null;setObjective(null);taxiPassenger.visible=false;
    if(player.inCar)exitCar(true);
    if(player.inAircraft){player.inAircraft.occupied=false;player.inAircraft=null;player.mesh.visible=true;}
    player.jetpack=false;player.mesh.userData.jetpack.visible=false;
    player.x=SPAWN.x;player.z=SPAWN.z;player.y=0;player.vy=0;player.vx=0;player.vz=0;player.mesh.position.set(player.x,0,player.z);
    wanted.heat=0;wanted.level=0;police.forEach(p=>scene.remove(p.mesh));police=[];if(policeHelicopter)scene.remove(policeHelicopter.mesh);policeHelicopter=null;
  }
}
function updateTraffic(dt){for(const c of traffic){const target=c.route[c.wp],dx=target.x-c.x,dz=target.z-c.z,d=Math.hypot(dx,dz);if(d<2){c.wp=(c.wp+1)%c.route.length;continue;}const nearPlayer=player.inCar&&dist(c,player.inCar)<8;const step=Math.min(d,c.speed*(nearPlayer?.2:1)*dt);c.x+=dx/d*step;c.z+=dz/d*step;c.h=Math.atan2(dx,dz);c.mesh.position.set(c.x,0,c.z);c.mesh.rotation.y=c.h;}}
function refreshCrowd(dt){
  crowdRefresh-=dt;if(crowdRefresh>0)return;crowdRefresh=2.5;
  const center=activePosition();
  for(let i=0;i<peds.length;i++){
    const p=peds[i],distance=dist(p,center);
    if(distance>145||!p.alive&&performance.now()-(p.hitUntil||0)>1800){
      const spot=pedestrianSpot(center,i+Math.floor(worldTime),30,110);
      p.x=spot.x;p.z=spot.z;p.node=spot.node;p.route=[];p.entrance=null;p.insideUntil=0;p.wait=1+Math.random()*3;p.panic=0;p.health=2;p.alive=true;
      setPedestrianRoute(p);
      p.mesh.rotation.x=0;p.mesh.rotation.z=0;p.mesh.position.set(p.x,0,p.z);if(!p.mesh.parent)scene.add(p.mesh);playCharacter(p.mesh,'Idle');
    }
    p.mesh.visible=p.alive&&p.insideUntil<=0&&dist(p,center)<125;
  }
}
function updatePeds(dt,t){for(const p of peds){
  if(!p.alive)continue;
  if(p.insideUntil>0){p.insideUntil-=dt;if(p.insideUntil<=0){p.insideUntil=0;setPedestrianRoute(p);p.mesh.visible=dist(p,activePosition())<125;}continue;}
  const hurt=performance.now()<(p.hitUntil||0),phase=hurt?(performance.now()-p.hitAt)/500:1;
  p.mesh.rotation.z=hurt?Math.sin(phase*Math.PI)*.3:0;p.mesh.userData.arms.forEach(arm=>arm.rotation.x=hurt?-.75:0);
  p.wait=Math.max(0,p.wait-dt);p.panic=Math.max(0,p.panic-dt);p.socialCooldown=Math.max(0,p.socialCooldown-dt);
  const friend=p.friendGroup===null?null:peds.find(other=>other!==p&&other.friendGroup===p.friendGroup&&other.alive&&!other.insideUntil);
  if(friend&&dist(p,friend)<3.5&&p.socialCooldown===0&&Math.random()<dt*.08){p.wait=friend.wait=2+Math.random()*2;p.socialCooldown=friend.socialCooldown=18+Math.random()*12;}
  if(friend&&dist(p,friend)>9&&p.route.length<friend.route.length&&p.panic<=0)p.wait=Math.max(p.wait,.15);
  if(player.inCar&&Math.abs(player.inCar.speed)>5&&dist(p,player.inCar)<8){p.panic=2;p.wait=0;}
  if(player.inCar&&Math.abs(player.inCar.speed)>9&&dist(p,player.inCar)<2.4&&t-(player.inCar.lastPedHitAt??-10)>2){
    player.inCar.lastPedHitAt=t;player.inCar.speed*=.5;player.health=clamp(player.health-4,0,MAX_HEALTH);p.panic=7;p.wait=0;
    reportCrime(35);toast('Pedestrian struck · Police alerted');
  }
  if(!p.route.length&&!p.entrance)setPedestrianRoute(p);
  const target=p.route.length?pedestrianNodes[p.route[0]]:p.entrance?.point,dx=target?target.x-p.x:0,dz=target?target.z-p.z:0,d=Math.hypot(dx,dz);
  if(target&&d<.7){
    if(p.route.length)p.node=p.route.shift();
    else{p.insideUntil=5+Math.random()*9;p.mesh.visible=false;p.entrance=null;continue;}
  }
  else if(target&&p.wait<=0&&!hurt){
    const speed=p.panic>0?4.7:1.65+(p.node%4)*.13,step=Math.min(d,speed*dt);
    moveWithCollision(p,dx/d*step,dz/d*step,.65);p.h=Math.atan2(dx,dz);p.mesh.rotation.y=p.h;
    p.mesh.userData.legs[0].rotation.x=Math.sin(t*8+p.x)*.28;p.mesh.userData.legs[1].rotation.x=-p.mesh.userData.legs[0].rotation.x;
  }
  if(friend&&p.wait>0&&friend.wait>0){p.mesh.rotation.y=Math.atan2(friend.x-p.x,friend.z-p.z);}
  p.mesh.position.set(p.x,hurt?-.15*Math.sin(phase*Math.PI):0,p.z);
  if(p.mesh.visible&&p.mesh.userData.characterMixer){playCharacter(p.mesh,hurt&& !p.mesh.userData.womanVisual?'HitReact':p.wait>0?'Idle':target?p.panic>0?'Run':'Walk':'Idle');p.mesh.userData.characterMixer.update(dt);}
}}
function updatePoliceHelicopter(dt,subject){
  const airborne=wanted.heat>0&&!player.inCar&&subject.y>=POLICE_AIR_RESPONSE_HEIGHT;
  if(!airborne){if(policeHelicopter)scene.remove(policeHelicopter.mesh);policeHelicopter=null;return false;}
  if(!policeHelicopter){
    const mesh=createAircraftMesh('helicopter',true),pilot=avatar(mats.police,true);
    pilot.scale.setScalar(.43);pilot.position.set(0,.6,2.3);mesh.add(pilot);
    const height=clamp(subject.y+8,10,105);
    const offsets=[[34,34],[-34,34],[34,-34],[-34,-34],[0,30]];
    const start=offsets.map(([dx,dz])=>({x:clamp(subject.x+dx,-WORLD.halfX+8,WORLD.halfX-8),z:clamp(subject.z+dz,-WORLD.halfZ+8,WORLD.halfZ-8)})).find(p=>!airspaceBlocked(p.x,p.z,height,2.6))||{x:subject.x,z:subject.z};
    policeHelicopter={mesh,x:start.x,y:height,z:start.z,lastShot:0};
    mesh.position.set(policeHelicopter.x,policeHelicopter.y,policeHelicopter.z);scene.add(mesh);
    toast('Police helicopter inbound');
  }
  const cop=policeHelicopter;
  const goalX=clamp(subject.x+Math.cos(subject.h||0)*15,-WORLD.halfX+8,WORLD.halfX-8);
  const goalZ=clamp(subject.z-Math.sin(subject.h||0)*15,-WORLD.halfZ+8,WORLD.halfZ-8);
  const dx=goalX-cop.x,dz=goalZ-cop.z,d=Math.hypot(dx,dz),step=Math.min(d,19*dt);
  let nextX=cop.x+(d>.01?dx/d*step:0),nextZ=cop.z+(d>.01?dz/d*step:0);
  let nextY=cop.y+(clamp(subject.y+5,10,105)-cop.y)*(1-Math.exp(-dt*2));
  if(airspaceBlocked(nextX,nextZ,nextY,2.6)){
    const clearHeight=[nextY+8,nextY+16,nextY+24].find(y=>y<=105&&!airspaceBlocked(nextX,nextZ,y,2.6));
    if(clearHeight)nextY=clearHeight;
    else{nextX=cop.x;nextZ=cop.z;nextY=cop.y;}
  }
  cop.x=nextX;cop.z=nextZ;cop.y=nextY;
  cop.mesh.position.set(cop.x,cop.y+Math.sin(performance.now()*.002)*.2,cop.z);
  cop.mesh.rotation.y=Math.atan2(subject.x-cop.x,subject.z-cop.z);
  animateAircraft(cop.mesh,'helicopter',dt);
  const range=Math.hypot(subject.x-cop.x,subject.y-cop.y,subject.z-cop.z);
  const hasSight=range<42;
  if(hasSight&&range<31&&performance.now()-cop.lastShot>1600){
    cop.lastShot=performance.now();
    cop.mesh.updateMatrixWorld(true);
    const start=cop.mesh.localToWorld(new THREE.Vector3(0,1.8,2.4));
    const end=new THREE.Vector3(subject.x,subject.y+(player.inAircraft?2:2.4),subject.z);
    const ray=end.clone().sub(start),length=ray.length();
    if(length>.1){
      const trace=new THREE.Mesh(new THREE.CylinderGeometry(.045,.065,length,6),new THREE.MeshBasicMaterial({color:0xffca68,transparent:true,opacity:.85,depthWrite:false}));
      trace.position.copy(start).addScaledVector(ray,.5);
      trace.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),ray.normalize());
      addCombatEffect(trace,180,'trace');
    }
    player.health=clamp(player.health-5,0,MAX_HEALTH);
  }
  return hasSight;
}
function updatePolice(dt,t){let seen=false;const subject=activePosition(),groundReach=subject.y<POLICE_GROUND_REACH;for(const p of police){const hurt=performance.now()<(p.hitUntil||0),phase=hurt?(performance.now()-p.hitAt)/500:1;p.mesh.rotation.z=hurt?Math.sin(phase*Math.PI)*.3:0;p.mesh.userData.arms.forEach(arm=>arm.rotation.x=hurt?-.75:0);if(hurt)moveWithCollision(p,p.knockX*dt*2,p.knockZ*dt*2,.85);const d=dist(p,subject),hasSight=groundReach&&d<34&&!lineBlocked(p.x,p.z,subject.x,subject.z);if(hasSight){seen=true;p.state='chase';p.lost=0;wanted.last={x:subject.x,z:subject.z};}else{p.lost+=dt;p.state=p.lost<6?'search':'return';}
  const goal=p.state==='chase'?subject:wanted.last,dx=goal.x-p.x,dz=goal.z-p.z,len=Math.hypot(dx,dz);
  if(len>1.8&&!hurt){const speed=p.state==='chase'?6.3:4.4;moveWithCollision(p,dx/len*speed*dt,dz/len*speed*dt,.85);p.h=Math.atan2(dx,dz);p.mesh.rotation.y=p.h;p.mesh.userData.legs[0].rotation.x=Math.sin(t*12)*.4;p.mesh.userData.legs[1].rotation.x=-p.mesh.userData.legs[0].rotation.x;}
  p.mesh.position.set(p.x,hurt?-.15*Math.sin(phase*Math.PI):0,p.z);
  if(hasSight&&d<2.5&&!player.inCar)player.health=clamp(player.health-4*dt,0,MAX_HEALTH);
}
  if(updatePoliceHelicopter(dt,subject)){seen=true;wanted.last={x:subject.x,z:subject.z};}
  if(wanted.heat>0){if(!seen)wanted.heat=Math.max(0,wanted.heat-10*dt);wanted.level=wanted.heat>=60?2:wanted.heat>0?1:0;
    if(!wanted.level){police.forEach(p=>scene.remove(p.mesh));police=[];if(policeHelicopter)scene.remove(policeHelicopter.mesh);policeHelicopter=null;toast('Police lost your trail');}
  }
}
function updateCamera(dt){
  const a=activePosition(),distance=aiming&&!player.inAircraft?7.5:player.inAircraft?31:player.inCar?23:17,targetHeight=(a.y||0)+(player.inAircraft?2.6:player.inCar?2.2:2.4);
  const focus=new THREE.Vector3(a.x,targetHeight,a.z);
  const cameraPitch=aiming?Math.atan(Math.tan(camPitch)*.45):camPitch;
  const horizontal=distance*Math.cos(cameraPitch);
  const right=new THREE.Vector3(-Math.cos(camYaw),0,Math.sin(camYaw));
  const shoulder=aiming&&!player.inCar?1.15:0;
  const desired=new THREE.Vector3(a.x+Math.sin(camYaw)*horizontal,targetHeight+distance*Math.sin(cameraPitch),a.z+Math.cos(camYaw)*horizontal).addScaledVector(right,shoulder);
  const candidate=camera.position.clone().lerp(desired,1-Math.exp(-dt*8));
  const offset=candidate.clone().sub(focus),length=offset.length();
  cameraRaycaster.set(focus,offset.normalize());cameraRaycaster.far=length;
  const hit=cameraRaycaster.intersectObjects(solidMeshes,false)[0];
  if(hit&&hit.distance<length)candidate.copy(focus).addScaledVector(offset,Math.max(.8,hit.distance-.5));
  camera.position.copy(candidate);
  const lookTarget=focus.clone();
  if(aiming&&!player.inCar)lookTarget.add(new THREE.Vector3(-Math.sin(camYaw)*4,0,-Math.cos(camYaw)*4));
  camera.lookAt(lookTarget);
}
function updateUI(){if(!player)return;
  const now=performance.now();
  if(player.health<lastUiHealth-.1&&now-lastDamageFlash>450){const flash=$('damage-flash');flash.classList.remove('show');void flash.offsetWidth;flash.classList.add('show');lastDamageFlash=now;}
  lastUiHealth=player.health;
  $('health-value').textContent=Math.ceil(player.health);$('health-bar').style.width=`${player.health/MAX_HEALTH*100}%`;$('wanted-stars').textContent='★'.repeat(wanted.level)+'☆'.repeat(2-wanted.level);
  $('wanted-row').hidden=wanted.level===0;$('rep-row').hidden=false;$('upgrade-row').hidden=!player.inCar;
  $('speed-row').hidden=!player.inCar&&!player.inAircraft;$('speed-value').textContent=player.inAircraft?Math.round(Math.abs(player.inAircraft.speed)*3.6):player.inCar?Math.round(Math.abs(player.inCar.speed)*3.6):0;
  $('weapon-row').hidden=true;$('ammo-row').hidden=true;
  const combatVisible=!player.inCar&&!player.inAircraft&&(aiming||now<(player.hudUntil||0)||now-player.shotAt<3000||!!player.reloadingUntil);
  $('combat-hud').hidden=!combatVisible;$('combat-hud').classList.toggle('unarmed',player.weapon==='fists');
  $('combat-weapon').textContent=player.weapon==='pistol'?'PISTOL':'FISTS';
  $('combat-ammo').textContent=`${player.ammo} / ${player.reserve}`;
  $('ammo-fill').style.width=`${player.ammo/12*100}%`;
  $('reload-prompt').hidden=player.weapon!=='pistol'||(player.ammo>3&&!player.reloadingUntil)||player.reserve<=0;
  $('reload-prompt').textContent=player.reloadingUntil?'RELOADING…':`${keyLabel(settings.bindings.reload)} · RELOAD`;
  $('ammo-value').textContent=`${player.ammo} / ${player.reserve}`;
  $('cash-value').textContent=`₱${cash.toLocaleString()}`;$('rep-value').textContent=streetRep;$('upgrade-value').textContent=`LV ${engineLevel}`;
  const activityText={courier:'Deliver the parcel',taxi:job?.index===0?'Pick up the passenger':'Take the passenger to the destination',race:'Clear every circuit checkpoint'};
  $('activity-label').textContent=job?job.kind.toUpperCase():'CITY LIFE';
  $('activity-title').textContent=job?activityText[job.kind]:'Make your own way';
  $('activity-detail').textContent=job?`Follow the bright destination marker · ${Math.ceil(job.time)}s left`:'Visit a colored street marker for a courier run, passenger fare, or street circuit.';
  $('activity-progress').hidden=!job;
  if(job)$('activity-progress').textContent=`STOP ${job.index+1} / ${jobRoutes[job.kind].length} · REWARD ₱${{courier:120,taxi:180,race:320}[job.kind]}+`;
  $('nav-cue').hidden=!job;$('objective-distance').hidden=!job;
  if(job){
    const target=jobRoutes[job.kind][job.index],route=routePoints(activePosition(),target);
    const distance=Math.round(route.slice(1).reduce((sum,point,index)=>sum+dist(route[index],point),0));
    $('nav-title').textContent=job.kind==='race'?'NEXT CHECKPOINT':job.kind==='taxi'&&job.index===0?'PICKUP':'DESTINATION';
    $('nav-distance').textContent=`${distance} m by road`;$('objective-distance').textContent=`◆ ${distance} m by road · ${Math.ceil(job.time)}s left`;
    const next=route[1]||target,heading=Math.atan2(next.x-activePosition().x,next.z-activePosition().z),viewHeading=camYaw+Math.PI;
    const turn=Math.atan2(Math.sin(heading-viewHeading),Math.cos(heading-viewHeading));
    $('nav-direction').textContent=Math.abs(turn)>2.35?'TURN AROUND':turn>.4?'RIGHT':turn<-.4?'LEFT':'AHEAD';
    $('nav-arrow').style.transform=`rotate(${turn}rad)`;
  }
  $('hint').textContent=player.inAircraft?.kind==='jet'?(player.inAircraft.mode==='hover'?'JET HOVER · W rise · S descend · ↑/↓ drift · Num 8 or V flight mode · E exit after landing':'JET FLIGHT · W thrust · S brake · A/D turn · ↑/↓ pitch · Num 2 or V hover mode'):player.inAircraft?'HELICOPTER · W rise · S descend · ↑/↓ move · A/D turn · E exit after landing':player.jetpack?'JETPACK · WASD move · Space rise · Ctrl descend · E remove':player.inCar?`${keyLabel(settings.bindings.forward)}/${keyLabel(settings.bindings.back)} drive · ${keyLabel(settings.bindings.interact)} exit`:`${keyLabel(settings.bindings.forward)}/${keyLabel(settings.bindings.back)} move · ${keyLabel(settings.bindings.fists)} fists · ${keyLabel(settings.bindings.pistol)} pistol · Click attack · Type ROCKETMAN, JUMPJET, or OHDUDE`;
  const car=!player.inCar?cars.find(c=>near(player,c,5.2)):null;let prompt='';
  const hub=hubs.find(h=>near(activePosition(),h,5));
  if(player.jetpack)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> REMOVE JETPACK`;
  else if(player.inAircraft&&player.inAircraft.y<2&&Math.abs(player.inAircraft.speed)<4)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> EXIT AIRCRAFT`;
  else if(hub)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> ${hub.kind==='garage'?'USE GARAGE':`START ${hub.label}`}`;
  else if(aircraft.some(c=>!c.occupied&&c.y<2&&near(player,c,7)))prompt=`<b>${keyLabel(settings.bindings.interact)}</b> ENTER AIRCRAFT`;
  else if(car)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> ENTER CAR`;
  else if(player.inCar&&Math.abs(player.inCar.speed)<1.5)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> EXIT VEHICLE`;
  $('prompt').innerHTML=prompt;$('prompt').hidden=!prompt;
  const position=activePosition(),nearby=featuredPlaces.map(p=>({name:p.name,distance:Math.hypot(position.x-p.point[0],position.z-p.point[1])})).sort((a,b)=>a.distance-b.distance)[0];
  $('district-location').textContent=nearestRoad(position).name+(nearby?.distance<24?` · ${nearby.name}`:'');
  const mins=Math.floor(worldTime)%1440;$('clock').textContent=`DAY 01 · ${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
}
function drawDistrictMap(context,w,h,labels=false){
  const radar=!labels&&!!player,center=player?activePosition():SPAWN;
  const sx=radar?2.2:w/(WORLD.halfX*2),sz=radar?2.2:h/(WORLD.halfZ*2);
  const X=x=>radar?w/2+(x-center.x)*sx:(x+WORLD.halfX)*sx;
  const Z=z=>radar?h/2+(z-center.z)*sz:(z+WORLD.halfZ)*sz;
  if(radar){context.save();context.beginPath();context.arc(w/2,h/2,w/2-2,0,Math.PI*2);context.clip();}
  context.fillStyle='#617c62';context.fillRect(0,0,w,h);
  for(const park of district.parks){context.fillStyle='#8ca97a';context.beginPath();park.points.forEach((p,i)=>i?context.lineTo(X(p[0]),Z(p[1])):context.moveTo(X(p[0]),Z(p[1])));context.closePath();context.fill();}
  context.lineCap='round';for(const road of driveSegments){context.strokeStyle='#34444b';context.lineWidth=Math.max(labels?1.5:1,road.width*sx);context.beginPath();context.moveTo(X(road.a.x),Z(road.a.z));context.lineTo(X(road.b.x),Z(road.b.z));context.stroke();}
  context.fillStyle='#c2c8bf';for(const building of district.buildings){context.beginPath();building.points.forEach((p,i)=>i?context.lineTo(X(p[0]),Z(p[1])):context.moveTo(X(p[0]),Z(p[1])));context.closePath();context.fill();}
  if(job&&player){const route=routePoints(activePosition(),jobRoutes[job.kind][job.index]);context.strokeStyle='#ffe38b';context.lineWidth=labels?4:2;context.beginPath();route.forEach((p,i)=>i?context.lineTo(X(p.x),Z(p.z)):context.moveTo(X(p.x),Z(p.z)));context.stroke();}
  for(const hub of hubs){context.fillStyle='#'+hub.color.toString(16).padStart(6,'0');context.beginPath();context.arc(X(hub.x),Z(hub.z),labels?6:3,0,Math.PI*2);context.fill();}
  if(labels){
    const occupied=[];
    const label=(name,x,y,color,font='bold 11px sans-serif')=>{
      context.font=font;const width=context.measureText(name).width,rect={l:x-width/2-3,r:x+width/2+3,t:y-12,b:y+3};
      if(rect.l<3||rect.r>w-3||rect.t<3||rect.b>h-3||occupied.some(p=>rect.l<p.r&&rect.r>p.l&&rect.t<p.b&&rect.b>p.t))return false;
      occupied.push(rect);context.textAlign='center';context.lineWidth=3;context.strokeStyle='#193239';context.strokeText(name,x,y);context.fillStyle=color;context.fillText(name,x,y);return true;
    };
    const byStreet=new Map();for(const road of driveSegments){if(!road.name||road.name==='Access lane'||road.kind==='service')continue;const length=Math.hypot(road.b.x-road.a.x,road.b.z-road.a.z);if(length>(byStreet.get(road.name)?.length||0))byStreet.set(road.name,{road,length});}
    for(const [name,{road}] of byStreet){label(name,X((road.a.x+road.b.x)/2),Z((road.a.z+road.b.z)/2),'#fff2c9','bold 11px sans-serif');}
    for(const place of featuredPlaces){const x=X(place.point[0]),y=Z(place.point[1]),style=placeStyle(place.name,place.kind);context.fillStyle=style.background;context.beginPath();context.arc(x,y,4,0,Math.PI*2);context.fill();label(place.name,x,y-7,style.foreground,'bold 10px sans-serif');}
    for(const p of landmarks){const x=X(p.x),y=Z(p.z);context.fillStyle='#10272d';context.fillRect(x-4,y-4,8,8);label(p.name,x,y-9,'#fff1cb','bold 11px sans-serif');}
    context.textAlign='left';context.font='bold 12px sans-serif';context.fillStyle='#fff1cb';context.fillText('N ↑',12,22);
  }
  if(player){context.save();context.translate(X(player.x),Z(player.z));context.rotate(-(player.inCar?.h??player.h));context.fillStyle='#fff';context.beginPath();context.moveTo(0,labels?8:5);context.lineTo(-4,-4);context.lineTo(4,-4);context.closePath();context.fill();context.restore();}
  if(radar){context.fillStyle='#f8dfad';context.font='bold 12px sans-serif';context.textAlign='center';context.fillText('N',w/2,17);context.restore();}
}
function drawMini(){drawDistrictMap(ctx,mini.width,mini.height);if(!$('district-map-panel').hidden){const map=$('district-map');drawDistrictMap(map.getContext('2d'),map.width,map.height,true);}}
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function updateAtmosphere(){
  const hour=(worldTime%1440)/60;
  const daylight=clamp(Math.sin((hour-6)/12*Math.PI),0,1);
  scene.background.copy(nightSky).lerp(daySky,daylight);
  scene.fog.color.copy(scene.background);
  sun.intensity=.3+daylight*2.1;
  ambient.intensity=.55+daylight*1.55;
  renderer.toneMappingExposure=.9+daylight*.38;
  sun.position.set(-240+Math.cos(hour/24*Math.PI*2)*110,380+daylight*140,140+Math.sin(hour/24*Math.PI*2)*140);
  if(engineGain&&audioContext){
    const speed=playing&&!paused&&player?.inCar?Math.abs(player.inCar.speed):0;
    engineGain.gain.setTargetAtTime(playing&&!paused&&player&&player.inCar ? 0.025 : 0,audioContext.currentTime,.12);
    engineTone.frequency.setTargetAtTime(45+speed*4,audioContext.currentTime,.08);
  }
}
window.addEventListener('resize',resize);resize();
window.addEventListener('keydown',e=>{
  if(waitingForBinding){
    e.preventDefault();
    if(e.code==='Escape'){waitingForBinding=null;renderBindings();return;}
    if(e.code==='KeyT'){toast('T is reserved for open mic');return;}
    if(!/^(Key[A-Z]|Digit[0-9]|Enter|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.code))return;
    const current=settings.bindings[waitingForBinding],other=Object.keys(settings.bindings).find(action=>action!==waitingForBinding&&settings.bindings[action]===e.code);
    if(other)settings.bindings[other]=current;
    settings.bindings[waitingForBinding]=e.code;waitingForBinding=null;saveSettings();applySettings();renderBindings();return;
  }
  if(playing&&!paused&&!multiplayer.isTyping()&&/^Key[A-Z]$/.test(e.code)&&!(e.target instanceof HTMLElement&&e.target.closest('input,select,button'))){
    const cheats=['rocketman','jumpjet','ohdude'];
    if(e.repeat&&cheatBuffer&&cheats.some(word=>word.startsWith(cheatBuffer))){e.preventDefault();return;}
    if(!e.repeat){
      const now=performance.now();if(now-cheatTime>1800)cheatBuffer='';cheatTime=now;
      const letter=e.code.slice(3).toLowerCase(),candidate=cheatBuffer+letter;
      cheatBuffer=cheats.some(word=>word.startsWith(candidate))?candidate:cheats.some(word=>word.startsWith(letter))?letter:'';
      const code=cheats.find(word=>word===cheatBuffer);
      if(code){e.preventDefault();keys.clear();cheatBuffer='';applyCheat(code);return;}
      if(cheatBuffer&&cheatBuffer!=='r'){e.preventDefault();return;}
    }
  }
  if(multiplayer.handlesKey(e)){keys.clear();return;}
  if(paused&&e.code!=='Escape'&&e.target instanceof HTMLElement&&e.target.closest('input,select,button'))return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'){if(playing){paused?hideOverlay():showOverlay();}return;}
  if(paused||!playing||e.target instanceof HTMLElement&&e.target.closest('input,select,button'))return;
  keys.add(e.code);if(e.repeat)return;
  if(player.inAircraft?.kind==='jet'&&['Numpad8','Numpad2','KeyB'].includes(e.code)){
    player.inAircraft.mode=e.code==='Numpad8'?'flight':e.code==='Numpad2'?'hover':player.inAircraft.mode==='hover'?'flight':'hover';
    cue(player.inAircraft.mode==='flight'?850:570);toast(player.inAircraft.mode==='flight'?'JET FLIGHT · W accelerates, ↑/↓ adjusts altitude':'JET HOVER · W climbs, S descends');updateUI();return;
  }
  if(matchKey(e,'jump')&&!player.inCar&&!player.inAircraft&&!player.jetpack&&player.y===0)player.vy=11;
  else if(matchKey(e,'interact'))interact();
  else if(matchKey(e,'fists'))setWeapon('fists');
  else if(matchKey(e,'pistol'))setWeapon('pistol');
  else if(matchKey(e,'switchWeapon'))setWeapon(player.weapon==='pistol'?'fists':'pistol');
  else if(matchKey(e,'reload'))reload();
  else if(e.code==='F5'){e.preventDefault();saveGame();}
  else if(e.code==='F9'){e.preventDefault();loadGame();}
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(playing)showOverlay();});
document.addEventListener('pointermove',e=>{
  if(!playing||paused)return;
  if(document.pointerLockElement===canvas||e.target===canvas){
    camYaw-=clamp(e.movementX,-80,80)*.005*settings.sensitivity;
    camPitch=clamp(camPitch+clamp(e.movementY,-80,80)*.005*settings.sensitivity,.16,1.25);
    lastLookAt=performance.now();
  }
  if(document.pointerLockElement!==canvas&&e.target===canvas){pointer.x=e.clientX/window.innerWidth;pointer.y=e.clientY/window.innerHeight;}
});
canvas.addEventListener('pointerdown',e=>{
  if(!playing||paused)return;
  const captured=document.pointerLockElement===canvas;
  if(e.button===2&&!player.inAircraft){aiming=true;$('crosshair').hidden=false;}
  if(!captured&&!pointerLockUnavailable&&canvas.requestPointerLock){
    try{Promise.resolve(canvas.requestPointerLock()).catch(()=>{pointerLockUnavailable=true;});}
    catch{pointerLockUnavailable=true;}
  }
  if(e.button===0)attack();
});
window.addEventListener('pointerup',e=>{if(e.button===2){aiming=false;$('crosshair').hidden=true;}});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas){hadPointerLock=true;return;}
  const wasCaptured=hadPointerLock;hadPointerLock=false;aiming=false;$('crosshair').hidden=true;
  if(wasCaptured&&playing&&!paused&&!multiplayer.isTyping())showOverlay();
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.style.cursor='crosshair';
$('newBtn').onclick=newGame;$('continueBtn').onclick=loadGame;$('resumeBtn').onclick=hideOverlay;$('saveBtn').onclick=()=>saveGame();$('loadBtn').onclick=loadGame;$('pauseBtn').onclick=()=>{if(playing)paused?hideOverlay():showOverlay();};
try{refreshSaveButtons();}catch(e){console.warn('Local storage unavailable',e);}
// Show an animated district behind the initial menu.
let last=performance.now(),elapsed=0,uiTimer=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;elapsed+=dt;
  for(let i=combatEffects.length-1;i>=0;i--){
    const effect=combatEffects[i],progress=clamp((now-effect.born)/(effect.until-effect.born),0,1);
    if(progress>=1){combatEffects.splice(i,1);scene.remove(effect.mesh);effect.mesh.geometry?.dispose();effect.mesh.material.dispose();continue;}
    effect.mesh.material.opacity=1-progress;
    if(effect.kind==='hit'){const size=3.5+progress*1.8;effect.mesh.scale.set(size,size,1);}
    if(effect.kind==='ring'){effect.mesh.quaternion.copy(camera.quaternion);effect.mesh.scale.setScalar(1+progress*.8);}
    if(effect.kind==='muzzle'||effect.kind==='muzzleGlow')effect.mesh.scale.multiplyScalar(1+dt*2);
  }
  for(let i=fallenBodies.length-1;i>=0;i--){
    const body=fallenBodies[i],progress=clamp((now-body.born)/(body.until-body.born),0,1);
    if(body.mesh.userData.characterMixer)body.mesh.userData.characterMixer.update(dt);
    else body.mesh.rotation.x=progress*1.35;
    body.mesh.position.y=-progress*.6;
    if(progress>=1){scene.remove(body.mesh);fallenBodies.splice(i,1);}
  }
  if(playing&&!paused){worldTime+=dt*1.2;updatePlayer(dt,elapsed);updateTraffic(dt);refreshCrowd(dt);updatePeds(dt,elapsed);updatePolice(dt,elapsed);updateJob(dt);hubMeshes.forEach((mesh,i)=>{mesh.children[0].rotation.z+=dt*(i%2?-.5:.5);mesh.children[2].lookAt(camera.position);});if(job){objectiveMesh.children[2].lookAt(camera.position);objectiveHalo.rotation.z+=dt*.5;objectiveBeam.material.opacity=.1+Math.sin(elapsed*3)*.035;}if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').hidden=true;}uiTimer-=dt;if(uiTimer<=0){updateUI();drawMini();uiTimer=.12;}}
  if(taxiPassenger.visible)taxiPassenger.userData.characterMixer?.update(dt);
  for(const craft of aircraft)animateAircraft(craft.mesh,craft.kind,dt,craft.occupied);
  updateAtmosphere();if(playing){multiplayer.update(dt);voice.update(dt);}
  if(playing)updateCamera(dt);else{camera.position.set(-170,210,300);camera.lookAt(0,20,-50);}
  renderer.render(scene,camera);
}
requestAnimationFrame(frame);

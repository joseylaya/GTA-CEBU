import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { WORLD, createDistrict, collides as worldCollides, lineBlocked, box, solids, solidMeshes, insidePolygon, setFacadeNight } from './world.js';
import { createJetpackMesh, createAircraftMesh, animateAircraft } from './flight.js';
import { createMultiplayer } from './multiplayer.js';
import { VoiceChatManager } from './voice/VoiceChatManager.js';
import { APPEARANCE_OPTIONS, STYLE_OPTIONS, normalizeAppearance } from './appearance.js';
import { settings, saveSettings, keyLabel } from './settings.js';
import { district, driveSegments, nearestRoad, routePoints, landmarks, landmark, trafficLoop, SPAWN, MAP_ID } from './geography.js';
import { FFA_WEAPONS } from './ffaWeapons.js';
import { progress as levelProgress } from './progression.js';
import { featuredPlaces, placeStyle } from './places.js';
import { pedestrianNodes, pedestrianSpots, pedestrianEntrances, pedestrianPath, closestPedestrianNode } from './pedestrian-lanes.js';
import {ActivityManager,ACTIVITY_STATES,ACTIVITY_DEFINITIONS} from './activities.js';

const $=id=>document.getElementById(id);
const canvas=$('game'), mini=$('minimap'), ctx=mini.getContext('2d');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
const MAX_PIXEL_RATIO=Math.min(window.devicePixelRatio||1,2);
let pixelRatio=MAX_PIXEL_RATIO;
renderer.setPixelRatio(pixelRatio); renderer.shadowMap.enabled=true;
// Watches a rolling average and trades resolution for frame rate, then gives it
// back once there is headroom. Hysteresis keeps it from oscillating.
let frameAverage=16.7,qualityHold=0;
function adaptQuality(frameMs,dt){
  frameAverage+=(frameMs-frameAverage)*.05;
  qualityHold-=dt;
  if(qualityHold>0)return;
  const floor=Math.min(1,MAX_PIXEL_RATIO);
  if(frameAverage>22&&pixelRatio>floor){
    pixelRatio=Math.max(floor,pixelRatio-.25);
    renderer.setPixelRatio(pixelRatio);qualityHold=2.5;
  }else if(frameAverage<13&&pixelRatio<MAX_PIXEL_RATIO){
    pixelRatio=Math.min(MAX_PIXEL_RATIO,pixelRatio+.25);
    renderer.setPixelRatio(pixelRatio);qualityHold=4;
  }
}
renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
// Let the browser paint the loading screen before the district is built.
// Everything from here is synchronous and takes seconds; the DOM was ready at
// around 40ms but first paint was landing after all of it, so the player sat
// looking at nothing. Top-level await is fine: this module is the entry point
// and nothing imports it.
await new Promise(resolve=>{
  const go=()=>resolve();
  // Two frames: one to lay out, one to actually composite.
  requestAnimationFrame(()=>requestAnimationFrame(go));
  // A backgrounded tab never animates, so never hang on the frame callback.
  setTimeout(go,400);
});
const scene=new THREE.Scene();const {sun,ambient,assetsReady:worldAssetsReady}=createDistrict(scene);
scene.updateMatrixWorld(true);
const deductionScene=new THREE.Scene();deductionScene.background=new THREE.Color(0xaac5cf);deductionScene.fog=new THREE.Fog(0xaac5cf,120,280);
const deductionAmbient=new THREE.HemisphereLight(0xd9ecf0,0x52645a,2.2),deductionSun=new THREE.DirectionalLight(0xfff1ce,3.1);deductionSun.position.set(-90,160,80);deductionSun.castShadow=true;deductionScene.add(deductionAmbient,deductionSun);
const camera=new THREE.PerspectiveCamera(62,1,.1,1400);
const raycaster=new THREE.Raycaster();
const cameraRaycaster=new THREE.Raycaster();
const cameraEye=new THREE.Vector3(),cameraForward=new THREE.Vector3(),cameraFocus=new THREE.Vector3(),cameraRight=new THREE.Vector3(),cameraDesired=new THREE.Vector3(),cameraCandidate=new THREE.Vector3(),cameraOffset=new THREE.Vector3(),cameraLookTarget=new THREE.Vector3();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const MAX_HEALTH=200;
const JUMP_BUFFER_MS=130,COYOTE_MS=95;
const material=color=>new THREE.MeshStandardMaterial({color,roughness:1});
const mats={skin:material(0xd6a884),hair:material(0x242d33),shirt:material(0xe6a74c),pants:material(0x253b49),police:material(0x305775),dark:material(0x1d3039),glass:material(0x87b4be),wheel:material(0x1e262b),white:material(0xf0eee1),blue:material(0x4f91a0)};
const clothingMaterials=Object.fromEntries(Object.entries(APPEARANCE_OPTIONS).map(([part,choices])=>[part,choices.map(([,color])=>material(color))]));
let appearance=normalizeAppearance(null);
try{appearance=normalizeAppearance(JSON.parse(localStorage.getItem('districtZeroAppearance')||'null'));}catch{}
const SCOPE_TOGGLE_MS=260;   // shorter than this is a click, not a hold
let scopeHeld=false,scopePressAt=0;
let keys=new Set(),pointer={x:.5,y:.5},lookDragging=false,aiming=false,hadPointerLock=false,releasingPointerLock=false,pointerLockUnavailable=!canvas.requestPointerLock,lastLookAt=0,camYaw=.7,camPitch=.55,toastTimer=0,worldTime=9*60;
let playing=false,paused=true, player, cars=[],aircraft=[],traffic=[],peds=[],police=[],policeHelicopter=null,wanted={heat:0,level:0,last:{x:0,z:0}};
let assetsReady=false;
// This flag exists before any spawn or safe-point calculation. Using inFfa()
// here caused startup to call a not-yet-initialized function and trapped the
// live client on the loader after The Office was added.
let activeFfaMap='it-park';
const POLICE_GROUND_REACH=4,POLICE_AIR_RESPONSE_HEIGHT=8;
let cheatBuffer='',cheatTime=0;
const characterTemplates=new Map();
const UNIVERSAL_CHARACTERS={Atlas:'Superhero_Male_FullBody',Nova:'Superhero_Female_FullBody'};
const PIRATE_CHARACTERS=['Henry','Anne','Mako','Captain_Barbarossa','Sharky',...Object.keys(UNIVERSAL_CHARACTERS)];
const PLAYER_CHARACTERS=Object.keys(UNIVERSAL_CHARACTERS);
let characterChoice='Atlas';
try{const savedCharacter=localStorage.getItem('districtZeroCharacter');if(PLAYER_CHARACTERS.includes(savedCharacter))characterChoice=savedCharacter;else localStorage.setItem('districtZeroCharacter',characterChoice);}catch{}
const previewCanvas=$('lobby-character-preview');
const previewRenderer=new THREE.WebGLRenderer({canvas:previewCanvas,alpha:true,antialias:true,powerPreference:'low-power'});
previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));previewRenderer.outputColorSpace=THREE.SRGBColorSpace;previewRenderer.toneMapping=THREE.ACESFilmicToneMapping;previewRenderer.toneMappingExposure=1.35;
const previewScene=new THREE.Scene(),previewCamera=new THREE.PerspectiveCamera(30,1,.1,30),previewStage=new THREE.Group();
previewCamera.position.set(0,2.1,7.2);previewCamera.lookAt(0,1.8,0);previewScene.add(previewStage);
previewScene.add(new THREE.HemisphereLight(0xe6ebff,0x17142d,2.7));
const previewKey=new THREE.DirectionalLight(0xffd1bd,4.2);previewKey.position.set(-3,5,4);previewScene.add(previewKey);
const previewRim=new THREE.DirectionalLight(0x746cff,5);previewRim.position.set(4,3,-3);previewScene.add(previewRim);
let previewModel=null,previewMixer=null,previewCharacter=null,previewShowcaseUntil=0,previewRotation=.24,previewDragging=false,previewDragX=0;
const menuPreviewCanvas=$('menu-character-preview');
const menuPreviewRenderer=new THREE.WebGLRenderer({canvas:menuPreviewCanvas,alpha:true,antialias:true,powerPreference:'low-power'});
menuPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));menuPreviewRenderer.outputColorSpace=THREE.SRGBColorSpace;menuPreviewRenderer.toneMapping=THREE.ACESFilmicToneMapping;menuPreviewRenderer.toneMappingExposure=1.35;
const menuPreviewScene=new THREE.Scene(),menuPreviewCamera=new THREE.PerspectiveCamera(28,1,.1,30),menuPreviewStage=new THREE.Group();
menuPreviewCamera.position.set(0,2.05,8.2);menuPreviewCamera.lookAt(0,1.65,0);menuPreviewScene.add(menuPreviewStage);
menuPreviewScene.add(new THREE.HemisphereLight(0xe6ebff,0x17142d,2.7));
const menuPreviewKey=new THREE.DirectionalLight(0xffd1bd,4.2);menuPreviewKey.position.set(-3,5,4);menuPreviewScene.add(menuPreviewKey);
const menuPreviewRim=new THREE.DirectionalLight(0x00e3fd,5);menuPreviewRim.position.set(4,3,-3);menuPreviewScene.add(menuPreviewRim);
let menuPreviewModel=null,menuPreviewMixer=null,menuPreviewRotation=.2,menuPreviewDragging=false,menuPreviewDragX=0;
function mountMenuSharky(){
  if(menuPreviewModel)return;
  const source=characterTemplates.get('Sharky');if(!source)return;
  menuPreviewModel=cloneSkeleton(source.scene);const bounds=new THREE.Box3().setFromObject(menuPreviewModel),height=Math.max(.1,bounds.max.y-bounds.min.y),scale=2.55/height;
  menuPreviewModel.scale.setScalar(scale);menuPreviewModel.position.set(0,-bounds.min.y*scale+.08,0);
  menuPreviewModel.traverse(child=>{if(child.name?.startsWith('Weapon_'))child.visible=false;if(child.isMesh){child.castShadow=false;child.receiveShadow=false;}});
  menuPreviewStage.add(menuPreviewModel);menuPreviewMixer=new THREE.AnimationMixer(menuPreviewModel);
  const clip=THREE.AnimationClip.findByName(source.animations,'Idle')||source.animations[0];if(clip)menuPreviewMixer.clipAction(clip).play();
}
function sizeMenuPreview(){const area=menuPreviewCanvas.getBoundingClientRect(),width=Math.max(1,Math.round(area.width)),height=Math.max(1,Math.round(area.height));if(menuPreviewCanvas.width!==width||menuPreviewCanvas.height!==height){menuPreviewRenderer.setSize(width,height,false);menuPreviewCamera.aspect=width/height;menuPreviewCamera.updateProjectionMatrix();}}
menuPreviewCanvas.addEventListener('pointerdown',event=>{menuPreviewDragging=true;menuPreviewDragX=event.clientX;menuPreviewCanvas.setPointerCapture(event.pointerId);});
menuPreviewCanvas.addEventListener('pointermove',event=>{if(!menuPreviewDragging)return;menuPreviewRotation+=(event.clientX-menuPreviewDragX)*.012;menuPreviewDragX=event.clientX;});
menuPreviewCanvas.addEventListener('pointerup',()=>{menuPreviewDragging=false;});menuPreviewCanvas.addEventListener('pointercancel',()=>{menuPreviewDragging=false;});
function sizePiratePreview(){
  const area=previewCanvas.getBoundingClientRect(),width=Math.max(1,Math.round(area.width)),height=Math.max(1,Math.round(area.height));
  if(previewCanvas.width!==width||previewCanvas.height!==height){previewRenderer.setSize(width,height,false);previewCamera.aspect=width/height;previewCamera.updateProjectionMatrix();}
}
function playPreviewAnimation(name='Idle',once=false){
  const source=characterTemplates.get(previewCharacter),clip=source&&THREE.AnimationClip.findByName(source.animations,name);if(!clip||!previewMixer)return;
  previewMixer.stopAllAction();const action=previewMixer.clipAction(clip);action.reset().setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);action.clampWhenFinished=once;action.play();
  if(once)previewMixer.addEventListener('finished',function returnToIdle(){previewMixer.removeEventListener('finished',returnToIdle);playPreviewAnimation('Idle');});
}
function showPiratePreview(name,celebrate=false){
  const source=characterTemplates.get(name);if(!source)return;
  if(previewCharacter!==name){
    if(previewModel)previewStage.remove(previewModel);previewMixer?.stopAllAction();
    previewModel=cloneSkeleton(source.scene);const bounds=new THREE.Box3().setFromObject(previewModel),centre=bounds.getCenter(new THREE.Vector3()),height=Math.max(.1,bounds.max.y-bounds.min.y),scale=3.05/height;
    previewModel.scale.setScalar(scale);previewModel.position.set(-centre.x*scale,-bounds.min.y*scale+.14,-centre.z*scale);previewModel.rotation.y=0;
    previewModel.traverse(child=>{if(child.name?.startsWith('Weapon_'))child.visible=false;if(child.isMesh){child.castShadow=false;child.receiveShadow=false;}});
    previewStage.add(previewModel);previewMixer=new THREE.AnimationMixer(previewModel);previewCharacter=name;
  }
  if(celebrate){previewShowcaseUntil=performance.now()+2600;playPreviewAnimation('Wave',true);}
  else if(performance.now()>=previewShowcaseUntil)playPreviewAnimation('Idle');
  $('selected-pirate-art').classList.add('is-loaded');sizePiratePreview();
}
function createPiratePortrait(name,source){
  const portraitCanvas=document.createElement('canvas');portraitCanvas.width=128;portraitCanvas.height=160;
  const portraitRenderer=new THREE.WebGLRenderer({canvas:portraitCanvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
  portraitRenderer.setPixelRatio(1);portraitRenderer.outputColorSpace=THREE.SRGBColorSpace;portraitRenderer.toneMapping=THREE.ACESFilmicToneMapping;portraitRenderer.toneMappingExposure=1.4;
  const portraitScene=new THREE.Scene(),portraitCamera=new THREE.PerspectiveCamera(28,128/160,.1,20),model=cloneSkeleton(source.scene);
  const bounds=new THREE.Box3().setFromObject(model),height=Math.max(.1,bounds.max.y-bounds.min.y),scale=3.2/height;
  model.scale.setScalar(scale);model.position.set(0,-bounds.min.y*scale-.05,0);model.rotation.y=0;
  model.traverse(child=>{if(child.name?.startsWith('Weapon_'))child.visible=false;});portraitScene.add(model);
  portraitScene.add(new THREE.HemisphereLight(0xe8edff,0x17142d,3));const key=new THREE.DirectionalLight(0xffd2bf,4);key.position.set(-3,5,4);portraitScene.add(key);
  portraitCamera.position.set(0,1.75,7.4);portraitCamera.lookAt(0,1.75,0);portraitRenderer.render(portraitScene,portraitCamera);
  const tile=document.querySelector(`#lobby-character-grid button[data-character="${name}"] i`);
  if(tile){tile.style.backgroundImage=`url(${portraitCanvas.toDataURL('image/png')})`;tile.classList.add('has-photo');}
  portraitRenderer.forceContextLoss();portraitRenderer.dispose();
}
previewCanvas.addEventListener('pointerdown',event=>{previewDragging=true;previewDragX=event.clientX;previewCanvas.setPointerCapture(event.pointerId);});
previewCanvas.addEventListener('pointermove',event=>{if(!previewDragging)return;previewRotation+=(event.clientX-previewDragX)*.012;previewDragX=event.clientX;});
previewCanvas.addEventListener('pointerup',()=>{previewDragging=false;});
previewCanvas.addEventListener('pointercancel',()=>{previewDragging=false;});
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
    // Decode now that there is something to decode into. The bytes are already
    // in the HTTP cache from the boot sequence, so this is quick.
    primeSamples(['fire-pistol','fire-smg','fire-rifle','fire-shotgun','melee-knife',
      'melee-knife-2','hit','headshot-victim','headshot-killer','firstblood','double-kill','triple-kill','rampage','kill','death','footstep']);
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
  if(playSample('fire-pistol',{volume:.85,hold:.45}))return;
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
// Background music is gone. Streaming a looping track alongside the renderer
// cost frames for something nobody was listening for, so the calls below are
// kept as no-ops rather than unpicking every call site; sound effects are
// untouched and still run through the Web Audio graph.
function playMusic(){}
function stopMusic(){}
function refreshMusicVolume(){}

// --- Recorded audio ---------------------------------------------------------
// Synthesised weapons only go so far. If a sample exists at the path below it is
// used; if the file is absent the synthesised voice still plays, so the game
// never goes silent and files can be added one at a time.
//
//   public/audio/<name>.(ogg|mp3|wav)
//
// Names: fire-pistol, fire-smg, fire-rifle, fire-shotgun, fire-sniper,
//        fire-magnum, fire-arc, melee-knife, weapon-switch, reload,
//        hit, headshot, kill, death
const SAMPLE_FORMATS=['ogg','mp3','wav'];
const sampleCache=new Map();
function loadSample(name){
  if(sampleCache.has(name))return sampleCache.get(name);
  // A browser only gives us an audio context after the first gesture. Caching
  // a miss from before that point is permanent, and it silently drops the game
  // back to its synthesised voices for the whole session -- which is exactly
  // what happened when the boot sequence started warming samples too early.
  // Leave the cache alone and let the next call, after setupAudio, succeed.
  if(!audioContext)return Promise.resolve(null);
  const pending=(async()=>{
    for(const extension of SAMPLE_FORMATS){
      try{
        const response=await fetch(`/audio/${name}.${extension}`);
        // A dev server answers unknown paths with the SPA shell, so a 200 is not
        // proof of a sound. Check the type before handing bytes to the decoder.
        if(!response.ok)continue;
        if(!/audio|octet-stream/i.test(response.headers.get('content-type')||''))continue;
        return await audioContext.decodeAudioData(await response.arrayBuffer());
      }catch{ /* try the next format, then fall back to synthesis */ }
    }
    return null;
  })();
  sampleCache.set(name,pending);
  return pending;
}
// Warm the cache so the first shot is not the one that waits on the network.
function primeSamples(names){for(const name of names)loadSample(name);}
function playSample(name,{volume=1,rate=1,variance=.06,hold=0}={}){
  if(!audioContext)return false;
  // An array picks one at random, so repeated actions do not sound identical.
  if(Array.isArray(name))return playSample(name[Math.floor(Math.random()*name.length)],{volume,rate,variance,hold});
  const cached=sampleCache.get(name);
  // Only play synchronously from an already-decoded buffer; a pending load
  // returns false so the caller can fall back to synthesis this once.
  if(!cached||typeof cached.then==='function'){loadSample(name);return false;}
  const source=audioContext.createBufferSource(),gain=audioContext.createGain();
  source.buffer=cached;
  source.playbackRate.value=rate*(1+(Math.random()*2-1)*variance);
  const now=audioContext.currentTime;
  gain.gain.setValueAtTime(volume,now);
  source.connect(gain).connect(masterGain);
  source.start(now);
  // Recordings are longer than the weapons that fire them: the rifle sample runs
  // 1.9s against a 120ms cooldown, so without this every burst stacks a dozen
  // overlapping copies into mush. Fade the tail instead of cutting it dead.
  if(hold>0){
    const end=now+hold;
    gain.gain.setValueAtTime(volume,Math.max(now,end-.09));
    gain.gain.exponentialRampToValueAtTime(.0008,end);
    source.stop(end+.02);
  }
  return true;
}
// A sound that happened somewhere else in the district: quieter with distance
// and panned to the side it came from, so gunfire tells you where to look.
const SOUND_NEAR=18, SOUND_FAR=260;
function playSampleAt(name,x,z,{volume=1,rate=1,variance=.06,hold=0}={}){
  if(!audioContext||!player)return false;
  const dx=x-player.x,dz=z-player.z,distance=Math.hypot(dx,dz);
  if(distance>SOUND_FAR)return true;   // too far to hear, but not a failure
  if(Array.isArray(name))return playSampleAt(name[Math.floor(Math.random()*name.length)],x,z,{volume,rate,variance,hold});
  const cached=sampleCache.get(name);
  if(!cached||typeof cached.then==='function'){loadSample(name);return false;}
  // Linear rolloff reads more clearly than inverse-square across a city block.
  const falloff=distance<=SOUND_NEAR?1:Math.max(0,1-(distance-SOUND_NEAR)/(SOUND_FAR-SOUND_NEAR));
  if(falloff<=.01)return true;
  const source=audioContext.createBufferSource(),gain=audioContext.createGain();
  source.buffer=cached;
  source.playbackRate.value=rate*(1+(Math.random()*2-1)*variance);
  const now=audioContext.currentTime;
  gain.gain.setValueAtTime(volume*falloff*falloff,now);
  let tail=gain;
  // Pan by which side of the camera it is on, so you can turn toward it.
  if(audioContext.createStereoPanner){
    const forwardX=-Math.sin(camYaw),forwardZ=-Math.cos(camYaw);
    const rightX=-forwardZ,rightZ=forwardX;
    const side=distance>.01?(dx*rightX+dz*rightZ)/distance:0;
    const panner=audioContext.createStereoPanner();
    panner.pan.value=clamp(side,-1,1)*.85;
    gain.connect(panner);tail=panner;
  }
  tail.connect(masterGain);
  source.connect(gain);
  source.start(now);
  if(hold>0){
    const end=now+hold;
    gain.gain.setValueAtTime(gain.gain.value,Math.max(now,end-.09));
    gain.gain.exponentialRampToValueAtTime(.0008,end);
    source.stop(end+.02);
  }
  return true;
}

// Resolve a pending load into the cache so later calls can play it directly.
function settleSample(name){
  const cached=sampleCache.get(name);
  if(cached&&typeof cached.then==='function')cached.then(buffer=>{if(buffer)sampleCache.set(name,buffer);else sampleCache.set(name,null);});
}
// Short burst of decaying noise, the raw material for most of the effects below.
function noiseSource(duration,curve=2){
  const length=Math.max(1,Math.floor(audioContext.sampleRate*duration));
  const buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),samples=buffer.getChannelData(0);
  for(let i=0;i<length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/length,curve);
  const source=audioContext.createBufferSource();source.buffer=buffer;return source;
}
// A scuff of shoe on pavement. Pitch wanders a little so a run does not machine-gun.
function footstepSound(running){
  // Recorded step, pitched by pace; falls back to the synthesised one.
  if(playSample('footstep',{volume:running?.5:.34,rate:running?1.12:1,variance:.12}))return;
  if(!audioContext)return;
  const now=audioContext.currentTime,noise=noiseSource(.09,3),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
  filter.type='lowpass';filter.Q.value=.9;
  filter.frequency.setValueAtTime(running?1600:1100,now);filter.frequency.exponentialRampToValueAtTime(240,now+.08);
  gain.gain.setValueAtTime(running?.11:.07,now);gain.gain.exponentialRampToValueAtTime(.001,now+.09);
  noise.playbackRate.value=.85+Math.random()*.3;
  noise.connect(filter).connect(gain).connect(masterGain);noise.start(now);noise.stop(now+.1);
}
// Rising effort tone plus a little air moving past.
function jumpSound(){
  if(!audioContext)return;
  const now=audioContext.currentTime,tone=audioContext.createOscillator(),gain=audioContext.createGain();
  tone.type='triangle';tone.frequency.setValueAtTime(220,now);tone.frequency.exponentialRampToValueAtTime(560,now+.16);
  gain.gain.setValueAtTime(.1,now);gain.gain.exponentialRampToValueAtTime(.001,now+.2);
  tone.connect(gain).connect(masterGain);tone.start(now);tone.stop(now+.21);
  const air=noiseSource(.18,2),band=audioContext.createBiquadFilter(),airGain=audioContext.createGain();
  band.type='bandpass';band.Q.value=1.1;
  band.frequency.setValueAtTime(700,now);band.frequency.exponentialRampToValueAtTime(1900,now+.16);
  airGain.gain.setValueAtTime(.045,now);airGain.gain.exponentialRampToValueAtTime(.001,now+.18);
  air.connect(band).connect(airGain).connect(masterGain);air.start(now);air.stop(now+.19);
}
// Weighted by how hard the landing was, so a hop is not a crash.
function landSound(force){
  if(!audioContext)return;
  const now=audioContext.currentTime,level=clamp(force,.25,1);
  const thump=audioContext.createOscillator(),gain=audioContext.createGain();
  thump.type='sine';thump.frequency.setValueAtTime(150,now);thump.frequency.exponentialRampToValueAtTime(52,now+.12);
  gain.gain.setValueAtTime(.16*level,now);gain.gain.exponentialRampToValueAtTime(.001,now+.14);
  thump.connect(gain).connect(masterGain);thump.start(now);thump.stop(now+.15);
  const dust=noiseSource(.1,3),lp=audioContext.createBiquadFilter(),dustGain=audioContext.createGain();
  lp.type='lowpass';lp.frequency.value=900;
  dustGain.gain.setValueAtTime(.07*level,now);dustGain.gain.exponentialRampToValueAtTime(.001,now+.1);
  dust.connect(lp).connect(dustGain).connect(masterGain);dust.start(now);dust.stop(now+.11);
}
// Swing always; the thud only lands when the punch connects.
function punchSound(connected){
  if(!audioContext)return;
  const now=audioContext.currentTime;
  const swing=noiseSource(.13,2.4),band=audioContext.createBiquadFilter(),swingGain=audioContext.createGain();
  band.type='bandpass';band.Q.value=1.4;
  band.frequency.setValueAtTime(1500,now);band.frequency.exponentialRampToValueAtTime(420,now+.12);
  swingGain.gain.setValueAtTime(.09,now);swingGain.gain.exponentialRampToValueAtTime(.001,now+.13);
  swing.connect(band).connect(swingGain).connect(masterGain);swing.start(now);swing.stop(now+.14);
  if(!connected)return;
  const hit=now+.055;
  const thud=audioContext.createOscillator(),thudGain=audioContext.createGain();
  thud.type='sine';thud.frequency.setValueAtTime(190,hit);thud.frequency.exponentialRampToValueAtTime(70,hit+.1);
  thudGain.gain.setValueAtTime(.2,hit);thudGain.gain.exponentialRampToValueAtTime(.001,hit+.12);
  thud.connect(thudGain).connect(masterGain);thud.start(hit);thud.stop(hit+.13);
  const slap=noiseSource(.07,4),lp=audioContext.createBiquadFilter(),slapGain=audioContext.createGain();
  lp.type='lowpass';lp.frequency.value=2300;
  slapGain.gain.setValueAtTime(.15,hit);slapGain.gain.exponentialRampToValueAtTime(.001,hit+.07);
  slap.connect(lp).connect(slapGain).connect(masterGain);slap.start(hit);slap.stop(hit+.08);
}
// Bright metal: noise sweeping upward with a thin ring trailing off after it.
function knifeSound(){
  if(!audioContext)return;
  const now=audioContext.currentTime;
  const slash=noiseSource(.22,2.2),hp=audioContext.createBiquadFilter(),gain=audioContext.createGain();
  hp.type='highpass';hp.frequency.setValueAtTime(900,now);hp.frequency.exponentialRampToValueAtTime(4200,now+.12);
  gain.gain.setValueAtTime(.002,now);gain.gain.exponentialRampToValueAtTime(.17,now+.04);gain.gain.exponentialRampToValueAtTime(.001,now+.22);
  slash.connect(hp).connect(gain).connect(masterGain);slash.start(now);slash.stop(now+.23);
  const ring=audioContext.createOscillator(),ringGain=audioContext.createGain();
  ring.type='triangle';ring.frequency.setValueAtTime(2600,now+.02);ring.frequency.exponentialRampToValueAtTime(760,now+.18);
  ringGain.gain.setValueAtTime(.06,now+.02);ringGain.gain.exponentialRampToValueAtTime(.001,now+.2);
  ring.connect(ringGain).connect(masterGain);ring.start(now+.02);ring.stop(now+.21);
}
// Footsteps follow the character animation rather than distance travelled.
// The player moves at 10 m/s on foot, so pacing by distance fired far more
// often than the legs actually came down. Reading the running clip's own
// playhead keeps every step landing on a visible footfall.
const FALLBACK_STRIDE_SECONDS=.36;   // used only by the built-in box character
function trackFootsteps(dt,grounded){
  if(!grounded||Math.hypot(player.vx,player.vz)<=.6){player.stepPhase=null;player.stepClock=0;return;}
  const data=player.mesh.userData,action=data.characterActions?.get(data.characterAction);
  if(action&&data.characterAction!=='Idle'){
    const duration=action.getClip?.()?.duration||0;
    if(duration>0){
      // Two footfalls per loop of the cycle, one per foot.
      const phase=Math.floor(action.time/duration*2)%2;
      if(player.stepPhase===null||player.stepPhase===undefined)player.stepPhase=phase;
      else if(phase!==player.stepPhase){player.stepPhase=phase;footstepSound(down('sprint'));}
      return;
    }
  }
  // No rigged model loaded: fall back to a steady cadence in the same range.
  player.stepClock=(player.stepClock||0)+dt;
  const stride=down('sprint')?FALLBACK_STRIDE_SECONDS*.78:FALLBACK_STRIDE_SECONDS;
  if(player.stepClock>=stride){player.stepClock=0;footstepSound(down('sprint'));}
}
// Landing is only audible if the drop had some speed behind it.
function trackLanding(previousVy){
  if(player.y>0||previousVy>=-4)return;
  landSound(Math.min(1,-previousVy/18));
}
// Each weapon gets its own voice, built from the same synthesis as the rest of
// the game's audio. Shared shape: a noise body through a sweeping filter, plus
// a tonal thump, with the numbers doing the characterisation.
const WEAPON_VOICE={
  pistol: {noise:.12,from:2600,to:420, gain:.30,thump:170,thumpTo:60, type:'triangle'},
  smg:    {noise:.07,from:3200,to:700, gain:.20,thump:210,thumpTo:90, type:'square'},
  rifle:  {noise:.13,from:2800,to:380, gain:.30,thump:150,thumpTo:52, type:'triangle'},
  shotgun:{noise:.26,from:1500,to:180, gain:.42,thump:95, thumpTo:34, type:'sine'},
  sniper: {noise:.34,from:1900,to:150, gain:.46,thump:80, thumpTo:28, type:'sine'},
  magnum: {noise:.20,from:2300,to:260, gain:.40,thump:120,thumpTo:42, type:'triangle'},
  // The arc emitter is electrical rather than explosive: a rising buzz.
  arc:    {noise:.09,from:900, to:5200,gain:.22,thump:640,thumpTo:1500,type:'sawtooth'}
};
// Which recording each weapon uses, how loud, and how much of its tail to keep.
// The pack has no railgun, magnum or arc emitter, so those are pitched variants
// of the nearest recording rather than dropping back to synthesis.
const WEAPON_SAMPLE={
  pistol: {name:'fire-pistol', rate:1,    volume:.85, hold:.45},
  smg:    {name:'fire-smg',    rate:1.06, volume:.55, hold:.22},
  rifle:  {name:'fire-rifle',  rate:1,    volume:.70, hold:.32},
  shotgun:{name:'fire-shotgun',rate:1,    volume:.95, hold:.90},
  sniper: {name:'fire-rifle',  rate:.72,  volume:1,   hold:1.2},
  magnum: {name:'fire-pistol', rate:.78,  volume:.95, hold:.60},
  arc:    {name:'fire-smg',    rate:1.55, volume:.45, hold:.18},
  knife:  {name:['melee-knife','melee-knife-2'],rate:1,volume:.7,hold:.5},
  // No launcher sample in the pack: the shotgun slowed right down reads as the
  // hollow thump of a tube rather than a gunshot.
  bazooka:{name:'fire-shotgun',rate:.52,  volume:1,   hold:1.4}
};
function weaponSound(kind){
  if(!audioContext)return;
  const sample=WEAPON_SAMPLE[kind];
  if(sample&&playSample(sample.name,sample))return;
  const voice=WEAPON_VOICE[kind]||WEAPON_VOICE.pistol,now=audioContext.currentTime;
  const noise=noiseSource(voice.noise,kind==='arc'?1.2:2),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
  filter.type=kind==='arc'?'bandpass':'lowpass';
  filter.frequency.setValueAtTime(voice.from,now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40,voice.to),now+voice.noise*.9);
  gain.gain.setValueAtTime(voice.gain,now);
  gain.gain.exponentialRampToValueAtTime(.001,now+voice.noise);
  noise.connect(filter).connect(gain).connect(masterGain);noise.start(now);noise.stop(now+voice.noise+.02);
  const body=audioContext.createOscillator(),bodyGain=audioContext.createGain();
  body.type=voice.type;
  body.frequency.setValueAtTime(voice.thump,now);
  body.frequency.exponentialRampToValueAtTime(Math.max(20,voice.thumpTo),now+voice.noise*.85);
  bodyGain.gain.setValueAtTime(voice.gain*.8,now);
  bodyGain.gain.exponentialRampToValueAtTime(.001,now+voice.noise*.95);
  body.connect(bodyGain).connect(masterGain);body.start(now);body.stop(now+voice.noise+.02);
}
// Handling noise when you change weapons: a mechanical clack, then a click.
function weaponSwitchSound(){
  if(!audioContext)return;
  if(playSample('weapon-switch',{volume:.8,variance:.03}))return;
  const now=audioContext.currentTime;
  const clack=noiseSource(.07,3),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();
  filter.type='bandpass';filter.frequency.setValueAtTime(1800,now);filter.Q.value=1.6;
  gain.gain.setValueAtTime(.16,now);gain.gain.exponentialRampToValueAtTime(.001,now+.07);
  clack.connect(filter).connect(gain).connect(masterGain);clack.start(now);clack.stop(now+.08);
  const click=audioContext.createOscillator(),clickGain=audioContext.createGain();
  click.type='square';click.frequency.setValueAtTime(880,now+.06);
  click.frequency.exponentialRampToValueAtTime(420,now+.13);
  clickGain.gain.setValueAtTime(.07,now+.06);clickGain.gain.exponentialRampToValueAtTime(.001,now+.14);
  click.connect(clickGain).connect(masterGain);click.start(now+.06);click.stop(now+.15);
}
function addCombatEffect(mesh,duration,kind){
  const now=performance.now();scene.add(mesh);combatEffects.push({mesh,born:now,until:now+duration,kind});
}
function glowAt(position,color,size,duration,kind='glow'){
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
  sprite.position.copy(position);sprite.scale.set(size,size,1);addCombatEffect(sprite,duration,kind);
}
// Irregular splat textures, built once and reused. Three variants so pools do
// not visibly repeat when several bodies drop near each other.
const bloodTextures=Array.from({length:3},()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const context=canvas.getContext('2d');
  const blob=(cx,cy,r)=>{
    const grad=context.createRadialGradient(cx,cy,r*.15,cx,cy,r);
    grad.addColorStop(0,'rgba(124,8,13,.97)');grad.addColorStop(.6,'rgba(96,6,10,.85)');grad.addColorStop(1,'rgba(74,4,8,0)');
    context.fillStyle=grad;context.beginPath();context.arc(cx,cy,r,0,Math.PI*2);context.fill();
  };
  blob(64,64,38+Math.random()*6);
  for(let i=0;i<8;i++){const angle=Math.random()*Math.PI*2,away=24+Math.random()*32;blob(64+Math.cos(angle)*away,64+Math.sin(angle)*away,6+Math.random()*13);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
});
// Pools spread, hold, then dry up and are disposed of. The cap is a safety net
// for a flurry of kills inside one lifetime, not the usual way they are freed.
const bloodPools=[];
const MAX_BLOOD_POOLS=26;
const BLOOD_LIFETIME=5000;
const BLOOD_SPREAD=900;   // grows over this long
const BLOOD_FADE=1400;    // and dries out over this long at the end
const BODY_BLOOD_MS=600000;  // blood marking a corpse waits for a meeting instead
// How many of the scattered sites each crewmate is given.
const TASKS_PER_PLAYER=4;
// How close you must stand to work a console. The prompt and the interact must
// use the same number, or the game offers an action it will then refuse.
const TASK_REACH=4.6;
function bloodPool(x,z,size=1,lifetime=BLOOD_LIFETIME){
  const texture=bloodTextures[Math.floor(Math.random()*bloodTextures.length)];
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);
  mesh.rotation.x=-Math.PI/2;mesh.rotateZ(Math.random()*Math.PI*2);
  // Just clear of the road surface, so it reads as lying on the ground.
  mesh.position.set(x,.03,z);
  mesh.scale.setScalar(.6);
  scene.add(mesh);
  bloodPools.push({mesh,born:performance.now(),target:(2.6+Math.random()*1.5)*size,lifetime});
  while(bloodPools.length>MAX_BLOOD_POOLS){
    const oldest=bloodPools.shift();
    scene.remove(oldest.mesh);oldest.mesh.geometry.dispose();oldest.mesh.material.dispose();
  }
  return mesh;
}
function clearBloodPools(){
  for(const pool of bloodPools){scene.remove(pool.mesh);pool.mesh.geometry.dispose();pool.mesh.material.dispose();}
  bloodPools.length=0;
}
// Spread, hold, then fade away and dispose. Called from the render loop.
function updateBloodPools(now){
  for(let i=bloodPools.length-1;i>=0;i--){
    const pool=bloodPools[i],age=now-pool.born,life=pool.lifetime||BLOOD_LIFETIME;
    if(age>=life){
      bloodPools.splice(i,1);
      scene.remove(pool.mesh);pool.mesh.geometry.dispose();pool.mesh.material.dispose();
      continue;
    }
    const spread=clamp(age/BLOOD_SPREAD,0,1),eased=1-Math.pow(1-spread,3);
    pool.mesh.scale.setScalar(.6+(pool.target-.6)*eased);
    // Full strength once spread, then dry out over the closing stretch.
    const fade=clamp((age-(life-BLOOD_FADE))/BLOOD_FADE,0,1);
    pool.mesh.material.opacity=.9*eased*(1-fade);
  }
}
// A burst of droplets thrown out from the wound, pulled down by gravity.
function bloodSplash(x,y,z,dirX=0,dirZ=0){
  for(let i=0;i<15;i++){
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:0x8d0a12,transparent:true,opacity:.95,depthWrite:false}));
    const size=.16+Math.random()*.34;sprite.scale.set(size,size,1);
    sprite.position.set(x,y,z);
    const angle=Math.random()*Math.PI*2,spread=1.4+Math.random()*3.6;
    sprite.userData.velocity=new THREE.Vector3(
      Math.cos(angle)*spread+dirX*2.4,
      2+Math.random()*3.6,
      Math.sin(angle)*spread+dirZ*2.4
    );
    addCombatEffect(sprite,600+Math.random()*340,'blood');
  }
}
// One call for the whole kill: spray, then a pool where the body lands.
// `share` broadcasts it so other players in the district see the same killing.
function bloodBurst(x,y,z,dirX=0,dirZ=0,size=1,share=false,lifetime=BLOOD_LIFETIME){
  bloodSplash(x,y,z,dirX,dirZ);
  bloodPool(x,z,size,lifetime);
  if(share)multiplayer?.sendEffect?.({effect:'blood',x,z,dx:dirX,dz:dirZ,size});
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
let objectiveMesh,taxiPassenger,activityMarker;
let activitySnapshot={state:ACTIVITY_STATES.AVAILABLE,activity:null,index:0,total:0,countdown:0,remaining:0,cooldown:0};
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
  originalMeshes.forEach(part=>{if(!mesh.userData.gun?.getObjectById(part.id)&&!mesh.userData.deductionKnife?.getObjectById(part.id)&&!mesh.userData.jetpack?.getObjectById(part.id))part.visible=false;});
  const mixer=new THREE.AnimationMixer(visual),actions=new Map(source.animations.map(clip=>[clip.name,mixer.clipAction(clip)])),weaponActions=new Map();
  if(source.userData?.universal){
    const upperBody=/^(spine_0[1-3]|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|index_|middle_|ring_|pinky_|thumb_)/i;
    for(const clipName of ['PistolIdle','PistolShoot','PistolReload','SwordIdle','Sword']){
      const clip=source.animations.find(item=>item.name===clipName);if(!clip)continue;
      const upperClip=new THREE.AnimationClip(`${clipName}_Upper`,clip.duration,clip.tracks.filter(track=>upperBody.test(track.name)).map(track=>track.clone()));
      weaponActions.set(clipName,mixer.clipAction(upperClip));
    }
  }
  mesh.userData.characterVisual=visual;mesh.userData.characterMixer=mixer;mesh.userData.characterActions=actions;mesh.userData.weaponActions=weaponActions;mesh.userData.characterName=name;mesh.userData.universalVisual=source.userData?.universal===true;
  // The fallback avatar's shoulder used to remain the weapon parent after the
  // imported pirate replaced it. That invisible arm has different proportions,
  // leaving the gun floating beside the real hand. Keep the gun on the avatar
  // root and drive its mount from the live skeleton endpoint instead.
  if(mesh.userData.gun){
    const hand=visual.getObjectByName('hand_r'),gun=mesh.userData.gun;
    gun.userData.visualHand=hand||visual.getObjectByName('LowerArm.R')||null;gun.userData.visualHandIsHand=Boolean(hand);
    // Follow the animated hand position, but do not inherit its twist. The UAL
    // hand axis is authored for retargeting and rolls the weapon 90° upright.
    // Avatar-space parenting keeps the barrel facing where the player aims.
    mesh.attach(gun);gun.scale.setScalar(1);
  }
  if(mesh.userData.deductionKnife){
    const knife=mesh.userData.deductionKnife;
    knife.userData.visualHand=visual.getObjectByName('hand_r')||visual.getObjectByName('LowerArm.R')||null;
    mesh.attach(knife);
  }
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
function playWeaponCharacter(mesh,state){
  const data=mesh.userData,actions=data.weaponActions;if(!actions?.size)return;
  const armed=state.weapon==='pistol'||Boolean(GUN_MODELS[state.weapon]);
  const name=state.weapon==='knife'?(state.attacking?'Sword':'SwordIdle'):
    !armed?null:state.reloading?'PistolReload':state.attacking?'PistolShoot':'PistolIdle';
  if(data.weaponAction===name)return;
  const previous=actions.get(data.weaponAction);if(previous)previous.fadeOut(.1);
  data.weaponAction=name;if(!name)return;
  const action=actions.get(name);if(!action)return;
  // This is an upper-body layer over a full-weight locomotion clip. A stronger
  // weight prevents the base idle/run pose from averaging the hands back down.
  action.reset().setEffectiveWeight(6).fadeIn(.1).play();action.setLoop(['PistolIdle','SwordIdle'].includes(name)?THREE.LoopRepeat:THREE.LoopOnce,Infinity);action.clampWhenFinished=true;
}
const firearmBoneOrigin=new THREE.Vector3(),firearmBoneDirection=new THREE.Vector3(),firearmTarget=new THREE.Vector3();
const firearmRightGrip=new THREE.Vector3(),firearmLeftGrip=new THREE.Vector3(),firearmMount=new THREE.Vector3();
const firearmParentQuaternion=new THREE.Quaternion(),firearmWorldQuaternion=new THREE.Quaternion(),firearmYAxis=new THREE.Vector3(0,1,0);
function pointBoneAt(bone,target){
  if(!bone?.parent)return;
  bone.getWorldPosition(firearmBoneOrigin);firearmBoneDirection.copy(target).sub(firearmBoneOrigin).normalize();
  firearmWorldQuaternion.setFromUnitVectors(firearmYAxis,firearmBoneDirection);
  bone.parent.getWorldQuaternion(firearmParentQuaternion).invert();
  bone.quaternion.copy(firearmParentQuaternion).multiply(firearmWorldQuaternion);
  bone.updateMatrixWorld(true);
}
function poseCharacterFirearm(mesh,state){
  const data=mesh.userData,firearm=state.weapon==='pistol'||Boolean(GUN_MODELS[state.weapon]);
  if(!firearm||deduction.phase!=='idle')return;
  if(data.universalVisual){
    playWeaponCharacter(mesh,state);data.characterVisual?.updateMatrixWorld(true);
    const hand=data.gun?.userData.visualHand,leftHand=data.characterVisual?.getObjectByName('hand_l');
    if(hand&&data.gun){
      const recoil=state.attacking?.07:0;
      hand.getWorldPosition(firearmRightGrip);
      // The imported weapon origin is its geometric centre, not its pistol
      // grip. Put that centre between the animated hands, biased toward the
      // trigger hand, so the handle sits in the right palm and the fore-end
      // reaches the supporting left hand instead of floating at the body's side.
      if(leftHand){leftHand.getWorldPosition(firearmLeftGrip);firearmMount.copy(firearmRightGrip).lerp(firearmLeftGrip,.32);}
      else firearmMount.copy(firearmRightGrip);
      data.gun.position.copy(mesh.worldToLocal(firearmMount));data.gun.position.y+=.03;data.gun.position.z+=.08+recoil;
      const switching=state.switchingUntil&&performance.now()<state.switchingUntil;
      const progress=switching?1-(state.switchingUntil-performance.now())/420:1;
      const reveal=clamp((progress-.42)/.58,0,1);
      data.gun.scale.setScalar(reveal);data.gun.rotation.set(state.reloading?-.16:(1-reveal)*.9,0,state.reloading?.12:0);
    }
    return;
  }
  const rightUpper=data.characterVisual?.getObjectByName('UpperArm.R');
  const rightLower=data.characterVisual?.getObjectByName('LowerArm.R');
  const leftUpper=data.characterVisual?.getObjectByName('UpperArm.L');
  const leftLower=data.characterVisual?.getObjectByName('LowerArm.L');
  const pitch=clamp(state.pitch||0,-.65,.65),kick=state.attacking?.12:0;
  // Aim with explicit elbow/hand targets instead of guessed Euler axes. Pirate
  // Kit arms extend along bone-local +Y, so this works consistently for every
  // cadet and remains layered over Idle/Walk/Run.
  const targetWorld=(x,y,z)=>mesh.localToWorld(firearmTarget.set(x,y,z));
  if(state.reloading){
    pointBoneAt(rightUpper,targetWorld(.58,2.12,.28));pointBoneAt(rightLower,targetWorld(.2,1.82,.52));
    pointBoneAt(leftUpper,targetWorld(-.54,2.08,.32));pointBoneAt(leftLower,targetWorld(.02,1.72,.5));
  }else{
    const aimY=2.18-pitch*.55-kick;
    pointBoneAt(rightUpper,targetWorld(.58,2.16,.38));pointBoneAt(rightLower,targetWorld(.32,aimY,.92));
    pointBoneAt(leftUpper,targetWorld(-.52,2.12,.42));pointBoneAt(leftLower,targetWorld(-.02,aimY-.05,.82));
  }
  data.characterVisual?.updateMatrixWorld(true);
  if(data.gun){
    const recoil=state.attacking?.13:0,drop=state.reloading?.2:0;
    const hand=data.gun.userData.visualHand;
    if(hand){
      // LowerArm has no explicit hand bone; its finger children begin at y=.258,
      // so this endpoint is the centre of the grip for every Pirate Kit cadet.
      const gripWorld=hand.localToWorld(new THREE.Vector3(0,data.gun.userData.visualHandIsHand?0:.27,0));
      data.gun.position.copy(mesh.worldToLocal(gripWorld));
      data.gun.position.y-=drop;data.gun.position.z+=recoil;
      // Gun +Z is the barrel direction after setRemoteWeapon's model correction.
      // Keeping it in avatar space makes it follow aim while its grip stays on
      // the animated hand, instead of inheriting the forearm's roll.
      data.gun.rotation.set(state.reloading?.32:0,0,state.reloading?-.58:0);
    }
  }
}
function poseCharacterKnife(mesh,state){
  const data=mesh.userData,knife=data.deductionKnife;
  if(!knife)return;
  const held=state.weapon==='knife'&&(deduction.phase==='idle'||inFfa()||deduction.role==='impostor');
  knife.visible=held;if(!held)return;
  if(data.universalVisual)playWeaponCharacter(mesh,state);
  data.characterVisual?.updateMatrixWorld(true);
  const hand=knife.userData.visualHand||data.characterVisual?.getObjectByName('hand_r');
  if(!hand)return;
  hand.getWorldPosition(firearmRightGrip);knife.position.copy(mesh.worldToLocal(firearmRightGrip));
  knife.position.y-=.03;knife.position.z+=.22;
  const switching=state.switchingUntil&&performance.now()<state.switchingUntil;
  const progress=switching?1-(state.switchingUntil-performance.now())/420:1;
  const reveal=clamp((progress-.42)/.58,0,1);
  knife.scale.setScalar(reveal);knife.rotation.set(-.1+(1-reveal)*1.15,0,-.16);
}
// What other players are holding. This used to show the crude box gun only for
// the free-roam pistol, so in Free-for-All every enemy appeared empty-handed
// even though their weapon was already being synced. Load the same pack model
// the viewmodel uses and hang it off the right arm.
const REMOTE_GUN_SCALE=1.2;   // a touch larger than in hand so it reads at range
function setRemoteWeapon(mesh,kind){
  const gun=mesh.userData.gun;if(!gun)return;
  const armed=kind==='pistol'||Boolean(GUN_MODELS[kind]);
  gun.visible=armed&&(deduction.phase==='idle'||inFfa());
  if(!gun.visible||gun.userData.kind===kind)return;
  gun.userData.kind=kind;
  const holder=gun.userData.holder||(()=>{
    const group=new THREE.Group();
    // The pack models face -Z; the character rig holds its weapon forward
    // along +Z, so turn the model around to point where the player is aiming.
    group.rotation.y=Math.PI;
    gun.add(group);gun.userData.holder=group;
    // Remember the placeholder boxes so they can come back if a load fails.
    gun.userData.placeholder=gun.children.filter(child=>child!==group);
    return group;
  })();
  holder.clear();
  // Placeholder stays up until the real model lands, so nobody holds nothing.
  for(const child of gun.userData.placeholder)child.visible=true;
  const token=(gun.userData.token||0)+1;gun.userData.token=token;
  loadGunModel(kind).then(model=>{
    if(!model||gun.userData.token!==token)return;
    holder.add(fitGunModel(model,kind,REMOTE_GUN_SCALE));
    for(const child of gun.userData.placeholder)child.visible=false;
  }).catch(()=>{});
}
function animateRemoteCharacter(mesh,state,dt){
  const data=mesh.userData;
  if(data.characterMixer){
    playCharacter(mesh,state.weapon==='knife'&&state.attacking?'Sword':state.animation);
    data.characterMixer.update(dt);
    // The pirate kit has no firearm animation. Pose its right shoulder after
    // the mixer so aiming remains visible without replacing the walk cycle.
    // Add a two-handed firearm pose after the locomotion mixer. This preserves
    // the authored walk/run clips while making the upper body actually carry
    // and aim every FFA weapon. The reload pose is deliberately broad enough
    // to read from the third-person camera and for remote players.
    poseCharacterFirearm(mesh,state);
    poseCharacterKnife(mesh,state);
    // Look where they are aiming. The mixer rewrites bone rotations every frame,
    // so this is applied additively after the update. Sign is measured, not
    // guessed: the head bone's local +Z is the face direction, and decreasing
    // rotation.x tilts it up -- which matches camPitch being negative when the
    // player looks up.
    const head=data.characterVisual?.getObjectByName('Head');
    if(head&&state.pitch)head.rotation.x+=clamp(state.pitch,-.7,.7);
  }else{
    const stride=state.animation==='Run'?.75:state.animation==='Walk'?.4:0;
    const swing=Math.sin(performance.now()*(state.animation==='Run'?.016:.011))*stride;
    data.legs[0].rotation.x=swing;data.legs[1].rotation.x=-swing;
  }
  const armBlend=1-Math.exp(-dt*24);
  const leftTarget=state.weapon==='fists'&&state.attacking&&state.attackArm===0?-1.4:0;
  // In Free-for-All the weapon is always up and follows the aim, so an enemy's
  // barrel shows where they are pointing. -1.2 is the arm level; more negative
  // raises it, and camPitch is negative when looking up, so it adds directly.
  const ffaAim=inFfa()&&Boolean(GUN_MODELS[state.weapon]);
  const rightTarget=ffaAim?clamp(-1.15+(state.pitch||0),-2.1,-.15)
    :state.weapon==='pistol'?(state.aiming||state.attacking?-1.2:-.12):state.attacking&&state.attackArm===1?-1.4:0;
  data.arms[0].rotation.x+=(leftTarget-data.arms[0].rotation.x)*armBlend;
  data.arms[1].rotation.x+=(rightTarget-data.arms[1].rotation.x)*armBlend;
  setRemoteWeapon(mesh,state.weapon);
  if(data.deductionKnife&&!data.characterMixer)data.deductionKnife.visible=state.weapon==='knife';
}
function attachCharacterGun(mesh){
  const gun=new THREE.Group();
  box(gun,0,0,.22,.25,.22,.72,mats.dark,false);
  box(gun,0,-.18,-.04,.21,.38,.22,mats.dark,false);
  box(gun,0,.15,-.02,.31,.08,.36,mats.white,false);
  gun.position.set(.72,1.52,.25);mesh.add(gun);
  mesh.userData.gun=gun;
  return gun;
}
function createFfaViewmodel(){
  const root=new THREE.Group(),skin=new THREE.MeshBasicMaterial({color:0xd6a884}),sleeve=new THREE.MeshBasicMaterial({color:0x334f61});
  // Slimmer, shorter arms: the originals were wide enough to block the weapon
  // they are supposed to be holding.
  const left=box(root,-.13,-.10,.10,.09,.09,.42,sleeve,false),right=box(root,.14,-.10,.10,.09,.09,.42,sleeve,false);
  left.rotation.x=right.rotation.x=-.12;
  // Held low and right, canted inward: the barrel runs toward the centre of
  // the screen instead of standing straight up the middle.
  root.position.set(.62,-.52,-1.12);root.rotation.set(-.05,-.13,.04);
  const hands=new THREE.Group(),leftHand=box(hands,-.11,-.04,-.16,.10,.09,.12,skin,false),rightHand=box(hands,.11,-.04,-.16,.10,.09,.12,skin,false);root.add(hands);
  const weapon=new THREE.Group();root.add(weapon);root.userData.weapon=weapon;root.userData.leftArm=left;root.userData.rightArm=right;root.userData.leftHand=leftHand;root.userData.rightHand=rightHand;root.visible=false;camera.add(root);scene.add(camera);return root;
}
const ffaViewmodel=createFfaViewmodel();

// The source guns are intentionally kept as a single mesh for download size.
// A lightweight magazine proxy supplies the one moving part players need to
// understand reload timing. It is removed, lowered, replaced, and seated while
// the authoritative server deadline remains the source of truth.
function addViewMagazine(kind){
  const weapon=ffaViewmodel.userData.weapon;
  for(const key of ['magazine','replacementMagazine'])if(weapon.userData[key]){weapon.remove(weapon.userData[key]);weapon.userData[key]=null;}
  if(['knife','bazooka','shotgun'].includes(kind))return;
  const long=['smg','rifle','arc'].includes(kind),makeMagazine=()=>{
    const magazine=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(long?.2:.16,long?.48:.31,long?.23:.18),new THREE.MeshBasicMaterial({color:0x1b252b}));
    body.rotation.x=long?-.14:0;magazine.add(body);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(long?.205:.165,.045,long?.235:.185),new THREE.MeshBasicMaterial({color:0x55dff2}));stripe.position.y=long?.13:.08;stripe.rotation.x=body.rotation.x;magazine.add(stripe);return magazine;
  },magazine=makeMagazine(),replacementMagazine=makeMagazine();
  magazine.position.set(.02,long?-.19:-.14,long?-.18:-.12);
  magazine.userData.home=magazine.position.clone();
  replacementMagazine.visible=false;
  weapon.add(magazine,replacementMagazine);weapon.userData.magazine=magazine;weapon.userData.replacementMagazine=replacementMagazine;
}
// Scoping narrows the field of view, hides the viewmodel behind the optic, and
// slows the look so the magnified view stays controllable. Firing is untouched:
// the shot still goes through the same path, so a scoped sniper can shoot.
function setFfaScope(on){
  const optic=FFA_SCOPES[player.weapon];
  const want=Boolean(on&&optic&&inFfa()&&!ffa.deadUntil);
  if(ffa.scoped===want)return;
  ffa.scoped=want;
  const panel=$('ffa-scope');
  if(panel){
    panel.hidden=!want;
    if(want)$('ffa-scope-zoom').textContent=optic.label;
  }
  $('crosshair').hidden=want;                 // the optic has its own reticle
  ffaViewmodel.visible=!want&&!ffa.deadUntil;
}
// --- Sci-Fi Gun Pack ------------------------------------------------------
// Seven models, one per weapon. They are loaded once, cached, and cloned into
// the viewmodel; the procedural boxes below remain as the fallback for anything
// that fails to load, so a missing file never leaves you holding nothing.
const GUN_MODELS={pistol:'pistol',smg:'smg',rifle:'rifle',shotgun:'shotgun',sniper:'sniper',magnum:'magnum',arc:'arc',bazooka:'bazooka.glb'};
const GUN_NAMES={pistol:'SIDEARM',smg:'MACHINE PISTOL',rifle:'PULSE RIFLE',shotgun:'SCATTER RAY',
                 sniper:'RAILGUN',magnum:'MAGNUM',arc:'ARC EMITTER',knife:'COMBAT BLADE',bazooka:'BAZOOKA'};
// Each model arrives at its own scale and facing; these line them up in hand.
// How long each weapon should appear in view, in world units. The models are
// authored at wildly different scales, so rather than guessing a multiplier per
// file the loader measures each one and fits it to these lengths.
const GUN_LENGTH={pistol:.76,smg:1.02,rifle:1.34,shotgun:1.22,sniper:1.46,magnum:.88,arc:1.16,bazooka:1.62};
const GUN_OFFSET={
  pistol:[.02,-.04,-.10],smg:[.02,-.04,-.12],rifle:[.02,-.05,-.14],
  shotgun:[.02,-.05,-.13],sniper:[.02,-.05,-.16],magnum:[.02,-.04,-.11],arc:[.02,-.05,-.13]
};
const gunCache=new Map();
function loadGunModel(kind){
  const file=GUN_MODELS[kind];
  if(!file)return Promise.resolve(null);
  if(gunCache.has(file))return gunCache.get(file);
  // The pack is FBX; the bazooka arrived as a glTF binary. Pick the parser from
  // the file rather than keeping two loading paths that can drift apart.
  const glb=file.endsWith('.glb')||file.endsWith('.gltf');
  const url=glb?`/models/guns/${file}`:`/models/guns/${file}.fbx`;
  const pending=new Promise(resolve=>{
    const done=result=>{
      const object=glb?result.scene||result.scenes?.[0]:result;
      if(!object){resolve(null);return;}
      // The pack has no textures but it does have per-part material colours --
      // that is where the red shotgun and cyan ray gun live. Keep each colour
      // and only swap the shader, so the weapon stays readable at night and
      // does not go dark when the lights are cut.
      const convert=material=>{
        const basic=new THREE.MeshBasicMaterial({
          color:material?.color?material.color.clone():new THREE.Color(0x9aa7ad),
          map:material?.map||null
        });
        // Nudge the darkest parts up so grips and barrels do not read as a
        // single black mass this close to the camera.
        const hsl={};basic.color.getHSL(hsl);
        if(hsl.l<.16)basic.color.setHSL(hsl.h,hsl.s,.2);
        return basic;
      };
      object.traverse(child=>{
        if(!child.isMesh)return;
        child.material=Array.isArray(child.material)?child.material.map(convert):convert(child.material);
        child.castShadow=false;child.receiveShadow=false;
      });
      resolve(object);
    };
    const loader=glb?new GLTFLoader():new FBXLoader();
    loader.load(url,done,undefined,()=>resolve(null));
  });
  gunCache.set(file,pending);
  return pending;
}
// Measure a pack model, then scale it so its longest edge matches the intended
// length. Guessing a multiplier per file is what left these either enormous or
// invisible. Shared by the first-person viewmodel and by other players' hands.
function fitGunModel(model,kind,scale=1,offset=null){
  const instance=model.clone(true);
  const bounds=new THREE.Box3().setFromObject(instance),size=new THREE.Vector3();
  bounds.getSize(size);
  const longest=Math.max(size.x,size.y,size.z)||1;
  // Point the long axis down -Z, whichever axis the artist used.
  if(size.x>=size.y&&size.x>=size.z)instance.rotation.y=Math.PI/2;
  else if(size.y>=size.x&&size.y>=size.z)instance.rotation.x=Math.PI/2;
  instance.updateMatrixWorld(true);
  instance.scale.setScalar((GUN_LENGTH[kind]||.45)*scale/longest);
  // Re-centre on the origin so the offsets mean the same thing for every model.
  instance.updateMatrixWorld(true);
  const fitted=new THREE.Box3().setFromObject(instance),centre=new THREE.Vector3();
  fitted.getCenter(centre);
  instance.position.sub(centre);
  if(offset)instance.position.add(new THREE.Vector3(...offset));
  return instance;
}
// --- Weapon previews ------------------------------------------------------
// Same approach as the pirate portraits: render each model once to a data URL
// for the grid tiles, and keep one live canvas for the selected weapon.
const GUN_ROLE={smg:'SMG',rifle:'ASSAULT',shotgun:'CLOSE',sniper:'SNIPER',magnum:'HEAVY',arc:'ENERGY',pistol:'SIDEARM'};
const GUN_BLURB={
  smg:'Fast and forgiving up close; the spread punishes long range.',
  rifle:'The all-rounder. Steady damage at almost any distance.',
  shotgun:'Devastating inside a few metres, useless beyond them.',
  sniper:'One hit, one kill — if you can land it. Right mouse to scope.',
  magnum:'Six heavy rounds. Hits hard and punishes a miss.',
  arc:'A stream of light chip damage. Short reach, huge magazine.',
  pistol:'Your backup. Always in the holster.'
};
function gunStatLine(kind){
  const spec=FFA_WEAPONS[kind];if(!spec)return '';
  return `${spec.damage} dmg · ${spec.head} head · ${spec.magazine} rounds · ${spec.range}m`;
}
// One WebGL context for every weapon visual. Six throwaway renderers for the
// tiles plus one per live preview took the page from 7 contexts to 14, close
// enough to the browser's ~16 limit that it starts killing the oldest one --
// which shows up as the main view flickering. Everything now renders through
// this single offscreen context and is blitted into plain 2D canvases.
let gunGL=null;
function gunRenderer(){
  if(!gunGL){
    gunGL=new THREE.WebGLRenderer({canvas:document.createElement('canvas'),alpha:true,antialias:true,preserveDrawingBuffer:true});
    gunGL.setPixelRatio(1);gunGL.outputColorSpace=THREE.SRGBColorSpace;
  }
  return gunGL;
}
const gunThumbCache=new Map();
// One throwaway renderer, reused for every tile then disposed.
function gunThumbnail(kind){
  if(gunThumbCache.has(kind))return gunThumbCache.get(kind);
  const pending=loadGunModel(kind).then(model=>{
    if(!model)return null;
    const renderer=gunRenderer();renderer.setSize(256,160,false);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,256/160,.1,40);
    const instance=fitGunModel(model,kind,1);
    // Three-quarter view so the silhouette reads better than a flat side-on.
    instance.rotation.y+=Math.PI*.22;instance.rotation.x+=.18;
    scene.add(instance);
    scene.add(new THREE.HemisphereLight(0xe8edff,0x17142d,3.1));
    const key=new THREE.DirectionalLight(0xffd2bf,3.4);key.position.set(-3,4,5);scene.add(key);
    const size=new THREE.Vector3();new THREE.Box3().setFromObject(instance).getSize(size);
    camera.position.set(0,0,Math.max(size.x,size.y,size.z)*2.25+.4);camera.lookAt(0,0,0);
    renderer.render(scene,camera);
    return renderer.domElement.toDataURL('image/png');
  }).catch(()=>null);
  gunThumbCache.set(kind,pending);
  return pending;
}
function paintGunTiles(root){
  for(const button of root.querySelectorAll('[data-gun]')){
    const kind=button.dataset.gun,tile=button.querySelector('i');
    if(!tile||tile.dataset.painted)continue;
    tile.dataset.painted='1';
    gunThumbnail(kind).then(url=>{if(url){tile.style.backgroundImage=`url(${url})`;tile.classList.add('has-photo');}});
  }
}
// A live, slowly turning preview of one weapon on a given canvas.
function createGunStage(canvasEl){
  const paint=canvasEl.getContext('2d');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1.6,.1,40),stage=new THREE.Group();
  scene.add(stage);scene.add(new THREE.HemisphereLight(0xe6ebff,0x17142d,2.9));
  const key=new THREE.DirectionalLight(0xffd1bd,3.8);key.position.set(-3,4,5);scene.add(key);
  const rim=new THREE.DirectionalLight(0x746cff,4.2);rim.position.set(4,2,-3);scene.add(rim);
  const stageState={scene,camera,stage,kind:null,token:0,spin:0};
  stageState.show=function(kind){
    if(stageState.kind===kind)return;
    stageState.kind=kind;
    const token=++stageState.token;
    loadGunModel(kind).then(model=>{
      if(!model||stageState.token!==token)return;
      stage.clear();
      const instance=fitGunModel(model,kind,1);
      stage.add(instance);
      const size=new THREE.Vector3();new THREE.Box3().setFromObject(instance).getSize(size);
      camera.position.set(0,.05,Math.max(size.x,size.y,size.z)*2.1+.35);camera.lookAt(0,0,0);
      canvasEl.parentElement?.classList.add('is-loaded');
    }).catch(()=>{});
  };
  stageState.render=function(dt){
    if(!stageState.kind||!paint)return;
    const area=canvasEl.getBoundingClientRect();
    const width=Math.max(1,Math.round(area.width)),height=Math.max(1,Math.round(area.height));
    if(!width||!height)return;
    if(canvasEl.width!==width||canvasEl.height!==height){canvasEl.width=width;canvasEl.height=height;}
    const renderer=gunRenderer();
    renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    stageState.spin+=dt*.55;stage.rotation.y=stageState.spin;
    renderer.render(scene,camera);
    paint.clearRect(0,0,width,height);
    paint.drawImage(renderer.domElement,0,0,width,height);
  };
  return stageState;
}
let lobbyGunStage=null,armoryStage=null;

function setFfaViewWeapon(kind,force=false){
  const weapon=ffaViewmodel.userData.weapon;
  // Rebuilding is expensive: it clears the group, re-creates the placeholder
  // boxes and re-clones the model. applyFfaWeapon() runs on every snapshot, so
  // doing that unconditionally tore the gun down several times a second --
  // which is why it appeared to vanish while standing still, and why the
  // frame rate suffered during a firefight.
  if(!force&&ffaViewmodel.userData.kind===kind)return;
  ffaViewmodel.userData.kind=kind;
  weapon.clear();
  weapon.userData.magazine=null;weapon.userData.replacementMagazine=null;
  const dark=new THREE.MeshBasicMaterial({color:0x17242b}),metal=new THREE.MeshBasicMaterial({color:0x49626b}),accent=new THREE.MeshBasicMaterial({color:0xd39b42});
  const length={pistol:.72,smg:1.12,rifle:1.48,shotgun:1.58,sniper:1.72}[kind]||1;
  if(kind==='knife'){
    box(weapon,0,-.12,-.08,.18,.42,.2,dark,false);const blade=new THREE.Mesh(new THREE.ConeGeometry(.13,.9,4),new THREE.MeshBasicMaterial({color:0xd9e4e6}));blade.rotation.x=-Math.PI/2;blade.position.z=-.62;weapon.add(blade);weapon.position.set(.12,-.02,-.12);weapon.userData.muzzle=null;return;
  }
  box(weapon,0,.03,-.42,kind==='pistol'?.22:.27,.22,length,dark,false);
  box(weapon,0,-.16,-.12,.2,.38,.22,metal,false);
  if(kind!=='pistol')box(weapon,0,.03,.24,.28,.28,.48,metal,false);
  if(kind==='sniper'){box(weapon,0,.22,-.36,.18,.16,.58,accent,false);box(weapon,0,.22,-.66,.28,.05,.08,accent,false);}
  if(kind==='shotgun')box(weapon,0,.03,-1.22,.13,.13,.72,metal,false);
  // Replace the placeholder with the real model as soon as it is available.
  if(GUN_MODELS[kind]){
    const token=(ffaViewmodel.userData.token||0)+1;ffaViewmodel.userData.token=token;
    loadGunModel(kind).then(model=>{
      if(!model||ffaViewmodel.userData.token!==token)return;
      const instance=fitGunModel(model,kind,1,GUN_OFFSET[kind]);
      // Keep the muzzle flare that the procedural build already positioned.
      const flare=weapon.userData.muzzle;
      weapon.clear();
      weapon.add(instance);
      if(flare){weapon.add(flare);weapon.userData.muzzle=flare;}
      addViewMagazine(kind);
    }).catch(()=>{});
  }
  const flareMaterial=new THREE.MeshBasicMaterial({color:0xffd26a,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}),muzzle=new THREE.Group();
  const flame=new THREE.Mesh(new THREE.ConeGeometry(.16,.55,6),flareMaterial);flame.rotation.x=-Math.PI/2;flame.position.z=-.25;muzzle.add(flame);
  muzzle.add(new THREE.Mesh(new THREE.SphereGeometry(.13,6,4),flareMaterial.clone()));muzzle.position.set(0,.03,-(.42+length*.52));muzzle.visible=false;weapon.add(muzzle);weapon.userData.muzzle=muzzle;
  weapon.position.set(.02,.02,-.05);
  weapon.userData.home=weapon.position.clone();
  addViewMagazine(kind);
}
const characterLoader=new GLTFLoader();
let universalAnimationPromise=null;
function loadUniversalAnimations(){
  if(!universalAnimationPromise)universalAnimationPromise=new Promise(resolve=>characterLoader.load('/models/universal/UAL1_Standard.glb',gltf=>resolve(gltf.animations||[]),undefined,error=>{console.warn('Universal animation library unavailable.',error);resolve([]);}));
  return universalAnimationPromise;
}
const universalAnimationNames={Idle_Loop:'Idle',Walk_Loop:'Walk',Sprint_Loop:'Run',Jump_Loop:'Jump',Punch_Jab:'Punch',Death01:'Death',Hit_Chest:'HitReact',Sword_Attack:'Sword',Sword_Idle:'SwordIdle',Pistol_Idle_Loop:'PistolIdle',Pistol_Shoot:'PistolShoot',Pistol_Reload:'PistolReload'};
// Every one of these used to start the moment the module was evaluated, which
// is why the menu took twenty seconds to appear: ten large downloads and their
// decoding saturated the main thread before anything could paint. They are now
// started deliberately by the boot sequence, which can report progress.
const loadPirate=async name=>{
  const universalFile=UNIVERSAL_CHARACTERS[name],animations=universalFile?await loadUniversalAnimations():null;
  return new Promise(resolve=>characterLoader.load(universalFile?`/models/universal/${universalFile}.gltf`:`/models/pirates/Characters_${name}.gltf`,gltf=>{
  if(universalFile){
    gltf.animations=animations.filter(clip=>universalAnimationNames[clip.name]).map(clip=>{const copy=clip.clone();copy.name=universalAnimationNames[clip.name];return copy;});
    gltf.userData={...(gltf.userData||{}),universal:true};
  }
  characterTemplates.set(name,gltf);
  if(name==='Sharky')mountMenuSharky();
  createPiratePortrait(name,gltf);
  if(player&&player.character===name)attachCharacterModel(player.mesh,name);
  if(characterChoice===name)showPiratePreview(name);
  multiplayer?.refreshCharacters?.();
  resolve(true);
},undefined,error=>{console.warn(`Character ${name} unavailable; using built-in character.`,error);resolve(false);}));
};
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
const loadWoman=name=>new Promise(resolve=>womenLoader.load(`/models/women/${name}.fbx`,source=>{
  womenTemplates.set(name,source);
  for(const ped of peds)if(ped.variant===name)attachWomanModel(ped.mesh,name);
  if(taxiPassenger&&name==='Female_Casual')attachWomanModel(taxiPassenger,name);
  resolve(true);
},undefined,error=>{console.warn(`Women NPC model ${name} unavailable; using built-in character.`,error);resolve(false);}));

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
const featuredActivity=ACTIVITY_DEFINITIONS[0];
activityMarker=beacon(featuredActivity.position.x,featuredActivity.position.z,0x20d9ee,featuredActivity.name);
const activityManager=new ActivityManager({
  getPosition:()=>player?activePosition():null,
  isEligible:()=>Boolean(playing&&!job&&deduction.phase==='idle'&&!inFfa()&&!player.inCar&&!player.inAircraft&&!player.jetpack&&!wanted.level),
  request:(path,body)=>accountRequest(path,{token:accountToken(),...body}),
  onState:snapshot=>{activitySnapshot=snapshot;if(activityMarker)activityMarker.visible=deduction.phase==='idle'&&!inFfa();},
  onObjective:setObjective,
  onResult:result=>{
    if(result.success){applyWorldProgress(result.reward);cue(920);const seconds=(result.reward.elapsedMs/1000).toFixed(1);toast(`SKYLINE SPRINT COMPLETE · ${seconds}s · +${result.reward.gainedExp} XP`);}
    else toast(result.message);
  }
});
taxiPassenger=avatar(material(0xf1cb72));attachWomanModel(taxiPassenger,'Female_Casual');taxiPassenger.position.set(jobRoutes.taxi[0].x,0,jobRoutes.taxi[0].z);taxiPassenger.visible=false;scene.add(taxiPassenger);

// A self-contained social-deduction activity. The lobby lives in the city,
// while rounds run on a raised arena so city collision and traffic cannot
// leak into the match.
const deductionLobby={...safePoint(landmark('Garden Bloc').roadPoint,3)};
const deductionLobbyMesh=beacon(deductionLobby.x,deductionLobby.z,0xff5d57,'DEDUCTION LOBBY');
deductionLobbyMesh.children[0].scale.setScalar(1.65);
const deductionArena=new THREE.Group();deductionArena.visible=false;scene.add(deductionArena);
// Phases where the meeting UI owns the screen. During these the camera must
// not track the mouse: the player is moving the pointer to read and click the
// vote panel, and because movement is camera relative, letting camYaw drift
// here is what leaves WASD rotated once play resumes.
const MEETING_PHASES=new Set(['meeting','ejecting','wrong-vote']);
const meetingActive=()=>MEETING_PHASES.has(deduction.phase);
// Collapse the meeting panel so the chat log and voice HUD are reachable while
// a vote is running. The countdown stays on show in the collapsed bar.
function setMeetingMinimized(minimized){
  const panel=$('meeting-panel');if(!panel)return;
  panel.classList.toggle('minimized',minimized);
  const toggle=$('meeting-toggle');if(!toggle)return;
  toggle.setAttribute('aria-expanded',String(!minimized));
  $('meeting-toggle-label').textContent=minimized?'OPEN VOTE':'MINIMIZE';
  toggle.title=minimized?'Back to the vote panel (M)':'Minimize so you can chat (M)';
}
function toggleMeetingPanel(){
  setMeetingMinimized(!$('meeting-panel').classList.contains('minimized'));
}
// Put the camera directly behind the player so forward is forward again.
function alignCameraBehindPlayer(){
  camYaw=player.h+Math.PI;camPitch=.55;lastLookAt=performance.now();
}
const deduction={phase:'idle',role:null,mapName:'',bots:[],bodies:[],tasks:[],taskDone:0,taskRequired:0,taskOpen:null,returnPoint:null,meetingBoard:null,blackHole:null,resultAt:0,ejected:null,nextNpcKill:0,killReadyAt:0,playerAlive:true,playerGhost:false,emergencyLeft:1,meetingDeadline:0,meetingStage:null,playerVote:null,sabotage:null,sabotageEnds:0,nextSabotage:0,ventReadyAt:0};
// Imported, not copied. A hand-maintained duplicate is what left the magnum
// and the arc emitter unable to fire: they existed on the server but the
// client's table had no entry, so every trigger pull bailed out early.
// Which weapons carry optics, and how far they magnify.
const FFA_SCOPES={sniper:{zoom:3.4,fov:22,label:'3.4x'},rifle:{zoom:1.35,fov:46,label:'1.35x'}};
const ffa={phase:'idle',mapId:'it-park',startsAt:0,scoped:false,snapshot:null,primary:'smg',returnToLobby:false,spawnIndex:0,deadUntil:0,lastShotId:0,lastTick:0,recoil:0,muzzleUntil:0,claimSent:null,lockedCharacter:null,firstBloodShown:false};
let ffaPingAt=0,ffaPingBusy=false;
function updateFfaPing(){
  if(!inFfa()||ffaPingBusy||performance.now()-ffaPingAt<5000)return;
  ffaPingAt=performance.now();ffaPingBusy=true;const started=performance.now();
  fetch('/api/health',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error();return response.text();})
    .then(()=>{$('ffa-ping').textContent=`● ${Math.max(1,Math.round(performance.now()-started))} MS`;})
    .catch(()=>{$('ffa-ping').textContent='● OFFLINE';}).finally(()=>{ffaPingBusy=false;});
}
const inFfa=()=>ffa.phase!=='idle';
const OFFICE_CENTER_X=300,officeArena=new THREE.Group(),officeWalls=[],officeSolidMeshes=[];
officeArena.visible=false;scene.add(officeArena);
const officeMat=(color,roughness=.75,metalness=.05)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function officeBlock(x,y,z,w,h,d,material,solid=false){
  const mesh=box(officeArena,OFFICE_CENTER_X+x,y,z,w,h,d,material);if(solid){officeWalls.push({x:OFFICE_CENTER_X+x,z,w,d});officeSolidMeshes.push(mesh);}return mesh;
}
function officeSign(text,x,z,rotation=0,color='#8ff4ff'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const g=canvas.getContext('2d');
  g.fillStyle='#122033';g.fillRect(0,0,512,128);g.strokeStyle=color;g.lineWidth=7;g.strokeRect(4,4,504,120);g.fillStyle=color;g.font='900 52px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,66,480);
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(5.6,1.4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));panel.position.set(OFFICE_CENTER_X+x,3.4,z);panel.rotation.y=rotation;officeArena.add(panel);
}
function buildOfficeArena(){
  if(officeArena.userData.built)return;officeArena.userData.built=true;
  const wall=officeMat(0xe7edf2,.88),accent=officeMat(0x23384c,.65,.12),floor=officeMat(0x8d969e,.95),carpet=officeMat(0x315a72,.98),glass=new THREE.MeshPhysicalMaterial({color:0x8fd5e7,transparent:true,opacity:.34,roughness:.12,metalness:.15,side:THREE.DoubleSide}),wood=officeMat(0x9a7048,.72),desk=officeMat(0xc7b28e,.78),black=officeMat(0x222a31,.58,.2),green=officeMat(0x4c8b62,.9);
  officeBlock(0,-.12,0,96,.24,68,floor);officeBlock(-25,.015,0,40,.05,60,carpet);officeBlock(25,.015,0,40,.05,60,carpet);
  officeBlock(0,5.7,0,96,.22,68,officeMat(0xf3f6f7,.95));
  for(const [x,z,w,d] of [[0,-34,96,.45],[0,34,96,.45],[-48,0,.45,68],[48,0,.45,68]])officeBlock(x,2.8,z,w,5.6,d,wall,true);
  // Central lift core. The steel doors are decorative and deliberately inactive.
  for(const [x,z,w,d] of [[0,-7,12,.5],[0,7,12,.5],[-6,0,.5,14],[6,0,.5,14]])officeBlock(x,2.8,z,w,5.6,d,accent,true);
  for(const x of [-2.15,2.15])officeBlock(x,2.15,-7.28,3.7,4.3,.12,officeMat(0x778a96,.28,.72));
  officeBlock(0,3.95,-7.38,8.8,.55,.14,black);officeSign('ELEVATORS · OFFLINE',0,-7.5,0,'#ffcc73');
  // Glass marks meeting rooms without turning either wing into a maze. Every
  // run is split around a wide doorway; the previous full-length panes sealed
  // several spawn points into glass boxes and made players appear unable to
  // move. Low dividers keep the open-plan areas readable without blocking.
  for(const [x,z,w,d] of [
    [-30,-12,7,.3],[-18,-12,7,.3],[-14,-24,.3,7],[-14,-15.5,.3,2],
    [30,-12,7,.3],[18,-12,7,.3],[14,-24,.3,7],[14,-15.5,.3,2]
  ])officeBlock(x,2.8,z,w,5.6,d,glass,true);
  for(const [x,z,w,d] of [[-31,12,8,1.1],[-20,12,8,1.1],[-10,18,1.1,9],[31,12,8,1.1],[20,12,8,1.1],[10,18,1.1,9]])
    officeBlock(x,.7,z,w,1.4,d,accent,true);
  officeSign('WING A',-28,-33.65,0);officeSign('WING B',28,-33.65,0);officeSign('RECEPTION',-20,11.78,Math.PI,'#ffe39a');officeSign('BOARDROOM',24,10.78,Math.PI,'#ffe39a');
  // Reception desk and lounge.
  officeBlock(-20,.72,5,9,1.35,2.1,wood,true);officeBlock(-20,1.55,5,9,.18,2.3,desk);
  for(const [x,z] of [[-38,-25],[-27,-25],[-38,-17],[-27,-17],[27,-25],[38,-25],[27,-17],[38,-17]]){
    officeBlock(x,.72,z,4.4,1.35,2.1,desk,true);officeBlock(x,1.48,z-.25,1.65,.95,.12,black);officeBlock(x,.5,z+1.55,1.5,1,1.1,accent);
  }
  // Boardroom tables, collaboration islands and cover that make both wings play differently.
  officeBlock(24,.75,20,12,1.45,3,wood,true);officeBlock(24,1.55,20,12,.16,3.2,desk);
  for(const [x,z] of [[-37,21],[-23,22],[23,22],[37,21],[-37,1],[37,1]]){
    officeBlock(x,.65,z,3.8,1.2,1.8,desk,true);officeBlock(x,1.35,z-.2,1.4,.8,.1,black);
  }
  // Planters, printers, cabinets and break-room counters add believable office detail and cover.
  for(const [x,z] of [[-43,28],[-43,8],[-10,-29],[10,-29],[43,28],[43,8]]){
    officeBlock(x,.5,z,1.4,1,1.4,wood,true);const plant=new THREE.Mesh(new THREE.SphereGeometry(.8,10,7),green);plant.position.set(OFFICE_CENTER_X+x,1.45,z);plant.scale.y=1.35;officeArena.add(plant);
  }
  for(const [x,z,w,d] of [[-5,-22,2,4],[5,-22,2,4],[-5,22,2,4],[5,22,2,4],[-38,-7,2,7],[38,-7,2,7]])officeBlock(x,1,z,w,2,d,officeMat(0x71808a,.7,.2),true);
  // Warm ceiling panels make the arena feel occupied without expensive dynamic shadows.
  for(let x=-35;x<=35;x+=10)for(let z=-24;z<=24;z+=12){const light=officeBlock(x,5.52,z,5,.08,1.1,new THREE.MeshBasicMaterial({color:0xfff2ce}));light.userData.officeLight=true;}
  const hemi=new THREE.HemisphereLight(0xe9f4ff,0x42505c,2.5),warm=new THREE.PointLight(0xffe7bd,18,70);warm.position.set(OFFICE_CENTER_X,4.8,0);officeArena.add(hemi,warm);
}
function officeCollides(x,z,r=1){
  if(Math.abs(x-OFFICE_CENTER_X)+r>47.5||Math.abs(z)+r>33.5)return true;
  return officeWalls.some(w=>Math.abs(x-w.x)<w.w/2+r&&Math.abs(z-w.z)<w.d/2+r);
}
function collides(x,z,r=1){return activeFfaMap==='office'?officeCollides(x,z,r):worldCollides(x,z,r);}
function setFfaMap(mapId){ffa.mapId=mapId==='office'?'office':'it-park';activeFfaMap=ffa.mapId;if(ffa.mapId==='office')buildOfficeArena();officeArena.visible=ffa.mapId==='office'&&inFfa();}
// Floating damage number at the point of impact, or at the crosshair when the
// hit happened off screen. Confirms a shot landed and how hard it landed.
function showDamageNumber(amount,kind,worldPoint){
  const host=$('damage-numbers');if(!host)return;
  const label=document.createElement('b');
  label.textContent=kind==='kill'?`${amount} ✕`:String(amount);
  if(kind)label.classList.add(kind);
  let x=window.innerWidth/2,y=window.innerHeight/2-40;
  if(worldPoint){
    const projected=worldPoint.clone().project(camera);
    if(projected.z<1){
      x=(projected.x*.5+.5)*window.innerWidth;
      y=(-projected.y*.5+.5)*window.innerHeight;
    }
  }
  label.style.left=`${x}px`;label.style.top=`${y}px`;
  host.append(label);
  setTimeout(()=>label.remove(),900);
}
function flashHitMarker(headshot){
  const marker=$('hit-marker');
  marker.classList.toggle('headshot',Boolean(headshot));
  marker.classList.remove('show');void marker.offsetWidth;marker.classList.add('show');
  if(headshot){
    const call=$('headshot-marker');
    call.classList.remove('show');void call.offsetWidth;call.classList.add('show');
  }
  hitSound(headshot);
}
// A short bright tick for a hit, pitched up for a headshot.
function hitSound(headshot){
  if(!audioContext)return;
  const now=audioContext.currentTime,tone=audioContext.createOscillator(),gain=audioContext.createGain();
  tone.type='square';
  tone.frequency.setValueAtTime(headshot?1650:1050,now);
  tone.frequency.exponentialRampToValueAtTime(headshot?900:620,now+.08);
  gain.gain.setValueAtTime(.09,now);gain.gain.exponentialRampToValueAtTime(.001,now+.11);
  tone.connect(gain).connect(masterGain);tone.start(now);tone.stop(now+.12);
}
// Sparks and a puff where a round lands, so shots read against the world.
// A visible death, so the person who landed the shot sees a kill rather than a
// target that blinked out. Drawn for every death in the match, not just yours.
function deathBurst(x,z,y=1.2){
  const at=new THREE.Vector3(x,y,z);
  glowAt(at,0xff5a3c,2.6,220,'deathGlow');
  glowAt(at,0xffd9a0,1.3,140,'deathCore');
  bloodBurst(x,y,z,0,0,1.6,true);
  bloodPool(x,z,1.5);
  // A ring that punches outward reads as an impact even at a distance.
  const ring=new THREE.Mesh(new THREE.RingGeometry(.35,.62,20),
    new THREE.MeshBasicMaterial({color:0xff7a4a,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));
  ring.position.copy(at);ring.rotation.x=-Math.PI/2;
  addCombatEffect(ring,420,'ring');
}

function impactBurst(point,headshot){
  if(!point)return;
  glowAt(point,headshot?0xffd34d:0xffb35c,headshot?2.4:1.6,260,'hit');
  for(let i=0;i<(headshot?10:6);i++){
    const spark=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,
      color:headshot?0xffe08a:0xffc27a,transparent:true,opacity:.95,
      blending:THREE.AdditiveBlending,depthWrite:false}));
    const size=.1+Math.random()*.16;spark.scale.set(size,size,1);
    spark.position.copy(point);
    const angle=Math.random()*Math.PI*2,spread=2+Math.random()*4;
    spark.userData.velocity=new THREE.Vector3(Math.cos(angle)*spread,1.2+Math.random()*2.6,Math.sin(angle)*spread);
    addCombatEffect(spark,260+Math.random()*180,'blood');
  }
}
let pendingServerRound=null;
const deductionColors=[0x55b9e8,0xf2c354,0xb77ae5,0x65d59d,0xf07b75,0xe88ac4,0x8ba2f4];
const deductionProfiles=[
  {name:'Mika',pirate:'Anne',strategy:'tasker',speed:4.7,awareness:14,bravery:.72,patience:4200,color:0xe26b6b},
  {name:'Jules',pirate:'Henry',strategy:'buddy',speed:4.25,awareness:11,bravery:.45,patience:6200,color:0x5db8df},
  {name:'Nico',pirate:'Mako',strategy:'investigator',speed:4.5,awareness:17,bravery:.9,patience:5200,color:0xe6bd4e},
  {name:'Ari',pirate:'Captain_Barbarossa',strategy:'leader',speed:3.9,awareness:15,bravery:.8,patience:4700,color:0x9d77d5},
  {name:'Sam',pirate:'Sharky',strategy:'cautious',speed:4.05,awareness:18,bravery:.25,patience:7600,color:0x62c88f},
  {name:'Kai',pirate:'Mako',strategy:'runner',speed:5.35,awareness:10,bravery:.62,patience:3500,color:0xeb8bbc},
  {name:'Bea',pirate:'Anne',strategy:'observer',speed:4.15,awareness:20,bravery:.55,patience:6800,color:0x8298ee}
];
const deductionWalls=[];
const shipRooms=[
  {name:'CENTRAL PLAZA',x:0,z:-14,w:23,d:16,color:0x6f8b78},{name:'NORTH GARAGE',x:-29,z:-19,w:14,d:10,color:0x737f86},
  {name:'FOUNDRY',x:-33,z:-3,w:12,d:11,color:0x765b50},{name:'WATCHTOWER',x:-21,z:3,w:9,d:8,color:0x557064},
  {name:'CLINIC',x:-13,z:-5,w:11,d:9,color:0xa7b9b6},{name:'POWER YARD',x:-15,z:16,w:12,d:10,color:0x81715c},
  {name:'SOUTH GARAGE',x:-30,z:21,w:14,d:10,color:0x737f86},{name:'CARGO MARKET',x:1,z:17,w:18,d:14,color:0x82735a},
  {name:'TOWN HALL',x:14,z:5,w:11,d:9,color:0x806b67},{name:'ARSENAL',x:23,z:-15,w:12,d:10,color:0x786164},
  {name:'WATERWORKS',x:23,z:-3,w:9,d:8,color:0x5d7d78},{name:'EAST LOOKOUT',x:35,z:1,w:12,d:11,color:0x547783},
  {name:'MARINA',x:25,z:17,w:10,d:9,color:0x4f7c80}
].map(room=>({...room,x:room.x*1.55,z:room.z*1.55,w:room.w*1.45,d:room.d*1.45}));
const taskSpecs=[
  {room:'POWER YARD',title:'RESTORE GRID',type:'wires'},{room:'TOWN HALL',title:'VERIFY ACCESS',type:'sequence'},
  {room:'ARSENAL',title:'CALIBRATE RANGE',type:'targets'},{room:'EAST LOOKOUT',title:'ALIGN BEACON',type:'sequence'},
  {room:'FOUNDRY',title:'START FURNACE',type:'sequence'},{room:'CLINIC',title:'MEDICAL SCAN',type:'hold'},
  {room:'CARGO MARKET',title:'SORT CARGO',type:'targets'},{room:'WATERWORKS',title:'CLEAN FILTER',type:'targets'}
];
const ventLinks=[['POWER YARD','CLINIC'],['CLINIC','WATCHTOWER'],['EAST LOOKOUT','ARSENAL'],['ARSENAL','WATERWORKS'],['FOUNDRY','NORTH GARAGE'],['SOUTH GARAGE','FOUNDRY']];
const deductionCityAssets=new Map(),deductionCityLoader=new GLTFLoader();
const deductionAssetsReady=Promise.all(
  ['Building_Small_1','Building_Medium_2_001','Building_Large_2','Entrance_Concrete_2x2','Prop_Planter_Single','Prop_Bollard','Prop_ManholeCover','Prop_ACUnit']
    .map(name=>new Promise(resolve=>deductionCityLoader.load(
      `/models/megakit/${name}.gltf`,
      gltf=>{deductionCityAssets.set(name,gltf.scene);resolve(true);},
      undefined,
      error=>{console.warn(`Deduction place asset ${name} unavailable`,error);resolve(false);}
    )))
);
function shipMaterial(color,emissive=0x000000){return new THREE.MeshStandardMaterial({color,metalness:.48,roughness:.32,emissive,emissiveIntensity:emissive?1.1:0});}
function arenaBox(x,y,z,w,h,d,color){return box(deductionArena,x,y,z,w,h,d,shipMaterial(color));}
function arenaWall(x,z,w,d){deductionWalls.push({x,z,w,d});return arenaBox(x,136.3,z,w,2.8,d,0x77858b);}
function placeDeductionAsset(name,x,z,height,rotation=0){
  const source=deductionCityAssets.get(name);if(!source)return null;const mesh=source.clone(true),bounds=new THREE.Box3().setFromObject(mesh),sourceHeight=Math.max(.01,bounds.max.y-bounds.min.y),scale=height/sourceHeight;mesh.scale.setScalar(scale);mesh.position.set(x,134.9-bounds.min.y*scale,z);mesh.rotation.y=rotation;mesh.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});deductionArena.add(mesh);return mesh;
}
function crewmateSuit(color,name=''){
  const suit=new THREE.Group(),fabric=shipMaterial(color),dark=shipMaterial(0x17242c),glass=new THREE.MeshPhysicalMaterial({color:0x9ddcf4,metalness:.15,roughness:.08,transmission:.18,clearcoat:1,clearcoatRoughness:.05});
  const body=new THREE.Mesh(new RoundedBoxGeometry(1.15,1.45,.72,6,.2),fabric);body.position.y=2.05;body.castShadow=true;suit.add(body);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.61,24,16),dark);helmet.position.y=3.12;helmet.castShadow=true;suit.add(helmet);
  const visor=new THREE.Mesh(new THREE.SphereGeometry(.49,24,12),glass);visor.scale.set(1,.66,.32);visor.position.set(0,3.14,.51);visor.castShadow=true;suit.add(visor);
  const collar=new THREE.Mesh(new THREE.TorusGeometry(.48,.09,8,24),shipMaterial(0xaab7bc));collar.rotation.x=Math.PI/2;collar.position.y=2.69;suit.add(collar);
  const pack=new THREE.Mesh(new RoundedBoxGeometry(.92,1.16,.42,5,.12),fabric);pack.position.set(0,2.05,-.58);suit.add(pack);
  const legs=[];for(const x of [-.31,.31]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.23,.72,6,12),fabric);leg.position.set(x,.83,0);leg.castShadow=true;suit.add(leg);legs.push(leg);const boot=new THREE.Mesh(new RoundedBoxGeometry(.5,.3,.72,4,.12),dark);boot.position.set(x,.25,.12);suit.add(boot);}
  for(const x of [-.72,.72]){const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.78,6,12),fabric);arm.position.set(x,2.05,0);arm.rotation.z=x<0?-.08:.08;arm.castShadow=true;suit.add(arm);}
  const rim=new THREE.PointLight(color,1.5,7);rim.position.set(0,2.8,-.4);suit.add(rim);
  if(name){const c=document.createElement('canvas');c.width=256;c.height=48;const g=c.getContext('2d');g.font='700 25px sans-serif';g.textAlign='center';g.fillStyle='#fff';g.shadowColor='#000';g.shadowBlur=6;g.fillText(name,128,31);const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));label.position.set(0,4.15,0);label.scale.set(3.8,.72,1);suit.add(label);}
  suit.userData={legs,body,visor,isCrewmate:true};return suit;
}
function addDeductionNameTag(mesh,name){const c=document.createElement('canvas');c.width=256;c.height=48;const g=c.getContext('2d');g.font='700 25px sans-serif';g.textAlign='center';g.fillStyle='#fff';g.shadowColor='#000';g.shadowBlur=6;g.fillText(name,128,31);const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));label.position.set(0,4.05,0);label.scale.set(3.8,.72,1);mesh.add(label);mesh.userData.deductionNameTag=label;}
function arenaLabel(text,x,z,color='#dff7ff'){
  const c=document.createElement('canvas');c.width=512;c.height=96;const g=c.getContext('2d');g.fillStyle='#09151ddd';g.fillRect(0,0,512,96);g.strokeStyle=color;g.lineWidth=5;g.strokeRect(3,3,506,90);g.fillStyle=color;g.font='bold 40px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,49,485);
  const texture=new THREE.CanvasTexture(c),panel=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));panel.position.set(x,138.4,z);panel.scale.set(7.2,1.35,1);deductionArena.add(panel);
}
// The round's shared random source. Task sites, task assignments and crew
// spawns all came from Math.random(), so two players in the same room built
// entirely different maps of work. Seeding from the server's value makes every
// client compute an identical layout.
function makeRng(seed){
  let state=(seed>>>0)||1;
  return()=>{
    state+=0x6D2B79F5;
    let x=Math.imul(state^state>>>15,1|state);
    x^=x+Math.imul(x^x>>>7,61|x);
    return ((x^x>>>14)>>>0)/4294967296;
  };
}
// Pick points that cover the district rather than whichever candidates happen
// to come first in the list. Farthest-point sampling: repeatedly take the one
// furthest from everything already chosen, which pushes the set out to the
// corners of IT Park instead of clustering near the spawn.
function spreadOut(candidates,count,rand=Math.random){
  const chosen=[];
  if(!candidates.length)return chosen;
  chosen.push(candidates[Math.floor(rand()*candidates.length)]);
  while(chosen.length<Math.min(count,candidates.length)){
    let best=null,bestGap=-1;
    for(const candidate of candidates){
      if(chosen.includes(candidate))continue;
      let gap=Infinity;
      for(const picked of chosen)gap=Math.min(gap,dist(picked,candidate));
      if(gap>bestGap){bestGap=gap;best=candidate;}
    }
    if(!best)break;
    chosen.push(best);
  }
  return chosen;
}
function buildDeductionArena(){
  deductionArena.clear();deduction.tasks=[];deductionWalls.length=0;
  deduction.mapName='CEBU IT PARK';
  const TASK_TEMPLATES=[
    {title:'CONNECT STREET LIGHT WIRING',type:'wires'},
    {title:'MOVE THE TRACK SWITCH',type:'sequence'},
    {title:'CALIBRATE TRAFFIC SIGNALS',type:'targets'},
    {title:'RESTORE THE POWER BOX',type:'sequence'},
    {title:'REALIGN THE ROOFTOP DISH',type:'targets'},
    {title:'CLEAR THE DRAINAGE GRATE',type:'wires'},
    {title:'RESET THE LIFT CONTROLLER',type:'sequence'},
    {title:'PATCH THE FIBRE JUNCTION',type:'targets'}
  ];
  const taskSites=spreadOut(
    landmarks.map(place=>({name:place.name,...safePoint(place.entrance,2.2)}))
      .filter(site=>Number.isFinite(site.x)&&Number.isFinite(site.z)),
    TASK_TEMPLATES.length,deduction.rng||Math.random);
  const streetTasks=taskSites.map((site,index)=>({...TASK_TEMPLATES[index%TASK_TEMPLATES.length],street:site.name,site}));
  for(const [index,spec] of streetTasks.entries()){
    if(spec.site){
      // Landmark entrances are already clear of buildings and on a footway.
      const mesh=box(deductionArena,spec.site.x,1,spec.site.z,1.8,2,1,shipMaterial(0x67cfae,0x1b6b58));
      deduction.tasks.push({...spec,room:spec.street,x:spec.site.x,z:spec.site.z,mesh,done:false,completedBy:new Set(),index});
      continue;
    }
    const segments=driveSegments.filter(s=>s.name===spec.street),segment=segments.sort((a,b)=>Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z)-Math.hypot(a.b.x-a.a.x,a.b.z-a.z))[0];if(!segment)continue;
    const length=Math.hypot(segment.b.x-segment.a.x,segment.b.z-segment.a.z),nx=-(segment.b.z-segment.a.z)/length,nz=(segment.b.x-segment.a.x)/length,x=(segment.a.x+segment.b.x)/2+nx*(segment.width/2+2.2),z=(segment.a.z+segment.b.z)/2+nz*(segment.width/2+2.2);
    const mesh=box(deductionArena,x,1,z,1.8,2,1,shipMaterial(0x67cfae,0x1b6b58));deduction.tasks.push({...spec,room:spec.street,x,z,mesh,done:false,completedBy:new Set(),index});
  }
  const meetingPoint=safePoint(landmark('Garden Bloc').entrance,3),board=new THREE.Group();board.position.set(meetingPoint.x,0,meetingPoint.z);board.visible=false;deductionArena.add(board);deduction.meetingBoard=board;deduction.meetingPoint=meetingPoint;
  const deck=new THREE.Mesh(new THREE.CylinderGeometry(13,13,.8,32),material(0x34464b));deck.position.y=.4;board.add(deck);
  const hole=new THREE.Mesh(new THREE.CylinderGeometry(4.2,4.2,.22,32),new THREE.MeshBasicMaterial({color:0x000000}));hole.position.y=.86;board.add(hole);deduction.blackHole=hole;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(5.4,.25,8,32),new THREE.MeshBasicMaterial({color:0xff6b62}));ring.rotation.x=Math.PI/2;ring.position.y=1;board.add(ring);
}
function createKnife(){
  const knife=new THREE.Group(),blade=material(0xdce8e7),handle=material(0x641d24);
  box(knife,0,0,.35,.16,.12,.9,blade,false);box(knife,0,0,-.2,.22,.2,.35,handle,false);knife.position.set(0,-1.05,.38);knife.rotation.x=-.25;return knife;
}
function attachCharacterKnife(mesh){
  if(mesh.userData.deductionKnife)return mesh.userData.deductionKnife;
  const knife=createKnife();knife.position.set(.7,1.55,.48);knife.rotation.set(-.35,0,-.25);knife.visible=false;mesh.add(knife);mesh.userData.deductionKnife=knife;
  const visual=mesh.userData.characterVisual;
  if(visual)knife.userData.visualHand=visual.getObjectByName('hand_r')||visual.getObjectByName('LowerArm.R')||null;
  return knife;
}
function applyDeductionLoadout(reset=false){
  if(!player||deduction.phase==='idle')return;
  attachCharacterKnife(player.mesh);player.mesh.userData.gun.visible=false;
  player.weapon=deduction.role==='impostor'?(reset||!['hands','knife'].includes(player.weapon)?'knife':player.weapon):'hands';
  player.mesh.userData.deductionKnife.visible=deduction.role==='impostor'&&deduction.playerAlive&&player.weapon==='knife';
  aiming=false;$('crosshair').hidden=true;
}
function setDeductionWeapon(kind){
  if(deduction.phase!=='play'||deduction.role!=='impostor')return;
  player.weapon=kind;player.weaponSwitchUntil=performance.now()+420;player.mesh.userData.gun.visible=false;
  attachCharacterKnife(player.mesh);
  player.mesh.userData.deductionKnife.visible=kind==='knife';player.hudUntil=performance.now()+2500;updateUI();
}
function setCityVisible(visible){
  [...cars,...aircraft,...traffic,...peds,...police].forEach(item=>item.mesh.visible=visible);hubMeshes.forEach(mesh=>mesh.visible=visible);activityMarker.visible=visible;deductionLobbyMesh.visible=visible;objectiveMesh.visible=visible&&Boolean(job||activitySnapshot.state===ACTIVITY_STATES.ACTIVE);taxiPassenger.visible=visible&&job?.kind==='taxi';
  for(const selector of ['.radar-cluster','.social-panel','.topbar','.hud-right','.hud-left'])document.querySelector(selector).hidden=!visible;
}
// Street lamps exist so the impostor has something worth taking away. They are
// emissive meshes with a glow sprite rather than real lights: a few hundred
// PointLights would cost far more than the effect is worth.
const streetLamps=[];
// Tracks the last state pushed to the lamps so we only touch them on a change.
let streetLampsLit=null;
const LAMP_ON=0xffd9a0,LAMP_OFF=0x2a2f33;
function buildStreetLamps(){
  if(streetLamps.length)return;
  const posts=[];
  for(const road of driveSegments){
    const length=Math.hypot(road.b.x-road.a.x,road.b.z-road.a.z);
    if(length<14)continue;
    const steps=Math.max(1,Math.floor(length/34));
    const nx=-(road.b.z-road.a.z)/length,nz=(road.b.x-road.a.x)/length;
    for(let i=0;i<=steps;i++){
      const t=i/steps,side=i%2?1:-1;
      posts.push({x:road.a.x+(road.b.x-road.a.x)*t+nx*(road.width/2+1.4)*side,
                  z:road.a.z+(road.b.z-road.a.z)*t+nz*(road.width/2+1.4)*side});
    }
  }
  // Cap the count and spread what we keep, so the district is lit evenly
  // instead of a few streets being blinding and the rest pitch black.
  const chosen=posts.length>170?spreadOut(posts,170):posts;
  const postGeometry=new THREE.CylinderGeometry(.11,.14,5.2,6);
  const headGeometry=new THREE.SphereGeometry(.42,8,6);
  const postMaterial=new THREE.MeshStandardMaterial({color:0x2f3a40,roughness:.8});
  for(const spot of chosen){
    if(collides(spot.x,spot.z,.5))continue;
    const group=new THREE.Group();
    const post=new THREE.Mesh(postGeometry,postMaterial);post.position.y=2.6;
    const head=new THREE.Mesh(headGeometry,new THREE.MeshStandardMaterial({
      color:LAMP_ON,emissive:LAMP_ON,emissiveIntensity:1.6,roughness:.4}));
    head.position.y=5.3;
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color:0xffca7a,
      transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
    halo.scale.set(7,7,1);halo.position.y=5.3;
    group.add(post,head,halo);group.position.set(spot.x,0,spot.z);
    scene.add(group);
    streetLamps.push({group,head,halo});
  }
}
function setStreetLamps(on){
  for(const lamp of streetLamps){
    lamp.head.material.emissiveIntensity=on?1.6:0;
    lamp.head.material.color.setHex(on?LAMP_ON:LAMP_OFF);
    lamp.halo.visible=on;
  }
}
function showStreetLamps(visible){
  for(const lamp of streetLamps)lamp.group.visible=visible;
}
function setDeductionWorld(active){
  if(active)buildStreetLamps();
  showStreetLamps(active);
  if(active)setStreetLamps(true);
  // The district geometry is shared, but its sandbox actors and activities are not.
  // This makes deduction a closed match staged in IT Park rather than free roam
  // with a role label placed over it.
  [...cars,...aircraft,...traffic,...peds,...police].forEach(item=>item.mesh.visible=!active);
  hubMeshes.forEach(mesh=>mesh.visible=!active);activityMarker.visible=!active;deductionLobbyMesh.visible=!active;
  objectiveMesh.visible=!active&&Boolean(job||activitySnapshot.state===ACTIVITY_STATES.ACTIVE);taxiPassenger.visible=!active&&job?.kind==='taxi';
  document.body.classList.toggle('deduction-mode',active);
}
function startDeduction(setup=null){
  if(deduction.phase!=='idle')return;
  activityManager.cancel('Activity ended when you joined a match');
  deduction.setup=setup;
  // Every client in a room seeds from the same value, so the layout matches.
  deduction.rng=makeRng(setup?.seed??Math.floor(Math.random()*2147483647));
  deduction.networked=Boolean(setup);
  deduction.hostId=setup?.hostId||null;
  deduction.serverRound=null;
  multiplayer.setCommunicationAllowed?.(true);voice.setCommunicationAllowed(true);
  deduction.seatOfBot=new Map();
  if(player.inCar)exitCar(true);if(player.inAircraft)exitAircraft(true);player.jetpack=false;player.mesh.userData.jetpack.visible=false;
  deduction.returnPoint={x:player.x,z:player.z};buildDeductionArena();deductionArena.visible=true;job=null;setObjective(null);setDeductionWorld(true);
  deduction.phase='play';deduction.role=setup?.role||(Math.random()<.4?'impostor':'crewmate');deduction.taskDone=0;deduction.taskOpen=null;deduction.bots=[];deduction.bodies=[];deduction.nextNpcKill=performance.now()+18000;deduction.killReadyAt=performance.now()+12000;deduction.playerAlive=true;deduction.playerGhost=false;deduction.emergencyLeft=1;deduction.meetingStage=null;deduction.playerVote=null;deduction.sabotage=null;deduction.nextSabotage=performance.now()+22000;deduction.ventReadyAt=0;
  const start=safePoint(landmark('Garden Bloc').entrance,3);
  // Everyone used to drop onto the same tile, which handed the impostor a kill
  // before anyone could move. Each player takes a different scattered spot:
  // by roster seat in a lobby round so no two clients choose the same one,
  // at random when playing solo.
  const arrivals=spreadOut(pedestrianSpots.filter(node=>!collides(node.x,node.z,.9)),14,deduction.rng);
  let landing=start;
  if(arrivals.length){
    const seats=setup?.roster||[];
    const seat=seats.findIndex(entry=>entry.id===multiplayer.getLocalId?.());
    const pick=seat>=0?(seat*3+1)%arrivals.length:Math.floor(Math.random()*arrivals.length);
    landing=safePoint(arrivals[pick],1.1);
  }
  player.x=landing.x;player.z=landing.z;player.y=0;player.vx=player.vz=player.vy=0;attachCharacterModel(player.mesh,characterChoice);addDeductionNameTag(player.mesh,$('player-name').value.trim()||'YOU');player.mesh.position.set(player.x,0,player.z);player.mesh.visible=true;scene.add(player.mesh);
  const walkable=pedestrianSpots.filter(node=>!collides(node.x,node.z,.8));
  const spawnNodes=spreadOut(walkable,12,deduction.rng);
  // Solo play keeps the full cast; in a room the count comes from the lobby.
  const botCount=setup?Math.max(0,Math.min(deductionProfiles.length,setup.npcCount||0)):deductionProfiles.length;
  for(let i=0;i<botCount;i++){const profile=deductionProfiles[i],spawn=spawnNodes[Math.min(spawnNodes.length-1,i*2)]||closestPedestrianNode(start),mesh=avatar(material(profile.color)),bot={...profile,id:i,x:spawn?.x??start.x,z:spawn?.z??start.z,h:0,alive:true,isImpostor:false,emergencyLeft:1,completedTasks:new Set(),target:null,route:[],moveAt:0,decisionAt:0,taskSince:0,stuckFor:0,lastMoveX:spawn?.x??start.x,lastMoveZ:spawn?.z??start.z,killReadyAt:performance.now()+18000+i*900,suspicion:new Map(),lastSeen:null,mesh};attachCharacterModel(mesh,profile.pirate);mesh.scale.setScalar(.94+i%3*.045);addDeductionNameTag(mesh,bot.name);mesh.position.set(bot.x,0,bot.z);deductionArena.add(mesh);deduction.bots.push(bot);}
  if(setup){
    // The server drew the impostors; mark whichever NPC seats it named.
    for(const id of setup.npcImpostors||[]){
      const index=Number(String(id).replace('npc-',''));
      if(deduction.bots[index])deduction.bots[index].isImpostor=true;
    }
  }else if(deduction.role==='crewmate'&&deduction.bots.length){
    deduction.bots[Math.floor(Math.random()*deduction.bots.length)].isImpostor=true;
  }
  // Everyone doing all eight sites turned a round into a hike. Each crewmate
  // gets a random subset instead: the same spread of destinations across the
  // district, a fraction of the walking, and different routes per player.
  const perPlayer=Math.max(1,Math.min(deduction.tasks.length,TASKS_PER_PLAYER));
  const rng=deduction.rng;
  const drawTasks=()=>{
    const pool=deduction.tasks.map(task=>task.index);
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    return new Set(pool.slice(0,perPlayer));
  };
  // Draw for every seat in roster order first, then the NPC seats, so the
  // sequence of rng calls is identical on every client and each player ends up
  // with the same list wherever it is computed.
  const assignments=new Map();
  for(const entry of setup?.roster||[])assignments.set(entry.id,drawTasks());
  deduction.bots.forEach((_,i)=>assignments.set(`npc-${i}`,drawTasks()));
  const myId=multiplayer.getLocalId?.();
  deduction.myTasks=deduction.role==='crewmate'
    ?(assignments.get(myId)||drawTasks())
    :new Set();
  deduction.bots.forEach((bot,i)=>{bot.assignedTasks=bot.isImpostor?new Set():(assignments.get(`npc-${i}`)||new Set());});
  // A light column over your own sites. The markers are spread across the whole
  // district, so without something visible from a distance they are found by
  // accident rather than navigation.
  for(const task of deduction.tasks){
    if(!deduction.myTasks.has(task.index))continue;
    const beam=new THREE.Mesh(
      new THREE.CylinderGeometry(.6,.6,28,12,1,true),
      new THREE.MeshBasicMaterial({color:0x67cfae,transparent:true,opacity:.15,depthWrite:false,side:THREE.DoubleSide}));
    beam.position.set(task.x,14,task.z);
    deductionArena.add(beam);
    task.beam=beam;
  }
  deduction.taskRequired=deduction.bots.filter(bot=>!bot.isImpostor).length*perPlayer
    +(deduction.role==='crewmate'?deduction.myTasks.size:0);
  player.weapon='hands';player.mesh.userData.gun.visible=false;if(player.mesh.userData.deductionKnife)player.mesh.userData.deductionKnife.visible=false;
  $('deduction-role').hidden=false;$('deduction-role').classList.toggle('impostor',deduction.role==='impostor');$('deduction-role-name').textContent=deduction.role.toUpperCase();
  $('deduction-role-copy').textContent=deduction.role==='impostor'?'Q: knife · Click: kill · G: vent · X: sabotage. Blend in.':`Complete all ${deduction.tasks.length} glowing consoles. E interacts.`;
  applyDeductionLoadout(true);
  if(pendingServerRound&&(!setup?.seed||pendingServerRound.seed===setup.seed)){
    applyServerRoster(pendingServerRound);pendingServerRound=null;
  }
  $('ship-status').hidden=true;
  toast(`${deduction.mapName} · round started`);camYaw=Math.PI;camPitch=.55;updateUI();
}
function endDeduction(message){
  deduction.discussion=[];toast(message);deduction.phase='ending';deduction.resultAt=performance.now()+3000;$('meeting-panel').hidden=true;$('deduction-role-name').textContent=message;$('deduction-role-copy').textContent='Returning to Cebu IT Park…';
}
function leaveDeduction(){
  const backToLobby=deduction.returnToLobby;
  deduction.returnToLobby=false;
  if(backToLobby){
    // Reopen the browser on the room we just played; the server has already
    // reset everyone's ready state and put the room back in the lobby.
    setTimeout(()=>{
      if(!playing)return;
      showOverlay();showLobby(true);
      if(lobbyRoom)renderRoom(lobbyRoom);else multiplayer.refreshRooms?.().catch(()=>{});
    },40);
  }
  deductionArena.visible=false;deductionArena.clear();clearBloodPools();deduction.sabotage=null;deduction.phase='idle';setDeductionWorld(false);$('deduction-role').hidden=true;$('meeting-panel').hidden=true;$('ship-status').hidden=true;$('task-panel').hidden=true;document.body.classList.remove('lights-out','comms-out');
  multiplayer.setRoomPeers?.(null);multiplayer.setCommunicationAllowed?.(true);voice.setCommunicationAllowed(true);player.mesh.userData.deductionKnife&&(player.mesh.userData.deductionKnife.visible=false);if(player.mesh.userData.deductionNameTag){player.mesh.remove(player.mesh.userData.deductionNameTag);delete player.mesh.userData.deductionNameTag;}player.mesh.traverse(child=>{if(child.isMesh&&child.material){child.material.opacity=1;child.material.transparent=false;}});scene.add(player.mesh);player.weapon='fists';player.x=deduction.returnPoint?.x??deductionLobby.x;player.z=deduction.returnPoint?.z??deductionLobby.z;player.y=0;player.mesh.position.set(player.x,0,player.z);player.vx=player.vz=0;updateUI();
}
function killDeductionTarget(){
  if(deduction.phase!=='play'||deduction.role!=='impostor'||!deduction.playerAlive)return;
  if(player.weapon!=='knife')setDeductionWeapon('knife');
  if(deduction.networked){
    const nearbyBot=deduction.bots.filter(bot=>bot.alive&&dist(bot,player)<5.5).sort((a,b)=>dist(a,player)-dist(b,player))[0];
    const seat=nearestServerSeat()||(nearbyBot?{id:`npc-${nearbyBot.id}`,name:nearbyBot.name}:null);
    if(!seat){toast('Move closer to a player');return;}
    multiplayer.roundAction?.('kill',{targetId:seat.id}).catch(error=>toast(error.message));
    return;
  }
  if(performance.now()<deduction.killReadyAt){toast(`Kill cooldown · ${Math.ceil((deduction.killReadyAt-performance.now())/1000)}s`);return;}
  const target=deduction.bots.filter(b=>b.alive&&dist(b,player)<3.4).sort((a,b)=>dist(a,player)-dist(b,player))[0];if(!target){toast('Move closer to a player');return;}
  knifeSound();
  bloodBurst(target.x,1.25,target.z,(target.x-player.x)/Math.max(1,dist(target,player)),(target.z-player.z)/Math.max(1,dist(target,player)),1.15,true);
  player.shotAt=performance.now();deduction.killReadyAt=player.shotAt+30000;player.attackUntil=player.shotAt+420;target.alive=false;target.bodyAt=player.shotAt;target.mesh.rotation.z=Math.PI/2;target.mesh.position.y=.45;playCharacter(target.mesh,'Death',.05);deduction.bodies.push(target);deduction.bots.filter(bot=>bot.alive&&!bot.isImpostor&&dist(bot,player)<12).forEach(witness=>witness.suspicion.set('player',(witness.suspicion.get('player')||0)+5));cue(115);toast('Body left behind · kill cooldown 30s');checkDeductionWin();
}
// --- meeting discussion ---------------------------------------------------
// The bots argue from the state they actually hold: who they saw, what their
// suspicion map says, and whether they are the impostor and therefore lying.
const pickOne=list=>list[Math.floor(Math.random()*list.length)];
function deductionDisplayName(id){
  if(id==='player')return $('player-name').value.trim()||'You';
  return deduction.bots.find(bot=>bot.id===id)?.name||'someone';
}
function botPlace(bot){return nearestRoad(bot)?.name||deduction.mapName||'the block';}
function topSuspectOf(bot){
  const ranked=[...bot.suspicion.entries()].sort((a,b)=>b[1]-a[1])[0];
  return ranked&&ranked[1]>0?ranked[0]:null;
}
// Builds the whole exchange up front and timestamps it, so the meeting tick
// only has to release lines as their moment arrives.
function buildDiscussion(body){
  const alive=deduction.bots.filter(bot=>bot.alive);
  if(!alive.length)return [];
  const playerName=$('player-name').value.trim()||'You';
  const lines=[],spoken=new Set();
  const nextSpeaker=()=>{
    const fresh=alive.filter(bot=>!spoken.has(bot.id));
    const bot=pickOne(fresh.length?fresh:alive);spoken.add(bot.id);return bot;
  };
  const say=(bot,text)=>lines.push({name:bot.name,text});

  const opener=nextSpeaker();
  say(opener,body
    ?pickOne([`I found ${body.name} near ${botPlace(opener)}.`,
              `${body.name} is down by ${botPlace(opener)}. Who was over there?`,
              `Body at ${botPlace(opener)}. ${body.name} never finished their tasks.`])
    :pickOne([`I called this. Something is off and I want everyone accounted for.`,
              `Round table. Where was everyone in the last minute?`,
              `I am not waiting for another body. Talk.`]));

  // Alibis, coloured by how each bot plays.
  for(const bot of alive.slice(0,3)){
    if(bot===opener)continue;
    say(bot,bot.strategy==='tasker'?pickOne([`Wiring at ${botPlace(bot)}. I have the tasks to show for it.`,`Heads down on tasks at ${botPlace(bot)}.`])
      :bot.strategy==='runner'?pickOne([`I was moving the whole time. Passed ${botPlace(bot)} twice.`,`Never stopped. ${botPlace(bot)}, then back around.`])
      :pickOne([`${botPlace(bot)} for me. Saw nobody.`,`I was at ${botPlace(bot)}. Can anyone confirm that?`]));
  }

  // The accusation. An honest bot names whoever it actually suspects; an
  // impostor picks anyone but itself, which is exactly the tell to listen for.
  const accuser=alive.find(bot=>!bot.isImpostor&&topSuspectOf(bot))||nextSpeaker();
  const honestTarget=topSuspectOf(accuser);
  const liarTarget=pickOne([...alive.filter(b=>b!==accuser).map(b=>b.id),...(deduction.playerAlive?['player']:[])]);
  const accusedId=accuser.isImpostor||!honestTarget?liarTarget:honestTarget;
  const accusedName=deductionDisplayName(accusedId);
  deduction.accusedId=accusedId;
  say(accuser,accuser.isImpostor
    ?pickOne([`${accusedName} was behaving oddly. I would start there.`,
              `Do not look at me, look at ${accusedName}.`,
              `${accusedName} was nowhere near their tasks.`])
    :pickOne([`I saw ${accusedName} leave the area right before this.`,
              `${accusedName}. I watched them double back twice.`,
              `${accusedName} has not named a single place they were.`]));

  // The accused answers for themselves.
  const accusedBot=deduction.bots.find(bot=>bot.id===accusedId&&bot.alive);
  if(accusedBot)say(accusedBot,accusedBot.isImpostor
    ?pickOne([`That is a reach. I was on tasks at ${botPlace(accusedBot)}.`,
              `Convenient. Accuse me and the real one walks free.`,
              `I have done more tasks than ${accuser.name} has.`])
    :pickOne([`That is wrong. I was at ${botPlace(accusedBot)} and I can prove it.`,
              `You are wasting the round on me.`,
              `Check the tasks. I have been working.`]));
  else if(accusedId==='player')lines.push({name:'SYSTEM',text:`${accusedName} has been accused. Defend yourself in chat.`});

  // Someone backs the accuser, someone else pushes back.
  const second=alive.find(bot=>bot!==accuser&&bot.id!==accusedId);
  if(second)say(second,second.isImpostor||Math.random()<.5
    ?pickOne([`I am with ${accuser.name} on this.`,`That matches what I saw. ${accusedName} it is.`])
    :pickOne([`I am not convinced. That is thin.`,`We have nothing solid. Skipping is safer than being wrong.`]));

  const closer=alive.find(bot=>bot.strategy==='leader')||pickOne(alive);
  say(closer,pickOne([`Last call. Say something useful or we vote.`,
                      `Vote ${accusedName} or skip. Decide.`,
                      `I want names, not guesses. Voting now.`]));

  // Spread the exchange across the discussion, with the last beats landing
  // during voting so the room is not silent while people decide.
  const span=58000;
  return lines.map((line,index)=>({...line,at:2200+index*(span/Math.max(1,lines.length))+Math.random()*1200}));
}
function requestMeeting(body){
  if(deduction.phase!=='play')return;deduction.phase='meeting';deduction.meetingStage='discussion';deduction.meetingDeadline=performance.now()+45000;deduction.playerVote=null;deduction.sabotage=null;deduction.tasks.forEach(task=>task.mesh.visible=true);document.body.classList.remove('lights-out','comms-out');deduction.meetingBoard.visible=true;hadPointerLock=false;if(document.pointerLockElement===canvas)document.exitPointerLock();
  deduction.bodies.forEach(dead=>deductionArena.remove(dead.mesh));deduction.bodies=[];
  const center=deduction.meetingPoint,alive=deduction.bots.filter(b=>b.alive);alive.forEach((b,i)=>{const a=i/alive.length*Math.PI*2;b.x=center.x+Math.sin(a)*10;b.z=center.z+Math.cos(a)*10;b.mesh.position.set(b.x,1,b.z);b.mesh.lookAt(center.x,1,center.z);});
  if(deduction.playerAlive){
    player.x=center.x;player.z=center.z+12;player.y=1;player.mesh.position.set(player.x,1,player.z);
    // lookAt turns the mesh but leaves player.h stale, which then disagrees
    // with the direction movement and the camera derive from it.
    player.h=Math.atan2(center.x-player.x,center.z-player.z);player.mesh.rotation.y=player.h;
    player.vx=0;player.vz=0;
  }
  keys.clear();
  const testimony=alive.filter(bot=>bot.suspicion?.size).map(bot=>{const [id,score]=[...bot.suspicion.entries()].sort((a,b)=>b[1]-a[1])[0]||[];if(!score)return '';const suspect=id==='player'?($('player-name').value.trim()||'You'):deduction.bots.find(other=>other.id===id)?.name;return suspect?`${bot.name} suspects ${suspect}`:'';}).filter(Boolean).slice(0,2).join(' · ');
  deduction.meetingStartedAt=performance.now();
  deduction.accusedId=null;
  deduction.discussion=buildDiscussion(body);
  setMeetingMinimized(false);
  $('meeting-panel').hidden=false;$('meeting-copy').textContent=(body?`${body.name} was found.`:'Emergency meeting called at Garden Bloc.')+(testimony?` ${testimony}.`:' No one has convincing evidence yet.')+' Discussion: 45 seconds. Drag the view to look around; the crew is talking in chat.';$('meeting-result').hidden=false;$('meeting-result').textContent='DISCUSSION · 45s';
  const host=$('vote-options');host.replaceChildren();
  for(const candidate of [...alive,...(deduction.playerAlive?[{id:'player',name:$('player-name').value.trim()||'You',alive:true}]:[])]){const button=document.createElement('button');button.type='button';button.textContent=candidate.name;button.disabled=true;button.onclick=()=>castVote(candidate);host.append(button);}
  const skip=document.createElement('button');skip.type='button';skip.textContent='SKIP VOTE';skip.onclick=()=>castVote({id:'skip',name:'No one'});host.append(skip);
  skip.disabled=true;
}
function castVote(candidate){
  if(deduction.phase!=='meeting'||deduction.meetingStage!=='voting'||!deduction.playerAlive)return;
  deduction.playerVote=candidate;
  if(deduction.networked){
    document.querySelectorAll('#vote-options button').forEach(button=>button.disabled=true);
    $('meeting-result').textContent='VOTE CAST · waiting for the crew';
    multiplayer.roundAction?.('vote',{candidateId:candidate.id}).catch(error=>toast(error.message));
    return;
  }
  finishMeetingVote();
}
function finishMeetingVote(){
  if(deduction.phase!=='meeting')return;const alive=deduction.bots.filter(bot=>bot.alive),candidates=[...alive,...(deduction.playerAlive?[{id:'player',name:$('player-name').value.trim()||'You'}]:[])],skip={id:'skip',name:'No one'},votes=new Map();
  const add=candidate=>votes.set(candidate.id,(votes.get(candidate.id)||0)+1);if(deduction.playerAlive)add(deduction.playerVote||skip);
  // Bots used to vote at random or abstain, which scattered the tally and made
  // a skip almost inevitable. They now follow the accusation the room actually
  // made during the discussion, so the debate decides the round.
  const byId=id=>candidates.find(candidate=>candidate.id===id);
  const accused=deduction.accusedId?byId(deduction.accusedId):null;
  for(const voter of alive){
    const evidence=[...voter.suspicion.entries()]
      .filter(([id])=>id==='player'?deduction.playerAlive:alive.some(bot=>bot.id===id))
      .sort((a,b)=>b[1]-a[1]);
    let choice=skip;
    if(evidence[0]?.[1]>=3){
      // Saw something firsthand: that outweighs anything said in the room.
      choice=byId(evidence[0][0])||skip;
    }else if(voter.isImpostor){
      // Push the room toward whoever is already under suspicion, so long as it
      // is not a fellow impostor; otherwise pick any crewmate.
      const crew=candidates.filter(candidate=>candidate.id==='player'?deduction.role==='crewmate':!candidate.isImpostor);
      choice=(accused&&crew.includes(accused))?accused:(crew[Math.floor(Math.random()*crew.length)]||skip);
    }else if(accused&&accused.id!==voter.id&&Math.random()<.68){
      choice=accused;                       // goes along with the room
    }else if(Math.random()<.25){
      choice=candidates[Math.floor(Math.random()*candidates.length)]||skip;
    }
    add(choice);
  }
  // Most votes wins, as in the games this borrows from. Requiring more than
  // half of everyone meant a split tally always fell through to a skip.
  const ranked=[...votes.entries()].sort((a,b)=>b[1]-a[1]);
  const tied=ranked.length>1&&ranked[0][1]===ranked[1][1];
  const winner=!ranked.length||tied?'skip':ranked[0][0];deduction.ejected=winner==='skip'?skip:candidates.find(candidate=>candidate.id===winner)||skip;deduction.phase='ejecting';deduction.resultAt=performance.now()+1800;document.querySelectorAll('#vote-options button').forEach(button=>button.disabled=true);setMeetingMinimized(false);
  const chosen=deduction.ejected;if(chosen.id!=='player'&&chosen.id!=='skip')chosen.alive=false;if(chosen.id==='player')player.vy=5;else if(chosen.id!=='skip')chosen.vy=5;
  const tally=ranked.map(([id,count])=>`${id==='skip'?'Skip':deductionDisplayName(id)} ${count}`).join(' · ');
  $('meeting-copy').textContent=(chosen.id==='skip'
    ?(tied?'The vote was tied. No one is ejected.':'The crew could not agree. No one is ejected.')
    :`${chosen.name} has the most votes. Watch the jump…`)+`  Votes — ${tally}`;
}
function resolveVote(){
  const chosen=deduction.ejected,correct=chosen.id==='player'?deduction.role==='impostor':chosen.isImpostor;
  const result=$('meeting-result');result.hidden=false;
  if(chosen.id==='skip'){result.textContent='NO ONE WAS EJECTED. IMPOSTOR IS STILL ALIVE.';deduction.resultAt=performance.now()+3000;deduction.phase='wrong-vote';return;}
  if(correct){result.textContent=`${chosen.name} was the impostor. CREWMATES WIN.`;deduction.resultAt=performance.now()+3500;deduction.phase='won';}
  else{if(chosen.id==='player'){deduction.playerAlive=false;deduction.playerGhost=true;if(deduction.role==='crewmate')deduction.taskRequired-=[...(deduction.myTasks||[])].filter(index=>!deduction.tasks[index]?.completedBy.has('player')).length;player.mesh.traverse(child=>{if(child.isMesh&&child.material){child.material=child.material.clone();child.material.transparent=true;child.material.opacity=.34;}});$('deduction-role-name').textContent='GHOST';$('deduction-role-copy').textContent='Observe silently. You cannot vote, report, kill, or complete tasks.';}else if(!chosen.isImpostor)deduction.taskRequired-=deduction.tasks.filter(task=>!chosen.completedTasks.has(task.index)).length;result.textContent=`${chosen.name} was not the impostor. IMPOSTOR IS STILL ALIVE.`;deduction.resultAt=performance.now()+3500;deduction.phase='wrong-vote';}
}
function deductionInteract(){
  if(deduction.phase==='idle'){if(near(player,deductionLobby,5.2))startDeduction();return true;}
  if(deduction.phase!=='play')return true;
  const body=deduction.bodies.find(b=>dist(b,player)<4.2);
  if(body){
    if(deduction.networked)multiplayer.roundAction?.('report',{bodyId:body.seatId||body.id}).catch(error=>toast(error.message));
    else requestMeeting(body);
    return true;
  }
  if(!deduction.playerAlive)return true;
  if(Math.hypot(player.x-deduction.meetingPoint.x,player.z-deduction.meetingPoint.z)<4.5&&deduction.emergencyLeft>0){
    if(deduction.networked)multiplayer.roundAction?.('emergency').catch(error=>toast(error.message));
    else{deduction.emergencyLeft--;requestMeeting(null);}
    return true;
  }
  if(deduction.sabotage){const station=deduction.sabotage.stations.find(index=>!deduction.sabotage.repaired.has(index)&&dist(deduction.tasks[index],player)<4);if(station!==undefined){repairSabotage('player',station);return true;}}
  if(deduction.role==='crewmate'){const task=deduction.tasks.find(t=>deduction.myTasks?.has(t.index)&&!t.completedBy.has('player')&&dist(t,player)<TASK_REACH);if(task){openTask(task);return true;}}
  return true;
}
function openTask(task){
  deduction.taskOpen=task;hadPointerLock=false;if(document.pointerLockElement===canvas)document.exitPointerLock();$('task-panel').hidden=false;$('task-room').textContent=task.room;$('task-title').textContent=task.title;
  const host=$('task-controls');host.replaceChildren();let progress=0,total=task.type==='wires'?4:task.type==='targets'?6:task.type==='hold'?3:5;
  $('task-instruction').textContent=task.type==='wires'?'Connect the colors in order.':task.type==='targets'?'Clear every highlighted target.':task.type==='hold'?'Run all three scan stages.':'Activate controls from left to right.';
  const colors=['red','blue','yellow','green'];
  for(let i=0;i<total;i++){const button=document.createElement('button');button.type='button';button.textContent=task.type==='wires'?colors[i].toUpperCase():task.type==='targets'?'◎':String(i+1);if(task.type==='wires')button.className=colors[i];button.onclick=()=>{if(task.type==='sequence'&&i!==progress){progress=0;host.querySelectorAll('button').forEach(b=>b.classList.remove('done'));toast('Sequence reset');return;}if(button.classList.contains('done'))return;button.classList.add('done');progress++;if(progress===total)completeTask(task);};host.append(button);}
}
function completeTask(task,actor='player'){
  const key=actor==='player'?'player':`bot-${actor.id}`;if(task.completedBy.has(key))return;task.completedBy.add(key);if(actor==='player'){task.done=true;deduction.taskOpen=null;$('task-panel').hidden=true;task.mesh.material.color.set(0x31423e);task.mesh.material.emissive.set(0x000000);}else actor.completedTasks.add(task.index);
  deduction.taskDone++;cue(820);toast(`${actor==='player'?'Task':`${actor.name}'s task`} complete · crew ${deduction.taskDone}/${deduction.taskRequired}`);if(deduction.taskDone>=deduction.taskRequired)endDeduction('ALL CREW TASKS COMPLETE · IMPOSTOR LOST');
}
$('task-close').onclick=()=>{deduction.taskOpen=null;$('task-panel').hidden=true;};
function triggerSabotage(){
  if(deduction.phase!=='play'||deduction.role!=='impostor'||!deduction.playerAlive||deduction.sabotage)return;
  if(deduction.networked){
    // This ran locally, so cutting the lights darkened the impostor's own
    // screen and nobody else's -- precisely backwards. Ask the server so the
    // whole room gets it. The host relays on an NPC impostor's behalf, but a
    // human impostor is entitled to raise their own.
    const first=Math.floor(Math.random()*deduction.tasks.length);
    multiplayer.roundAction?.('sabotage',{kind:'LIGHTS',stations:[first]})
      .catch(error=>toast(error.message||'Could not cut the power'));
    return;
  }
  startSabotage();
}
function startSabotage(forcedKind,forcedStations){
  if(deduction.sabotage||!deduction.tasks.length)return;
  // The impostor's one power is darkness. The old reactor and oxygen variants
  // could kill the crew outright on a timer, which is a different game.
  const types=['LIGHTS'],type='LIGHTS',lethal=false,first=Number.isFinite(forcedStations?.[0])?forcedStations[0]:Math.floor(Math.random()*deduction.tasks.length),second=Number.isFinite(forcedStations?.[1])?forcedStations[1]:(first+Math.max(1,Math.floor(deduction.tasks.length/2)))%deduction.tasks.length,stations=lethal?[first,second]:[first];deduction.sabotage={type,stations,required:stations.length,repaired:new Set(),lethal};deduction.sabotageEnds=performance.now()+(lethal?30000:45000);setStreetLamps(false);   // the district actually goes dark, not just the HUD
  // Only the crew get the closed-in view; the impostor keeps a clear screen.
  document.body.classList.toggle('lights-out',type==='LIGHTS'&&deduction.role!=='impostor');document.body.classList.toggle('comms-out',type==='COMMS');if(type==='COMMS')deduction.tasks.forEach((task,index)=>task.mesh.visible=stations.includes(index));toast(deduction.role==='impostor'
    ?'LIGHTS CUT · the crew must restore the street power'
    :`LIGHTS OUT · repair ${stations.length} street station${stations.length>1?'s':''} to restore power`);
}
function repairSabotage(actor,station){if(!deduction.sabotage||deduction.sabotage.repaired.has(station))return;deduction.sabotage.repaired.add(station);if(deduction.sabotage.repaired.size>=deduction.sabotage.required){setStreetLamps(true);toast('STREET POWER RESTORED');deduction.sabotage=null;deduction.tasks.forEach(task=>task.mesh.visible=true);document.body.classList.remove('lights-out','comms-out');}else toast(`Repair station ${deduction.sabotage.repaired.size}/${deduction.sabotage.required}`);}
function useVent(){
  if(deduction.phase!=='play'||deduction.role!=='impostor'||!deduction.playerAlive||performance.now()<deduction.ventReadyAt)return;
  const source=deduction.tasks.find(t=>dist(t,player)<4);if(!source){toast('Stand near a street access hatch');return;}const destination=deduction.tasks[(source.index+2)%deduction.tasks.length];player.x=destination.x;player.z=destination.z;player.y=0;player.mesh.position.set(player.x,0,player.z);deduction.ventReadyAt=performance.now()+8000;toast(`Vented to ${destination.room}`);
}
function checkDeductionWin(){
  // In a lobby round the server decides who won; local bot bookkeeping must not
  // end the round early on one client.
  if(deduction.networked)return;
  const livingCrew=deduction.bots.filter(b=>b.alive&&!b.isImpostor).length+(deduction.role==='crewmate'&&deduction.playerAlive?1:0),livingImpostors=deduction.bots.filter(b=>b.alive&&b.isImpostor).length+(deduction.role==='impostor'&&deduction.playerAlive?1:0);
  if(deduction.taskDone>=deduction.taskRequired)endDeduction('ALL CREW TASKS COMPLETE · IMPOSTOR LOST');else if(livingImpostors===0)endDeduction('ALL IMPOSTORS EJECTED · CREWMATES WIN');else if(livingImpostors>=livingCrew)endDeduction('IMPOSTOR PARITY · IMPOSTORS WIN');
}
function botSetTarget(bot,target,kind,now,duration=6000){
  const startNode=closestPedestrianNode(bot),endNode=closestPedestrianNode(target);let route=[];
  if(startNode&&endNode){const ids=pedestrianPath(startNode.id,endNode.id);if(ids)route=ids.slice(dist(bot,startNode)<1.2?1:0).map(id=>pedestrianNodes[id]);}
  // Walk to the target itself, not merely the nearest path node: stopping at
  // the node left bots loitering a few metres short of the thing they wanted.
  bot.target={x:target.x,z:target.z,kind,ref:target};
  bot.route=route;
  // Give up only after enough time to actually get there. A flat six seconds
  // covers about 24 m at walking pace, so once tasks were spread across the
  // district every bot abandoned its errand before arriving and dithered.
  const span=dist(bot,target);
  const travel=span/Math.max(1,bot.speed)*1000*1.8+4000;
  bot.moveAt=now+Math.max(duration,Math.min(60000,travel));
  bot.decisionAt=now+900+Math.random()*900;bot.stuckFor=0;bot.arrivedAt=0;
}
function decideBotAction(bot,now){
  const living=deduction.bots.filter(other=>other.alive&&other!==bot),visibleBody=deduction.bodies.filter(body=>dist(bot,body)<bot.awareness).sort((a,b)=>dist(bot,a)-dist(bot,b))[0];
  if(!bot.isImpostor&&visibleBody){botSetTarget(bot,visibleBody,'report',now,3500);return;}
  const strongestSuspicion=[...bot.suspicion.values()].sort((a,b)=>b-a)[0]||0;if(!bot.isImpostor&&bot.emergencyLeft>0&&strongestSuspicion>=5&&!deduction.sabotage&&(bot.strategy==='leader'||bot.strategy==='investigator')){botSetTarget(bot,deduction.meetingPoint,'emergency',now,5000);return;}
  if(!bot.isImpostor&&deduction.sabotage){const station=deduction.sabotage.stations.find(index=>!deduction.sabotage.repaired.has(index));if(station!==undefined){botSetTarget(bot,deduction.tasks[station],'repair',now,4200);return;}}
  if(bot.isImpostor){
    const possible=[...living.filter(other=>!other.isImpostor),...(deduction.role==='crewmate'?[player]:[])];
    const isolated=possible.map(target=>({target,witnesses:living.filter(other=>other!==target&&dist(other,target)<10).length,distance:dist(bot,target)})).sort((a,b)=>a.witnesses-b.witnesses||a.distance-b.distance)[0];
    if(isolated&&isolated.witnesses<=1){botSetTarget(bot,isolated.target,'stalk',now,4200);return;}
    const fake=deduction.tasks[(bot.id+Math.floor(now/9000))%deduction.tasks.length];botSetTarget(bot,fake,'fake-task',now,bot.patience);return;
  }
  if(bot.strategy==='buddy'){
    const friend=[player,...living.filter(other=>!other.isImpostor)].sort((a,b)=>dist(bot,a)-dist(bot,b))[0];if(friend){botSetTarget(bot,friend,'buddy',now,3500);return;}
  }
  if(bot.strategy==='investigator'||bot.strategy==='observer'){
    const suspect=[...bot.suspicion.entries()].sort((a,b)=>b[1]-a[1])[0],watched=suspect&&(suspect[0]==='player'?player:deduction.bots.find(other=>other.id===suspect[0]));
    if(watched&&watched.alive!==false){botSetTarget(bot,watched,'watch',now,4200);return;}
  }
  if(bot.strategy==='cautious'){
    const friend=living.filter(other=>!other.isImpostor).sort((a,b)=>dist(bot,a)-dist(bot,b))[0];if(friend){botSetTarget(bot,{x:friend.x+(Math.random()-.5)*4,z:friend.z+(Math.random()-.5)*4},'safe',now,5000);return;}
  }
  const available=deduction.tasks.filter(task=>bot.assignedTasks?.has(task.index)&&!bot.completedTasks.has(task.index)),stop=(available.length?available:deduction.tasks)[(bot.id+Math.floor(now/7000))%(available.length||deduction.tasks.length)];botSetTarget(bot,{x:stop.x+(Math.random()-.5)*4,z:stop.z+(Math.random()-.5)*4,index:stop.index},'task',now,bot.patience);
}
// A bot impostor striking. In a lobby round the server owns the outcome, so
// the host asks on the bot's behalf and waits for the broadcast; solo rounds
// resolve locally as before.
function botKill(killer,victim,now){
  if(!deduction.networked){npcKill(killer,victim,now);return;}
  if(!crewAuthority())return;                 // only the simulating client asks
  const seatIndex=deduction.bots.indexOf(killer);
  if(seatIndex<0)return;
  const victimSeat=victim===player
    ? multiplayer.getLocalId?.()
    : `npc-${deduction.bots.indexOf(victim)}`;
  if(!victimSeat)return;
  killer.killReadyAt=now+25000;               // mirror the server cooldown locally
  multiplayer.roundAction?.('kill',{targetId:victimSeat,asSeat:`npc-${seatIndex}`}).catch(()=>{});
}
function npcKill(killer,victim,now){
  if(victim===player){bloodBurst(player.x,1.25,player.z,0,0,1.15,true);deduction.playerAlive=false;deduction.playerGhost=true;multiplayer.setCommunicationAllowed?.(false);voice.setCommunicationAllowed(false);deduction.taskRequired-=deduction.tasks.filter(task=>!task.completedBy.has('player')).length;const corpse=avatar(material(0x8c9ba2)),body={id:'player-body',name:$('player-name').value.trim()||'You',x:player.x,z:player.z,alive:false,isImpostor:false,bodyAt:now,mesh:corpse};attachCharacterModel(corpse,characterChoice);corpse.position.set(player.x,.45,player.z);corpse.rotation.z=Math.PI/2;deductionArena.add(corpse);deduction.bodies.push(body);player.mesh.traverse(child=>{if(child.isMesh&&child.material){child.material=child.material.clone();child.material.transparent=true;child.material.opacity=.34;}});$('deduction-role-name').textContent='GHOST';$('deduction-role-copy').textContent='Observe silently. You cannot vote, report, kill, or complete tasks.';toast('You were eliminated · continue as a silent ghost');checkDeductionWin();return;}
  victim.alive=false;bloodBurst(victim.x,1.25,victim.z,0,0,1.15);deduction.taskRequired-=[...(victim.assignedTasks||[])].filter(index=>!victim.completedTasks.has(index)).length;victim.bodyAt=now;victim.x=killer.x+1;victim.z=killer.z;victim.mesh.position.set(victim.x,.45,victim.z);victim.mesh.rotation.z=Math.PI/2;playCharacter(victim.mesh,'Death',.05);deduction.bodies.push(victim);killer.killReadyAt=now+26000+Math.random()*9000;killer.target=null;
  deduction.bots.filter(bot=>bot.alive&&!bot.isImpostor&&bot!==victim&&dist(bot,killer)<12).forEach(witness=>witness.suspicion.set(killer.id,(witness.suspicion.get(killer.id)||0)+5));
  toast('A pirate has gone missing somewhere in IT Park');checkDeductionWin();
}
function updateNetworkMeetingClock(){
  if(!deduction.networked||deduction.phase!=='meeting'||!deduction.meetingDeadline)return;
  const remaining=Math.max(0,Math.ceil((deduction.meetingDeadline-Date.now())/1000));
  $('meeting-result').textContent=`${deduction.meetingStage==='voting'?'VOTING':'DISCUSSION'} · ${remaining}s`;
  if(remaining<=0&&performance.now()-(deduction.lastTickAt||0)>1200){
    deduction.lastTickAt=performance.now();multiplayer.roundAction?.('tick').catch(()=>{});
  }
}
function updateDeduction(dt,t){
  const now=performance.now();
  if(deduction.phase==='ending'&&now>=deduction.resultAt){leaveDeduction();return;}
  if(deduction.phase==='won'&&now>=deduction.resultAt){endDeduction('CREWMATES WIN');return;}
  if(deduction.phase==='meeting'&&deduction.networked){
    updateNetworkMeetingClock();
    return;
  }
  if(deduction.phase==='meeting'){
    // Let the room talk. Lines are released on their own clock so the debate
    // keeps running through voting rather than stopping when it opens.
    if(deduction.discussion?.length){
      const since=now-deduction.meetingStartedAt;
      while(deduction.discussion.length&&deduction.discussion[0].at<=since){
        const line=deduction.discussion.shift();
        multiplayer.postLocalChat?.(line.name,line.text);
      }
    }
    const remaining=Math.max(0,Math.ceil((deduction.meetingDeadline-now)/1000));
    if(deduction.meetingStage==='discussion'){
      $('meeting-result').textContent=`DISCUSSION · ${remaining}s`;
      if(now>=deduction.meetingDeadline){deduction.meetingStage='voting';deduction.meetingDeadline=now+35000;$('meeting-copy').textContent+=' Voting is now open.';document.querySelectorAll('#vote-options button').forEach(button=>button.disabled=!deduction.playerAlive);}
    }else{$('meeting-result').textContent=`VOTING · ${remaining}s`;if(now>=deduction.meetingDeadline)finishMeetingVote();}
    return;
  }
  if(deduction.phase==='wrong-vote'&&now>=deduction.resultAt){const start=safePoint(landmark('Garden Bloc').entrance,3),nearby=pedestrianSpots.filter(node=>dist(node,start)<35&&!collides(node.x,node.z,.8));$('meeting-panel').hidden=true;deduction.meetingBoard.visible=false;deduction.phase='play';player.x=start.x;player.z=start.z;player.y=0;player.mesh.position.set(player.x,0,player.z);deduction.bots.filter(b=>b.alive&&b!==deduction.ejected).forEach((b,i)=>{const node=nearby[(i*3)%nearby.length]||closestPedestrianNode(start);b.x=node?.x??start.x;b.z=node?.z??start.z;b.target=null;b.route=[];b.stuckFor=0;b.mesh.position.set(b.x,0,b.z);});deduction.ejected=null;deduction.discussion=[];deduction.killReadyAt=Math.max(deduction.killReadyAt,now+10000);deduction.meetingStage=null;
    // Hand the controls back in a known state rather than whatever the camera
    // was left pointing at while the vote panel was open.
    keys.clear();player.vx=0;player.vz=0;alignCameraBehindPlayer();
    toast(deduction.playerGhost?'You are a ghost · observe silently':'The hunt continues');checkDeductionWin();return;}
  if(deduction.phase==='ejecting'){
    const target=deduction.ejected,center=deduction.meetingPoint;if(target.id==='player'){player.y-=dt*8;player.x+=(center.x-player.x)*dt*2;player.z+=(center.z-player.z)*dt*2;player.mesh.position.set(player.x,player.y,player.z);}else if(target.id!=='skip'){target.mesh.position.y-=dt*8;target.x+=(center.x-target.x)*dt*2;target.z+=(center.z-target.z)*dt*2;target.mesh.position.x=target.x;target.mesh.position.z=target.z;}
    if(now>=deduction.resultAt)resolveVote();return;
  }
  if(deduction.phase!=='play'||deduction.taskOpen)return;
  const f=(down('forward')?1:0)-(down('back')?1:0),r=(down('right')?1:0)-(down('left')?1:0),mag=Math.hypot(f,r);
  if(deduction.playerGhost){
    // Spectating: no gravity, no collision, and free vertical movement, so a
    // dead player can follow the round from anywhere.
    const drift=down('sprint')?20:12;
    const gx=mag?(-Math.sin(camYaw)*f+Math.cos(camYaw)*r)/mag*drift*dt:0;
    const gz=mag?(-Math.cos(camYaw)*f-Math.sin(camYaw)*r)/mag*drift*dt:0;
    player.x=clamp(player.x+gx,-WORLD.halfX+1,WORLD.halfX-1);
    player.z=clamp(player.z+gz,-WORLD.halfZ+1,WORLD.halfZ-1);
    const climb=(down('jump')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')?1:0);
    player.y=clamp(player.y+climb*drift*dt,0,80);
    player.vx=dt?gx/dt:0;player.vz=dt?gz/dt:0;player.vy=0;
    player.mesh.position.set(player.x,player.y,player.z);
    if(mag){player.h=Math.atan2(gx,gz);player.mesh.rotation.y=player.h;}
    if(player.mesh.userData.characterMixer){playCharacter(player.mesh,'Idle');player.mesh.userData.characterMixer.update(dt);}
  }else{
  const speed=down('sprint')?12:8;
  const dx=mag?(-Math.sin(camYaw)*f+Math.cos(camYaw)*r)/mag*speed*dt:0,dz=mag?(-Math.cos(camYaw)*f-Math.sin(camYaw)*r)/mag*speed*dt:0;
  consumeQueuedJump(now);const fallingVy=player.vy;
  moveWithCollision(player,dx,dz,1.05);player.vy=Math.max(-30,player.vy-32*dt);player.y=Math.max(0,player.y+player.vy*dt);player.grounded=player.y<=.001&&player.vy<=0;if(player.grounded){player.y=0;player.vy=0;player.lastGroundedAt=performance.now();}player.vx=dt?dx/dt:0;player.vz=dt?dz/dt:0;
  trackLanding(fallingVy);trackFootsteps(dt,player.grounded);player.mesh.position.set(player.x,player.y,player.z);if(mag){player.h=Math.atan2(dx,dz);player.mesh.rotation.y=player.h;}if(player.mesh.userData.characterMixer){playCharacter(player.mesh,!player.grounded?'Jump':mag?'Run':'Idle');player.mesh.userData.characterMixer.update(dt);}
  }
  // Every client simulates its room's NPCs from the same seeded starting state.
  // The host may still publish snapshots as a soft correction, but movement no
  // longer freezes if Vercel rotates the socket that originally owned the room.
  deduction.crewClock=(deduction.crewClock||0)-dt;
  if(deduction.networked&&crewAuthority()&&deduction.crewClock<=0){
    deduction.crewClock=CREW_SEND_INTERVAL;
    multiplayer.sendCrew?.(deduction.bots.map((bot,index)=>[
      index,
      // Two decimals is well under a pixel at this scale and keeps frames small.
      Math.round(bot.x*100)/100,Math.round(bot.z*100)/100,
      Math.round(bot.h*100)/100,
      bot.alive?1:0,
      bot.target?1:0
    ]));
  }
  for(const bot of deduction.bots.filter(b=>b.alive)){
    if(now>bot.moveAt||now>bot.decisionAt&&!bot.target)decideBotAction(bot,now);
    const target=bot.target;if(!target)continue;let waypoint=bot.route?.[0]||target,bx=waypoint.x-bot.x,bz=waypoint.z-bot.z,len=Math.hypot(bx,bz);
    if(len<1.05&&bot.route?.length){bot.route.shift();waypoint=bot.route[0]||target;bx=waypoint.x-bot.x;bz=waypoint.z-bot.z;len=Math.hypot(bx,bz);}
    if(len>.95){const pace=bot.speed*(target.kind==='report'?1.22:(target.kind === 'stalk' ? 0.92 : 1)),beforeX=bot.x,beforeZ=bot.z;moveWithCollision(bot,bx/len*dt*pace,bz/len*dt*pace,.7);const progress=Math.hypot(bot.x-beforeX,bot.z-beforeZ);bot.arrivedAt=0;bot.stuckFor=progress<pace*dt*.18?bot.stuckFor+dt:Math.max(0,bot.stuckFor-dt*2);if(bot.stuckFor>1.15){const recovery=closestPedestrianNode(bot,12);if(collides(bot.x,bot.z,.7)&&recovery&&!collides(recovery.x,recovery.z,.8)){bot.x=recovery.x;bot.z=recovery.z;}bot.target=null;bot.route=[];bot.decisionAt=0;bot.stuckFor=0;}bot.mesh.position.set(bot.x,0,bot.z);bot.mesh.rotation.y=Math.atan2(bx,bz);playCharacter(bot.mesh,pace>4.6?'Run':'Walk');bot.taskSince=0;}
    else{
      playCharacter(bot.mesh,'Idle');
      bot.arrivedAt=bot.arrivedAt||now;
      if(target.kind==='report'&&deduction.bodies.includes(target.ref)){requestMeeting(target.ref);return;}
      if(target.kind==='emergency'&&!bot.isImpostor&&bot.emergencyLeft>0){bot.emergencyLeft--;requestMeeting(null);return;}
      if(target.kind==='stalk'&&bot.isImpostor&&now>bot.killReadyAt){const victim=target.ref,witnesses=deduction.bots.filter(other=>other.alive&&other!==bot&&other!==victim&&dist(other,bot)<9).length;if(witnesses===0||Math.random()<.12)botKill(bot,victim,now);}
      if(target.kind==='repair'&&!bot.isImpostor&&deduction.sabotage){const station=deduction.sabotage.stations.find(index=>!deduction.sabotage.repaired.has(index)&&dist(deduction.tasks[index],bot)<5);if(station!==undefined)repairSabotage(bot,station);bot.target=null;}
      if(target.kind==='task'&&!bot.isImpostor){bot.taskSince=bot.taskSince||now;if(now-bot.taskSince>2800+bot.patience*.35){const task=deduction.tasks.find(item=>!bot.completedTasks.has(item.index)&&dist(item,bot)<5);if(task)completeTask(task,bot);bot.target=null;bot.taskSince=0;}}
      // moveAt is how long the journey may take, not how long to loiter once
      // it is over. Reusing it as a dwell timer left bots standing for up to a
      // minute after arriving, which is the hanging that remained.
      const dwell=target.kind==='task'||target.kind==='fake-task'?4500:1500;
      if(now>bot.arrivedAt+dwell||now>bot.moveAt){bot.target=null;bot.arrivedAt=0;}
    }
    bot.mesh.userData.characterMixer?.update(dt);
  }
  // A finished site stops advertising itself.
  for(const task of deduction.tasks){
    if(task.beam)task.beam.visible=!task.completedBy.has('player');
  }
  if(!deduction.sabotage&&deduction.bots.some(bot=>bot.alive&&bot.isImpostor)&&now>deduction.nextSabotage){
    // In a room the host raises it once for everyone; solo rounds stay local.
    // It also no longer depends on being a crewmate, which used to leave the
    // impostor's own screen untouched.
    if(deduction.networked){
      if(crewAuthority()){
        // Name the NPC impostor we are acting for; the server verifies that
        // seat is genuinely a living impostor before it relays anything.
        const seatIndex=deduction.bots.findIndex(bot=>bot.alive&&bot.isImpostor);
        if(seatIndex>=0){
          const first=Math.floor(deduction.rng()*deduction.tasks.length);
          multiplayer.roundAction?.('sabotage',{kind:'LIGHTS',stations:[first],
            asSeat:`npc-${seatIndex}`}).catch(()=>{});
        }
      }
    }else startSabotage();
    deduction.nextSabotage=now+35000+Math.random()*25000;
  }
  if(deduction.sabotage&&deduction.sabotage.lethal&&now>deduction.sabotageEnds)endDeduction(`${deduction.sabotage.type} FAILURE · IMPOSTORS WIN`);
}
// Accounts: the token is read during the multiplayer join, which happens
// before the account UI below is set up, so the storage helpers live up here.
const ACCOUNT_TOKEN_KEY='districtZeroAccount';
let account=null;
const multiplayer=createMultiplayer({
  scene,avatar:look=>avatar(mats.shirt,false,look),applyAppearance,attachCharacter:(mesh,name)=>attachCharacterModel(mesh,name),attachWeapon:attachCharacterGun,attachKnife:attachCharacterKnife,animateCharacter:animateRemoteCharacter,carMesh,canvas,
  isPlaying:()=>playing&&!paused,
  // Read at join time, so signing in and then playing credits the right
  // account without reconnecting.
  getAccountToken:()=>accountToken(),
  getAppearance:()=>appearance,
  // A match locks the lobby selection. State packets must never make a cadet
  // flicker between a stale menu choice and the model chosen for this round.
  getCharacter:()=>ffa.lockedCharacter||characterChoice,
  getPlayerPosition:()=>!player?null:player.inAircraft?
    {x:player.inAircraft.x,z:player.inAircraft.z,y:player.inAircraft.y,h:player.inAircraft.h,inCar:false,flight:player.inAircraft.kind}:
    player.inCar?{x:player.inCar.x,z:player.inCar.z,y:0,h:player.inCar.h,inCar:true,flight:null}:
    {x:player.x,z:player.z,y:player.y,h:player.h,inCar:false,flight:player.jetpack?'jetpack':null,ghost:deduction.playerGhost===true},
  getPlayerAnimation:()=>{
    if(!player)return null;
    const attacking=performance.now()<player.attackUntil;
    const pace=Math.hypot(player.vx,player.vz);
    return {
      animation:player.inCar||player.inAircraft||player.jetpack&&player.y>.15?'Idle':player.y>.15?'Jump':attacking&&player.weapon==='fists'?'Punch':pace>11?'Run':pace>.8?'Walk':'Idle',
      weapon:player.weapon,aiming:aiming&&!player.inCar&&!player.inAircraft,
      // Where the player is actually looking, so others can read their aim.
      // Quantised so a resting hand does not resend state every frame, and only
      // sent in Free-for-All, where the camera is the player's own eyes.
      pitch:inFfa()?Math.round(clamp(camPitch,-1.35,1.35)*50)/50:0,
      attacking,reloading:Boolean(player.reloadingUntil),attackArm:player.attackArm
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
// Kills elsewhere in the district. Replayed locally without rebroadcasting.
multiplayer.onEffect?.(data=>{
  if(data.effect!=='blood')return;
  bloodBurst(data.x,1.25,data.z,data.dx||0,data.dz||0,data.size||1,false);
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
  characterChoice=PLAYER_CHARACTERS.includes($('character-choice').value)?$('character-choice').value:'Atlas';
  try{localStorage.setItem('districtZeroCharacter',characterChoice);}catch{}
  if(player){player.character=characterChoice;attachCharacterModel(player.mesh,characterChoice);}
  multiplayer.refreshCharacters?.();
  toast(`Character selected · ${characterChoice.replaceAll('_',' ')}`);
});
$('meeting-toggle').onclick=()=>toggleMeetingPanel();
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
  const crosshair=$('crosshair'),glyph={plus:'＋',dot:'●',ring:'○'}[settings.crosshairShape]||'＋';
  crosshair.textContent=glyph;crosshair.style.color=settings.crosshairColor;crosshair.style.fontSize=`${settings.crosshairSize}px`;crosshair.style.opacity=settings.crosshairOpacity;
  $('chat-key-label').textContent=keyLabel(settings.bindings.chat);
  if(masterGain)masterGain.gain.value=settings.volume;
  refreshMusicVolume();
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
for(const [id,key] of [['crosshair-size','crosshairSize'],['crosshair-opacity','crosshairOpacity']]){
  const control=$(id);control.value=settings[key];control.oninput=()=>{settings[key]=Number(control.value);applySettings();saveSettings();};
}
$('crosshair-shape').value=settings.crosshairShape;$('crosshair-shape').onchange=event=>{settings.crosshairShape=event.target.value;applySettings();saveSettings();};
$('crosshair-color').value=settings.crosshairColor;$('crosshair-color').oninput=event=>{settings.crosshairColor=event.target.value;applySettings();saveSettings();};
function openDistrictMap(){if(playing)showOverlay();document.body.classList.add('district-map-open');$('pause-menu').hidden=true;$('district-map-panel').hidden=false;$('settings-panel').hidden=true;$('customize-panel').hidden=true;const map=$('district-map');drawDistrictMap(map.getContext('2d'),map.width,map.height,true);}
$('mapBtn').onclick=openDistrictMap;$('open-map').onclick=openDistrictMap;
$('settingsBtn').onclick=()=>{$('district-map-panel').hidden=true;$('settings-panel').hidden=!$('settings-panel').hidden;$('customize-panel').hidden=true;waitingForBinding=null;renderBindings();};
applySettings();renderBindings();

function clearDynamic(){for(const a of [...cars,...aircraft,...traffic,...peds,...police,...fallenBodies])scene.remove(a.mesh);if(policeHelicopter)scene.remove(policeHelicopter.mesh);policeHelicopter=null;if(player)scene.remove(player.mesh);for(const effect of combatEffects){scene.remove(effect.mesh);effect.mesh.geometry?.dispose();effect.mesh.material.dispose();}combatEffects.length=0;fallenBodies.length=0;cars=[];aircraft=[];traffic=[];peds=[];police=[];}
function newGame(){
  if(!assetsReady){toast('FINISHING GAME DOWNLOAD…');return false;}
  if(!account){openAccount('login');toast('Sign in to enter Cebu');return false;}
  clearBloodPools();
  if(deduction.phase!=='idle'){
    deductionArena.visible=false;deductionArena.clear();deduction.phase='idle';deduction.bots=[];deduction.bodies=[];deduction.tasks=[];deduction.taskOpen=null;deduction.sabotage=null;
    $('deduction-role').hidden=true;$('meeting-panel').hidden=true;$('ship-status').hidden=true;$('task-panel').hidden=true;document.body.classList.remove('lights-out','comms-out','deduction-mode');
  }
  clearDynamic();activityManager.reset();wanted={heat:0,level:0,last:{...SPAWN}};worldTime=worldClockNow();cash=account.money??150;streetRep=account.streetRep??0;engineLevel=account.engineLevel??0;completedJobs=account.completedJobs??0;job=null;objectiveMesh.visible=false;taxiPassenger.visible=false;cheatBuffer='';
  player={...safePoint(SPAWN),h:0,y:0,vy:0,vx:0,vz:0,grounded:true,lastGroundedAt:performance.now(),jumpQueuedUntil:0,health:MAX_HEALTH,ammo:12,reserve:24,inCar:null,inAircraft:null,jetpack:false,character:characterChoice,shotAt:0,weapon:'pistol',weaponSwitchUntil:0,attackUntil:0,attackArm:0,mesh:avatar(mats.shirt,false,appearance)};
  attachCharacterGun(player.mesh);
  player.mesh.userData.jetpack=createJetpackMesh();player.mesh.userData.jetpack.visible=false;player.mesh.add(player.mesh.userData.jetpack);
  attachCharacterModel(player.mesh,characterChoice);
  attachCharacterKnife(player.mesh);
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
  camYaw=.7;camPitch=.55;lastUiHealth=MAX_HEALTH;player.hudUntil=performance.now()+5000;playing=true;paused=false;setupAudio();hideOverlay();multiplayer.start();toast('Find a colored street marker to start an activity.');updateUI();return true;
}
function saveGame(){
  if(!playing)return;
  if(job){toast('Finish the current activity before saving');return;}
  if(player.inCar||player.inAircraft||player.y>1||wanted.heat>0){toast('Land, exit the vehicle, and lose the police before saving');return;}
  const data={version:5,map:MAP_ID,time:Date.now(),player:{x:player.x,z:player.z,health:player.health,ammo:player.ammo,reserve:player.reserve}};
  try{const current=localStorage.getItem('districtZeroSave');if(current)localStorage.setItem('districtZeroBackup',current);localStorage.setItem('districtZeroSave',JSON.stringify(data));refreshSaveButtons();toast('Game saved');}
  catch(e){toast('Save unavailable in this browser');console.error(e);}
}
function loadGame(){
  if(!account){openAccount('login');toast('Sign in to continue');return;}
  try{
    const raw=localStorage.getItem('districtZeroSave');if(!raw){toast('No save found');return;}
    const data=JSON.parse(raw),pos=data.player;
    if(![1,2,3,4,5].includes(data.version)||!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.z))throw Error('Invalid save');
    newGame();const savedPoint=data.map===MAP_ID?safePoint(pos):safePoint(SPAWN);player.x=savedPoint.x;player.z=savedPoint.z;
    const health=Number(pos.health);
    player.health=Number.isFinite(health)?clamp(data.version===1?health*2:health,1,MAX_HEALTH):MAX_HEALTH;
    player.ammo=clamp(Number(pos.ammo)||0,0,12);player.reserve=clamp(Number(pos.reserve)||0,0,60);
    // Economy fields in legacy saves are intentionally ignored. The signed-in
    // account is now the authority for cash, XP, reputation and upgrades.
    player.mesh.position.set(player.x,0,player.z);lastUiHealth=player.health;updateUI();toast('Game loaded');
  }catch(e){toast('Save could not be loaded');console.error(e);}
}
function refreshSaveButtons(){const has=Boolean(account)&&!!localStorage.getItem('districtZeroSave');$('continueBtn').disabled=!has;$('loadBtn').disabled=!has;}
function setGameplayUi(active){document.body.classList.toggle('gameplay-active',Boolean(active));}
function showOverlay(){setGameplayUi(false);document.body.classList.add('menu-open');const matchPause=playing&&(deduction.phase!=='idle'||inFfa());paused=true;aiming=false;multiplayer.closeChat();$('crosshair').hidden=true;document.body.classList.toggle('deduction-pause',matchPause);document.body.classList.toggle('pause-menu-open',playing&&!lobbyVisible());if(document.pointerLockElement===canvas)document.exitPointerLock();$('overlay').hidden=false;$('pause-menu').hidden=!playing||lobbyVisible();$('exit-deduction').hidden=true;$('resumeBtn').hidden=true;$('saveBtn').hidden=true;$('loadBtn').hidden=true;refreshSaveButtons();}
function hideOverlay(){document.body.classList.remove('menu-open','pause-menu-open','district-map-open');paused=false;document.body.classList.remove('deduction-pause');$('pause-menu').hidden=true;$('district-map-panel').hidden=true;$('map-backdrop').hidden=true;$('overlay').hidden=true;setGameplayUi(playing&&!lobbyVisible());}
function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;toastTimer=3.5;}
function near(a,b,r){return dist(a,b)<r;}
function activePosition(){return player.inAircraft||player.inCar||player;}
function setObjective(point){objectiveMesh.visible=!!point;if(point)objectiveMesh.position.set(point.x,0,point.z);}
async function finishJob(){
  if(!job||job.completing)return;
  job.completing=true;
  try{
    const result=await accountRequest('/api/job/complete',{token:accountToken(),jobId:job.serverId});
    applyWorldProgress(result);cue(880);
    toast(`${job.kind.toUpperCase()} COMPLETE · +₱${result.gainedMoney} · +${result.gainedExp} XP`);
    job=null;setObjective(null);taxiPassenger.visible=false;updateUI();
  }catch(error){job.completing=false;toast(error.message);}
}
async function startJob(kind){
  if(!account){openAccount('login');toast('Sign in to work in Cebu');return;}
  if(job){toast('Finish your current activity first');return;}
  if(activitySnapshot.state!==ACTIVITY_STATES.AVAILABLE){toast('Finish Skyline Sprint first');return;}
  if(wanted.level){toast('Lose the police before starting an activity');return;}
  if((kind==='taxi'||kind==='race')&&!player.inCar){toast('Get in a car to start this activity');return;}
  try{
    const ticket=await accountRequest('/api/job/start',{token:accountToken(),kind});
    const time={courier:300,taxi:300,race:300}[kind];
    job={kind,index:0,time,serverId:ticket.jobId};setObjective(jobRoutes[kind][0]);taxiPassenger.visible=kind==='taxi';
    toast(`${kind.toUpperCase()} STARTED · Follow the gold marker`);updateUI();
  }catch(error){toast(error.message);}
}
async function useGarage(){
  if(!player.inCar){toast('Bring a car into the garage to upgrade it');return;}
  if(Math.abs(player.inCar.speed)>1.5){toast('Stop the car before using the garage');return;}
  try{
    const result=await accountRequest('/api/garage/engine',{token:accountToken()});
    applyWorldProgress(result);cue(740);toast(`Engine upgraded to level ${engineLevel} · −₱${result.price}`);
  }catch(error){toast(error.message);}
  updateUI();
}
function updateJob(dt){
  if(!job)return;
  job.time-=dt;
  if(job.time<=0){toast('Activity timed out');job=null;setObjective(null);taxiPassenger.visible=false;return;}
  if(job.checking||job.completing)return;
  const point=jobRoutes[job.kind][job.index];
  if(dist(activePosition(),point)>5.5)return;
  if((job.kind==='race'||job.kind==='taxi')&&!player.inCar)return;
  job.checking=true;
  accountRequest('/api/job/checkpoint',{token:accountToken(),jobId:job.serverId,index:job.index})
    .then(result=>{
      if(!job)return;
      job.index=result.nextCheckpoint;
      if(result.complete){finishJob();return;}
      setObjective(jobRoutes[job.kind][job.index]);
      if(job.kind==='taxi'&&job.index===1){taxiPassenger.visible=false;toast('Passenger aboard · Reach the destination');}
      else toast(`Checkpoint ${job.index}/${jobRoutes[job.kind].length}`);
    })
    .catch(error=>toast(error.message))
    .finally(()=>{if(job)job.checking=false;});
}
function interact(){
  if(!playing||paused)return;
  if(deduction.phase!=='idle'||near(player,deductionLobby,5.2)){deductionInteract();return;}
  if(player.inAircraft){exitAircraft();return;}
  if(player.jetpack){removeJetpack();return;}
  const nearbyActivity=activityManager.nearby();
  if(nearbyActivity){activityManager.join(nearbyActivity.id).catch(error=>toast(error.message));return;}
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
  if([ACTIVITY_STATES.COUNTDOWN,ACTIVITY_STATES.ACTIVE].includes(activitySnapshot.state))activityManager.cancel('Skyline Sprint must be completed on foot');
  if(player.inAircraft){if(player.inAircraft.y>2){toast('Land before changing flight gear');return;}exitAircraft(true);if(player.inAircraft)return;}
  if(player.inCar)exitCar(true);
  player.jetpack=true;player.mesh.userData.jetpack.visible=true;player.vy=0;player.y=Math.max(player.y,1.2);player.mesh.position.y=player.y;
  cue(900);toast('ROCKETMAN · Space up · Ctrl down · E to remove');updateUI();
}
function spawnAircraft(kind){
  if([ACTIVITY_STATES.COUNTDOWN,ACTIVITY_STATES.ACTIVE].includes(activitySnapshot.state))activityManager.cancel('Skyline Sprint must be completed on foot');
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
function applyCheat(code){if(deduction.phase!=='idle')return;if(code==='rocketman')equipJetpack();else if(code==='jumpjet')spawnAircraft('jet');else if(code==='ohdude')spawnAircraft('helicopter');}
function enterCar(car){
  if(car.occupied||Math.abs(car.speed)>1||dist(player,car)>5.2||player.y>0)return;
  if([ACTIVITY_STATES.COUNTDOWN,ACTIVITY_STATES.ACTIVE].includes(activitySnapshot.state))activityManager.cancel('Skyline Sprint must be completed on foot');
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
function setWeapon(kind){if(!playing||paused||player.inCar||player.inAircraft||kind===player.weapon)return;player.weapon=kind;player.weaponSwitchUntil=performance.now()+420;player.reloadingUntil=0;player.hudUntil=performance.now()+3500;player.mesh.userData.gun.visible=kind==='pistol';aiming=false;$('crosshair').hidden=true;weaponSwitchSound();updateUI();}
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
    bloodBurst(entity.x,1.25,entity.z,entity.knockX,entity.knockZ,1,true);
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
  if(target){hitCharacter(target,1);punchSound(true);}else punchSound(false);
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
function attack(){if(inFfa()){shootFfa();return;}if(deduction.phase!=='idle'){killDeductionTarget();return;}if(player.inAircraft)return;if(player.weapon==='fists')punch();else shoot();}
function reload(){if(inFfa()){reloadFfa();return;}if(player.inCar||player.inAircraft||player.weapon!=='pistol'||player.ammo>=12||player.reserve<=0||player.reloadingUntil)return;player.reloadingUntil=performance.now()+1050;player.hudUntil=player.reloadingUntil+2000;updateUI();}

function moveWithCollision(entity,dx,dz,r){if(!collides(entity.x+dx,entity.z,r))entity.x+=dx;if(!collides(entity.x,entity.z+dz,r))entity.z+=dz;}
function queueJump(){if(player)player.jumpQueuedUntil=performance.now()+JUMP_BUFFER_MS;}
function consumeQueuedJump(now=performance.now()){
  if(player.grounded)player.lastGroundedAt=now;
  if(player.jumpQueuedUntil>=now&&(player.grounded||now-(player.lastGroundedAt||0)<=COYOTE_MS)){
    player.vy=11;player.grounded=false;player.jumpQueuedUntil=0;jumpSound();return true;
  }
  if(player.jumpQueuedUntil&&player.jumpQueuedUntil<now)player.jumpQueuedUntil=0;
  return false;
}
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
    const movementNow=performance.now();
    consumeQueuedJump(movementNow);
    const f=(down('forward')?1:0)-(down('back')?1:0),r=(down('right')?1:0)-(down('left')?1:0),mag=Math.hypot(f,r);
    const speed=inFfa()?(down('sprint')?20:13):(down('sprint')?16:10);
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
    // Free-for-All is a shooter: the body faces where the camera is aiming, not
    // where the feet are going. Taking the heading from the movement vector made
    // a player walking backwards broadcast a facing 180 degrees from their aim,
    // so enemies appeared to run backwards; strafing showed them side-on.
    if(aiming||inFfa()){player.h=camYaw+Math.PI;player.mesh.rotation.y=player.h;}
    if(player.jetpack){
      const climb=(down('jump')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')?1:0);
      player.vy+=(climb*(down('sprint')?17:11)-player.vy)*(1-Math.exp(-dt*7));
      const ny=clamp(player.y+player.vy*dt,0,110);if(!airspaceBlocked(player.x,player.z,ny,1.05))player.y=ny;
      player.mesh.userData.jetpack.userData.flames.forEach((flame,i)=>{flame.scale.y=.65+Math.abs(player.vy)*.04+Math.sin(t*24+i)*.08;flame.visible=player.y>.3||climb>0;});
    }else{
      const fallingVy=player.vy;
      player.vy=Math.max(-30,player.vy-32*dt);player.y=Math.max(0,player.y+player.vy*dt);
      player.grounded=player.y<=.001&&player.vy<=0;
      if(player.grounded){player.y=0;player.vy=0;player.lastGroundedAt=movementNow;if(collides(player.x,player.z,1.05)){const landing=safePoint(player,1.05);player.x=landing.x;player.z=landing.z;}}
      trackLanding(fallingVy);
      trackFootsteps(dt,!player.jetpack&&player.y===0);
    }
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
    const state=player.inCar||player.inAircraft||player.jetpack&&player.y>.15?'Idle':!player.grounded?'Jump':performance.now()<player.attackUntil&&player.weapon==='fists'?'Punch':pace>11?'Run':pace>.8?'Walk':'Idle';
    playCharacter(player.mesh,state);player.mesh.userData.characterMixer.update(dt);
    const characterState={weapon:player.weapon,pitch:camPitch,aiming,reloading:Boolean(player.reloadingUntil),attacking:performance.now()<player.attackUntil,switchingUntil:player.weaponSwitchUntil};
    poseCharacterFirearm(player.mesh,characterState);poseCharacterKnife(player.mesh,characterState);
  }
  if(player.health<=0){
    toast('You were injured. Returning to the district start.');player.health=MAX_HEALTH;
    activityManager.cancel('Skyline Sprint failed · you were injured');
    job=null;setObjective(null);taxiPassenger.visible=false;
    if(player.inCar)exitCar(true);
    if(player.inAircraft){player.inAircraft.occupied=false;player.inAircraft=null;player.mesh.visible=true;}
    player.jetpack=false;player.mesh.userData.jetpack.visible=false;
    player.x=SPAWN.x;player.z=SPAWN.z;player.y=0;player.vy=0;player.vx=0;player.vz=0;player.grounded=true;player.lastGroundedAt=performance.now();player.jumpQueuedUntil=0;player.mesh.position.set(player.x,0,player.z);
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
function updatePeds(dt,t){
  const watcher=activePosition();
  for(const p of peds){
  if(!p.alive)continue;
  // Cheap distance gate before any per-pedestrian work.
  p.nearby=dist(p,watcher)<70;
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
  // Skinned animation is the costliest per-pedestrian work; skip it for anyone
  // too far away to read, and for anyone the camera cannot see at all.
  if(p.nearby&&p.mesh.visible&&p.mesh.userData.characterMixer){playCharacter(p.mesh,hurt&& !p.mesh.userData.womanVisual?'HitReact':p.wait>0?'Idle':target?p.panic>0?'Run':'Walk':'Idle');p.mesh.userData.characterMixer.update(dt);}
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
  if(inFfa()){
    cameraEye.set(player.x,player.y+2.65,player.z);cameraForward.set(-Math.sin(camYaw)*Math.cos(camPitch),-Math.sin(camPitch),-Math.cos(camYaw)*Math.cos(camPitch));
    camera.position.copy(cameraEye);cameraLookTarget.copy(cameraEye).add(cameraForward);camera.lookAt(cameraLookTarget);
    const fov=ffa.scoped?(FFA_SCOPES[player.weapon]?.fov??30):75;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}
    const speed=Math.hypot(player.vx||0,player.vz||0),moving=Math.min(1,speed/10),bob=Math.sin(performance.now()*.012)*.012*moving,sway=Math.sin(performance.now()*.006)*.008;
    ffa.recoil=Math.max(0,ffa.recoil-dt*8);ffaViewmodel.visible=!ffa.deadUntil&&['countdown','playing','sudden-death'].includes(ffa.phase);
    // Read the authoritative reload deadline and turn it into a visible motion:
    // lower the weapon, roll it toward the player, hold while the magazine is
    // changed, then snap it cleanly back on target exactly when it can fire.
    const reloadSpec=FFA_WEAPONS[player.weapon],reloadMs=reloadSpec?.reload||1000;
    const reloadRemaining=player.reloadingUntil?Math.max(0,player.reloadingUntil-serverNow()):0;
    const reloadProgress=reloadRemaining?clamp(1-reloadRemaining/reloadMs,0,1):1;
    let reloadDrop=0,reloadRoll=0,reloadPitch=0,reloadSide=0;
    if(reloadRemaining){
      const lower=clamp(reloadProgress/.18,0,1),raise=clamp((reloadProgress-.72)/.28,0,1),hold=lower*(1-raise);
      reloadDrop=.42*hold;reloadRoll=-.72*hold;reloadPitch=.34*hold;reloadSide=.18*hold;
      // A small magazine-seat bump in the middle makes the pause read as an
      // action rather than a frozen lowered gun.
      if(reloadProgress>.38&&reloadProgress<.62)reloadDrop+=Math.sin((reloadProgress-.38)/.24*Math.PI)*.08;
    }
    // Drop the old weapon out of frame, swap at the midpoint, then bring the
    // selected blade/firearm back into the hands. This makes Q/number changes
    // readable in first person instead of popping models instantly.
    const switchRemaining=Math.max(0,(player.weaponSwitchUntil||0)-performance.now());
    const switchProgress=switchRemaining?1-switchRemaining/420:1;
    const switchDrop=switchRemaining?Math.sin(switchProgress*Math.PI)*.72:0;
    const switchRoll=switchRemaining?Math.sin(switchProgress*Math.PI)*.42:0;
    const targetX=(aiming?.10:.62)+sway*(aiming?.3:1)+reloadSide,targetY=(aiming?-.54:-.52)+bob-ffa.recoil*.045-reloadDrop-switchDrop,targetZ=-1.12+ffa.recoil*.24+.08*reloadDrop,blend=1-Math.exp(-dt*18);
    ffaViewmodel.position.x+=(targetX-ffaViewmodel.position.x)*blend;ffaViewmodel.position.y+=(targetY-ffaViewmodel.position.y)*blend;ffaViewmodel.position.z+=(targetZ-ffaViewmodel.position.z)*blend;
    ffaViewmodel.rotation.x+=((-.05+reloadPitch)-ffaViewmodel.rotation.x)*blend;ffaViewmodel.rotation.y+=((-.13+reloadRoll*.18)-ffaViewmodel.rotation.y)*blend;ffaViewmodel.rotation.z+=(((aiming?.15:1)*sway+reloadRoll+switchRoll)-ffaViewmodel.rotation.z)*blend;
    const viewWeapon=ffaViewmodel.userData.weapon,weaponHome=viewWeapon.userData.home||new THREE.Vector3(.02,.02,-.05);
    viewWeapon.position.copy(weaponHome);viewWeapon.position.z+=ffa.recoil*.38;viewWeapon.position.y-=ffa.recoil*.06;
    viewWeapon.rotation.x=ffa.recoil*.14;viewWeapon.rotation.z=-ffa.recoil*.05;
    const magazine=viewWeapon.userData.magazine,replacement=viewWeapon.userData.replacementMagazine,leftHand=ffaViewmodel.userData.leftHand,rightHand=ffaViewmodel.userData.rightHand,leftArm=ffaViewmodel.userData.leftArm,rightArm=ffaViewmodel.userData.rightArm;
    const handKick=ffa.recoil*.16;
    leftHand.position.set(-.11+sway*.8,-.04+bob*.7,-.16+handKick*.55);rightHand.position.set(.11+sway*.55,-.04+bob*.55,-.16+handKick);
    leftArm.position.set(-.13+sway*.45,-.10+bob*.35,.10+handKick*.35);rightArm.position.set(.14+sway*.35,-.10+bob*.3,.10+handKick*.8);
    leftArm.rotation.x=-.12-ffa.recoil*.08;leftArm.rotation.z=sway*1.8;rightArm.rotation.x=-.12-ffa.recoil*.18;rightArm.rotation.z=-sway*1.4;
    if(magazine){
      const home=magazine.userData.home;
      magazine.visible=!reloadRemaining||reloadProgress<.43;
      const travel=reloadRemaining?clamp((reloadProgress-.14)/.29,0,1):0;
      magazine.position.copy(home);magazine.position.y-=travel*.46;magazine.position.x-=travel*.1;
      magazine.rotation.z=travel*.28;
      if(replacement){
        const inserting=reloadRemaining&&reloadProgress>=.48&&reloadProgress<.84;
        replacement.visible=inserting;
        const insert=clamp((reloadProgress-.48)/.36,0,1);
        replacement.position.copy(home).add(new THREE.Vector3(-.34*(1-insert),-.48*(1-insert),.08));
        replacement.rotation.z=-.32*(1-insert);
      }
      const reach=reloadRemaining?Math.sin(clamp((reloadProgress-.1)/.78,0,1)*Math.PI):0;
      leftHand.position.set(-.11+reach*.17+sway*.8,-.04-reach*.24+bob*.7,-.16-reach*.08);
      leftArm.rotation.x=-.12-reach*.42;leftArm.rotation.z=reach*.28;
    }
    const muzzle=ffaViewmodel.userData.weapon.userData.muzzle;if(muzzle){muzzle.visible=performance.now()<ffa.muzzleUntil;if(muzzle.visible)muzzle.rotation.z=Math.random()*Math.PI*2;}
    // The optic has its own reticle; this ran every frame and put the normal
    // crosshair back on top of it.
    $('crosshair').hidden=ffa.scoped;return;
  }
  const a=activePosition(),distance=aiming&&!player.inAircraft?7.5:player.inAircraft?31:player.inCar?23:17,targetHeight=(a.y||0)+(player.inAircraft?2.6:player.inCar?2.2:2.4);
  const focus=cameraFocus.set(a.x,targetHeight,a.z);
  const cameraPitch=aiming?Math.atan(Math.tan(camPitch)*.45):camPitch;
  const horizontal=distance*Math.cos(cameraPitch);
  const right=cameraRight.set(-Math.cos(camYaw),0,Math.sin(camYaw));
  const shoulder=aiming&&!player.inCar?1.15:0;
  const desired=cameraDesired.set(a.x+Math.sin(camYaw)*horizontal,targetHeight+distance*Math.sin(cameraPitch),a.z+Math.cos(camYaw)*horizontal).addScaledVector(right,shoulder);
  const candidate=cameraCandidate.copy(camera.position).lerp(desired,1-Math.exp(-dt*8));
  const offset=cameraOffset.copy(candidate).sub(focus),length=offset.length();
  cameraRaycaster.set(focus,offset.normalize());cameraRaycaster.far=length;
  const hit=cameraRaycaster.intersectObjects(solidMeshes,false)[0];
  if(hit&&hit.distance<length)candidate.copy(focus).addScaledVector(offset,Math.max(.8,hit.distance-.5));
  camera.position.copy(candidate);
  const lookTarget=cameraLookTarget.copy(focus);
  if(aiming&&!player.inCar)lookTarget.x-=Math.sin(camYaw)*4,lookTarget.z-=Math.cos(camYaw)*4;
  camera.lookAt(lookTarget);
}
function updateUI(){if(!player)return;
  const now=performance.now();
  if(inFfa())updateFfaPing();
  if(player.health<lastUiHealth-.1&&now-lastDamageFlash>450){const flash=$('damage-flash');flash.classList.remove('show');void flash.offsetWidth;flash.classList.add('show');lastDamageFlash=now;}
  lastUiHealth=player.health;
  $('health-value').textContent=Math.ceil(player.health);$('health-bar').style.width=`${player.health/(inFfa()?100:MAX_HEALTH)*100}%`;$('wanted-stars').textContent='★'.repeat(wanted.level)+'☆'.repeat(2-wanted.level);
  $('wanted-row').hidden=wanted.level===0;$('rep-row').hidden=false;$('upgrade-row').hidden=!player.inCar;
  $('speed-row').hidden=!player.inCar&&!player.inAircraft;$('speed-value').textContent=player.inAircraft?Math.round(Math.abs(player.inAircraft.speed)*3.6):player.inCar?Math.round(Math.abs(player.inCar.speed)*3.6):0;
  $('weapon-row').hidden=true;$('ammo-row').hidden=true;
  const combatVisible=inFfa()||(!player.inCar&&!player.inAircraft&&(aiming||now<(player.hudUntil||0)||now-player.shotAt<3000||!!player.reloadingUntil));
  $('combat-hud').hidden=!combatVisible;$('combat-hud').classList.toggle('unarmed',player.weapon!=='pistol');
  $('combat-weapon').textContent=String(player.weapon==='rifle'?'ASSAULT RIFLE':player.weapon).replaceAll('_',' ').toUpperCase();
  $('combat-ammo').textContent=`${player.ammo} / ${player.reserve}`;
  $('ammo-fill').style.width=`${player.ammo/(FFA_WEAPONS[player.weapon]?.magazine||12)*100}%`;
  $('reload-prompt').hidden=(!inFfa()&&player.weapon!=='pistol')||(player.ammo>3&&!player.reloadingUntil)||player.reserve<=0;
  $('reload-prompt').textContent=player.reloadingUntil?'RELOADING…':`${keyLabel(settings.bindings.reload)} · RELOAD`;
  $('ammo-value').textContent=`${player.ammo} / ${player.reserve}`;
  $('cash-value').textContent=`₱${cash.toLocaleString()}`;$('rep-value').textContent=streetRep;$('upgrade-value').textContent=`LV ${engineLevel}`;
  if($('menu-money'))$('menu-money').textContent=cash.toLocaleString();
  const activityText={courier:'Deliver the parcel',taxi:job?.index===0?'Pick up the passenger':'Take the passenger to the destination',race:'Clear every circuit checkpoint'};
  const inDeduction=deduction.phase!=='idle';
  if(inFfa()&&ffa.snapshot){const deadline=ffa.phase==='sudden-death'?ffa.snapshot.suddenDeathEndsAt:ffa.snapshot.endsAt,seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));$('ffa-timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;$('ffa-phase').textContent=ffa.phase==='countdown'?`STARTING ${Math.max(1,Math.ceil((ffa.snapshot.startsAt-Date.now())/1000))}`:ffa.phase==='sudden-death'?'SUDDEN DEATH':ffa.deadUntil?'KILLCAM':'FREE-FOR-ALL';}
  if(inFfa()){
    const health=Math.max(0,Math.round(player.health));
    $('ffa-health').textContent=health;
    $('ffa-health-fill').style.width=`${clamp(health,0,100)}%`;
    $('ffa-vitals').classList.toggle('hurt',health<=40);
    $('ffa-weapon-name').textContent=GUN_NAMES[player.weapon]||String(player.weapon||'').toUpperCase();
    $('ffa-mag').textContent=player.reloadingUntil?'--':player.ammo;
    $('ffa-reserve').textContent=`/ ${player.reserve}`;
    $('ffa-ammo').querySelector('.ammo-count').classList.toggle('empty',!player.reloadingUntil&&player.ammo<=0);
    $('ffa-ammo-hint').textContent=player.reloadingUntil?'RELOADING…':'R RELOAD · 1-4 SWITCH';
  }
  if(inFfa()&&Date.now()-ffa.lastTick>2500){ffa.lastTick=Date.now();multiplayer.ffaAction?.('tick').catch(()=>{});}
  if(inDeduction){
    $('ship-room').textContent=nearestRoad(player)?.name||'CEBU IT PARK';$('task-meter-label').textContent=`CREW TASKS ${deduction.taskDone} / ${deduction.taskRequired}`;$('task-meter-fill').style.width=`${deduction.taskRequired?deduction.taskDone/deduction.taskRequired*100:0}%`;
    const taskList=$('ship-task-list');taskList.replaceChildren(...deduction.tasks.filter(task=>deduction.myTasks?.has(task.index)).map(task=>{const done=task.completedBy.has('player'),li=document.createElement('li');li.textContent=`${done?'✓':'○'} ${task.room} · ${task.title}`;li.className=done?'done':'';return li;}));
    const remaining=deduction.sabotage?Math.max(0,Math.ceil((deduction.sabotageEnds-performance.now())/1000)):0;$('ship-status').classList.toggle('sabotage',!!deduction.sabotage);$('sabotage-status').textContent=deduction.sabotage?`${deduction.sabotage.type} SABOTAGE · ${remaining}s · REPAIR ${deduction.sabotage.repaired.size}/${deduction.sabotage.required}`:'';
  }
  const worldActivity=activitySnapshot.activity&&activitySnapshot.state!==ACTIVITY_STATES.AVAILABLE;
  $('activity-label').textContent=inFfa()?'FREE-FOR-ALL':inDeduction?'SOCIAL DEDUCTION':worldActivity?'DISTRICT ACTIVITY':job?job.kind.toUpperCase():'CITY LIFE';
  $('activity-title').textContent=inFfa()?'CEBU IT PARK':inDeduction?deduction.mapName:worldActivity?activitySnapshot.activity.name:job?activityText[job.kind]:'Find something happening';
  $('activity-detail').textContent=inFfa()?(ffa.deadUntil?'Respawning after the killcam…':'Eliminate every rival. First place after five minutes wins.'):inDeduction?(deduction.playerGhost?'You are a silent ghost. Observe the remaining players.':deduction.role==='impostor'?'Blend in. Q swaps bare hands and knife. Click near a player to kill.':`Complete your street consoles · crew ${deduction.taskDone}/${deduction.taskRequired}`):worldActivity?(activitySnapshot.state===ACTIVITY_STATES.COUNTDOWN?'Get ready. Reach every checkpoint before time runs out.':activitySnapshot.state===ACTIVITY_STATES.ACTIVE?activitySnapshot.activity.objective:`Available again in ${activitySnapshot.cooldown}s`):job?`Follow the bright destination marker · ${Math.ceil(job.time)}s left`:'Explore the district. Nearby markers offer jobs and timed challenges.';
  $('activity-progress').hidden=!(job||worldActivity||inDeduction||inFfa());
  if(inFfa())$('activity-progress').textContent=`${ffa.snapshot?.you?.score||0} KILLS · ${ffa.snapshot?.you?.deaths||0} DEATHS`;
  if(inDeduction)$('activity-progress').textContent=`CREW TASKS ${deduction.taskDone} / ${deduction.taskRequired}`;
  else if(worldActivity)$('activity-progress').textContent=activitySnapshot.state===ACTIVITY_STATES.COUNTDOWN?`STARTING IN ${activitySnapshot.countdown}`:activitySnapshot.state===ACTIVITY_STATES.ACTIVE?`CHECKPOINT ${activitySnapshot.index+1} / ${activitySnapshot.total} · ${activitySnapshot.remaining}s`:`REPLAY IN ${activitySnapshot.cooldown}s`;
  else if(job)$('activity-progress').textContent=`STOP ${job.index+1} / ${jobRoutes[job.kind].length} · REWARD ₱${{courier:120,taxi:180,race:320}[job.kind]}+`;
  const activityNavigating=activitySnapshot.state===ACTIVITY_STATES.ACTIVE;
  $('nav-cue').hidden=!(job||activityNavigating);$('objective-distance').hidden=!(job||activityNavigating);
  if(job||activityNavigating){
    const target=job?jobRoutes[job.kind][job.index]:activitySnapshot.activity.checkpoints[activitySnapshot.index],route=routePoints(activePosition(),target);
    const distance=Math.round(route.slice(1).reduce((sum,point,index)=>sum+dist(route[index],point),0));
    $('nav-title').textContent=activityNavigating?'SPRINT CHECKPOINT':job.kind==='race'?'NEXT CHECKPOINT':job.kind==='taxi'&&job.index===0?'PICKUP':'DESTINATION';
    const seconds=activityNavigating?activitySnapshot.remaining:Math.ceil(job.time);
    $('nav-distance').textContent=`${distance} m by road`;$('objective-distance').textContent=`◆ ${distance} m by road · ${seconds}s left`;
    const next=route[1]||target,heading=Math.atan2(next.x-activePosition().x,next.z-activePosition().z),viewHeading=camYaw+Math.PI;
    const turn=Math.atan2(Math.sin(heading-viewHeading),Math.cos(heading-viewHeading));
    $('nav-direction').textContent=Math.abs(turn)>2.35?'TURN AROUND':turn>.4?'RIGHT':turn<-.4?'LEFT':'AHEAD';
    $('nav-arrow').style.transform=`rotate(${turn}rad)`;
  }
  $('hint').textContent=inFfa()?'WASD · Shift sprint · Click attack · Right-click or F scope · Q knife · R reload · 1 primary · 2 pistol · Tab armory · Hold C scoreboard':inDeduction?(deduction.playerGhost?'GHOST · WASD move · Observe silently':deduction.role==='impostor'?'WASD · Q hands/knife · Click kill · G vent · X sabotage · E report':'WASD move · E task, repair, meeting, or report'):player.inAircraft?.kind==='jet'?(player.inAircraft.mode==='hover'?'JET HOVER · W rise · S descend · ↑/↓ drift · Num 8 or V flight mode · E exit after landing':'JET FLIGHT · W thrust · S brake · A/D turn · ↑/↓ pitch · Num 2 or V hover mode'):player.inAircraft?'HELICOPTER · W rise · S descend · ↑/↓ move · A/D turn · E exit after landing':player.jetpack?'JETPACK · WASD move · Space rise · Ctrl descend · E remove':player.inCar?`${keyLabel(settings.bindings.forward)}/${keyLabel(settings.bindings.back)} drive · ${keyLabel(settings.bindings.interact)} exit`:`${keyLabel(settings.bindings.forward)}/${keyLabel(settings.bindings.back)} move · ${keyLabel(settings.bindings.fists)} fists · ${keyLabel(settings.bindings.pistol)} pistol · Click attack · Type ROCKETMAN, JUMPJET, or OHDUDE`;
  const car=!player.inCar?cars.find(c=>near(player,c,5.2)):null;let prompt='';
  const hub=hubs.find(h=>near(activePosition(),h,5));
  const nearbyActivity=activityManager.nearby();
  if(player.jetpack)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> REMOVE JETPACK`;
  else if(player.inAircraft&&player.inAircraft.y<2&&Math.abs(player.inAircraft.speed)<4)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> EXIT AIRCRAFT`;
  else if(nearbyActivity)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> JOIN ${nearbyActivity.name} · ${nearbyActivity.reward.xp} XP`;
  else if(hub)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> ${hub.kind==='garage'?'USE GARAGE':`START ${hub.label}`}`;
  else if(aircraft.some(c=>!c.occupied&&c.y<2&&near(player,c,7)))prompt=`<b>${keyLabel(settings.bindings.interact)}</b> ENTER AIRCRAFT`;
  else if(car)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> ENTER CAR`;
  else if(player.inCar&&Math.abs(player.inCar.speed)<1.5)prompt=`<b>${keyLabel(settings.bindings.interact)}</b> EXIT VEHICLE`;
  if(inDeduction&&deduction.phase==='play'){
    const body=deduction.playerAlive&&deduction.bodies.find(b=>dist(b,player)<4.2),task=deduction.playerAlive&&deduction.tasks.find(t=>deduction.myTasks?.has(t.index)&&!t.completedBy.has('player')&&dist(t,player)<TASK_REACH);
    const atEmergency=deduction.playerAlive&&Math.hypot(player.x-deduction.meetingPoint.x,player.z-deduction.meetingPoint.z)<4.5&&deduction.emergencyLeft>0;
    const repair=deduction.playerAlive&&deduction.sabotage&&deduction.sabotage.stations.map(index=>deduction.tasks[index]).find(item=>!deduction.sabotage.repaired.has(item.index)&&dist(item,player)<4),atRepair=!!repair;
    const atHatch=deduction.playerAlive&&deduction.role==='impostor'&&deduction.tasks.some(t=>dist(t,player)<4);
    prompt=body?'<b>E</b> REPORT BODY':atRepair?'<b>E</b> REPAIR SABOTAGE':atEmergency?'<b>E</b> CALL EMERGENCY MEETING':deduction.role==='crewmate'&&task?'<b>E</b> OPEN TASK CONSOLE':atHatch?'<b>G</b> USE STREET HATCH':'';
  }else if(deduction.phase==='idle'&&near(player,deductionLobby,5.2))prompt='<b>E</b> ENTER DEDUCTION ROUND';
  $('prompt').innerHTML=prompt;$('prompt').hidden=!prompt;
  $('deduction-lobby-card').hidden=deduction.phase!=='idle'||!near(player,deductionLobby,5.2);
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
  const toCanvas=(x,z)=>({x:X(x),y:Z(z)});
  context.fillStyle='#617c62';context.fillRect(0,0,w,h);
  for(const park of district.parks){context.fillStyle='#8ca97a';context.beginPath();park.points.forEach((p,i)=>i?context.lineTo(X(p[0]),Z(p[1])):context.moveTo(X(p[0]),Z(p[1])));context.closePath();context.fill();}
  context.lineCap='round';for(const road of driveSegments){context.strokeStyle='#34444b';context.lineWidth=Math.max(labels?1.5:1,road.width*sx);context.beginPath();context.moveTo(X(road.a.x),Z(road.a.z));context.lineTo(X(road.b.x),Z(road.b.z));context.stroke();}
  context.fillStyle='#c2c8bf';for(const building of district.buildings){context.beginPath();building.points.forEach((p,i)=>i?context.lineTo(X(p[0]),Z(p[1])):context.moveTo(X(p[0]),Z(p[1])));context.closePath();context.fill();}
  const activeActivityTarget=activitySnapshot.state===ACTIVITY_STATES.ACTIVE?activitySnapshot.activity.checkpoints[activitySnapshot.index]:null;
  if((job||activeActivityTarget)&&player){const target=job?jobRoutes[job.kind][job.index]:activeActivityTarget,route=routePoints(activePosition(),target);context.strokeStyle=job?'#ffe38b':'#20d9ee';context.lineWidth=labels?4:2;context.beginPath();route.forEach((p,i)=>i?context.lineTo(X(p.x),Z(p.z)):context.moveTo(X(p.x),Z(p.z)));context.stroke();}
  for(const hub of hubs){context.fillStyle='#'+hub.color.toString(16).padStart(6,'0');context.beginPath();context.arc(X(hub.x),Z(hub.z),labels?6:3,0,Math.PI*2);context.fill();}
  context.fillStyle='#20d9ee';context.beginPath();context.arc(X(featuredActivity.position.x),Z(featuredActivity.position.z),labels?7:3.5,0,Math.PI*2);context.fill();
  // Your own task sites. They are scattered across the whole district now, so
  // without them on the map there is nothing to navigate by. Only your
  // assignments are shown; other crews' work is not yours to find.
  if(deduction.phase!=='idle'&&deduction.myTasks?.size){
    for(const task of deduction.tasks){
      if(!deduction.myTasks.has(task.index))continue;
      const done=task.completedBy.has('player');
      let x=X(task.x),y=Z(task.z),r=labels?7:4.5,offscreen=false;
      if(radar){
        // The radar only covers the street around you, so a task hundreds of
        // metres away would simply not be drawn. Pin it to the rim instead, so
        // the marker still says which way to walk.
        const dx=x-w/2,dy=y-h/2,away=Math.hypot(dx,dy),rim=w/2-9;
        if(away>rim){x=w/2+dx/away*rim;y=h/2+dy/away*rim;offscreen=true;r=3.6;}
      }
      context.save();
      if(!done&&!offscreen){
        // A soft halo so a marker still reads against buildings and parks.
        context.globalAlpha=.35;context.fillStyle='#67cfae';
        context.beginPath();context.arc(x,y,r*2,0,Math.PI*2);context.fill();
        context.globalAlpha=1;
      }
      context.fillStyle=done?'#4b6d63':'#67cfae';
      context.strokeStyle=done?'#2b3f3a':'#06231c';
      context.lineWidth=labels?2:1.4;
      context.beginPath();
      // A diamond, so tasks are distinguishable from the round activity hubs.
      context.moveTo(x,y-r);context.lineTo(x+r,y);context.lineTo(x,y+r);context.lineTo(x-r,y);
      context.closePath();context.fill();context.stroke();
      if(done){
        context.strokeStyle='#d8f5ec';context.lineWidth=labels?2:1.5;
        context.beginPath();context.moveTo(x-r*.45,y);context.lineTo(x-r*.1,y+r*.4);context.lineTo(x+r*.5,y-r*.4);context.stroke();
      }
      context.restore();
    }
  }
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
  if(player){
    context.save();context.translate(X(player.x),Z(player.z));
    if(labels){
      context.fillStyle='#00e3fd';context.strokeStyle='#07151d';context.lineWidth=4;
      context.beginPath();context.arc(0,0,9,0,Math.PI*2);context.fill();context.stroke();
      context.fillStyle='#fff';context.beginPath();context.arc(0,0,3,0,Math.PI*2);context.fill();
    }else{
      context.rotate(-(player.inCar?.h??player.h));context.fillStyle='#fff';context.beginPath();context.moveTo(0,5);context.lineTo(-4,-4);context.lineTo(4,-4);context.closePath();context.fill();
    }
    context.restore();
  }
  if(radar){context.fillStyle='#f8dfad';context.font='bold 12px sans-serif';context.textAlign='center';context.fillText('N',w/2,17);context.restore();}
  // Gunfire last so it sits above the streets and markers.
  drawGunfireBlips(context,w,h,toCanvas,radar);
}
// Recent gunfire, newest last. Drawn on both the minimap and the district map
// so you can tell where a fight is without seeing it.
const GUNFIRE_BLIP_MS=3200;
const gunfireBlips=[];
function addGunfireBlip(x,z,weapon,mine){
  if(!Number.isFinite(x)||!Number.isFinite(z))return;
  gunfireBlips.push({x,z,at:performance.now(),mine:Boolean(mine),
    // A shotgun blast carries further than a sidearm, so show it bigger.
    weight:weapon==='sniper'?1.5:weapon==='shotgun'?1.3:weapon==='knife'?.7:1});
  if(gunfireBlips.length>48)gunfireBlips.shift();
}
function drawGunfireBlips(context,width,height,toCanvas,radar){
  const now=performance.now();
  for(let i=gunfireBlips.length-1;i>=0;i--){
    const blip=gunfireBlips[i],age=now-blip.at;
    if(age>GUNFIRE_BLIP_MS){gunfireBlips.splice(i,1);continue;}
    const life=1-age/GUNFIRE_BLIP_MS;
    let point=toCanvas(blip.x,blip.z),edge=false;
    if(!point)continue;
    if(radar){
      // The radar only covers a block or so, and distant gunfire is precisely
      // what you want to know about. Pin anything off the dial to the rim so it
      // still reads as a bearing rather than vanishing.
      const cx=width/2,cy=height/2,limit=width/2-6;
      const dx=point.x-cx,dy=point.y-cy,d=Math.hypot(dx,dy);
      if(d>limit){const k=limit/d;point={x:cx+dx*k,y:cy+dy*k};edge=true;}
    }
    // A ring that expands as it fades: easy to spot out of the corner of an eye.
    const radius=edge?3.5:(3+blip.weight*3)*(1+(1-life)*2.1);
    context.save();
    context.globalAlpha=Math.max(0,life*.9);
    context.strokeStyle=blip.mine?'#7fd4ff':'#ff8a4a';
    context.lineWidth=2;
    context.beginPath();context.arc(point.x,point.y,radius,0,Math.PI*2);context.stroke();
    context.globalAlpha=Math.max(0,life*life);
    context.fillStyle=blip.mine?'#7fd4ff':'#ffb066';
    context.beginPath();context.arc(point.x,point.y,2.1+blip.weight,0,Math.PI*2);context.fill();
    context.restore();
  }
}

function drawMini(){drawDistrictMap(ctx,mini.width,mini.height);if(!$('district-map-panel').hidden){const map=$('district-map');drawDistrictMap(map.getContext('2d'),map.width,map.height,true);}}
// Measure the element the canvas actually fills. window.innerHeight and CSS
// viewport units disagree on a phone -- browser chrome, safe areas, and the
// gap between an orientation change and the new dimensions settling -- and the
// drawing buffer was being built to one while the canvas was painted at the
// other. That is what stretched the picture and left the stage colour showing
// down the sides.
const stage=document.getElementById('app');
function resize(){
  const box=stage?.getBoundingClientRect();
  const w=Math.max(1,Math.round(box?.width||window.innerWidth));
  const h=Math.max(1,Math.round(box?.height||window.innerHeight));
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
// The sky is derived from the clock, never accumulated per client. Two players
// standing side by side must see the same time of day, and an accumulator makes
// that impossible: whoever loaded first is permanently ahead. serverClockOffset
// corrects for skew between machines using the match snapshot's serverTime.
const WORLD_TIME_RATE=1.2;        // world minutes per real second
const WORLD_TIME_START=9*60;      // the cycle is anchored at 09:00
let serverClockOffset=0;
function worldClockNow(){
  return ((WORLD_TIME_START+(Date.now()+serverClockOffset)/1000*WORLD_TIME_RATE)%1440+1440)%1440;
}

// Without an environment map, a glass tower reflects nothing and reads as a
// painted box no matter how good its texture is. This builds a cheap sky/ground
// gradient probe once and hands it to the whole scene, so glazing, metal and
// car paint all pick up the sky. Its strength follows the day/night cycle.
function buildSkyEnvironment(){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=256;
  const c=canvas.getContext('2d'),grad=c.createLinearGradient(0,0,0,256);
  grad.addColorStop(0,'#4d8fd4');     // zenith
  grad.addColorStop(.42,'#bcd8ef');   // upper haze
  grad.addColorStop(.5,'#eef3f5');    // bright horizon -- what facades mostly catch
  grad.addColorStop(.54,'#9aa093');   // ground haze
  grad.addColorStop(1,'#6a7063');     // ground
  c.fillStyle=grad;c.fillRect(0,0,64,256);
  // A bright sun in the probe. Without one the reflection is an even wash and
  // the glass looks flat; this is what produces a hotspot that slides across a
  // facade as you move.
  const sun=c.createRadialGradient(20,74,0,20,74,30);
  sun.addColorStop(0,'#ffffff');sun.addColorStop(.25,'#fff4d8');
  sun.addColorStop(.6,'rgba(255,229,178,.35)');sun.addColorStop(1,'rgba(255,229,178,0)');
  c.fillStyle=sun;c.fillRect(0,40,64,70);
  const texture=new THREE.CanvasTexture(canvas);
  texture.mapping=THREE.EquirectangularReflectionMapping;
  texture.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer);
  const target=pmrem.fromEquirectangular(texture);
  pmrem.dispose();texture.dispose();
  return target.texture;
}
scene.environment=buildSkyEnvironment();

function updateAtmosphere(){
  // Deduction is staged after dark: the round is about what you cannot see, so
  // the district holds a fixed night rather than drifting through the clock.
  const inRound=deduction.phase!=='idle';
  // FFA spends most of its synchronized five-minute cycle in daylight. The
  // final 45 seconds sweep through dusk/night/dawn, instead of a player being
  // stuck in darkness for half a match.
  const ffaPhase=((Date.now()+serverClockOffset)/1000)%300;
  const ffaHour=ffaPhase<255?6+(ffaPhase/255)*12:18+((ffaPhase-255)/45)*12;
  const hour=inRound?23:inFfa()?ffaHour:(worldTime%1440)/60;
  // The impostor cut the power and knows the streets; the crew are the ones
  // left stumbling. Lamps are off in the world for everybody, but only the crew
  // lose their night vision with them.
  const blackout=inRound&&!!deduction.sabotage&&deduction.role!=='impostor';
  const daylight=inRound?(blackout?0:.06):clamp(Math.sin((hour-6)/12*Math.PI),0,1);
  scene.background.copy(nightSky).lerp(daySky,daylight);
  // Office lights come on as the sun goes down.
  // Windows glow gently. In the reference photos the towers are mostly dark
  // and the street is what is bright, so this stays low on purpose.
  setFacadeNight((1-daylight)*.34);
  // Reflections fade with the light, or glass glows at midnight.
  scene.environmentIntensity=.1+daylight*.95;
  // Street lighting is the main source of night character in the references.
  // Deduction owns its own lamp state (the sabotage blackout), so only drive
  // them in free roam and Free-for-All.
  if(deduction.phase==='idle'){
    buildStreetLamps();
    const dark=daylight<.34;
    if(streetLampsLit!==dark){streetLampsLit=dark;setStreetLamps(dark);showStreetLamps(true);}
  }
  scene.fog.color.copy(scene.background);
  // Draw distance, not just a screen vignette: in a blackout the crew genuinely
  // cannot see across the street.
  // You can see across a street but not down one.
  const fogNear=blackout?14:inRound?60:230;
  const fogFar=blackout?62:inRound?520:1000;
  scene.fog.near+=(fogNear-scene.fog.near)*.12;
  scene.fog.far+=(fogFar-scene.fog.far)*.12;
  sun.intensity=inRound?(blackout?.06:.12):.3+daylight*2.1;
  // Dark enough to lose someone in, light enough to still play. The first pass
  // at this left the crew unable to see anything at all.
  ambient.intensity=inRound?(blackout?.3:.5):.55+daylight*1.55;
  renderer.toneMappingExposure=inRound?(blackout?.88:.95):.9+daylight*.38;
  sun.position.set(-240+Math.cos(hour/24*Math.PI*2)*110,380+daylight*140,140+Math.sin(hour/24*Math.PI*2)*140);
  if(engineGain&&audioContext){
    const speed=playing&&!paused&&player?.inCar?Math.abs(player.inCar.speed):0;
    engineGain.gain.setTargetAtTime(playing&&!paused&&player&&player.inCar ? 0.025 : 0,audioContext.currentTime,.12);
    engineTone.frequency.setTargetAtTime(45+speed*4,audioContext.currentTime,.08);
  }
}
window.addEventListener('resize',resize);
// A rotation reports its new size late, and a phone may settle over a couple of
// frames, so re-measure a few times rather than trusting the first number.
const resettle=()=>{resize();for(const delay of [60,180,420,900])setTimeout(resize,delay);};
window.addEventListener('orientationchange',resettle);
document.addEventListener('fullscreenchange',resettle);
window.visualViewport?.addEventListener('resize',resize);
screen.orientation?.addEventListener?.('change',resettle);
resize();
window.addEventListener('keydown',e=>{
  if(inFfa()&&e.code==='Tab'){e.preventDefault();toggleArmory();return;}
  if(inFfa()&&e.code==='KeyC'){e.preventDefault();$('ffa-scoreboard').hidden=false;return;}
  // Keyboard scope, for anyone whose mouse or trackpad cannot hold right while
  // clicking left.
  if(inFfa()&&e.code==='KeyF'){e.preventDefault();setFfaScope(!ffa.scoped);return;}
  if(waitingForBinding){
    e.preventDefault();
    if(e.code==='Escape'){waitingForBinding=null;renderBindings();return;}
    if(e.code==='KeyT'){toast('T is reserved for open mic');return;}
    if(!/^(Key[A-Z]|Digit[0-9]|Enter|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(e.code))return;
    const current=settings.bindings[waitingForBinding],other=Object.keys(settings.bindings).find(action=>action!==waitingForBinding&&settings.bindings[action]===e.code);
    if(other)settings.bindings[other]=current;
    settings.bindings[waitingForBinding]=e.code;waitingForBinding=null;saveSettings();applySettings();renderBindings();return;
  }
  // A lobby is a full-screen navigation state. Letting the generic pause
  // handler consume Escape called hideOverlay(), exposing the Free Roam world
  // underneath while the player was still seated in a lobby. Only the visible
  // lobby buttons may leave or return from this screen.
  if(e.code==='Escape'&&lobbyVisible()){
    e.preventDefault();e.stopPropagation();keys.clear();return;
  }
  if(e.code==='KeyM'&&playing&&!e.repeat&&!multiplayer.isTyping()
     &&!(e.target instanceof HTMLElement&&e.target.closest('input,textarea'))){
    e.preventDefault();
    // Toggle: a second press closes the map again.
    if(!$('overlay').hidden&&!$('district-map-panel').hidden)hideOverlay();
    else openDistrictMap();
    return;
  }
  if(deduction.phase==='idle'&&playing&&!paused&&!multiplayer.isTyping()&&/^Key[A-Z]$/.test(e.code)&&!(e.target instanceof HTMLElement&&e.target.closest('input,select,button'))){
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
  if(inFfa()&&e.code==='Digit1'){switchFfa(ffa.primary);return;}
  if(inFfa()&&e.code==='Digit2'){switchFfa('pistol');return;}
  if(inFfa()&&e.code==='KeyQ'){switchFfa(player.weapon==='knife'?ffa.primary:'knife');return;}
  // G is the drop weapon: it only does anything once a crate has been taken.
  if(inFfa()&&e.code==='KeyG'){
    const held=ffa.snapshot?.you;
    if(player.weapon==='bazooka')switchFfa(ffa.primary);
    else if(held?.hasDrop)switchFfa('bazooka');
    else toast('No bazooka — find the supply drop');
    return;
  }
  if(deduction.phase!=='idle'&&e.code==='KeyE'){e.preventDefault();deductionInteract();return;}
  if(deduction.phase!=='idle'&&e.code==='KeyQ'){setDeductionWeapon(player.weapon==='knife'?'hands':'knife');return;}
  if(deduction.phase==='play'&&e.code==='KeyX'){triggerSabotage();return;}
  if(deduction.phase==='play'&&e.code==='KeyG'){useVent();return;}
  if(player.inAircraft?.kind==='jet'&&['Numpad8','Numpad2','KeyB'].includes(e.code)){
    player.inAircraft.mode=e.code==='Numpad8'?'flight':e.code==='Numpad2'?'hover':player.inAircraft.mode==='hover'?'flight':'hover';
    cue(player.inAircraft.mode==='flight'?850:570);toast(player.inAircraft.mode==='flight'?'JET FLIGHT · W accelerates, ↑/↓ adjusts altitude':'JET HOVER · W climbs, S descends');updateUI();return;
  }
  if(matchKey(e,'jump')&&!player.inCar&&!player.inAircraft&&!player.jetpack)queueJump();
  else if(matchKey(e,'interact'))interact();
  else if(matchKey(e,'fists'))setWeapon('fists');
  else if(matchKey(e,'pistol'))setWeapon('pistol');
  else if(matchKey(e,'switchWeapon'))setWeapon(player.weapon==='pistol'?'fists':'pistol');
  else if(matchKey(e,'reload'))reload();
  else if(e.code==='F5'){e.preventDefault();saveGame();}
  else if(e.code==='F9'){e.preventDefault();loadGame();}
});
let windowDeactivating=false;
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyC')$('ffa-scoreboard').hidden=true;});window.addEventListener('blur',()=>{windowDeactivating=true;keys.clear();aiming=false;$('crosshair').hidden=true;$('ffa-scoreboard').hidden=true;});window.addEventListener('focus',()=>{windowDeactivating=false;});
document.addEventListener('pointermove',e=>{
  if(!playing||paused)return;
  if(meetingActive()){
    // Cursor is free for the vote panel, so looking around is a deliberate
    // drag. Merely passing over the canvas no longer turns the camera.
    if(!lookDragging||!(e.buttons&3))return;
    camYaw-=clamp(e.movementX,-80,80)*.005*settings.sensitivity*(ffa.scoped?.32:1);
    camPitch=clamp(camPitch+clamp(e.movementY,-80,80)*.005*settings.sensitivity*(ffa.scoped?.32:1),.16,1.25);
    lastLookAt=performance.now();
    return;
  }
  if(document.pointerLockElement===canvas||e.target===canvas){
    camYaw-=clamp(e.movementX,-80,80)*.005*settings.sensitivity*(ffa.scoped?.32:1);
    const pitchMin=inFfa()?-1.35:.16,pitchMax=inFfa()?1.35:1.25;
    camPitch=clamp(camPitch+clamp(e.movementY,-80,80)*.005*settings.sensitivity,pitchMin,pitchMax);
    lastLookAt=performance.now();
  }
  if(document.pointerLockElement!==canvas&&e.target===canvas){pointer.x=e.clientX/window.innerWidth;pointer.y=e.clientY/window.innerHeight;}
});
canvas.addEventListener('pointerdown',e=>{
  if(!playing||paused)return;
  // A touch contact reports button 0, so dragging to look was firing the gun
  // on every swipe. Touch fires from its own button and looks from its own
  // handler, so the mouse path stops here.
  if(e.pointerType==='touch')return;
  // A click beside the vote panel starts a look-drag: no attack, and no
  // pointer capture, which would hide the cursor needed for voting.
  if(meetingActive()){lookDragging=true;return;}
  const captured=document.pointerLockElement===canvas;
  if(e.button===2&&!player.inAircraft){
    if(inFfa()){
      // Hold *or* toggle. Holding right while clicking left is awkward on a
      // trackpad and on some mice the second button never reaches the page, so
      // a quick right-click latches the scope and another one drops it. Holding
      // it down still works exactly as before.
      if(ffa.scoped&&!scopeHeld)setFfaScope(false);
      else{setFfaScope(true);scopePressAt=performance.now();}
      scopeHeld=true;
    }
    else{aiming=true;$('crosshair').hidden=false;}
  }
  if(!captured&&!pointerLockUnavailable&&canvas.requestPointerLock){
    try{Promise.resolve(canvas.requestPointerLock()).catch(()=>{pointerLockUnavailable=true;});}
    catch{pointerLockUnavailable=true;}
  }
  if(e.button===0)attack();
});
window.addEventListener('pointerup',e=>{
  if(e.pointerType==='touch')return;
  lookDragging=false;
  if(e.button===2){
    scopeHeld=false;
    // A deliberate hold releases the scope; a quick click leaves it latched.
    if(inFfa()){if(performance.now()-scopePressAt>=SCOPE_TOGGLE_MS)setFfaScope(false);}
    else{aiming=false;$('crosshair').hidden=true;}
  }
});
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===canvas){hadPointerLock=true;return;}
  const wasCaptured=hadPointerLock;hadPointerLock=false;aiming=false;$('crosshair').hidden=true;
  // Releasing the cursor on purpose -- opening the armoury -- is not the player
  // tabbing away, so it must not raise the pause menu over the match.
  if(releasingPointerLock){releasingPointerLock=false;return;}
  if(wasCaptured&&playing&&!paused&&!multiplayer.isTyping()&&!windowDeactivating&&!document.hidden&&document.hasFocus())showOverlay();
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.style.cursor='crosshair';
// --- Free-for-All ---------------------------------------------------------
// Combat results come from the server. The client ray only nominates a target;
// it never changes health, ammunition, score, or death state by itself.
function ffaSpawn(){
  const me=multiplayer.getLocalId?.(),roster=ffa.snapshot?.roster||[],seat=Math.max(0,roster.findIndex(entry=>entry.id===me));
  const officeSpawns=[[-34,-24],[-22,-25],[-10,-15],[-34,13],[-18,24],[34,-24],[22,-25],[10,-15],[34,13],[18,24]].map(([x,z])=>({x:OFFICE_CENTER_X+x,z}));
  const choices=ffa.mapId==='office'?officeSpawns:pedestrianSpots.filter(node=>!collides(node.x,node.z,.9));
  const point=choices.length?choices[(seat*3+ffa.spawnIndex++*5)%choices.length]:SPAWN;
  const safe=ffa.mapId==='office'?point:safePoint(point,1.1);player.x=safe.x;player.z=safe.z;player.y=0;player.vx=player.vz=player.vy=0;player.grounded=true;player.lastGroundedAt=performance.now();player.jumpQueuedUntil=0;player.mesh.position.set(player.x,0,player.z);
  // Tell everyone at once: a respawn is the one move that must not wait for the
  // position-changed check, because standing still afterwards sends nothing.
  multiplayer.keyframe?.();
}
function applyFfaWeapon(){
  const mine=ffa.snapshot?.you;if(!mine)return;
  const hint=$('ffa-ammo-hint');
  if(hint)hint.textContent=mine.hasDrop?'R RELOAD · G BAZOOKA · 1-2 SWITCH':'R RELOAD · 1-4 SWITCH';
  if(player.weapon!==mine.weapon)player.weaponSwitchUntil=performance.now()+420;
  ffa.primary=mine.primary;player.weapon=mine.weapon;player.ammo=mine.magazine;player.reserve=mine.reserve;player.reloadingUntil=mine.reloadingUntil||0;player.hudUntil=performance.now()+1200;
  if(player.mesh.userData.gun)player.mesh.userData.gun.visible=false;
  setFfaViewWeapon(mine.weapon);
  if(ffa.scoped&&!FFA_SCOPES[mine.weapon])setFfaScope(false);
}
function startFfa(setup){
  activityManager.cancel('Activity ended when you joined a match');
  ffa.startsAt=setup.startsAt||0;
  const me=multiplayer.getLocalId?.(),selectedCharacter=setup.roster?.find(member=>member.id===me)?.character;
  ffa.phase='countdown';ffa.snapshot=null;ffa.primary='smg';ffa.returnToLobby=false;ffa.spawnIndex=0;ffa.deadUntil=0;ffa.recoil=0;ffa.muzzleUntil=0;ffa.lockedCharacter=PLAYER_CHARACTERS.includes(selectedCharacter)?selectedCharacter:characterChoice;ffa.firstBloodShown=false;
  characterChoice=ffa.lockedCharacter;player.character=ffa.lockedCharacter;attachCharacterModel(player.mesh,ffa.lockedCharacter);
  setFfaMap(setup.mapId||'it-park');
  if(player.inCar)exitCar(true);if(player.inAircraft)exitAircraft(true);player.jetpack=false;job=null;setObjective(null);setDeductionWorld(true);
  multiplayer.setCommunicationAllowed?.(false);voice.setCommunicationAllowed(false);
  multiplayer.setNameTagsVisible?.(false);
  player.health=100;player.mesh.visible=false;ffaSpawn();camYaw=Math.PI;camPitch=0;setFfaViewWeapon(ffa.primary,true);ffaViewmodel.visible=true;camera.fov=75;camera.updateProjectionMatrix();
  // Decode the combat samples up front so the first shot is not the one waiting
  // on the network. Missing files resolve to null and simply stay synthesised.
  const combatSamples=['weapon-switch','reload','hit','headshot','headshot-victim','headshot-killer','firstblood','double-kill','triple-kill','rampage','kill','death','footstep',
    'melee-knife','melee-knife-2','fire-pistol','fire-smg','fire-rifle','fire-shotgun'];
  primeSamples(combatSamples);for(const name of combatSamples)settleSample(name);
  const rewardLine=$('ffa-reward');if(rewardLine){rewardLine.hidden=true;rewardLine.textContent='';}
  $('ffa-hud').hidden=false;$('crosshair').hidden=false;$('ffa-ping').hidden=false;ffaPingAt=0;updateFfaPing();
  $('ffa-vitals').hidden=false;$('ffa-ammo').hidden=false;
  document.body.classList.add('ffa-mode');hideOverlay();playMusic('match');toast('FREE-FOR-ALL · get ready');
}
function leaveFfa(){
  setArmory(false);hideDeathScreen();clearSupply();ffa.claimSent=null;
  const back=ffa.returnToLobby,roster=ffa.snapshot?.roster||[];
  // Back to the ready room means back to the lobby track; leaving entirely stops it.
  playMusic(back?'lobby':null);ffa.returnToLobby=false;ffa.phase='idle';ffa.startsAt=0;ffa.snapshot=null;ffa.deadUntil=0;ffa.lockedCharacter=null;activeFfaMap='it-park';
  camera.fov=62;camera.updateProjectionMatrix();ffaViewmodel.visible=false;ffaViewmodel.userData.kind=null;player.mesh.visible=true;player.health=MAX_HEALTH;officeArena.visible=false;setDeductionWorld(false);
  multiplayer.setCommunicationAllowed?.(true);voice.setCommunicationAllowed(true);for(const seat of roster)multiplayer.setPeerAlive?.(seat.id,true);multiplayer.setRoomPeers?.(null);
  multiplayer.setNameTagsVisible?.(true);
  setFfaScope(false);
  $('ffa-hud').hidden=true;$('ffa-scoreboard').hidden=true;$('ffa-results').hidden=true;$('crosshair').hidden=true;$('ffa-ping').hidden=true;
  $('ffa-vitals').hidden=true;$('ffa-ammo').hidden=true;$('ffa-scope').hidden=true;
  document.body.classList.remove('ffa-mode');
  if(back){
    showLobby(true);
    if(lobbyRoom)renderRoom(lobbyRoom);
    else multiplayer.refreshRooms?.().catch(()=>{});
  }
}
function renderFfaScoreboard(target='ffa-scoreboard'){
  const list=$(target);if(!list||!ffa.snapshot)return;list.replaceChildren();
  [...ffa.snapshot.roster].sort((a,b)=>b.score-a.score||a.deaths-b.deaths||a.name.localeCompare(b.name)).forEach((seat,index)=>{const row=document.createElement('li');row.innerHTML=`<b>${index+1}. ${seat.name}</b><span>${seat.score} K / ${seat.deaths} D</span>`;if(seat.id===multiplayer.getLocalId?.())row.classList.add('mine');list.append(row);});
}
// A flash at the barrel plus a screen-side bloom, scaled to the weapon. The
// old effect was a single mesh toggled on for a few frames, which barely read.
function muzzleBurst(weapon){
  const size={pistol:.5,smg:.45,rifle:.6,shotgun:.9,sniper:.85}[weapon]||.5;
  const muzzle=ffaViewmodel.userData.weapon?.userData?.muzzle;
  if(muzzle){
    muzzle.scale.setScalar(size*(1.6+Math.random()*.5));
    muzzle.rotation.z=Math.random()*Math.PI;
  }
  // Scoped, the viewmodel is hidden, so the flash goes at the camera instead.
  const origin=new THREE.Vector3();
  if(muzzle&&!ffa.scoped)muzzle.getWorldPosition(origin);
  else camera.getWorldPosition(origin).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.1));
  glowAt(origin,weapon==='arc'?0x8fd9ff:0xffd9a0,size*3.2,120,'muzzleGlow');
  weaponSound(weapon);
}
function shootFfa(){
  if(!['playing','sudden-death'].includes(ffa.phase)||ffa.deadUntil||player.reloadingUntil)return;
  if(player.weapon==='knife'){knifeFfa();return;}
  const mine=ffa.snapshot?.you,spec=FFA_WEAPONS[mine?.weapon];if(!mine||!spec||mine.magazine<=0){toast('Press R to reload');return;}
  const now=performance.now();if(now-player.shotAt<spec.cooldown)return;player.shotAt=now;
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  let best=null;
  for(const seat of ffa.snapshot.roster){
    if(seat.id===multiplayer.getLocalId?.()||!seat.alive)continue;
    const object=multiplayer.getPeerObject?.(seat.id);if(!object)continue;
    const hit=raycaster.intersectObject(object,true)[0];if(hit&&(!best||hit.distance<best.hit.distance))best={seat,object,hit};
  }
  const wall=raycaster.intersectObjects(ffa.mapId==='office'?officeSolidMeshes:solidMeshes,false)[0];
  const target=best&&best.hit.distance<(wall?.distance??Infinity)?best:null;
  const origin=camera.position,direction=raycaster.ray.direction;
  multiplayer.ffaAction?.('shot',{shotId:`${Date.now().toString(36)}-${++ffa.lastShotId}`,weapon:mine.weapon,targetId:target?.seat.id||'',headshot:Boolean(target&&target.hit.point.y-target.object.position.y>2.65),origin:{x:origin.x,y:origin.y,z:origin.z},direction:{x:direction.x,y:direction.y,z:direction.z},clientTime:Date.now()}).catch(error=>toast(error.message));
  const end=target?.hit.point||wall?.point||raycaster.ray.at(Math.min(spec.range||55,70),new THREE.Vector3()),muzzle=ffaViewmodel.userData.weapon.userData.muzzle,start=muzzle?muzzle.getWorldPosition(new THREE.Vector3()):origin.clone(),travel=end.clone().sub(start),travelLength=travel.length();
  // A rocket is a projectile people can see and dodge, so it replaces the
  // instant tracer entirely -- the server still resolves the blast.
  if(spec.rocket){
    launchRocket(start,direction,Math.min(spec.range*2,240));
    muzzleBurst(mine.weapon);
    ffa.recoil=1;ffa.muzzleUntil=performance.now()+90;camPitch=clamp(camPitch-.05,-1.35,1.35);
    const flashEl=$('shot-flash');flashEl.classList.remove('show');void flashEl.offsetWidth;flashEl.classList.add('show');
    gunSound();
    return;
  }
  if(travelLength>.05){const trace=new THREE.Mesh(new THREE.CylinderGeometry(.018,.032,travelLength,5),new THREE.MeshBasicMaterial({color:0xffe39a,transparent:true,opacity:.85,depthWrite:false}));trace.position.copy(start).addScaledVector(travel,.5);trace.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),travel.normalize());addCombatEffect(trace,95,'ffa-trace');}
  const casing=new THREE.Mesh(new THREE.BoxGeometry(.045,.11,.045),new THREE.MeshBasicMaterial({color:0xd8a53e,transparent:true,opacity:1}));casing.position.copy(camera.localToWorld(new THREE.Vector3(.4,-.22,-.65)));casing.userData.velocity=new THREE.Vector3(.8+Math.random()*.5,1.2+Math.random()*.5,.2-Math.random()*.4).applyQuaternion(camera.quaternion);addCombatEffect(casing,650,'casing');
  muzzleBurst(mine.weapon);
  const kick={pistol:.42,smg:.22,rifle:.3,shotgun:.8,sniper:.92}[mine.weapon]||.3;ffa.recoil=Math.min(1,ffa.recoil+kick);ffa.muzzleUntil=performance.now()+55;camPitch=clamp(camPitch-kick*.018,-1.35,1.35);
  const flash=$('shot-flash'),crosshair=$('crosshair');flash.classList.remove('show');void flash.offsetWidth;flash.classList.add('show');
  const kicker=ffa.scoped?$('ffa-scope'):crosshair;
  kicker.classList.remove('fire');void kicker.offsetWidth;kicker.classList.add('fire');
  gunSound();
}
// --- supply drops ---------------------------------------------------------
// The server owns the crate: when it appears, where it lands, and who reached
// it first. This only draws what the snapshot describes, so everyone watches
// the same aircraft fly the same line into the same street.
const dropGroup=new THREE.Group();scene.add(dropGroup);
const supply={id:null,crate:null,chute:null,plane:null,planeModel:null,planeAsked:false,lastState:null};
const serverNow=()=>Date.now()+serverClockOffset;
const DROP_ALTITUDE=125, DROP_RUN=560, DROP_RELEASE=.34;
// How far past the drop the aircraft flies before it is out of the scene.
const PLANE_EXIT=2.2;

function buildCrate(){
  const crate=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.6,1.8),
    new THREE.MeshStandardMaterial({color:0x47563f,roughness:.85}));
  body.castShadow=body.receiveShadow=true;crate.add(body);
  // Banding and a lit panel, so a crate reads as loot from across the street.
  for(const [x,z] of [[.92,0],[-.92,0],[0,.92],[0,-.92]]){
    const band=new THREE.Mesh(new THREE.BoxGeometry(x?.06:1.84,1.64,z?.06:1.84),
      new THREE.MeshStandardMaterial({color:0xe3a93f,roughness:.55,emissive:0x6a4a10,emissiveIntensity:.6}));
    band.position.set(x,0,z);crate.add(band);
  }
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),
    new THREE.MeshBasicMaterial({color:0x8ff0ff}));
  lamp.position.y=1;lamp.name='lamp';crate.add(lamp);
  return crate;
}
function buildChute(){
  const chute=new THREE.Group();
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(3.1,16,10,0,Math.PI*2,0,Math.PI/2),
    new THREE.MeshStandardMaterial({color:0xdfe7ee,roughness:.9,side:THREE.DoubleSide}));
  canopy.position.y=3.4;chute.add(canopy);
  for(const [x,z] of [[2.1,2.1],[-2.1,2.1],[2.1,-2.1],[-2.1,-2.1]]){
    const cord=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,3.4,4),
      new THREE.MeshBasicMaterial({color:0xb9c6cf}));
    cord.position.set(x/2,1.8,z/2);chute.add(cord);
  }
  return chute;
}
// The aircraft is a heavy model for a ten-second flyover, so it is fetched once,
// lazily, and the crate still falls on schedule if it never arrives.
function planeModel(){
  if(supply.planeModel)return supply.planeModel;
  if(supply.planeAsked)return null;
  supply.planeAsked=true;
  // The pack's FBX is FileVersion 6000, which three's loader refuses -- the OBJ
  // beside it is version-free and loads fine. It carries no UVs, so the model
  // gets a flat military finish rather than the pack texture; at flyover
  // distance the silhouette is what reads anyway.
  new OBJLoader().load('/models/air/plane.obj',object=>{
    const bounds=new THREE.Box3().setFromObject(object),size=new THREE.Vector3();
    bounds.getSize(size);
    const longest=Math.max(size.x,size.y,size.z)||1;
    object.scale.setScalar(26/longest);
    const skin=new THREE.MeshStandardMaterial({color:0x6a7360,roughness:.78,metalness:.18});
    object.traverse(child=>{if(child.isMesh){child.material=skin;child.castShadow=false;child.receiveShadow=false;
      if(!child.geometry.attributes.normal)child.geometry.computeVertexNormals();}});
    const wrap=new THREE.Group();wrap.add(object);
    object.updateMatrixWorld(true);
    const fitted=new THREE.Box3().setFromObject(object),centre=new THREE.Vector3();
    fitted.getCenter(centre);object.position.sub(centre);
    supply.planeModel=wrap;
  },undefined,()=>{supply.planeAsked=true;});
  return null;
}
// A stand-in so the drop still reads as an air drop before the model lands.
function buildPlaneStub(){
  const stub=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(1.5,14,4,8),
    new THREE.MeshStandardMaterial({color:0x6d7780,roughness:.7}));
  body.rotation.x=Math.PI/2;stub.add(body);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(22,.5,3.4),
    new THREE.MeshStandardMaterial({color:0x5d666e,roughness:.7}));
  wing.position.y=.4;stub.add(wing);
  const tail=new THREE.Mesh(new THREE.BoxGeometry(7,.4,2),
    new THREE.MeshStandardMaterial({color:0x5d666e,roughness:.7}));
  // Tail at -Z, because the pack model noses along +Z and the flight code
  // orients both the same way. With the tail at +Z this stand-in flew
  // backwards -- and since the real model loads lazily, the stand-in was what
  // everybody saw on the first drop of a match.
  tail.position.set(0,1.1,-7.4);stub.add(tail);
  return stub;
}
function clearSupply(){
  dropGroup.clear();
  supply.id=null;supply.crate=null;supply.chute=null;supply.plane=null;supply.lastState=null;
}
function updateSupplyDrop(dt,elapsedSeconds){
  const drop=inFfa()?ffa.snapshot?.drop:null;
  if(!drop){if(supply.id)clearSupply();return;}
  if(supply.id!==drop.id){
    clearSupply();
    supply.id=drop.id;
    supply.crate=buildCrate();dropGroup.add(supply.crate);
    supply.chute=buildChute();dropGroup.add(supply.chute);
    const model=planeModel();
    supply.plane=model?model.clone(true):buildPlaneStub();
    dropGroup.add(supply.plane);
  }
  const now=serverNow();
  const fall=Math.max(1,drop.landAt-drop.dropAt);
  // Two clocks. The crate's is clamped -- it stops when it hits the ground --
  // but the aircraft's must keep running past the drop, or it freezes in the
  // sky above the zone for as long as the crate sits there.
  const raw=(now-drop.dropAt)/fall;
  const progress=clamp(raw,0,1);
  const heading=drop.heading||0;
  const dirX=Math.cos(heading),dirZ=Math.sin(heading);

  // The aircraft runs a straight line through the zone, releasing as it passes,
  // then carries on out of sight.
  if(supply.plane){
    const flying=raw<PLANE_EXIT;
    supply.plane.visible=flying;
    if(flying){
      const planeAt=(raw-DROP_RELEASE)*DROP_RUN;
      supply.plane.position.set(drop.x+dirX*planeAt,DROP_ALTITUDE,drop.z+dirZ*planeAt);
      supply.plane.rotation.set(0,-heading+Math.PI/2,0);
    }
  }
  const landed=drop.state==='landed'||progress>=1;
  if(landed){
    if(supply.chute)supply.chute.visible=false;
    // Set every frame, not just on the way down: a client that watched the
    // aircraft approach had hidden the crate until release, and nothing here
    // ever turned it back on, so the drop landed invisible.
    supply.crate.visible=true;
    supply.crate.position.set(drop.x,.8,drop.z);
    supply.crate.rotation.y=elapsedSeconds*.5;
    const lamp=supply.crate.getObjectByName('lamp');
    if(lamp)lamp.scale.setScalar(1+Math.sin(elapsedSeconds*5)*.22);
  }else{
    // Released at DROP_RELEASE, then drifting down under the canopy.
    const fallProgress=clamp((progress-DROP_RELEASE)/(1-DROP_RELEASE),0,1);
    const y=.8+(DROP_ALTITUDE-.8)*(1-fallProgress);
    // Straight down over the zone. The crate used to drift in from 26m away,
    // which took it over whatever happened to be beside the street -- so it
    // read as hanging above a building on the way down.
    supply.crate.visible=progress>=DROP_RELEASE;
    supply.crate.position.set(drop.x,y,drop.z);
    supply.crate.rotation.y=elapsedSeconds*.8;
    if(supply.chute){
      supply.chute.visible=progress>=DROP_RELEASE&&fallProgress<.98;
      supply.chute.position.copy(supply.crate.position);
      supply.chute.rotation.y=Math.sin(elapsedSeconds*1.3)*.16;
    }
  }
  if(supply.lastState!==drop.state){
    supply.lastState=drop.state;
    if(drop.state==='landed')toast('SUPPLY CRATE DOWN · take the bazooka');
  }
  // Walking into a landed crate claims it. The server decides who actually got
  // there first; this only asks, and only while we could plausibly reach it.
  if(landed&&drop.state==='landed'&&!ffa.deadUntil&&!ffa.claimSent){
    const reach=Math.hypot(player.x-drop.x,player.z-drop.z);
    if(reach<=4){
      ffa.claimSent=drop.id;
      multiplayer.ffaAction?.('claim',{dropId:drop.id}).catch(()=>{ffa.claimSent=null;});
    }
  }
  if(ffa.claimSent&&ffa.claimSent!==drop.id)ffa.claimSent=null;
}
// A rocket leaves a visible shell rather than an instant tracer, so people can
// see it coming and get out of the way.
function launchRocket(start,direction,range){
  const rocket=new THREE.Group();
  const shell=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.46,4,8),
    new THREE.MeshBasicMaterial({color:0xd8dee3}));
  shell.rotation.x=Math.PI/2;rocket.add(shell);
  const flame=new THREE.Mesh(new THREE.ConeGeometry(.17,.6,8),
    new THREE.MeshBasicMaterial({color:0xffb457,transparent:true,opacity:.9}));
  flame.rotation.x=-Math.PI/2;flame.position.z=.55;rocket.add(flame);
  rocket.position.copy(start);
  rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction.clone().normalize());
  rocket.userData.velocity=direction.clone().normalize().multiplyScalar(62);
  addCombatEffect(rocket,Math.min(2200,range/62*1000+260),'rocket');
}
// One blast, drawn once: fireball, ring, smoke and a shove of light.
function explosionBurst(x,y,z,radius=12){
  const core=new THREE.Mesh(new THREE.SphereGeometry(Math.max(2,radius*.32),16,12),
    new THREE.MeshBasicMaterial({color:0xffcf7a,transparent:true,opacity:.95,depthWrite:false}));
  core.position.set(x,y+1,z);addCombatEffect(core,520,'blast-core');
  const ring=new THREE.Mesh(new THREE.RingGeometry(radius*.2,radius*.26,28),
    new THREE.MeshBasicMaterial({color:0xffe3ad,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
  ring.position.set(x,.3,z);ring.rotation.x=-Math.PI/2;
  ring.userData.blastRadius=radius;addCombatEffect(ring,680,'blast-ring');
  for(let i=0;i<10;i++){
    const puff=new THREE.Mesh(new THREE.SphereGeometry(.7+Math.random()*1.3,8,6),
      new THREE.MeshBasicMaterial({color:0x4a4741,transparent:true,opacity:.65,depthWrite:false}));
    const angle=Math.random()*Math.PI*2,spread=Math.random()*radius*.55;
    puff.position.set(x+Math.cos(angle)*spread,y+.6+Math.random()*3,z+Math.sin(angle)*spread);
    addCombatEffect(puff,900+Math.random()*500,'blast-smoke');
  }
  glowAt(new THREE.Vector3(x,y+1.4,z),0xffb066,radius*.9,420,'muzzleGlow');
}
function knifeFfa(){
  const now=performance.now();if(now-player.shotAt<480)return;player.shotAt=now;
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);let best=null;
  for(const seat of ffa.snapshot?.roster||[]){if(seat.id===multiplayer.getLocalId?.()||!seat.alive)continue;const object=multiplayer.getPeerObject?.(seat.id);if(!object)continue;const hit=raycaster.intersectObject(object,true)[0];if(hit&&hit.distance<=3.4&&(!best||hit.distance<best.hit.distance))best={seat,hit};}
  multiplayer.ffaAction?.('melee',{targetId:best?.seat.id||''}).catch(error=>toast(error.message));ffa.recoil=1;player.attackUntil=now+360;
  if(!playSample(WEAPON_SAMPLE.knife.name,WEAPON_SAMPLE.knife))cue(best?145:95);
}
// The in-match armoury. Tab opens it, a click swaps your primary. The server
// keeps each weapon's own magazine, so cycling it is not a free reload.
const ARMORY_GUNS=['smg','rifle','shotgun','sniper','magnum','arc'];
let armoryOpen=false;
function buildArmory(){
  const grid=$('armory-grid');
  if(grid.childElementCount)return;
  for(const kind of ARMORY_GUNS){
    const button=document.createElement('button');
    button.type='button';button.dataset.gun=kind;
    const tile=document.createElement('i'),name=document.createElement('b'),role=document.createElement('small');
    name.textContent=GUN_NAMES[kind]||kind.toUpperCase();role.textContent=GUN_ROLE[kind]||'';
    button.append(tile,name,role);
    button.addEventListener('click',()=>pickArmoryGun(kind));
    button.addEventListener('pointerenter',()=>showArmoryGun(kind));
    grid.append(button);
  }
  paintGunTiles(grid);
}
function showArmoryGun(kind){
  if(!armoryStage)armoryStage=createGunStage($('armory-preview-canvas'));
  armoryStage.show(kind);
  $('armory-name').textContent=GUN_NAMES[kind]||kind.toUpperCase();
  $('armory-stats').textContent=`${GUN_BLURB[kind]||''} ${gunStatLine(kind)}`.trim();
  for(const button of $('armory-grid').querySelectorAll('[data-gun]'))
    button.classList.toggle('is-active',button.dataset.gun===kind);
}
function pickArmoryGun(kind){
  if(kind===ffa.primary&&player.weapon===kind){setArmory(false);return;}
  multiplayer.ffaAction?.('loadout',{weapon:kind})
    .then(()=>{weaponSwitchSound();toast(`${GUN_NAMES[kind]||kind} equipped`);setArmory(false);})
    .catch(error=>toast(error.message));
}
function setArmory(open){
  if(open&&(!inFfa()||ffa.deadUntil))return;
  armoryOpen=open;
  $('ffa-armory').hidden=!open;
  if(!open)return;
  buildArmory();
  showArmoryGun(ffa.primary||'smg');
  // Let go of the mouse so the cursor is usable over the panel.
  if(document.pointerLockElement===canvas){releasingPointerLock=true;document.exitPointerLock();}
  keys.clear();
}
function toggleArmory(){setArmory(!armoryOpen);}
$('armory-close').addEventListener('click',()=>setArmory(false));
$('ffa-armory').addEventListener('click',event=>{if(event.target===$('ffa-armory'))setArmory(false);});

// Killer, the weapon that did it, then the victim -- the weapon reuses the same
// rendered thumbnail as the armoury, so the feed shows the actual model rather
// than a word. The knife has no pack model, so it falls back to its name.
function killFeedLine(event){
  const line=document.createElement('p');
  line.className='kill-line';
  const killer=document.createElement('b');killer.textContent=event.killerName||'Someone';
  const victim=document.createElement('b');victim.textContent=event.victimName||'Someone';
  const mine=multiplayer.getLocalId?.();
  if(event.killerId===mine)line.classList.add('by-me');
  if(event.victimId===mine)line.classList.add('on-me');
  const kind=event.weapon||'';
  const tool=document.createElement('span');
  tool.className='kill-weapon';
  if(GUN_MODELS[kind]){
    tool.title=GUN_NAMES[kind]||kind;
    gunThumbnail(kind).then(url=>{if(url)tool.style.backgroundImage=`url(${url})`;});
  }else{
    tool.classList.add('is-text');
    tool.textContent=GUN_NAMES[kind]||(event.melee?'BLADE':'—');
  }
  line.append(killer,tool,victim);
  if(event.headshot){const head=document.createElement('i');head.className='kill-headshot';head.textContent='HS';line.append(head);}
  setTimeout(()=>line.remove(),5200);
  return line;
}

// The victim's own screen. Restarting the animations needs the element torn out
// of the layout and put back, otherwise a second death in the same life shows
// nothing at all.
function showDeathScreen(killerName){
  const screen=$('death-screen'),splash=screen.querySelector('.death-splashes'),copy=screen.querySelector('.death-copy strong');
  $('death-by').textContent=killerName?`eliminated by ${killerName}`:'';
  screen.hidden=false;
  for(const node of [screen,splash,copy]){node.style.animation='none';void node.offsetWidth;node.style.animation='';}
}
function hideDeathScreen(){$('death-screen').hidden=true;}

// --- Touch controls --------------------------------------------------------
// These drive the same state the keyboard and mouse do -- the movement keys go
// into `keys`, looking moves camYaw/camPitch, and the buttons call the same
// functions the key handlers call. Synthesising KeyboardEvents would have been
// fragile and would not survive a rebind, since `down()` reads the bindings.
const touchLayer=$('touch');
const TOUCH_FORCED=new URLSearchParams(location.search).has('touch');
const touchCapable=TOUCH_FORCED||(navigator.maxTouchPoints||0)>0||matchMedia('(pointer:coarse)').matches;
let lookPointer=null,stickPointer=null,stickCentre={x:0,y:0};
// Sprint has two sources: the button latch, and pushing the stick to its rim.
// Either one alone is enough, so they are tracked separately and combined --
// otherwise releasing the stick would cancel a deliberate latch.
let sprintFromStick=false;
function applySprint(){touchHold('sprint',sprintFromStick);}

function touchHold(action,on){
  const code=settings.bindings[action];
  if(!code)return;
  if(on)keys.add(code);else keys.delete(code);
}
// The stick feeds the four movement bindings, so rebinding still works.
function applyStick(dx,dy){
  const dead=0.28;
  touchHold('forward',dy<-dead);touchHold('back',dy>dead);
  touchHold('left',dx<-dead);touchHold('right',dx>dead);
}
function clearStick(){for(const a of ['forward','back','left','right'])touchHold(a,false);}

// One button instead of three slots: a phone has no room for 1/2/Q, so this
// walks the same order the number keys would -- primary, sidearm, blade in a
// match; fists and sidearm in free roam.
function cycleTouchWeapon(){
  if(inFfa()){
    const order=[ffa.primary,'pistol','knife'];
    const next=order[(order.indexOf(player.weapon)+1)%order.length];
    switchFfa(next);
    toast(GUN_NAMES[next]||String(next).toUpperCase());
    return;
  }
  const next=player.weapon==='pistol'?'fists':'pistol';
  setWeapon(next);
}
// Installed or not, a phone should hand the game the whole screen. The request
// only works inside a gesture, so it rides the button that starts a session and
// is allowed to fail: iOS Safari has no element fullscreen, and there the
// manifest's display mode does the same job once installed.
function goFullscreen(){
  if(!touchCapable)return;
  if(!document.fullscreenElement){
    const el=document.documentElement;
    const ask=el.requestFullscreen||el.webkitRequestFullscreen;
    if(ask)try{Promise.resolve(ask.call(el,{navigationUI:'hide'})).catch(()=>{});}catch{}
  }
  lockLandscape();
}
// Orientation locking is only permitted once the document is fullscreen, and
// the request above resolves a tick later, so try again when it lands.
function lockLandscape(){
  if(!screen.orientation?.lock)return;
  try{Promise.resolve(screen.orientation.lock('landscape')).catch(()=>{});}catch{}
}
function initTouchControls(){
  if(!touchCapable)return;
  touchLayer.hidden=false;
  for(const id of ['newBtn','ffaBtn','deductionBtn','continueBtn','resumeBtn'])
    $(id)?.addEventListener('click',goFullscreen);
  // The lock is refused until the document is actually fullscreen, so take the
  // second chance when that lands.
  document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement)lockLandscape();});
  document.body.classList.add('touch-mode');
  // The radar is a chip on a phone, too small to read, so tapping it opens the
  // full district map. A backdrop closes it again -- there is no Esc key here.
  const radar=document.querySelector('.mini-map');
  if(radar)radar.addEventListener('click',()=>{openDistrictMap();$('map-backdrop').hidden=false;document.body.classList.add('menu-open');});
  $('map-backdrop').addEventListener('pointerdown',()=>{
    $('map-backdrop').hidden=true;$('district-map-panel').hidden=true;hideOverlay();document.body.classList.remove('menu-open');
  });
  const stick=$('touch-stick'),knob=stick.querySelector('i'),stickZone=$('touch-stick-zone');
  // The pad used to sit in a fixed corner, so reaching its rim meant stretching
  // a thumb to the edge of the screen. Now it comes to the thumb: touching
  // anywhere in the lower-left zone drops the stick there, which puts the
  // sprint rim a short push away wherever you grab it.
  const stickRadius=()=>(stick.clientWidth||104)/2;

  stickZone.addEventListener('pointerdown',event=>{
    if(stickPointer!==null)return;
    stickPointer=event.pointerId;
    const zone=stickZone.getBoundingClientRect(),size=stick.offsetWidth||104;
    // Keep the pad whole even when the thumb lands in a corner of the zone.
    const cx=clamp(event.clientX,zone.left+size/2,zone.right-size/2);
    const cy=clamp(event.clientY,zone.top+size/2,zone.bottom-size/2);
    stick.style.left=`${cx-zone.left-size/2}px`;
    stick.style.top=`${cy-zone.top-size/2}px`;
    stick.style.bottom='auto';
    // Read the centre back from layout rather than trusting the maths, and do
    // it before anything that can throw: a stale origin leaves the stick
    // reporting full deflection at rest.
    const box=stick.getBoundingClientRect();
    stickCentre={x:box.left+box.width/2,y:box.top+box.height/2};
    stick.classList.add('is-live');
    try{stickZone.setPointerCapture(event.pointerId);}catch{}
    event.preventDefault();
  });
  stickZone.addEventListener('pointermove',event=>{
    if(event.pointerId!==stickPointer)return;
    const radius=stickRadius();
    const dx=(event.clientX-stickCentre.x)/radius,dy=(event.clientY-stickCentre.y)/radius;
    const len=Math.hypot(dx,dy),clamped=len>1?1/len:1;
    knob.style.transform=`translate(${dx*clamped*radius*.55}px,${dy*clamped*radius*.55}px)`;
    applyStick(dx*clamped,dy*clamped);
    // Pushed to the rim means run. A little hysteresis so a thumb resting near
    // the edge does not flicker between walk and sprint.
    const edge=sprintFromStick?len>=.72:len>=.86;
    if(edge!==sprintFromStick){
      sprintFromStick=edge;applySprint();
      stick.classList.toggle('is-sprint',edge);
    }
  });
  const dropStick=event=>{
    if(event.pointerId!==stickPointer)return;
    stickPointer=null;stick.classList.remove('is-live','is-sprint');
    // Back to its resting corner so the pad is where you expect it next time.
    stick.style.left='';stick.style.top='';stick.style.bottom='';
    knob.style.transform='';clearStick();
    sprintFromStick=false;applySprint();
  };
  stickZone.addEventListener('pointerup',dropStick);
  stickZone.addEventListener('pointercancel',dropStick);

  // Anywhere on the canvas that is not a control is a look-drag.
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'||lookPointer!==null)return;
    lookPointer=event.pointerId;lookPointer_x=event.clientX;lookPointer_y=event.clientY;
  },{passive:true});
  canvas.addEventListener('pointermove',event=>{
    if(event.pointerId!==lookPointer)return;
    const dx=event.clientX-lookPointer_x,dy=event.clientY-lookPointer_y;
    lookPointer_x=event.clientX;lookPointer_y=event.clientY;
    // A thumb swipe covers a fraction of the distance a mouse does, so the
    // desktop gain made turning around a two-handed chore. Scoped aim keeps a
    // finer rate for aiming.
    const gain=.0068*settings.sensitivity*(ffa.scoped?.32:1);
    camYaw-=dx*gain;
    const pitchMin=inFfa()?-1.35:.16,pitchMax=inFfa()?1.35:1.25;
    camPitch=clamp(camPitch+dy*gain,pitchMin,pitchMax);
    lastLookAt=performance.now();
  },{passive:true});
  const dropLook=event=>{if(event.pointerId===lookPointer)lookPointer=null;};
  canvas.addEventListener('pointerup',dropLook,{passive:true});
  canvas.addEventListener('pointercancel',dropLook,{passive:true});

  // Buttons. Held actions repeat while down; the rest fire once.
  for(const button of touchLayer.querySelectorAll('[data-act]')){
    const act=button.dataset.act;
    const press=event=>{
      event.preventDefault();button.classList.add('is-held');
      if(act==='fire'){touchFiring=true;attack();}
      else if(act==='aim'){inFfa()?setFfaScope(!ffa.scoped):(aiming=true,$('crosshair').hidden=false);}
      else if(act==='jump'){if(!player.inCar&&!player.inAircraft&&!player.jetpack)queueJump();}
      else if(act==='reload'){inFfa()?reloadFfa():reload();}
      else if(act==='interact')interact();
      else if(act==='swap')cycleTouchWeapon();
      else if(act==='armory'&&inFfa())toggleArmory();
      else if(act==='board'&&inFfa())$('ffa-scoreboard').hidden=false;
    };
    const release=event=>{
      event.preventDefault();button.classList.remove('is-held');
      if(act==='fire')touchFiring=false;
      else if(act==='aim'&&!inFfa()){aiming=false;$('crosshair').hidden=true;}
      else if(act==='board'&&inFfa())$('ffa-scoreboard').hidden=true;
    };
    button.addEventListener('pointerdown',press);
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
    button.addEventListener('contextmenu',e=>e.preventDefault());
  }
}
let lookPointer_x=0,lookPointer_y=0,touchFiring=false;

function reloadFfa(){if(!inFfa()||ffa.deadUntil||player.reloadingUntil)return;setFfaScope(false);multiplayer.ffaAction?.('reload').catch(error=>toast(error.message));}
function switchFfa(weapon){
  if(!inFfa()||ffa.deadUntil||weapon===player.weapon)return;
  player.weaponSwitchUntil=performance.now()+420;
  weaponSwitchSound();
  multiplayer.ffaAction?.('switch',{weapon}).catch(error=>toast(error.message));
}
multiplayer.onFfa?.(snapshot=>{
  if(snapshot.mapId&&snapshot.mapId!==ffa.mapId)setFfaMap(snapshot.mapId);
  ffa.snapshot=snapshot;ffa.phase=snapshot.phase;
  // One authoritative clock for the sky, so nobody is playing at a different
  // hour to the person standing next to them.
  if(Number.isFinite(snapshot.serverTime))serverClockOffset=snapshot.serverTime-Date.now();
  if(snapshot.you){const wasDead=Boolean(ffa.deadUntil);player.health=snapshot.you.health;applyFfaWeapon();if(!snapshot.you.alive)ffa.deadUntil=snapshot.you.respawnAt;else{ffa.deadUntil=0;hideDeathScreen();if(wasDead)ffaSpawn();}}
  // The visible-players list used to be fixed at match start, so anyone who
  // joined afterwards was invisible to everybody already playing -- while they
  // could see everyone, because their own list was built on arrival. Track the
  // server's roster instead, which is the only list that is always right.
  multiplayer.setRoomPeers?.(snapshot.roster.map(seat=>seat.id).filter(id=>id!==multiplayer.getLocalId?.()));
  for(const seat of snapshot.roster){if(seat.id!==multiplayer.getLocalId?.())multiplayer.setPeerAlive?.(seat.id,seat.alive);}
  const leader=Math.max(0,...snapshot.roster.map(seat=>seat.score));$('ffa-leader').textContent=`${leader} KILL${leader===1?'':'S'}`;renderFfaScoreboard();
  if(snapshot.phase==='playing'&&ffa.deadUntil===0)$('ffa-phase').textContent='FREE-FOR-ALL';
});
multiplayer.onFfaEvent?.(event=>{
  if(!inFfa())return;
  if(event.firstBlood&&!ffa.firstBloodShown){
    ffa.firstBloodShown=true;playSample('firstblood',{volume:1,variance:0});
    const banner=$('first-blood');banner.hidden=false;banner.classList.remove('show');void banner.offsetWidth;banner.classList.add('show');
    setTimeout(()=>{banner.hidden=true;banner.classList.remove('show');},2300);
  }
  const localId=multiplayer.getLocalId?.();
  const localKiller=event.killerId===localId||event.shooterId===localId;
  if(event.rampage){playSample('rampage',{volume:1,variance:0});if(localKiller)toast('RAMPAGE · 4+ KILL STREAK');}
  if(localKiller&&!event.rampage){
    if(event.tripleKill)playSample('triple-kill',{volume:1,variance:0});
    else if(event.doubleKill)playSample('double-kill',{volume:1,variance:0});
  }
  // Somebody fired somewhere: put it on the map and play it from that bearing,
  // so a fight across the district is something you can hear and locate.
  if(['shot','hit','kill','melee'].includes(event.event)&&Number.isFinite(event.x)){
    const mine=event.shooterId===multiplayer.getLocalId?.()||event.killerId===multiplayer.getLocalId?.();
    addGunfireBlip(event.x,event.z,event.weapon,mine);
    if(!mine){
      const voice=WEAPON_SAMPLE[event.weapon]||WEAPON_SAMPLE.pistol;
      playSampleAt(voice.name,event.x,event.z,{volume:voice.volume,rate:voice.rate,hold:voice.hold});
    }
  }
  if(event.event==='hit'&&event.shooterId===multiplayer.getLocalId?.()){
    flashHitMarker(event.headshot);
    playSample(event.headshot?'headshot':'hit',{volume:.7,variance:.02});
    const victim=multiplayer.getPeerObject?.(event.targetId);
    const point=victim?victim.position.clone().setY(victim.position.y+(event.headshot?2.6:1.6)):null;
    showDamageNumber(event.damage,event.headshot?'head':'',point);
    impactBurst(point,event.headshot);
  }
  if(event.event==='reload'&&event.playerId===multiplayer.getLocalId?.())player.reloadingUntil=event.until;
  if(event.event==='loadout'&&event.playerId===multiplayer.getLocalId?.())ffa.primary=event.weapon;
  if(event.event==='kill'){
    // Where the victim fell: the event carries the shooter's position, so prefer
    // the victim's own body if we can see it.
    const victimObject=multiplayer.getPeerObject?.(event.victimId);
    const at=victimObject?victimObject.position:(Number.isFinite(event.x)?{x:event.x,y:1.2,z:event.z}:null);
    if(at)deathBurst(at.x,at.z,(at.y||0)+1.2);
    if(event.killerId===multiplayer.getLocalId?.()){
      flashHitMarker(event.headshot);
      playSample(event.headshot?'headshot-killer':'kill',{volume:.8,variance:.02});
      const victim=multiplayer.getPeerObject?.(event.victimId);
      const point=victim?victim.position.clone().setY(victim.position.y+1.8):null;
      showDamageNumber(event.damage||0,'kill',point);
      impactBurst(point,event.headshot);
    }
    $('ffa-kill-feed').prepend(killFeedLine(event));
    if(event.victimId===multiplayer.getLocalId?.()){ffa.deadUntil=event.respawnAt;keys.clear();playSample(event.headshot?'headshot-victim':'death',{volume:.8,variance:.03});showDeathScreen(event.killerName);}
  }
  // One rocket, possibly several casualties: draw the explosion once, then let
  // every kill it caused behave exactly like an ordinary kill.
  if(event.event==='blast'){
    const mine=multiplayer.getLocalId?.();
    const at=event.impact||{x:event.x,y:1,z:event.z};
    explosionBurst(at.x,at.y||1,at.z,event.radius||12);
    addGunfireBlip(at.x,at.z,'bazooka',event.shooterId===mine);
    playSampleAt('kill',at.x,at.z,{volume:.95,rate:.62,hold:true});
    if(event.shooterId===mine&&event.hits?.length){
      flashHitMarker(false);
      const total=event.hits.reduce((sum,hit)=>sum+hit.damage,0);
      showDamageNumber(total,event.kills?.length?'kill':'',null);
    }
    for(const kill of event.kills||[]){
      $('ffa-kill-feed').prepend(killFeedLine({...kill,weapon:'bazooka'}));
      const body=multiplayer.getPeerObject?.(kill.victimId);
      if(body)deathBurst(body.position.x,body.position.z,body.position.y+1.2);
      if(kill.victimId===mine){
        ffa.deadUntil=kill.respawnAt;keys.clear();
        playSample('death',{volume:.8,variance:.03});
        showDeathScreen(kill.killerName);
      }
    }
    if(event.shooterId===mine&&event.kills?.length)playSample('kill',{volume:.85,variance:.02});
  }
  if(event.event==='drop-incoming'){
    toast('SUPPLY DROP INBOUND');
    if(event.drop)addGunfireBlip(event.drop.x,event.drop.z,'bazooka',false);
  }
  if(event.event==='drop-claimed'){
    ffa.claimSent=null;if(ffa.snapshot)ffa.snapshot.drop=null;clearSupply();
    const mine=multiplayer.getLocalId?.();
    toast(event.playerId===mine?'BAZOOKA TAKEN · press G to equip':`${event.name||'Someone'} took the bazooka`);
  }
  if(event.event==='drop-gone'){ffa.claimSent=null;if(ffa.snapshot)ffa.snapshot.drop=null;clearSupply();}
  if(event.event==='respawn'&&event.playerId===multiplayer.getLocalId?.()){
    // Only move if we were actually dead. A stray respawn -- one emitted by a
    // reconnect, say -- must never yank a living player across the map.
    const wasDead=Boolean(ffa.deadUntil)||player.health<=0;
    ffa.deadUntil=0;player.health=100;
    hideDeathScreen();
    if(wasDead){ffaSpawn();toast('RESPAWNED · protected for 1.5 seconds');}
  }
  if(event.event==='ended'){
    ffa.phase='results';ffa.returnToLobby=true;$('ffa-results').hidden=false;renderFfaScoreboard('ffa-final-standings');
    const winners=(ffa.snapshot?.roster||[]).filter(seat=>event.winnerIds?.includes(seat.id)).map(seat=>seat.name);$('ffa-result-title').textContent=winners.length===1?`${winners[0]} WINS`:'SHARED VICTORY';setTimeout(leaveFfa,6000);
  }
});
// --- deduction lobby ------------------------------------------------------
// Rooms are server state; this only renders what arrives and sends intent back.
let lobbyRoom=null,lobbyRefreshTimer=null,lobbyBusyTimer=null,lobbyMode='deduction';
function setLobbyBusy(busy,label='SYNCING OPEN ROOMS…'){
  clearTimeout(lobbyBusyTimer);$('lobby-browser').classList.toggle('lobby-browser-busy',busy);$('lobby-loading').hidden=!busy;$('lobby-loading').querySelector('span').textContent=label;
  if(busy)lobbyBusyTimer=setTimeout(()=>setLobbyBusy(false),8000);
}
function lobbyVisible(){return !$('lobby-panel').hidden;}
function showLobby(show){
  $('lobby-panel').hidden=!show;
  $('lobby-panel').dataset.mode=lobbyMode;
  // Matchmaking is its own full-screen state, never an in-game pause. Clear
  // the pause styling that newGame()/showOverlay() may have set while the
  // multiplayer connection was being prepared, or it hides this panel.
  if(show){
    paused=true;aiming=false;$('crosshair').hidden=true;
    if(document.pointerLockElement===canvas)document.exitPointerLock();
    document.body.classList.add('menu-open');
    document.body.classList.remove('pause-menu-open','deduction-pause');
    $('overlay').hidden=false;$('pause-menu').hidden=true;
  }
  // The lobby is a menu, not the world: chat and voice belong to the round, and
  // leaving them on top of the room browser just clutters it.
  const social=document.querySelector('.social-panel');
  if(social)social.hidden=show;
  document.body.classList.toggle('ready-room-open',show);
  if(show)setGameplayUi(false);
  else if(playing&&$('overlay').hidden)setGameplayUi(true);
  if(show){$('district-map-panel').hidden=true;$('settings-panel').hidden=true;$('customize-panel').hidden=true;}
  clearInterval(lobbyRefreshTimer);
  // Poll only while the browser is on screen and we are not already seated.
  if(show)lobbyRefreshTimer=setInterval(()=>{if(!lobbyRoom)multiplayer.refreshRooms?.().catch(()=>{});},5000);
}
let lastRoomListKey=null,lobbyPreviewRoom=null;
function showRoomPreview(room){
  lobbyPreviewRoom=room;$('lobby-room-preview').hidden=!room;$('lobby-rooms').hidden=Boolean(room);$('lobby-create').hidden=Boolean(room);
  if(!room){$('lobby-empty').hidden=$('lobby-rooms').childElementCount>0;return;}
  $('lobby-empty').hidden=true;$('lobby-preview-name').textContent=room.name;
  $('lobby-preview-meta').textContent=`${room.players} player${room.players===1?'':'s'}${room.npcCount?` + ${room.npcCount} NPC`:''} · ${lobbyMode==='ffa'?'Free For All':'Deduction'} · Host: ${room.host}`;
  const live=room.phase&&room.phase!=='lobby',full=room.total>=10||(live&&room.joinable===false);
  $('lobby-preview-join').disabled=full;$('lobby-preview-join').textContent=full?'ROOM FULL':(live?'JOIN LIVE MATCH ›':'JOIN ROOM ›');
}
function renderRoomList(rooms){
  setLobbyBusy(false);
  rooms=(rooms||[]).filter(room=>(room.mode||'deduction')===lobbyMode);
  // The browser polls every 5s and rebuilt every row each time, so a click
  // could land on a button that had just been replaced and do nothing. Only
  // rebuild when something a player can see actually changed.
  const key=JSON.stringify([lobbyMode,rooms.map(room=>[room.id,room.name,room.players,room.npcCount,
    room.total,room.phase,room.durationMinutes,room.joinable,room.host])]);
  if(key===lastRoomListKey&&$('lobby-rooms').childElementCount===rooms.length)return;
  lastRoomListKey=key;
  const host=$('lobby-rooms');host.replaceChildren();
  $('lobby-empty').hidden=rooms.length>0;
  for(const room of rooms){
    const item=document.createElement('li'),name=document.createElement('b'),meta=document.createElement('small'),join=document.createElement('button');
    name.textContent=room.name;
    const live=room.phase&&room.phase!=='lobby';
    meta.textContent=`${room.players} player${room.players===1?'':'s'}${room.npcCount?` + ${room.npcCount} NPC`:''} · ${lobbyMode==='ffa'?'FFA':'Deduction'}${room.durationMinutes?` · ${room.durationMinutes} min`:''} · host ${room.host}`;
    if(live){
      item.classList.add('is-live');
      const tag=document.createElement('span');tag.className='room-live';tag.textContent='IN GAME';
      name.append(tag);
    }
    join.type='button';
    // Joining always opens the ready room first, including for a live match.
    join.disabled=room.total>=10||(live&&room.joinable===false);
    join.textContent=join.disabled?'FULL':'JOIN ROOM';
    join.onclick=()=>{
      if(join.disabled)return;
      setLobbyBusy(true,`JOINING ${room.name.toUpperCase()}…`);
      multiplayer.roomAction('join',{roomId:room.id,mode:lobbyMode,loadout:ffa.primary})
        .catch(error=>{setLobbyBusy(false);toast(error.message);});
    };
    item.append(name,meta,join);host.append(item);
  }
}
$('lobby-preview-back').onclick=()=>{showRoomPreview(null);multiplayer.refreshRooms?.().catch(()=>{});};
$('lobby-preview-join').onclick=()=>{if(!lobbyPreviewRoom)return;const room=lobbyPreviewRoom;setLobbyBusy(true,`JOINING ${room.name.toUpperCase()}…`);multiplayer.roomAction('join',{roomId:room.id,mode:lobbyMode,loadout:ffa.primary}).catch(error=>{setLobbyBusy(false);toast(error.message);});};
function renderRoom(room){
  setLobbyBusy(false);
  lobbyRoom=room;
  const inRoom=Boolean(room);
  $('lobby-panel').classList.toggle('in-room',inRoom);
  $('lobby-panel').dataset.mode=lobbyMode;
  $('lobby-browser').hidden=inRoom;
  $('lobby-room').hidden=!inRoom;
  // Leaving the ready room resets the flow, so rejoining starts at step one.
  if(!inRoom){lobbyStep='character';if(!inFfa())playMusic(null);return;}
  const me=multiplayer.getLocalId?.();
  const isHost=room.hostId===me;
  lobbyMode=room.mode||'deduction';
  if(lobbyMode==='ffa'&&!inFfa())playMusic('lobby');
  document.querySelector('#lobby-browser .eyebrow').textContent=lobbyMode==='ffa'?'FREE-FOR-ALL LOBBIES':'DEDUCTION LOBBIES';
  document.querySelector('.ready-room-head .eyebrow').textContent=lobbyMode==='ffa'?'FREE-FOR-ALL READY ROOM':'DEDUCTION READY ROOM';
  $('lobby-room-name').textContent=room.name;
  $('lobby-player-count').textContent=`${room.total} / 10`;
  const host=$('lobby-members');host.replaceChildren();
  for(const member of room.members){
    const item=document.createElement('li'),portrait=document.createElement('span'),details=document.createElement('span'),tick=document.createElement('i'),name=document.createElement('b'),character=document.createElement('small');
    portrait.className='lobby-pirate';portrait.dataset.character=member.character||'Henry';portrait.textContent='☠';portrait.setAttribute('aria-label',`${member.character||'Henry'} pirate`);
    details.className='lobby-member-copy';character.textContent=(member.character||'Henry').replace('Captain_','Captain ').replaceAll('_',' ');
    tick.className='tick';name.textContent=member.name+(member.id===me?' (you)':'');
    item.classList.toggle('is-ready',member.ready);
    details.append(name,character);item.append(portrait,tick,details);
    if(member.id===room.hostId){const tag=document.createElement('span');tag.className='host-tag';tag.textContent='HOST';item.append(tag);}
    // The host can remove anyone but themselves, in the lobby or mid-match.
    if(isHost&&member.id!==room.hostId){
      const kick=document.createElement('button');
      kick.type='button';kick.className='kick-btn';kick.textContent='×';
      kick.title=`Remove ${member.name}`;kick.setAttribute('aria-label',`Remove ${member.name}`);
      kick.onclick=event=>{event.stopPropagation();
        multiplayer.roomAction('kick',{target:member.id}).catch(error=>toast(error.message));};
      item.append(kick);
    }
    host.append(item);
  }
  const npcPirates=['Anne','Mako','Sharky','Captain_Barbarossa'];
  for(let i=0;i<room.npcCount;i++){
    const item=document.createElement('li'),portrait=document.createElement('span'),details=document.createElement('span'),tick=document.createElement('i'),name=document.createElement('b'),character=document.createElement('small');
    const pirate=npcPirates[i%npcPirates.length];
    portrait.className='lobby-pirate';portrait.dataset.character=pirate;portrait.textContent='☠';tick.className='tick';name.textContent=`BOT ${i+1}`;character.textContent=pirate.replaceAll('_',' ');details.className='lobby-member-copy';details.append(name,character);item.classList.add('is-ready');item.append(portrait,tick,details);host.append(item);
  }
  // Only the host sets the NPC fill, but everyone sees the result.
  const slider=$('lobby-npc');
  $('lobby-npc').parentElement.hidden=!isHost||lobbyMode==='ffa';
  slider.max=String(Math.min(4,Math.max(0,10-room.members.length)));
  if(document.activeElement!==slider)slider.value=String(room.npcCount);
  $('lobby-npc-value').textContent=`${room.npcCount} / 4`;
  $('lobby-duration-wrap').hidden=!(lobbyMode==='ffa'&&isHost);
  for(const button of $('lobby-duration').children)
    button.classList.toggle('is-on',Number(button.dataset.minutes)===(room.durationMinutes||5));
  const mapId=room.mapId==='office'?'office':'it-park';
  $('lobby-map-wrap').hidden=lobbyMode!=='ffa';
  $('lobby-map-wrap').classList.toggle('is-readonly',!isHost||room.phase!=='lobby');
  for(const button of $('lobby-map-choice').children){button.classList.toggle('is-on',button.dataset.map===mapId);button.disabled=!isHost||room.phase!=='lobby';}
  $('lobby-map-name').textContent=mapId==='office'?'THE OFFICE':'IT PARK';
  $('lobby-map-description').textContent=mapId==='office'?'Arena: Wing A · Central Elevators · Wing B':'Arena: Cebu IT Park';
  $('lobby-status').textContent=room.blocker||`Ready to start · ${room.total} player${room.total===1?'':'s'}`;
  const mine=room.members.find(member=>member.id===me);
  const selected=mine?.character||characterChoice;
  if(mine?.loadout){ffa.primary=mine.loadout;if(lobbyStep==='weapon')showLobbyGun(mine.loadout);}
  $('selected-pirate-art').dataset.character=selected;
  $('selected-pirate-name').textContent=selected.replace('Captain_','').replaceAll('_',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySelectorAll('#lobby-character-grid button').forEach(button=>{
    const active=button.dataset.character===selected;
    button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
  });
  const readyButton=$('lobby-ready');
  const joiningLive=lobbyMode==='ffa'&&room.phase&&room.phase!=='lobby';
  readyButton.textContent=joiningLive?(mine?.ready?'JOINING…':'READY & JOIN MATCH'):(mine?.ready?'READY ✓':'READY');
  readyButton.classList.toggle('is-ready',Boolean(mine?.ready));
  readyButton.hidden=isHost;
  lobbyRoleHides.ready=isHost;
  const startButton=$('lobby-start');
  // Show the host the button even when it cannot be used yet. Hiding it left
  // a host with a ready crew staring at a lobby with no way to begin and no
  // obvious reason why; disabled-with-a-reason explains itself.
  startButton.hidden=!isHost;
  lobbyRoleHides.start=!isHost;
  // Step one hides the commit controls; the role rules above still decide
  // whether this player would see them at all on step two.
  applyLobbyStep();
  startButton.disabled=Boolean(room.blocker);
  startButton.title=room.blocker||'Start the round';
}
multiplayer.onRoomList?.(renderRoomList);
multiplayer.onRoom?.(room=>{
  // An explicit null is the server saying this player is no longer in any room
  // -- kicked, or the room was closed. That has to reach the UI; the guard
  // below treats it as somebody else's snapshot and swallowed it, which left a
  // kicked player sitting in a ready room the server had already forgotten.
  if(room===null){renderRoom(null);multiplayer.refreshRooms?.().catch(()=>{});return;}
  // Room updates share one broadcast channel. Ignore another crew's private
  // snapshot instead of letting it kick this player out of their own UI.
  if(!room?.members?.some(member=>member.id===multiplayer.getLocalId?.()))return;
  renderRoom(room);
});
multiplayer.onError?.(message=>{setLobbyBusy(false);toast(message);});
// --- networked round ------------------------------------------------------
// The server owns kills, meetings, votes and the win condition. This maps its
// roster onto the local scene: seat "npc-N" is the Nth locally drawn bot, and
// player seats are the avatars the multiplayer layer already renders.
// In a lobby round the host's client is the only one running crew AI; everyone
// else interpolates the snapshots it sends. Solo rounds are always authoritative.
function crewAuthority(){
  return !deduction.networked||(deduction.serverRound?.hostId||deduction.hostId)===multiplayer.getLocalId?.();
}
const CREW_SEND_INTERVAL=0.125;   // 8 Hz is plenty for walking pace
function seatIsNpc(id){return String(id).startsWith('npc-');}
function botForSeat(id){
  if(!seatIsNpc(id))return null;
  return deduction.bots[Number(String(id).replace('npc-',''))]||null;
}
function seatPosition(id){
  const me=multiplayer.getLocalId?.();
  if(id===me)return {x:player.x,z:player.z};
  const bot=botForSeat(id);
  if(bot)return {x:bot.x,z:bot.z};
  const object=multiplayer.getPeerObject?.(id);
  return object?{x:object.position.x,z:object.position.z}:null;
}
// Closest killable seat in front of the player, used to name a target for the
// server. The server re-checks range, so this only has to make a sensible pick.
function nearestServerSeat(){
  const round=deduction.serverRound;if(!round)return null;
  const me=multiplayer.getLocalId?.();
  let best=null,bestDistance=Infinity;
  for(const seat of round.roster){
    if(!seat.alive||seat.id===me||seat.role==='impostor')continue;
    const at=seatPosition(seat.id);if(!at)continue;
    const away=Math.hypot(at.x-player.x,at.z-player.z);
    if(away<bestDistance&&away<4.2){best=seat;bestDistance=away;}
  }
  return best;
}
function applyServerRoster(round){
  deduction.serverRound=round;
  const me=multiplayer.getLocalId?.();
  deduction.role=round.yourRole||deduction.role;
  deduction.emergencyLeft=round.emergencies??deduction.emergencyLeft;
  applyDeductionLoadout();
  // Aliveness is the server's to decide, for the local player and the NPCs.
  if(round.youAlive===false&&deduction.playerAlive)becomeGhostLocally();
  for(const seat of round.roster){
    const bot=botForSeat(seat.id);
    if(bot&&bot.alive&&!seat.alive){bot.alive=false;bot.mesh.rotation.z=Math.PI/2;bot.mesh.position.y=.45;}
  }
}
function becomeGhostLocally(){
  deduction.playerAlive=false;deduction.playerGhost=true;
  multiplayer.setCommunicationAllowed?.(false);voice.setCommunicationAllowed(false);
  player.mesh.traverse(child=>{
    if(child.isMesh&&child.material){child.material=child.material.clone();child.material.transparent=true;child.material.opacity=.34;}
  });
  $('deduction-role-name').textContent='GHOST';
  $('deduction-role-copy').textContent='Observe silently. Space and Ctrl to drift.';
  toast('You were killed · you are now a ghost');
}
// Builds the meeting panel from the server roster instead of local bots.
// Bodies and their blood are cleared when the crew gathers.
function clearDeductionCorpses(){
  for(const corpse of deduction.corpses||[])deductionArena.remove(corpse);
  deduction.corpses=[];
  clearBloodPools();
}
function openServerMeeting(payload){
  clearDeductionCorpses();
  deduction.phase='meeting';deduction.meetingStage='discussion';
  deduction.meetingDeadline=payload.until;
  deduction.playerVote=null;deduction.sabotage=null;
  deduction.meetingStartedAt=performance.now();
  deduction.discussion=[];
  document.body.classList.remove('lights-out','comms-out');setStreetLamps(true);
  deduction.meetingBoard.visible=true;hadPointerLock=false;
  if(document.pointerLockElement===canvas){releasingPointerLock=true;document.exitPointerLock();}
  keys.clear();
  const centre=deduction.meetingPoint;
  if(deduction.playerAlive){
    // Every client runs this for its own player, so a fixed spot put the whole
    // crew on one tile. Each seat takes its own place on the circle, derived
    // from the shared roster so no two clients pick the same one.
    const seats=deduction.serverRound?.roster?.filter(seat=>seat.kind==='player')||[];
    const index=Math.max(0,seats.findIndex(seat=>seat.id===multiplayer.getLocalId?.()));
    const angle=seats.length?index/seats.length*Math.PI*2:0;
    player.x=centre.x+Math.sin(angle)*12;
    player.z=centre.z+Math.cos(angle)*12;
    player.y=1;player.mesh.position.set(player.x,1,player.z);
    player.h=Math.atan2(centre.x-player.x,centre.z-player.z);player.mesh.rotation.y=player.h;
    player.vx=0;player.vz=0;
  }
  // The host owns crew movement, so it arranges them around the table too.
  if(crewAuthority()){
    const crew=deduction.bots.filter(bot=>bot.alive);
    crew.forEach((bot,i)=>{
      const a=i/Math.max(1,crew.length)*Math.PI*2+Math.PI/crew.length;
      bot.x=centre.x+Math.sin(a)*9;bot.z=centre.z+Math.cos(a)*9;
      bot.target=null;bot.route=[];
      bot.h=Math.atan2(centre.x-bot.x,centre.z-bot.z);
      bot.mesh.position.set(bot.x,0,bot.z);bot.mesh.rotation.y=bot.h;
    });
  }
  setMeetingMinimized(false);
  $('meeting-panel').hidden=false;
  $('meeting-copy').textContent=(payload.reason?.kind==='body'
    ?`${payload.reason.name} was found.`
    :`${payload.caller||'Someone'} called an emergency meeting.`)
    +' Discussion first, then voting. Drag the view to look around; the crew is talking in chat.';
  $('meeting-result').hidden=false;
  renderServerVoteOptions(false);
}
function renderServerVoteOptions(enabled){
  const round=deduction.serverRound,host=$('vote-options');host.replaceChildren();
  if(!round)return;
  const me=multiplayer.getLocalId?.();
  for(const seat of round.roster.filter(entry=>entry.alive)){
    const button=document.createElement('button');
    button.type='button';button.textContent=seat.name+(seat.id===me?' (you)':'');
    button.disabled=!enabled||round.youAlive===false;
    button.onclick=()=>castVote({id:seat.id,name:seat.name});
    host.append(button);
  }
  const skip=document.createElement('button');
  skip.type='button';skip.textContent='SKIP VOTE';skip.disabled=!enabled||round.youAlive===false;
  skip.onclick=()=>castVote({id:'skip',name:'No one'});
  host.append(skip);
}
multiplayer.onCrew?.(payload=>{
  if(!deduction.networked||crewAuthority())return;
  for(const entry of payload.bots||[]){
    const bot=deduction.bots[entry[0]];
    if(!bot)continue;
    bot.netTarget={x:entry[1],z:entry[2],h:entry[3],moving:entry[5]===1};
    if(entry[4]===0&&bot.alive){bot.alive=false;bot.mesh.rotation.z=Math.PI/2;}
  }
});
multiplayer.onRound?.(round=>{
  // Redis publishes the private snapshot and shared room-start event on
  // different channels, so either may arrive first. Keep the snapshot until
  // the scene and its NPC seats have been constructed instead of dropping it.
  if(deduction.networked&&deduction.phase!=='idle')applyServerRoster(round);
  else pendingServerRound=round;
});
multiplayer.onRoundEvent?.(payload=>{
  if(!deduction.networked)return;
  if(payload.event==='killed'){
    // Blood at a kill stays until the next meeting, so a body can be found.
    bloodBurst(payload.x,1.25,payload.z,0,0,1.15,false,BODY_BLOOD_MS);
    const bot=botForSeat(payload.victimId);
    if(bot){bot.alive=false;bot.bodyAt=performance.now();bot.mesh.rotation.z=Math.PI/2;bot.mesh.position.y=.45;}
    else{
      // A player seat: lay down a corpse where they fell. The victim's own
      // avatar leaves with them as a ghost, so without this there is nothing
      // on the ground for anyone to report.
      const corpse=avatar(material(0x8c9ba2));
      attachCharacterModel(corpse,'Henry');
      corpse.position.set(payload.x,.45,payload.z);
      corpse.rotation.z=Math.PI/2;
      deductionArena.add(corpse);
      deduction.corpses=deduction.corpses||[];
      deduction.corpses.push(corpse);
    }
    // Any body can be reported, so keep a local marker for the interact check.
    deduction.bodies.push({id:payload.victimId,seatId:payload.victimId,name:payload.victimName,x:payload.x,z:payload.z});
    if(payload.victimId===multiplayer.getLocalId?.())becomeGhostLocally();
    else toast(`${payload.victimName} was killed`);
    return;
  }
  if(payload.event==='meeting'){
    if(payload.stage==='voting'){
      deduction.meetingStage='voting';deduction.meetingDeadline=payload.until;
      renderServerVoteOptions(true);
      return;
    }
    openServerMeeting(payload);
    return;
  }
  if(payload.event==='voted'){
    $('meeting-result').textContent='VOTES IN · waiting for the rest';
    return;
  }
  if(payload.event==='ejected'){
    const tally=(payload.tally||[]).map(entry=>`${entry.name} ${entry.count}`).join(' · ');
    $('meeting-copy').textContent=(payload.ejectedId
      ?`${payload.ejectedName} was ejected. ${payload.wasImpostor?'They were the impostor.':'They were not the impostor.'}`
      :(payload.tied?'The vote was tied. No one is ejected.':'No one is ejected.'))+`  Votes — ${tally}`;
    const bot=botForSeat(payload.ejectedId);
    if(bot)bot.alive=false;
    if(payload.ejectedId===multiplayer.getLocalId?.())becomeGhostLocally();
    // Back to the district after the room has read the result.
    deduction.phase='wrong-vote';deduction.resultAt=performance.now()+3600;
    return;
  }
  if(payload.event==='sabotage'){
    startSabotage(payload.kind,payload.stations);
    return;
  }
  if(payload.event==='repair'){
    repairSabotage('crew',payload.station);
    return;
  }
  if(payload.event==='ended'){
    $('meeting-panel').hidden=true;
    clearDeductionCorpses();
    endDeduction(payload.winner==='crew'?'CREWMATES WIN':'IMPOSTORS WIN');
    // The room survives the round, so put the crew back in their lobby to ready
    // up again rather than stranding everyone in free roam.
    deduction.returnToLobby=true;
  }
});
multiplayer.onRoomStart?.(setup=>{
  // The socket rotates every 45s and re-joins with its ticket, and the server
  // helpfully hands the round back each time. Rebuilding on that snapped the
  // player home to their spawn on a timer. Only act on a round we are not
  // already playing; a genuine reconnect arrives with phase 'idle'.
  if(setup.mode==='ffa'){
    // Keep the room snapshot while the arena is active. It is the destination
    // after results, so ending a match cannot fall through to city free roam.
    showLobby(false);if(!playing)newGame();
    multiplayer.setRoomPeers?.((setup.roster||[]).map(member=>member.id).filter(id=>id!==multiplayer.getLocalId?.()));
    // The same guard the deduction path needed: a rotating socket re-joins and
    // the server hands the match back, and restarting it respawned the player
    // mid-fight. Only start a match we are not already in.
    if(ffa.phase!=='idle'&&ffa.startsAt===(setup.startsAt||0))return;
    startFfa(setup);return;
  }
  if(deduction.phase!=='idle'&&deduction.setup?.seed===setup.seed){
    // Still worth refreshing who is in the room.
    multiplayer.setRoomPeers?.((setup.roster||[]).map(member=>member.id).filter(id=>id!==multiplayer.getLocalId?.()));
    return;
  }
  showLobby(false);lobbyRoom=null;
  newGame();
  multiplayer.setRoomPeers?.((setup.roster||[]).map(member=>member.id).filter(id=>id!==multiplayer.getLocalId?.()));
  startDeduction(setup);
  toast(setup.role==='impostor'?'You are the IMPOSTOR · blend in':'You are CREW · finish the tasks');
});
$('lobby-refresh').onclick=()=>{setLobbyBusy(true);multiplayer.refreshRooms?.().catch(()=>setLobbyBusy(false));};
$('lobby-main-menu').onclick=()=>{
  setLobbyBusy(false);showRoomPreview(null);showLobby(false);renderRoom(null);
};
$('lobby-create').addEventListener('submit',event=>{
  event.preventDefault();
  setLobbyBusy(true,'CREATING YOUR ROOM…');
  multiplayer.roomAction('create',{name:$('lobby-name').value.trim(),mode:lobbyMode,npcCount:0,loadout:ffa.primary}).catch(error=>{setLobbyBusy(false);toast(error.message);});
  $('lobby-name').value='';
});
$('lobby-leave').onclick=()=>{multiplayer.roomAction('leave').catch(()=>{});renderRoom(null);multiplayer.refreshRooms?.().catch(()=>{});};
$('lobby-ready').onclick=()=>{
  const me=multiplayer.getLocalId?.(),mine=lobbyRoom?.members.find(member=>member.id===me);
  const joiningLive=lobbyMode==='ffa'&&lobbyRoom?.phase&&lobbyRoom.phase!=='lobby';
  multiplayer.roomAction('ready',{ready:joiningLive?true:!mine?.ready}).catch(error=>toast(error.message));
};
$('lobby-character-grid').addEventListener('click',event=>{
  const button=event.target.closest('button[data-character]');if(!button)return;
  characterChoice=PLAYER_CHARACTERS.includes(button.dataset.character)?button.dataset.character:'Atlas';
  $('character-choice').value=characterChoice;
  try{localStorage.setItem('districtZeroCharacter',characterChoice);}catch{}
  if(player){player.character=characterChoice;attachCharacterModel(player.mesh,characterChoice);}
  showPiratePreview(characterChoice,true);
  multiplayer.refreshCharacters?.();
  multiplayer.roomAction('character',{character:characterChoice}).catch(error=>toast(error.message));
});
$('lobby-npc').addEventListener('input',event=>{
  $('lobby-npc-value').textContent=`${event.target.value} / 4`;
  multiplayer.roomAction('npc',{npcCount:Number(event.target.value)}).catch(()=>{});
});
$('lobby-duration').addEventListener('click',event=>{
  const button=event.target.closest('[data-minutes]');if(!button)return;
  multiplayer.roomAction('duration',{minutes:Number(button.dataset.minutes)}).catch(error=>toast(error.message));
});
$('lobby-map-choice').addEventListener('click',event=>{
  const button=event.target.closest('button[data-map]');if(!button||button.disabled)return;
  multiplayer.roomAction('map',{mapId:button.dataset.map}).catch(error=>toast(error.message));
});
// Being removed by the host drops you back to the browser with a reason.
multiplayer.onKicked?.(()=>{
  lobbyRoom=null;
  // Kicked mid-match, the seat is already gone server side. Leaving the match
  // locally too stops them playing on as a ghost nobody else can see.
  if(inFfa()){ffa.returnToLobby=true;leaveFfa();}
  else{renderRoom(null);showOverlay();showLobby(true);}
  toast('The host removed you from the room');
});
$('lobby-gun-grid').addEventListener('click',event=>{
  const button=event.target.closest('[data-gun]');if(!button)return;
  ffa.primary=button.dataset.gun;showLobbyGun(ffa.primary);
  multiplayer.roomAction('loadout',{loadout:ffa.primary}).catch(error=>toast(error.message));
});
// Keeps the grid, the name and the turning preview agreeing on one weapon.
// Free-for-All picks a character, locks it in, then picks a weapon, so neither
// choice needs scrolling. Deduction has no weapon step and stays as it was.
// What the host/guest rules decided, remembered so a local step change can put
// the commit buttons back without waiting for the next server render.
const lobbyRoleHides={ready:false,start:false};
let lobbyStep='character';
function setLobbyStep(step){lobbyStep=step;applyLobbyStep();}
function applyLobbyStep(){
  const ffaLobby=lobbyMode==='ffa';
  const onWeapon=ffaLobby&&lobbyStep==='weapon';
  $('lobby-panel').dataset.step=onWeapon?'weapon':'character';
  $('lobby-steps').hidden=!ffaLobby;
  $('step-character-select').hidden=onWeapon;
  $('step-character-preview').hidden=onWeapon;
  $('step-weapon-select').hidden=!onWeapon;
  $('step-weapon-preview').hidden=!onWeapon;
  // Step one commits the character; only step two offers ready and start.
  $('lobby-lock-character').hidden=!ffaLobby||onWeapon;
  $('lobby-step-back').hidden=!onWeapon;
  const commitHidden=ffaLobby&&!onWeapon;
  $('lobby-ready').hidden=lobbyRoleHides.ready||commitHidden;
  $('lobby-start').hidden=lobbyRoleHides.start||commitHidden;
  for(const item of $('lobby-steps').children)
    item.classList.toggle('is-active',item.dataset.step===(onWeapon?'weapon':'character'));
  if(onWeapon){paintGunTiles($('lobby-gun-grid'));showLobbyGun(ffa.primary||'smg');}
}
$('lobby-lock-character').addEventListener('click',()=>setLobbyStep('weapon'));
$('lobby-step-back').addEventListener('click',()=>setLobbyStep('character'));

function showLobbyGun(kind){
  if(!lobbyGunStage)lobbyGunStage=createGunStage($('lobby-gun-preview'));
  lobbyGunStage.show(kind);
  $('selected-gun-name').textContent=GUN_NAMES[kind]||String(kind).toUpperCase();
  $('selected-gun-stats').textContent=`${GUN_BLURB[kind]||''} ${gunStatLine(kind)}`.trim();
  for(const button of $('lobby-gun-grid').querySelectorAll('[data-gun]'))
    button.classList.toggle('is-active',button.dataset.gun===kind);
}
$('lobby-start').onclick=()=>multiplayer.roomAction('start').catch(error=>toast(error.message));
$('exit-deduction').onclick=()=>{
  multiplayer.roomAction('leave').catch(()=>{});lobbyRoom=null;if(inFfa())leaveFfa();else leaveDeduction();document.body.classList.remove('deduction-pause');$('exit-deduction').hidden=true;showOverlay();
};
// Deduction mode now opens the room browser instead of dropping straight in.
$('deductionBtn').onclick=()=>{
  if(!account){openAccount('login');toast('Sign in to enter Cebu');return;}
  lobbyMode='deduction';showRoomPreview(null);document.querySelector('#lobby-browser .eyebrow').textContent='DEDUCTION LOBBIES';document.querySelector('.lobby-copy').textContent='Join a crew, or start your own. A round needs 5 to 10 players; add NPCs to fill empty seats.';
  if(!playing){newGame();showOverlay();}
  renderRoom(null);showLobby(true);
  if(lobbyVisible()){setLobbyBusy(true);multiplayer.refreshRooms?.().catch(()=>{setLobbyBusy(false);toast('Connect to the district first');});}
};
$('ffaBtn').onclick=()=>{
  if(!account){openAccount('login');toast('Sign in to play Free For All');return;}
  lobbyMode='ffa';showRoomPreview(null);document.querySelector('#lobby-browser .eyebrow').textContent='FREE-FOR-ALL LOBBIES';document.querySelector('.lobby-copy').textContent='First-person combat for 2 to 10 real players. Pick a primary weapon and ready up.';
  if(!playing){newGame();showOverlay();}renderRoom(null);showLobby(true);
  if(lobbyVisible()){setLobbyBusy(true);multiplayer.refreshRooms?.().catch(()=>{setLobbyBusy(false);toast('Connect to the district first');});}
};
$('newBtn').onclick=newGame;$('continueBtn').onclick=loadGame;$('resumeBtn').onclick=hideOverlay;$('saveBtn').onclick=()=>saveGame();$('loadBtn').onclick=loadGame;$('pauseBtn').onclick=()=>{if(playing)paused?hideOverlay():showOverlay();};
$('pause-resume').onclick=hideOverlay;
function leaveCurrentGame(){activityManager.cancel('Activity ended');if(lobbyRoom)multiplayer.roomAction('leave').catch(()=>{});lobbyRoom=null;document.body.classList.remove('pause-menu-open','deduction-pause','ffa-mode','deduction-mode');$('pause-menu').hidden=true;playing=false;paused=true;multiplayer.disconnect();showLobby(false);showOverlay();}
$('pause-home').onclick=leaveCurrentGame;
$('pause-exit').onclick=()=>{leaveCurrentGame();toast('Exited the current game');};
document.addEventListener('click',event=>{
  if(!event.target.closest('.next-version'))return;
  event.preventDefault();event.stopImmediatePropagation();toast('AVAILABLE IN NEXT VERSION');
},true);
try{refreshSaveButtons();}catch(e){console.warn('Local storage unavailable',e);}
// Show an animated district behind the initial menu.
let last=performance.now(),elapsed=0,uiTimer=0,activityTick=0;
function frame(now){requestAnimationFrame(frame);const frameMs=now-last,dt=Math.min(frameMs/1000,.05);last=now;elapsed+=dt;
  updateNetworkMeetingClock();
  if(playing)adaptQuality(frameMs,dt);
  for(let i=combatEffects.length-1;i>=0;i--){
    const effect=combatEffects[i],progress=clamp((now-effect.born)/(effect.until-effect.born),0,1);
    if(progress>=1){
      combatEffects.splice(i,1);scene.remove(effect.mesh);
      // A rocket is a group, not a single mesh, so dispose the whole subtree.
      effect.mesh.traverse?.(child=>{child.geometry?.dispose?.();
        if(Array.isArray(child.material))child.material.forEach(m=>m.dispose?.());
        else child.material?.dispose?.();});
      if(!effect.mesh.traverse){effect.mesh.geometry?.dispose();effect.mesh.material?.dispose?.();}
      continue;
    }
    if(effect.mesh.material)effect.mesh.material.opacity=1-progress;
    else effect.mesh.traverse?.(child=>{if(child.material&&child.material.transparent)child.material.opacity=1-progress;});
    if(effect.kind==='rocket'){
      const velocity=effect.mesh.userData.velocity;
      if(velocity)effect.mesh.position.addScaledVector(velocity,dt);
    }
    if(effect.kind==='blast-core')effect.mesh.scale.setScalar(1+progress*1.9);
    // The ring is authored at a quarter of the blast, so 3.85x reaches the edge.
    if(effect.kind==='blast-ring')effect.mesh.scale.setScalar(1+progress*2.85);
    if(effect.kind==='blast-smoke'){effect.mesh.scale.setScalar(1+progress*1.5);effect.mesh.position.y+=dt*1.2;}
    if(effect.kind==='hit'){const size=3.5+progress*1.8;effect.mesh.scale.set(size,size,1);}
    if(effect.kind==='ring'){effect.mesh.quaternion.copy(camera.quaternion);effect.mesh.scale.setScalar(1+progress*.8);}
    if(effect.kind==='muzzle'||effect.kind==='muzzleGlow')effect.mesh.scale.multiplyScalar(1+dt*2);
    if(effect.kind==='casing'){
      const velocity=effect.mesh.userData.velocity;velocity.y-=9.5*dt;effect.mesh.position.addScaledVector(velocity,dt);effect.mesh.rotation.x+=dt*18;effect.mesh.rotation.z+=dt*13;
    }
    if(effect.kind==='blood'){
      const velocity=effect.mesh.userData.velocity;
      if(velocity){
        velocity.y-=22*dt;effect.mesh.position.addScaledVector(velocity,dt);
        // Settle on the ground instead of sinking through it.
        if(effect.mesh.position.y<=.06){effect.mesh.position.y=.06;velocity.set(0,0,0);}
      }
    }
  }
  updateBloodPools(now);
  for(let i=fallenBodies.length-1;i>=0;i--){
    const body=fallenBodies[i],progress=clamp((now-body.born)/(body.until-body.born),0,1);
    if(body.mesh.userData.characterMixer)body.mesh.userData.characterMixer.update(dt);
    else body.mesh.rotation.x=progress*1.35;
    body.mesh.position.y=-progress*.6;
    if(progress>=1){scene.remove(body.mesh);fallenBodies.splice(i,1);}
  }
  if(playing&&!paused){worldTime=worldClockNow();if(touchFiring)attack();if(inFfa()){if(['playing','sudden-death'].includes(ffa.phase)&&!ffa.deadUntil)updatePlayer(dt,elapsed);else keys.clear();}else if(deduction.phase==='idle'){updatePlayer(dt,elapsed);updateTraffic(dt);refreshCrowd(dt);updatePeds(dt,elapsed);updatePolice(dt,elapsed);updateJob(dt);activityTick-=dt;if(activityTick<=0){activityTick=.1;activityManager.update().catch(error=>{activityManager.cancel(error.message);});}}else updateDeduction(dt,elapsed);hubMeshes.forEach((mesh,i)=>{mesh.children[0].rotation.z+=dt*(i%2?-.5:.5);mesh.children[2].lookAt(camera.position);});activityMarker.children[0].rotation.z-=dt*.65;activityMarker.children[2].lookAt(camera.position);deductionLobbyMesh.children[0].rotation.z+=dt*.65;if(job||activitySnapshot.state===ACTIVITY_STATES.ACTIVE){objectiveMesh.children[2].lookAt(camera.position);objectiveHalo.rotation.z+=dt*.5;objectiveBeam.material.opacity=.1+Math.sin(elapsed*3)*.035;}if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').hidden=true;}uiTimer-=dt;if(uiTimer<=0){updateUI();drawMini();uiTimer=.12;}}
  if(taxiPassenger.visible)taxiPassenger.userData.characterMixer?.update(dt);
  for(const craft of aircraft)animateAircraft(craft.mesh,craft.kind,dt,craft.occupied);
  if(inFfa())updateSupplyDrop(dt,elapsed);else if(supply.id)clearSupply();
  updateAtmosphere();if(playing){multiplayer.update(dt);voice.update(dt);}
  if(lobbyGunStage&&!$('step-weapon-preview').hidden)lobbyGunStage.render(dt);
  if(armoryStage&&armoryOpen)armoryStage.render(dt);
  if(playing)updateCamera(dt);else{camera.position.set(-170,210,300);camera.lookAt(0,20,-50);}
  renderer.render(scene,camera);
  if(!$('overlay').hidden&&!lobbyVisible()){mountMenuSharky();sizeMenuPreview();menuPreviewMixer?.update(dt);if(menuPreviewModel)menuPreviewStage.rotation.y=menuPreviewRotation+(menuPreviewDragging?0:Math.sin(elapsed*.55)*.08);menuPreviewRenderer.render(menuPreviewScene,menuPreviewCamera);}
  if(lobbyVisible()&&lobbyRoom){sizePiratePreview();previewMixer?.update(dt);if(previewModel)previewStage.rotation.y=previewRotation+(previewDragging?0:Math.sin(elapsed*.65)*.1);previewRenderer.render(previewScene,previewCamera);}
}
requestAnimationFrame(frame);

// Touch controls come last: they reference the canvas, settings and the FFA
// helpers above, and only switch themselves on for touch hardware.
initTouchControls();

// Register the service worker so the game can be installed to a home screen.
// Failure is silent and harmless: it only affects installability, never play.
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  const register=()=>navigator.serviceWorker.register('/sw.js').catch(()=>{});
  // This module has a top-level await, which makes it async -- so `load` fires
  // without waiting for it, and by the time this line runs the event is
  // usually already gone. A listener added after the fact never fires, which
  // silently stopped the game registering a worker and being installable.
  if(document.readyState==='complete')register();
  else window.addEventListener('load',register,{once:true});
}

// --- boot ------------------------------------------------------------------
// Everything heavy is fetched here, behind a progress bar, instead of being
// kicked off the moment this module evaluates. The old arrangement started ten
// multi-megabyte downloads at once and decoded them on the main thread, so the
// menu could not paint for around twenty seconds and the player saw nothing.
//
// The bar is markup in index.html with inline CSS, so it is on screen before
// this file is even parsed.
const bootEl=$('boot'),bootFill=$('boot-fill'),bootNote=$('boot-note'),bootRetry=$('boot-retry');
function bootProgress(done,total,label){
  if(bootFill)bootFill.style.width=`${Math.round(done/Math.max(1,total)*100)}%`;
  if(bootNote)bootNote.textContent=label;
}
// Yield to the compositor so the bar actually repaints between steps; without
// this the whole sequence runs in one frame and the bar jumps 0 to 100.
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));

async function boot(){
  if(bootRetry)bootRetry.hidden=true;
  assetsReady=false;
  const audioFiles=['fire-pistol.ogg','fire-smg.ogg','fire-rifle.ogg','fire-shotgun.ogg','melee-knife.ogg','melee-knife-2.ogg','hit.ogg','headshot-victim.mp3','headshot-killer.mp3','firstblood.mp3','double-kill.mp3','triple-kill.mp3','rampage.mp3','kill.ogg','death.ogg','footstep.ogg'];
  const steps=[
    ['CEBU CITY',  ()=>worldAssetsReady],
    ['CHARACTERS', ()=>Promise.all([...PIRATE_CHARACTERS].map(loadPirate))],
    ['CROWD',      ()=>Promise.all(womenNames.map(loadWoman))],
    ['WEAPONS',    ()=>Promise.all(Object.keys(GUN_MODELS).map(loadGunModel))],
    ['GAME MODES', ()=>deductionAssetsReady],
    ['AIRCRAFT',   ()=>new Promise(resolve=>{planeModel();const wait=()=>supply.planeModel?resolve():setTimeout(wait,120);setTimeout(wait,120);setTimeout(resolve,15000);})],
    // Decoding needs an audio context, which does not exist until the player
    // clicks something. Fetching the bytes does not, so warm the HTTP cache
    // here and let setupAudio decode them later.
    ['AUDIO',      ()=>Promise.all(audioFiles.map(async file=>{const response=await fetch(`/audio/${file}`,{cache:'force-cache'});if(!response.ok)throw Error(`Missing audio: ${file}`);await response.arrayBuffer();}))],
  ];
  let done=0;
  for(const [label,run] of steps){
    bootProgress(done,steps.length,`LOADING ${label}…`);
    await nextFrame();
    try{await run();}catch(error){console.warn(`Boot step ${label} failed; continuing.`,error);}
    done++;
    bootProgress(done,steps.length,`LOADING ${label}…`);
  }
  bootProgress(steps.length,steps.length,'READY');
  await nextFrame();
  assetsReady=true;
  if(bootEl)bootEl.hidden=true;
}
// Navigation stays locked on failure: letting a player enter while models are
// still missing merely moves the download stalls into combat. Offer a clear
// retry instead and keep the full-screen gate in place.
function startBoot(){boot().catch(error=>{console.warn('Asset buffer failed.',error);bootProgress(0,1,'DOWNLOAD INTERRUPTED · CHECK CONNECTION');if(bootRetry)bootRetry.hidden=false;});}
if(bootRetry)bootRetry.onclick=startBoot;
startBoot();

// --- player accounts -------------------------------------------------------
// Gameplay requires an account. The session token is the only credential kept
// locally -- never the password -- and all economy changes go through Node.
// Accounts live on the multiplayer Worker, not on whatever host served this
// page -- the game is static files on one origin and the backend is another.
// Derive the base from the same setting the socket uses, so there is one
// place to change it, and fall back to same-origin for local development.
const ACCOUNT_BASE=(()=>{
  const configured=String(import.meta.env.VITE_MULTIPLAYER_URL||'').trim();
  if(!configured)return '';
  try{
    const endpoint=new URL(configured,location.href);
    endpoint.protocol=endpoint.protocol==='wss:'?'https:':endpoint.protocol==='ws:'?'http:':endpoint.protocol;
    return endpoint.origin;
  }catch{return '';}
})();
const accountToken=()=>{try{return localStorage.getItem(ACCOUNT_TOKEN_KEY)||'';}catch{return '';}};
const rememberAccount=value=>{try{value?localStorage.setItem(ACCOUNT_TOKEN_KEY,value):localStorage.removeItem(ACCOUNT_TOKEN_KEY);}catch{}};

function renderAccount(){
  const out=$('account-out'),inside=$('account-in'),nameInput=$('player-name');
  if(!out||!inside)return;
  out.hidden=Boolean(account);
  inside.hidden=!account;
  // Signed in, the menu is the player's card: the generic pitch and the
  // throwaway name field belong to guests and step aside entirely.
  document.body.classList.toggle('signed-in',Boolean(account));
  // Keep entry points clickable while signed out so their handlers can open
  // the account modal instead of appearing broken or silently disabled.
  for(const id of ['newBtn','deductionBtn','ffaBtn'])$(id).disabled=false;
  if(account){
    $('account-name').textContent=account.name;
    renderProgress();
    // The account owns the display name; keep the hidden field in step so the
    // multiplayer join still sends the right one.
    if(nameInput){nameInput.value=account.name;nameInput.readOnly=true;nameInput.title='Your account name';}
    try{localStorage.setItem('districtZeroName',account.name);}catch{}
  }else if(nameInput){
    nameInput.readOnly=false;nameInput.title='';
  }
  refreshSaveButtons();
}
async function accountRequest(path,body){
  const response=await fetch(ACCOUNT_BASE+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok)throw Error(data?.error||'Something went wrong, try again');
  return data;
}
// A saved token is worth a round trip at startup: it is what makes the sign-in
// stick between visits.
async function restoreAccount(){
  const token=accountToken();if(!token){renderAccount();return;}
  try{
    const response=await fetch(`${ACCOUNT_BASE}/api/me?token=${encodeURIComponent(token)}`);
    if(response.ok){account=(await response.json()).player;}
    else if(response.status===401)rememberAccount('');   // expired or revoked
  }catch{ /* offline: stay signed out rather than block the menu */ }
  renderAccount();
}

// The level is derived from experience by the shared curve, never stored, so
// the bar cannot disagree with the server after the numbers are retuned.
let shownLevel=null;
function renderProgress(){
  if(!account)return;
  const p=levelProgress(account.exp||0);
  $('account-level').textContent=p.level;
  $('account-exp').textContent=p.maxed?`${p.exp.toLocaleString()} XP`:`${p.into.toLocaleString()} / ${p.needed.toLocaleString()} XP`;
  $('account-bar-fill').style.width=`${Math.round(p.ratio*100)}%`;
  $('account-points').textContent=(account.points||0).toLocaleString();
  if($('menu-xp'))$('menu-xp').textContent=(account.exp||0).toLocaleString();
  const matches=account.matchesPlayed||0,kills=account.kills||0,deaths=account.deaths||0;
  $('stat-matches').textContent=matches.toLocaleString();
  // Deaths of zero would divide by zero; a player with kills and no deaths is
  // shown their kill count, which is what every shooter does.
  $('stat-kd').textContent=deaths?(kills/deaths).toFixed(2):kills.toFixed(2);
  $('stat-wins').textContent=(account.wins||0).toLocaleString();
  // Only celebrate a level that actually changed under the player, not the
  // one they already had when the menu opened.
  if(shownLevel!==null&&p.level>shownLevel){
    const badge=$('account-level');
    badge.classList.remove('level-up');void badge.offsetWidth;badge.classList.add('level-up');
    toast(`LEVEL ${p.level}`);
  }
  shownLevel=p.level;
}

function applyWorldProgress(data){
  if(!account||!data)return;
  for(const key of ['money','exp','streetRep','engineLevel','completedJobs','completedActivities','activityWins','bestSkylineSprintMs'])
    if(Number.isFinite(Number(data[key])))account[key]=Number(data[key]);
  cash=account.money??cash;streetRep=account.streetRep??streetRep;
  engineLevel=account.engineLevel??engineLevel;completedJobs=account.completedJobs??completedJobs;
  renderProgress();updateUI();
}

let accountMode='login';
function setAccountMode(mode){
  accountMode=mode;
  const creating=mode==='register';
  $('account-title').textContent=creating?'CREATE ACCOUNT':'SIGN IN';
  $('account-blurb').textContent=creating
    ?'Pick a name nobody else has. Eight characters or more for the password.'
    :'Your name, your progress, on any device.';
  $('account-submit').textContent=creating?'CREATE ACCOUNT':'SIGN IN';
  $('account-email-row').hidden=!creating;
  $('account-swap-text').textContent=creating?'Already have one?':'No account yet?';
  $('account-swap').textContent=creating?'SIGN IN':'CREATE ONE';
  $('account-field-password').autocomplete=creating?'new-password':'current-password';
  accountError('');
}
function accountError(message){
  const box=$('account-error');if(!box)return;
  box.textContent=message||'';box.hidden=!message;
}
function openAccount(mode='login'){
  setAccountMode(mode);
  $('account-modal').hidden=false;
  $('account-field-name').value=account?.name||$('player-name')?.value||'';
  $('account-field-password').value='';
  $('account-field-name').focus();
}
function closeAccount(){$('account-modal').hidden=true;accountError('');}

$('account-open')?.addEventListener('click',()=>openAccount('login'));
$('account-close')?.addEventListener('click',closeAccount);
$('account-swap')?.addEventListener('click',()=>setAccountMode(accountMode==='login'?'register':'login'));
$('account-modal')?.addEventListener('pointerdown',event=>{if(event.target===$('account-modal'))closeAccount();});
$('account-signout')?.addEventListener('click',async()=>{
  const token=accountToken();
  if(playing){multiplayer.disconnect();playing=false;paused=true;showOverlay();}
  rememberAccount('');account=null;renderAccount();
  // Tell the server too, so the row goes away rather than lingering until it
  // expires -- but the player is signed out locally either way.
  try{await accountRequest('/api/logout',{token});}catch{}
  toast('Signed out');
});
$('account-form')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=$('account-submit');
  button.disabled=true;accountError('');
  try{
    const payload={name:$('account-field-name').value.trim(),password:$('account-field-password').value};
    if(accountMode==='register')payload.email=$('account-field-email').value.trim();
    const data=await accountRequest(accountMode==='register'?'/api/register':'/api/login',payload);
    account=data.player;rememberAccount(data.token);
    renderAccount();closeAccount();
    toast(accountMode==='register'?`Welcome, ${account.name}`:`Signed in as ${account.name}`);
  }catch(error){
    accountError(error.message);
  }finally{
    button.disabled=false;
  }
});
// The server scores the match and tells us what it was worth. Trusting it is
// the point: the browser never gets to say how much it earned.
multiplayer.onProgress?.(data=>{
  if(!account)return;
  account.exp=data.exp;account.points=data.points;
  account.matchesPlayed=data.matchesPlayed;account.kills=data.kills;
  account.deaths=data.deaths;account.wins=data.wins;
  renderProgress();
  const line=$('ffa-reward');
  if(line&&data.gainedExp){
    line.hidden=false;
    line.textContent=`+${data.gainedExp} XP · +${data.gainedPoints} POINTS`;
  }
});
restoreAccount();

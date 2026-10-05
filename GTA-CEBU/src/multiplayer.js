import { WORLD } from './map-config.js';
import * as THREE from 'three';
import { EMOTES, normalizeAppearance } from './appearance.js';
import { settings } from './settings.js';
import { createJetpackMesh, createAircraftMesh, animateAircraft } from './flight.js';
import { FFA_WEAPONS } from './ffaWeapons.js';

const $=id=>document.getElementById(id);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function textSprite(text,{background='#10242b',color='#ffffff',width=512,height=100,worldWidth=4.8}={}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=background;ctx.beginPath();ctx.roundRect(4,4,width-8,height-8,18);ctx.fill();
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  // Never trust the caller for this: a missing name used to throw on
  // .length here, inside the socket handler, which aborted addPeer and lost
  // the player entirely -- they could see you, you could not see them.
  const lines=[];let remaining=typeof text==='string'&&text?text:'Player';
  while(remaining.length>32&&lines.length<2){let cut=remaining.lastIndexOf(' ',32);if(cut<12)cut=32;lines.push(remaining.slice(0,cut));remaining=remaining.slice(cut).trimStart();}
  lines.push(remaining.slice(0,60));
  ctx.font=`bold ${lines.length>2?31:36}px sans-serif`;
  lines.slice(0,3).forEach((line,i)=>ctx.fillText(line,width/2,height/2+(i-(lines.length-1)/2)*36,width-30));
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));
  sprite.scale.set(worldWidth,worldWidth*height/width,1);return sprite;
}
function removeSprite(parent,sprite){if(!sprite)return;parent.remove(sprite);sprite.material.map.dispose();sprite.material.dispose();}
function speakingSprite(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#1c3a31';ctx.beginPath();ctx.arc(48,48,44,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#6ee7a8';ctx.lineWidth=6;ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='46px sans-serif';ctx.fillText('🎙️',48,52);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(1.1,1.1,1);return sprite;
}
function emojiSprite(emoji){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f5d38b';ctx.beginPath();ctx.roundRect(3,3,122,122,28);ctx.fill();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='82px sans-serif';ctx.fillText(emoji,64,67);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(2,2,1);return sprite;
}

// Everything a player can be holding: every firearm in the shared table, plus
// the melee and empty-handed states the table does not cover.
// Further than a sprinting player covers in a second: treat it as a teleport.
const TELEPORT_DISTANCE=16;
// Re-send state this often even when nothing changed. The old ten-second gap
// made silence ambiguous: a player standing still looked exactly like one whose
// connection had died, so a body that stopped updating had to be left on screen
// just in case. At this rate silence means gone, which lets stale bodies be
// removed quickly. Costs well under one message a second per idle player.
const STATE_HEARTBEAT_MS=1200;
// No packet for this long means the body on screen is a leftover.
const PEER_STALE_MS=3500;
// How long a body stays down before it is cleared away.
const PEER_DEATH_LINGER_MS=2600;
const PEER_WEAPONS=new Set(['fists','hands','knife',...Object.keys(FFA_WEAPONS)]);

export function createMultiplayer({scene,avatar,getAccountToken,applyAppearance,attachCharacter,attachWeapon,attachKnife,animateCharacter,carMesh,getPlayerPosition,getPlayerAnimation,getAppearance,getCharacter,canvas,isPlaying}){
  const liveTransport=import.meta.env.PROD&&!['localhost','127.0.0.1'].includes(window.location.hostname);
  const nameInput=$('player-name'),status=$('online-status'),log=$('chat-log'),form=$('chat-form'),input=$('chat-input'),panel=document.querySelector('.social-panel'),toggle=$('chat-toggle');
  const remote=new Map();
  // Dead players spectate. They stay hidden from anyone still alive, but can
  // see each other, so the afterlife is not lonely.
  let localGhost=false,visiblePeerIds=null,communicationAllowed=true,playerNamesVisible=true;
  // Forced state sends remaining, used after a teleport such as a respawn.
  let keyframesLeft=0;
  // Reused across frames: allocating one of these per peer per frame was pure
  // garbage collector pressure, and GC pauses are exactly what reads as stutter.
  const scratch=new THREE.Vector3();
  const voiceSignalHandlers=[],peerLeaveHandlers=[],sessionEndHandlers=[],effectHandlers=[];
  const progressHandlers=[],roomHandlers=[],roomListHandlers=[],roomStartHandlers=[],roundHandlers=[],roundEventHandlers=[],ffaHandlers=[],ffaEventHandlers=[],crewHandlers=[],errorHandlers=[];
  const notifyCrew=data=>{for(const handler of crewHandlers)handler(data);};
  const notifyRound=data=>{for(const handler of roundHandlers)handler(data);};
  const notifyRoundEvent=data=>{for(const handler of roundEventHandlers)handler(data);};
  const notifyFfa=data=>{for(const handler of ffaHandlers)handler(data);};
  const notifyFfaEvent=data=>{for(const handler of ffaEventHandlers)handler(data);};
  const notifyRoom=data=>{for(const handler of roomHandlers)handler(data);};
  const notifyRoomList=data=>{for(const handler of roomListHandlers)handler(data);};
  const notifyEffect=data=>{for(const handler of effectHandlers)handler(data);};
  const notifyVoiceSignal=(from,signal)=>{for(const handler of voiceSignalHandlers)handler(from,signal);};
  const notifyPeerLeave=id=>{for(const handler of peerLeaveHandlers)handler(id);};
  const notifySessionEnd=()=>{for(const handler of sessionEndHandlers)handler();};
  let session=null,stream=null,liveSocket=null,localTag=null,localBubble=null,localBubbleUntil=0,localMood=null,localMoodUntil=0,localMoodKind=null,sequence=0,stateClock=0,stateBusy=false,reconnectTimer=null,lastLiveFingerprint='',lastIdentity='',lastLiveSentAt=0,chatActiveUntil=0,rotateTimer=null,liveName='';
  // Vercel kills the function holding a WebSocket after about 60s, so the live
  // transport reconnects constantly. These keep that invisible: the player
  // resumes the same identity, and a fresh socket is opened before the old one
  // dies so there is no gap. Session scoped, so two tabs stay two players.
  const ROTATE_AFTER_MS=45000;
  let identity=null;
  // The resume ticket lives in localStorage so a closed or crashed tab can come
  // back to its seat. Two windows of one browser share that storage, though, so
  // the record carries a short lease: a tab refreshes it while alive, and a
  // starting tab only adopts an identity nobody has touched recently.
  const IDENTITY_KEY='districtZeroIdentity';
  const IDENTITY_LEASE_MS=6000;
  let leaseTimer=null;
  function readStoredIdentity(){
    try{
      const raw=JSON.parse(localStorage.getItem(IDENTITY_KEY)||'null');
      if(!raw?.id||!raw?.token)return null;
      if(raw.claimedAt&&Date.now()-raw.claimedAt<IDENTITY_LEASE_MS)return null;  // live in another tab
      return {id:raw.id,token:raw.token};
    }catch{return null;}
  }
  // Closing the tab hands the lease back at once, so reopening can reclaim the
  // seat immediately instead of waiting for the lease to lapse.
  function releaseLease(){
    try{
      const raw=JSON.parse(localStorage.getItem(IDENTITY_KEY)||'null');
      if(raw?.id)localStorage.setItem(IDENTITY_KEY,JSON.stringify({...raw,claimedAt:0}));
    }catch{}
  }
  function holdIdentity(value){
    try{localStorage.setItem(IDENTITY_KEY,JSON.stringify({...value,claimedAt:Date.now()}));}catch{}
  }
  identity=readStoredIdentity();
  function rememberIdentity(value){
    identity=value;
    holdIdentity(value);
    clearInterval(leaseTimer);
    leaseTimer=setInterval(()=>holdIdentity(value),IDENTITY_LEASE_MS/2);
  }
  function forgetIdentity(){
    identity=null;
    clearInterval(leaseTimer);leaseTimer=null;
    try{localStorage.removeItem(IDENTITY_KEY);}catch{}
  }
  // Bring the roster in line with a snapshot without tearing down players who
  // are still present -- clearing everything is what made avatars flicker.
  function reconcile(players){
    const seen=new Set(players.map(p=>p.id));
    for(const id of [...remote.keys()])if(!seen.has(id))removePeer(id);
    players.forEach(addPeer);
  }
  try{nameInput.value=localStorage.getItem('districtZeroName')||'Player';}catch{nameInput.value='Player';}
  function setStatus(value){status.textContent=value;}
  setStatus('OFFLINE');
  function clearRemote(){
    for(const peer of remote.values()){scene.remove(peer.root);removeSprite(peer.root,peer.nameTag);removeSprite(peer.root,peer.bubble);removeSprite(peer.root,peer.moodSprite);removeSprite(peer.root,peer.voiceSprite);}
    remote.clear();notifySessionEnd();
  }
  function disconnect({keepIdentity=false}={}){
    sequence++;clearTimeout(reconnectTimer);clearTimeout(rotateTimer);lastLiveFingerprint='';lastIdentity='';lastLiveSentAt=0;
    // Tearing down the socket to rebuild it is not the same as leaving, and
    // discarding the ticket here is what stopped a returning player reclaiming
    // their seat in a round already under way.
    if(!keepIdentity)forgetIdentity();
    if(stream){stream.close();stream=null;}
    if(liveSocket){liveSocket.close();liveSocket=null;}
    if(session){navigator.sendBeacon?.('/api/leave',new Blob([JSON.stringify({token:session.token})],{type:'application/json'}));session=null;}
    if(localMood){removeSprite(scene,localMood);localMood=null;localMoodKind=null;}
    if(localBubble){removeSprite(scene,localBubble);localBubble=null;}
    clearRemote();setStatus('OFFLINE');
  }
  function addPeer(data){
    if(!session||data.id===session.id)return;
    let peer=remote.get(data.id);
    if(!peer){
      const root=new THREE.Group(),body=avatar(data.appearance),vehicle=carMesh(0x79b7bb),jet=createAircraftMesh('jet'),helicopter=createAircraftMesh('helicopter'),jetpack=createJetpackMesh();
      attachWeapon?.(body);
      attachKnife?.(body);
      body.add(jetpack);root.add(body,vehicle,jet,helicopter);const nameTag=textSprite(data.name||'Player',{background:'#284d58',worldWidth:3.2});nameTag.position.y=4.35;nameTag.visible=playerNamesVisible;root.add(nameTag);
      peer={root,body,vehicle,jet,helicopter,jetpack,nameTag,name:data.name||'Player',ghost:false,matchAlive:true,voiceSprite:null,speaking:false,bubble:null,bubbleUntil:0,moodSprite:null,moodKind:null,moodUntil:0,appearanceKey:'',target:new THREE.Vector3(),previousTarget:new THREE.Vector3(),velocity:new THREE.Vector3(),lastStateAt:performance.now(),heading:data.h||0,flight:data.flight||null,animation:['Idle','Walk','Run','Jump','Punch'].includes(data.animation)?data.animation:'Idle',weapon:PEER_WEAPONS.has(data.weapon)?data.weapon:'hands',pitch:0,shownPitch:0,aiming:data.aiming===true,reloading:data.reloading===true,attacking:false,attackArm:data.attackArm===1?1:0,attackUntil:0,switchingUntil:0};
      remote.set(data.id,peer);scene.add(root);root.position.set(data.x||0,data.y||0,data.z||0);root.visible=!visiblePeerIds||visiblePeerIds.has(data.id);
      peer.target.copy(root.position);peer.previousTarget.copy(root.position);
    }
    // Position packets no longer carry the things that never change -- who you
    // are, what you look like. An absent field therefore means "as before";
    // reading it as "back to the default" turned every player into a default
    // Henry twelve times a second.
    if(data.character&&data.character!==peer.character){peer.character=data.character;attachCharacter?.(peer.body,data.character);}
    else if(!peer.character){peer.character='Atlas';attachCharacter?.(peer.body,'Atlas');}
    if(data.appearance){
      const look=normalizeAppearance(data.appearance),appearanceKey=JSON.stringify(look);
      if(peer.appearanceKey!==appearanceKey){applyAppearance(peer.body,look);peer.appearanceKey=appearanceKey;}
    }
    if(data.name&&data.name!==peer.name){
      peer.name=data.name;
      // A peer built from a bare position packet starts as "Player"; redraw
      // the tag the moment the real name turns up.
      const fresh=textSprite(data.name,{background:'#284d58',worldWidth:3.2});
      fresh.position.copy(peer.nameTag.position);
      peer.root.remove(peer.nameTag);
      peer.nameTag.material?.map?.dispose?.();peer.nameTag.material?.dispose?.();
      fresh.visible=playerNamesVisible;peer.nameTag=fresh;peer.root.add(fresh);
    }
    peer.ghost=data.ghost===true;
    const nextTarget=new THREE.Vector3(clamp(Number(data.x)||0,-WORLD.halfX+1,WORLD.halfX-1),clamp(Number(data.y)||0,0,110),clamp(Number(data.z)||0,-WORLD.halfZ+1,WORLD.halfZ-1));
    const now=performance.now(),elapsed=Math.max(.05,Math.min(.6,(now-peer.lastStateAt)/1000));
    peer.previousTarget.copy(peer.target);peer.target.copy(nextTarget);
    peer.velocity.copy(peer.target).sub(peer.previousTarget).multiplyScalar(1/elapsed);
    const horizontalSpeed=Math.hypot(peer.velocity.x,peer.velocity.z),maxSpeed=peer.flight==='jet'?70:peer.flight==='helicopter'?38:22;
    if(horizontalSpeed>maxSpeed){const scale=maxSpeed/horizontalSpeed;peer.velocity.x*=scale;peer.velocity.z*=scale;}
    peer.velocity.y=clamp(peer.velocity.y,-35,35);peer.lastStateAt=now;
    peer.heading=Number.isFinite(data.h)?data.h:0;
    peer.flight=['jetpack','jet','helicopter'].includes(data.flight)?data.flight:null;
    peer.animation=['Idle','Walk','Run','Jump','Punch'].includes(data.animation)?data.animation:'Idle';
    // Derived from the shared weapon table, never hand-listed: the literal this
    // replaced was missing magnum and arc, so a peer holding either was
    // sanitised to 'hands' and rendered empty-handed.
    const nextWeapon=PEER_WEAPONS.has(data.weapon)?data.weapon:'hands';
    if(nextWeapon!==peer.weapon)peer.switchingUntil=now+420;
    peer.weapon=nextWeapon;
    peer.pitch=Number.isFinite(Number(data.pitch))?Math.max(-1.4,Math.min(1.4,Number(data.pitch))):0;
    peer.aiming=data.aiming===true;
    peer.reloading=data.reloading===true;
    peer.attackArm=data.attackArm===1?1:0;
    if(data.attacking===true)peer.attackUntil=now+(peer.weapon==='fists'?330:peer.weapon==='knife'?420:180);
    else peer.attackUntil=0;
    peer.attacking=data.attacking===true;
    peer.body.visible=!data.inCar&&!['jet','helicopter'].includes(peer.flight);peer.vehicle.visible=!!data.inCar;
    peer.jetpack.visible=peer.flight==='jetpack';peer.jet.visible=peer.flight==='jet';peer.helicopter.visible=peer.flight==='helicopter';
    peer.nameTag.position.y=peer.flight==='jet'||peer.flight==='helicopter'?5.2:data.inCar?3.7:4.35;
    if(peer.voiceSprite)peer.voiceSprite.position.y=peer.nameTag.position.y+1.05;
    if(data.mood&&Object.hasOwn(EMOTES,data.mood)){
      if(peer.moodKind!==data.mood){removeSprite(peer.root,peer.moodSprite);peer.moodSprite=emojiSprite(EMOTES[data.mood]);peer.root.add(peer.moodSprite);peer.moodKind=data.mood;}
      peer.moodUntil=data.moodUntil;peer.moodSprite.position.y=peer.flight&&peer.flight!=='jetpack'?6.2:data.inCar?4.9:5.5;
    }else if(peer.moodSprite){removeSprite(peer.root,peer.moodSprite);peer.moodSprite=null;peer.moodKind=null;}
  }
  function removePeer(id){
    const peer=remote.get(id);if(!peer)return;
    scene.remove(peer.root);removeSprite(peer.root,peer.nameTag);removeSprite(peer.root,peer.bubble);removeSprite(peer.root,peer.moodSprite);removeSprite(peer.root,peer.voiceSprite);
    remote.delete(id);notifyPeerLeave(id);
  }
  // Shown only while incoming voice is actually detected, never for an idle peer connection.
  function setSpeaking(id,on){
    const peer=remote.get(id);if(!peer||peer.speaking===!!on)return;
    peer.speaking=!!on;
    if(on){peer.voiceSprite=speakingSprite();peer.voiceSprite.position.y=peer.nameTag.position.y+1.05;peer.root.add(peer.voiceSprite);}
    else{removeSprite(peer.root,peer.voiceSprite);peer.voiceSprite=null;}
  }
  function showBubble(id,message){
    const mine=session&&id===session.id,peer=mine?null:remote.get(id),parent=mine?scene:peer?.root;
    if(!parent)return;
    if(mine)removeSprite(scene,localBubble);else removeSprite(peer.root,peer.bubble);
    const bubble=textSprite(message,{background:'#f3cb80',color:'#1a252b',height:150,worldWidth:6});
    if(mine){localBubble=bubble;localBubbleUntil=performance.now()+6500;scene.add(bubble);}
    else{peer.bubble=bubble;peer.bubbleUntil=performance.now()+6500;bubble.position.y=peer.flight&&peer.flight!=='jetpack'?7:peer.vehicle.visible?6.05:6.7;peer.root.add(bubble);}
  }
  function addChat(data){
    if(visiblePeerIds&&data.id&&!visiblePeerIds.has(data.id)&&data.id!==session?.id)return;
    const row=document.createElement('p'),who=document.createElement('strong');
    who.textContent=`${data.name}: `;row.append(who,document.createTextNode(data.message));log.append(row);
    while(log.children.length>24)log.firstChild.remove();log.scrollTop=log.scrollHeight;
    chatActiveUntil=performance.now()+7000;panel.classList.add('recent');
    showBubble(data.id,data.message);
  }
  // Who is allowed to be drawn. This is now refreshed from every match
  // snapshot rather than once at the start, so it has to be cheap and
  // idempotent: bail when the roster has not actually changed.
  function setRoomPeers(ids=null){
    const next=ids?new Set(ids):null;
    const unchanged=(next===null&&visiblePeerIds===null)||
      (next&&visiblePeerIds&&next.size===visiblePeerIds.size&&[...next].every(id=>visiblePeerIds.has(id)));
    if(unchanged)return;
    const entering=Boolean(next)&&!visiblePeerIds;
    visiblePeerIds=next;
    // Walking into a room starts a fresh conversation. Somebody joining the
    // one you are already in does not, so do not wipe the log for that.
    if(entering)log.replaceChildren();
    for(const [id,peer] of remote)peer.root.visible=(!visiblePeerIds||visiblePeerIds.has(id))&&(!peer.ghost||localGhost);
  }
  // Dying is a moment, not a switch. Snapping a body out of existence the instant
  // it dies reads as a glitch to whoever shot it -- they see their target blink
  // away mid-burst. Keep it for a beat, face down, then let it go.
  let kickedHandler=null;
  function onKicked(fn){kickedHandler=fn;}
  function setPeerAlive(id,alive){
    const peer=remote.get(id);if(!peer)return;
    const next=alive!==false;
    if(peer.matchAlive!==false&&!next)peer.diedAt=performance.now();
    if(next)peer.diedAt=0;
    peer.matchAlive=next;
  }
  function setCommunicationAllowed(allowed){
    communicationAllowed=allowed!==false;
    if(!communicationAllowed)closeChat();
  }
  async function post(path,body){
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Connection failed');return data;
  }
  function connectLive(name,attempt){
    const configured=String(import.meta.env.VITE_MULTIPLAYER_URL||'').trim();
    let socketUrl;
    if(configured){
      const endpoint=new URL(configured,location.href);
      endpoint.protocol=endpoint.protocol==='https:'?'wss:':endpoint.protocol==='http:'?'ws:':endpoint.protocol;
      if(endpoint.pathname==='/'||!endpoint.pathname)endpoint.pathname='/api/ws';
      socketUrl=endpoint.href;
    }else{
      const scheme=location.protocol==='https:'?'wss:':'ws:';
      socketUrl=`${scheme}//${location.host}/api/ws`;
    }
    const socket=new WebSocket(socketUrl);
    // `replacing` is the socket this one is taking over from. It stays live and
    // in charge until this socket is welcomed, so play never pauses.
    const replacing=liveSocket;
    const takingOver=Boolean(replacing);
    if(!takingOver)liveSocket=socket;
    socket.addEventListener('open',()=>{
      if(attempt!==sequence){socket.close();return;}
      socket.send(JSON.stringify({
        type:'join',name,appearance:getAppearance(),character:getCharacter?.()||'Atlas',
        // Says who you are so a finished match can be credited. Optional:
        // without it you simply play as a guest and earn nothing.
        ...(getAccountToken?.()?{account:getAccountToken()}:{}),
        // The resume ticket. Rejected tickets simply yield a new identity.
        ...(identity?{id:identity.id,token:identity.token}:{})
      }));
    });
    socket.addEventListener('message',event=>{
      if(attempt!==sequence)return;
      let packet;try{packet=JSON.parse(event.data);}catch{return;}
      const data=packet.data;
      if(packet.type==='welcome'){
        // Only now is the handover complete; retire the socket being replaced.
        if(takingOver&&replacing&&replacing!==socket){
          try{replacing.close(1000,'rotated');}catch{}
        }
        liveSocket=socket;
        session={id:data.id};
        if(data.token)rememberIdentity({id:data.id,token:data.token});
        reconcile(data.players);
        setStatus(`${remote.size+1} ONLINE`);
        // Rotate well before the platform's function timeout reaches us.
        clearTimeout(rotateTimer);
        rotateTimer=setTimeout(()=>{
          if(attempt===sequence&&liveSocket===socket)connectLive(liveName||name,attempt);
        },ROTATE_AFTER_MS);
      }else if(packet.type==='joined'){
        addPeer(data);setStatus(`${remote.size+1} ONLINE`);
      }else if(packet.type==='state')addPeer(data);
      else if(packet.type==='left'){removePeer(data.id);setStatus(`${remote.size+1} ONLINE`);}
      else if(packet.type==='kicked'){notifyRoom(null);kickedHandler?.();}
      else if(packet.type==='chat')addChat(data);
      else if(packet.type==='voice'){if(!visiblePeerIds||visiblePeerIds.has(data.from))notifyVoiceSignal(data.from,data.signal);}
      // Our own effects are already drawn locally; only play back other people's.
      else if(packet.type==='effect'){if(data.id!==session?.id&&(!visiblePeerIds||visiblePeerIds.has(data.id)))notifyEffect(data);}
      else if(packet.type==='crew'){if(data.from!==session?.id)notifyCrew(data);}
      else if(packet.type==='round')notifyRound(data);
      else if(packet.type==='round-event')notifyRoundEvent(data);
      else if(packet.type==='ffa')notifyFfa(data);
      else if(packet.type==='ffa-event')notifyFfaEvent(data);
      else if(packet.type==='room')notifyRoom(data);
      else if(packet.type==='rooms')notifyRoomList(data);
      else if(packet.type==='progress')for(const handler of progressHandlers)handler(data);
      // Roles are broadcast together; each client keeps only its own.
      else if(packet.type==='room-start'){
        // Two backends, two shapes: the worker addresses each player and sends
        // only their own role, while the Vercel function broadcast the whole
        // map for clients to pick from. Accept either rather than silently
        // ignoring a start, which leaves the host stuck in the lobby.
        const mine=data.role||data.roles?.[session?.id];
        if(data.mode==='ffa')for(const handler of roomStartHandlers)handler(data);
        else if(mine)for(const handler of roomStartHandlers)handler({...data,role:mine,roles:undefined});
        else console.warn('[room] start received with no role for this player',data);
      }
      else if(packet.type==='error'){setStatus(data.message||'ONLINE ERROR');for(const handler of errorHandlers)handler(data.message||'Online request failed');}
    });
    socket.addEventListener('close',()=>{
      if(attempt!==sequence)return;
      // A socket we already replaced closing is the expected end of a handover.
      if(liveSocket!==socket)return;
      liveSocket=null;session=null;
      clearTimeout(rotateTimer);
      setStatus('RECONNECTING');
      clearTimeout(reconnectTimer);
      // Reconnect promptly: the resume ticket means this costs the player nothing.
      reconnectTimer=setTimeout(()=>{
        if(attempt===sequence&&!liveSocket)connectLive(liveName||name,attempt);
      },400);
    });
    socket.addEventListener('error',()=>{if(liveSocket===socket)setStatus('RECONNECTING');});
  }
  async function startLegacy(name,attempt){
    try{
      const joined=await post('/api/join',{name,appearance:getAppearance(),character:getCharacter?.()||'Atlas',...(getAccountToken?.()?{account:getAccountToken()}:{})});
      if(attempt!==sequence)return;
      session=joined;
      joined.players.forEach(addPeer);
      stream=new EventSource(`/api/events?token=${encodeURIComponent(session.token)}`);
      stream.addEventListener('open',()=>setStatus(`${remote.size+1} ONLINE`));
      stream.addEventListener('snapshot',event=>{const peers=JSON.parse(event.data);const seen=new Set(peers.map(p=>p.id));for(const id of remote.keys())if(!seen.has(id))removePeer(id);peers.forEach(addPeer);setStatus(`${remote.size+1} ONLINE`);});
      stream.addEventListener('joined',event=>{addPeer(JSON.parse(event.data));setStatus(`${remote.size+1} ONLINE`);});
      stream.addEventListener('state',event=>addPeer(JSON.parse(event.data)));
      stream.addEventListener('left',event=>{removePeer(JSON.parse(event.data).id);setStatus(`${remote.size+1} ONLINE`);});
      stream.addEventListener('chat',event=>addChat(JSON.parse(event.data)));
      stream.addEventListener('voice',event=>{const payload=JSON.parse(event.data);notifyVoiceSignal(payload.from,payload.signal);});
      stream.addEventListener('effect',event=>{const payload=JSON.parse(event.data);if(payload.id!==session?.id)notifyEffect(payload);});
      stream.addEventListener('crew',event=>{const payload=JSON.parse(event.data);if(payload.from!==session?.id)notifyCrew(payload);});
      stream.addEventListener('round',event=>notifyRound(JSON.parse(event.data)));
      stream.addEventListener('round-event',event=>notifyRoundEvent(JSON.parse(event.data)));
      stream.addEventListener('ffa',event=>notifyFfa(JSON.parse(event.data)));
      stream.addEventListener('ffa-event',event=>notifyFfaEvent(JSON.parse(event.data)));
      stream.addEventListener('room',event=>notifyRoom(JSON.parse(event.data)));
      stream.addEventListener('rooms',event=>notifyRoomList(JSON.parse(event.data)));
      // The polling transport needs the same eviction notice the socket gets.
      stream.addEventListener('kicked',()=>{notifyRoom(null);kickedHandler?.();});
      stream.addEventListener('progress',event=>{const d=JSON.parse(event.data);for(const handler of progressHandlers)handler(d);});
      stream.addEventListener('room-start',event=>{const payload=JSON.parse(event.data);for(const handler of roomStartHandlers)handler(payload);});
      stream.addEventListener('error',()=>{
        setStatus('RECONNECTING');
        clearTimeout(reconnectTimer);
        reconnectTimer=setTimeout(()=>{if(attempt===sequence&&stream?.readyState!==EventSource.OPEN)start();},5000);
      });
    }catch(error){if(attempt===sequence){setStatus('OFFLINE');const row=document.createElement('p');row.textContent=`Online connection unavailable: ${error.message}`;log.append(row);chatActiveUntil=performance.now()+7000;panel.classList.add('recent');}}
  }
  async function start(forceReconnect=false){
    // Starting/rebuilding the local game scene must not tear down the online
    // identity. In particular, a room-start calls newGame(), and disconnecting
    // here silently removed every participant from the room before play began.
    if(!forceReconnect&&(session||liveSocket))return;
    disconnect({keepIdentity:true});const attempt=sequence;
    const name=(nameInput.value.trim().slice(0,20)||'Player');nameInput.value=name;
    try{localStorage.setItem('districtZeroName',name);}catch{}
    if(localTag)removeSprite(scene,localTag);
    localTag=textSprite(name,{background:'#d59645',color:'#13252a',worldWidth:3.2});scene.add(localTag);
    setStatus('CONNECTING');
    if(liveTransport){liveName=name;connectLive(name,attempt);return;}
    startLegacy(name,attempt);
  }
  // Matchmaking can be opened before the socket's welcome packet arrives.
  // Queue that first room action briefly instead of rejecting a valid click.
  async function waitForSession(timeout=8000){
    const started=performance.now();
    while(!session){
      if(performance.now()-started>=timeout)throw Error('Could not connect to the district');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(liveTransport){
      while(liveSocket?.readyState!==WebSocket.OPEN){
        if(performance.now()-started>=timeout)throw Error('Could not connect to the district');
        await new Promise(resolve=>setTimeout(resolve,50));
      }
    }
  }
  // Deduction lobbies. The dev transport answers over HTTP; the live one
  // replies on the socket, so both paths resolve to the same handlers.
  async function roomAction(action,payload={}){
    await waitForSession();
    if(liveTransport){
      if(liveSocket?.readyState!==WebSocket.OPEN)throw Error('Still connecting to the district');
      liveSocket.send(JSON.stringify({type:'room',action,...payload}));
      return null;
    }
    return post('/api/room',{token:session.token,action,...payload});
  }
  // The host's snapshot of the NPC crew. Fire and forget: a dropped frame just
  // means one more interpolation step, so it is never worth retrying.
  function sendCrew(bots){
    if(!session||!bots?.length)return;
    if(liveTransport){
      if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'crew',bots}));
      return;
    }
    post('/api/crew',{token:session.token,bots}).catch(()=>{});
  }
  // Round actions are authoritative on the server; this only states intent.
  async function roundAction(action,payload={}){
    if(!session)return null;
    if(liveTransport){
      if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'round',action,...payload}));
      return null;
    }
    return post('/api/round',{token:session.token,action,...payload});
  }
  async function ffaAction(action,payload={}){
    if(!session)return null;
    if(liveTransport){if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'ffa',action,...payload}));return null;}
    return post('/api/ffa',{token:session.token,action,...payload});
  }
  async function refreshRooms(){
    await waitForSession();
    if(liveTransport){
      if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'rooms'}));
      return null;
    }
    const list=await (await fetch('/api/rooms')).json();
    notifyRoomList(list);return list;
  }
  // One-off world effects, broadcast to everyone in the district. Unlike the
  // continuous state stream these are rare, so they are sent as they happen.
  function sendEffect(payload){
    if(!session||!payload)return;
    if(liveTransport){
      if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'effect',...payload}));
      return;
    }
    post('/api/effect',{token:session.token,...payload}).catch(()=>{});
  }
  // Point to point signalling for voice chat. The payload is opaque here: the
  // voice system owns its shape, this only addresses and delivers it.
  function sendVoiceSignal(target,signal){
    if(!session||!target||target===session.id)return;
    if(liveTransport){
      if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'voice',target,signal}));
      return;
    }
    post('/api/voice',{token:session.token,target,signal}).catch(error=>console.warn('[Voice] Signal delivery failed',error.message));
  }
  function openChat(){
    if(!isPlaying()||!communicationAllowed)return;
    panel.classList.add('expanded');toggle.setAttribute('aria-expanded','true');form.hidden=false;input.focus();
    if(document.pointerLockElement===canvas)document.exitPointerLock();
  }
  function closeChat(){form.hidden=true;input.blur();panel.classList.remove('expanded');toggle.setAttribute('aria-expanded','false');}
  function handlesKey(event){
    if(document.activeElement===nameInput)return true;
    if(!form.hidden){if(event.code==='Escape'){event.preventDefault();closeChat();}return true;}
    if(communicationAllowed&&isPlaying()&&(event.code===settings.bindings.chat||event.code==='Enter')&&!event.repeat){event.preventDefault();openChat();return true;}
    return false;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const message=input.value.trim();if(!message)return;
    if(!communicationAllowed){input.value='';closeChat();return;}
    input.value='';closeChat();
    if(!session){setStatus('OFFLINE');return;}
    if(liveTransport){if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'chat',message}));return;}
    try{await post('/api/chat',{token:session.token,message});}catch(error){const row=document.createElement('p');row.textContent=error.message;log.append(row);chatActiveUntil=performance.now()+7000;panel.classList.add('recent');}
  });
  nameInput.addEventListener('change',()=>{if(session)start(true);});
  for(const [kind,emoji] of Object.entries(EMOTES)){
    const button=document.createElement('button');button.type='button';button.title=`Mood: ${kind}`;button.setAttribute('aria-label',`Set mood to ${kind}`);button.textContent=emoji;
    button.addEventListener('click',async()=>{
      if(!isPlaying()||!session)return;
      if(localMood)removeSprite(scene,localMood);
      localMood=emojiSprite(emoji);scene.add(localMood);localMoodUntil=Date.now()+8000;localMoodKind=kind;
      if(liveTransport){if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'mood',mood:kind}));return;}
      try{const result=await post('/api/mood',{token:session.token,mood:kind});localMoodUntil=result.moodUntil;}
      catch{removeSprite(scene,localMood);localMood=null;localMoodKind=null;}
    });
    $('mood-picker').append(button);
  }
  toggle.addEventListener('click',()=>form.hidden?openChat():closeChat());
  window.addEventListener('pagehide',()=>{
    // Leaving the page is not leaving the game: keep the ticket so an
    // accidental close can come back to a round still in progress.
    clearInterval(leaseTimer);leaseTimer=null;
    releaseLease();
    disconnect({keepIdentity:true});
  });
  function update(dt){
    if(performance.now()>chatActiveUntil)panel.classList.remove('recent');
    const position=getPlayerPosition();if(!position)return;
    localGhost=position.ghost===true;
    const flightHeight=position.flight&&position.flight!=='jetpack';
    if(localTag)localTag.position.set(position.x,position.y+(flightHeight?5.2:position.inCar?3.7:4.35),position.z);
    if(localBubble){localBubble.position.set(position.x,position.y+(flightHeight?7:position.inCar?6.05:6.7),position.z);if(performance.now()>localBubbleUntil){removeSprite(scene,localBubble);localBubble=null;}}
    if(localMood){localMood.position.set(position.x,position.y+(flightHeight?6.2:position.inCar?4.9:5.5),position.z);if(Date.now()>localMoodUntil){removeSprite(scene,localMood);localMood=null;localMoodKind=null;}}
    for(const [peerId,peer] of remote){
      // Re-checked every frame: the local player may die mid round, at which
      // point the other ghosts should become visible.
      // With a steady heartbeat, silence means the player is gone -- a body left
      // standing is a leftover from a dropped or rotated socket. Hide it rather
      // than leave an idle copy that others can still shoot at.
      peer.stale=performance.now()-peer.lastStateAt>PEER_STALE_MS;
      const downFor=peer.diedAt?performance.now()-peer.diedAt:-1;
      const lingering=downFor>=0&&downFor<PEER_DEATH_LINGER_MS;
      peer.root.visible=(peer.matchAlive!==false||lingering)&&!peer.stale&&(!visiblePeerIds||visiblePeerIds.has(peerId))&&(!peer.ghost||localGhost);
      // Fall over the first third of a second, then lie still.
      const fallen=lingering?Math.min(1,downFor/320):0;
      peer.root.rotation.z=fallen?Math.PI/2*fallen:0;
      peer.root.position.y=lingering?peer.target.y+.45*fallen:peer.root.position.y;
      const since=Math.min(.12,(performance.now()-peer.lastStateAt)/1000);
      scratch.copy(peer.target).addScaledVector(peer.velocity,since);
      // A respawn is a teleport, not a run. Smoothing across it drags the body
      // from where they died toward where they reappeared, so for a second or
      // two everyone else still sees them at the kill site -- and shoots at it.
      // Anything beyond a sprint-second is a jump: put them there immediately.
      if(peer.root.position.distanceTo(peer.target)>TELEPORT_DISTANCE){
        peer.root.position.copy(peer.target);peer.velocity.set(0,0,0);
      }else peer.root.position.lerp(scratch,1-Math.exp(-dt*16));
      // Turn toward the reported heading instead of snapping to it. Heading now
      // follows the aim in Free-for-All, so a fast flick of the mouse used to
      // make the body jump a quarter turn between packets.
      const turn=Math.atan2(Math.sin(peer.heading-peer.root.rotation.y),Math.cos(peer.heading-peer.root.rotation.y));
      peer.root.rotation.y+=turn*(1-Math.exp(-dt*14));
      const fresh=performance.now()-peer.lastStateAt<650;
      const animation=fresh?peer.animation:'Idle';
      animateCharacter?.(peer.body,{
        animation:lingering?'Death':peer.body.visible?animation:'Idle',weapon:peer.weapon,
        // Eased like the heading, so aim reads as a head turn rather than a snap.
        pitch:(peer.shownPitch+=((fresh?peer.pitch:0)-peer.shownPitch)*(1-Math.exp(-dt*14))),
        aiming:fresh&&peer.aiming,reloading:fresh&&peer.reloading,attacking:performance.now()<peer.attackUntil,
        attackArm:peer.attackArm,switchingUntil:peer.switchingUntil
      },dt);
      if(peer.flight==='helicopter')animateAircraft(peer.helicopter,'helicopter',dt);
      if(peer.bubble&&performance.now()>peer.bubbleUntil){removeSprite(peer.root,peer.bubble);peer.bubble=null;}
      if(peer.moodSprite&&Date.now()>peer.moodUntil){removeSprite(peer.root,peer.moodSprite);peer.moodSprite=null;peer.moodKind=null;}
    }
    if(!session)return;
    stateClock-=dt;
    if(liveTransport){
      if(stateClock<=0&&liveSocket?.readyState===WebSocket.OPEN){
        stateClock=.08;
        const appearance=getAppearance();
        const animation=getPlayerAnimation?.()||{};
        const character=getCharacter?.()||'Atlas';
        const identity=JSON.stringify([character,appearance]);
        const fingerprint=JSON.stringify([Math.round(position.x*50),Math.round(position.y*50),Math.round(position.z*50),Math.round(position.h*50),position.inCar,position.flight,position.ghost,identity,animation]);
        const now=performance.now();
        // Appearance and character are a third of every position packet and
        // they almost never change, so they ride the keyframe and any packet
        // that actually changes them -- not all twelve a second.
        const trim=value=>Math.round(value*100)/100;
        const body=()=>{
          const packet={type:'state',...position,...animation,
            x:trim(position.x),y:trim(position.y),z:trim(position.z),h:Math.round(position.h*1000)/1000};
          if(Number.isFinite(packet.pitch))packet.pitch=Math.round(packet.pitch*1000)/1000;
          if(identity!==lastIdentity||keyframesLeft>0){packet.appearance=appearance;packet.character=character;}
          return JSON.stringify(packet);
        };
        // A respawn moves you once and then you may stand still, so the single
        // packet carrying the new position is the only one sent for ten seconds.
        // If it is lost -- or arrives during a socket rotation -- everyone else
        // keeps aiming at the corpse. Resend a few times after a teleport.
        if(keyframesLeft>0){
          keyframesLeft--;
          liveSocket.send(body());
          lastLiveFingerprint=fingerprint;lastIdentity=identity;lastLiveSentAt=now;
        }else if(fingerprint!==lastLiveFingerprint){
          liveSocket.send(body());
          lastLiveFingerprint=fingerprint;lastIdentity=identity;lastLiveSentAt=now;
        }else if(now-lastLiveSentAt>=STATE_HEARTBEAT_MS){
          // Re-send the whole state rather than a bare heartbeat. The server
          // drops heartbeats, so a peer that missed an update -- or was re-added
          // by a socket rotation -- would otherwise stay stale indefinitely
          // while its player stands still. This costs one message per idle
          // player per ten seconds and makes the roster self-correcting. The
          // heartbeat carries identity too, so a peer that missed the keyframe
          // is repaired rather than left looking like somebody else.
          liveSocket.send(JSON.stringify({type:'state',...position,...animation,appearance,character}));
          lastIdentity=identity;lastLiveSentAt=now;
        }
      }
      return;
    }
    if(stateClock<=0&&!stateBusy){
      stateClock=.1;stateBusy=true;
      // Same trimming as the socket path: identity rides the first packet and
      // any packet that changes it, not every one.
      const appearance=getAppearance(),character=getCharacter?.()||'Atlas';
      const identity=JSON.stringify([character,appearance]);
      const trim=value=>Math.round(value*100)/100;
      const packet={token:session.token,...position,...getPlayerAnimation?.(),
        x:trim(position.x),y:trim(position.y),z:trim(position.z),h:Math.round(position.h*1000)/1000};
      if(Number.isFinite(packet.pitch))packet.pitch=Math.round(packet.pitch*1000)/1000;
      if(identity!==lastIdentity){packet.appearance=appearance;packet.character=character;lastIdentity=identity;}
      post('/api/state',packet).catch(()=>{}).finally(()=>{stateBusy=false;});
    }
  }
  function refreshCharacters(){for(const peer of remote.values())if(attachCharacter)attachCharacter(peer.body,peer.character||'Atlas');}
  return {
    start,disconnect,update,handlesKey,isTyping:()=>!form.hidden,closeChat,refreshCharacters,
    // Voice chat integration. These expose the multiplayer layer's own player
    // ids, objects and connection -- voice never keeps a second copy.
    getLocalId:()=>session?.id??null,
    getLocalPosition:()=>getPlayerPosition(),
    // Stale peers are untargetable too: hiding a mesh does not stop a raycast.
    getPeerObject:id=>{
      const peer=remote.get(id);
      // A raycast ignores visibility, so an unreachable body would still be
      // shootable. Refuse to hand out a peer that has gone quiet or is down.
      if(!peer||peer.stale||peer.matchAlive===false)return null;
      return peer.root;
    },
    getPeerName:id=>remote.get(id)?.name??null,
    listPeers:()=>[...remote.entries()].filter(([id])=>!visiblePeerIds||visiblePeerIds.has(id)).map(([id,peer])=>({id,name:peer.name||'Player',object:peer.root})),
    setRoomPeers,setPeerAlive,setCommunicationAllowed,onKicked,
    setNameTagsVisible:visible=>{playerNamesVisible=visible!==false;for(const peer of remote.values())peer.nameTag.visible=playerNamesVisible;},
    onProgress:handler=>progressHandlers.push(handler),
    // Call after teleporting the local player so peers are told promptly.
    keyframe:(count=6)=>{keyframesLeft=Math.max(keyframesLeft,count);},
    sendVoiceSignal,setSpeaking,sendEffect,roomAction,refreshRooms,roundAction,ffaAction,sendCrew,
    onCrew:handler=>crewHandlers.push(handler),
    onRound:handler=>roundHandlers.push(handler),
    onRoundEvent:handler=>roundEventHandlers.push(handler),
    onFfa:handler=>ffaHandlers.push(handler),
    onFfaEvent:handler=>ffaEventHandlers.push(handler),
    onRoom:handler=>roomHandlers.push(handler),
    onRoomList:handler=>roomListHandlers.push(handler),
    onRoomStart:handler=>roomStartHandlers.push(handler),
    onError:handler=>errorHandlers.push(handler),
    // Renders a line in the chat log without sending it anywhere. Used by the
    // deduction bots, which are simulated locally on each client.
    postLocalChat:(name,message)=>addChat({id:null,name,message}),
    onEffect:handler=>effectHandlers.push(handler),
    onVoiceSignal:handler=>voiceSignalHandlers.push(handler),
    onPeerLeave:handler=>peerLeaveHandlers.push(handler),
    onSessionEnd:handler=>sessionEndHandlers.push(handler)
  };
}

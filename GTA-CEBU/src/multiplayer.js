import { WORLD } from './map-config.js';
import * as THREE from 'three';
import { EMOTES, normalizeAppearance } from './appearance.js';
import { settings } from './settings.js';
import { createJetpackMesh, createAircraftMesh, animateAircraft } from './flight.js';

const $=id=>document.getElementById(id);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function textSprite(text,{background='#10242b',color='#ffffff',width=512,height=100,worldWidth=4.8}={}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=background;ctx.beginPath();ctx.roundRect(4,4,width-8,height-8,18);ctx.fill();
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  const lines=[];let remaining=text;
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

export function createMultiplayer({scene,avatar,applyAppearance,attachCharacter,attachWeapon,animateCharacter,carMesh,getPlayerPosition,getPlayerAnimation,getAppearance,getCharacter,canvas,isPlaying}){
  const liveTransport=import.meta.env.PROD&&!['localhost','127.0.0.1'].includes(window.location.hostname);
  const nameInput=$('player-name'),status=$('online-status'),log=$('chat-log'),form=$('chat-form'),input=$('chat-input'),panel=document.querySelector('.social-panel'),toggle=$('chat-toggle');
  const remote=new Map();
  const voiceSignalHandlers=[],peerLeaveHandlers=[],sessionEndHandlers=[];
  const notifyVoiceSignal=(from,signal)=>{for(const handler of voiceSignalHandlers)handler(from,signal);};
  const notifyPeerLeave=id=>{for(const handler of peerLeaveHandlers)handler(id);};
  const notifySessionEnd=()=>{for(const handler of sessionEndHandlers)handler();};
  let session=null,stream=null,liveSocket=null,localTag=null,localBubble=null,localBubbleUntil=0,localMood=null,localMoodUntil=0,localMoodKind=null,sequence=0,stateClock=0,stateBusy=false,reconnectTimer=null,lastLiveFingerprint='',lastLiveSentAt=0,chatActiveUntil=0,rotateTimer=null,liveName='';
  // Vercel kills the function holding a WebSocket after about 60s, so the live
  // transport reconnects constantly. These keep that invisible: the player
  // resumes the same identity, and a fresh socket is opened before the old one
  // dies so there is no gap. Session scoped, so two tabs stay two players.
  const ROTATE_AFTER_MS=45000;
  let identity=null;
  try{identity=JSON.parse(sessionStorage.getItem('districtZeroIdentity')||'null');}catch{}
  function rememberIdentity(value){
    identity=value;
    try{sessionStorage.setItem('districtZeroIdentity',JSON.stringify(value));}catch{}
  }
  function forgetIdentity(){
    identity=null;
    try{sessionStorage.removeItem('districtZeroIdentity');}catch{}
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
  function disconnect(){
    sequence++;clearTimeout(reconnectTimer);clearTimeout(rotateTimer);lastLiveFingerprint='';lastLiveSentAt=0;
    forgetIdentity();
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
      body.add(jetpack);root.add(body,vehicle,jet,helicopter);const nameTag=textSprite(data.name,{background:'#284d58',worldWidth:3.2});nameTag.position.y=4.35;root.add(nameTag);
      peer={root,body,vehicle,jet,helicopter,jetpack,nameTag,name:data.name,voiceSprite:null,speaking:false,bubble:null,bubbleUntil:0,moodSprite:null,moodKind:null,moodUntil:0,appearanceKey:'',target:new THREE.Vector3(),previousTarget:new THREE.Vector3(),velocity:new THREE.Vector3(),lastStateAt:performance.now(),heading:0,flight:null,animation:'Idle',weapon:'pistol',aiming:false,attacking:false,attackArm:0,attackUntil:0};
      remote.set(data.id,peer);scene.add(root);root.position.set(data.x||0,data.y||0,data.z||0);
      peer.target.copy(root.position);peer.previousTarget.copy(root.position);
    }
    if(attachCharacter)attachCharacter(peer.body,data.character||'Henry');
    const look=normalizeAppearance(data.appearance),appearanceKey=JSON.stringify(look);
    if(peer.appearanceKey!==appearanceKey){applyAppearance(peer.body,look);peer.appearanceKey=appearanceKey;}
    peer.character=data.character||'Henry';peer.name=data.name||peer.name;
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
    peer.weapon=data.weapon==='fists'?'fists':'pistol';
    peer.aiming=data.aiming===true;
    peer.attackArm=data.attackArm===1?1:0;
    if(data.attacking===true)peer.attackUntil=now+(peer.weapon==='fists'?330:180);
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
    const row=document.createElement('p'),who=document.createElement('strong');
    who.textContent=`${data.name}: `;row.append(who,document.createTextNode(data.message));log.append(row);
    while(log.children.length>24)log.firstChild.remove();log.scrollTop=log.scrollHeight;
    chatActiveUntil=performance.now()+7000;panel.classList.add('recent');
    showBubble(data.id,data.message);
  }
  async function post(path,body){
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Connection failed');return data;
  }
  function connectLive(name,attempt){
    const scheme=location.protocol==='https:'?'wss:':'ws:';
    const socket=new WebSocket(`${scheme}//${location.host}/api/ws`);
    // `replacing` is the socket this one is taking over from. It stays live and
    // in charge until this socket is welcomed, so play never pauses.
    const replacing=liveSocket;
    const takingOver=Boolean(replacing);
    if(!takingOver)liveSocket=socket;
    socket.addEventListener('open',()=>{
      if(attempt!==sequence){socket.close();return;}
      socket.send(JSON.stringify({
        type:'join',name,appearance:getAppearance(),character:getCharacter?.()||'Henry',
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
      else if(packet.type==='chat')addChat(data);
      else if(packet.type==='voice')notifyVoiceSignal(data.from,data.signal);
      else if(packet.type==='error')setStatus(data.message||'ONLINE ERROR');
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
      const joined=await post('/api/join',{name,appearance:getAppearance(),character:getCharacter?.()||'Henry'});
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
      stream.addEventListener('error',()=>{
        setStatus('RECONNECTING');
        clearTimeout(reconnectTimer);
        reconnectTimer=setTimeout(()=>{if(attempt===sequence&&stream?.readyState!==EventSource.OPEN)start();},5000);
      });
    }catch(error){if(attempt===sequence){setStatus('OFFLINE');const row=document.createElement('p');row.textContent=`Online connection unavailable: ${error.message}`;log.append(row);chatActiveUntil=performance.now()+7000;panel.classList.add('recent');}}
  }
  async function start(){
    disconnect();const attempt=sequence;
    const name=(nameInput.value.trim().slice(0,20)||'Player');nameInput.value=name;
    try{localStorage.setItem('districtZeroName',name);}catch{}
    if(localTag)removeSprite(scene,localTag);
    localTag=textSprite(name,{background:'#d59645',color:'#13252a',worldWidth:3.2});scene.add(localTag);
    setStatus('CONNECTING');
    if(liveTransport){liveName=name;connectLive(name,attempt);return;}
    startLegacy(name,attempt);
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
    if(!isPlaying())return;
    panel.classList.add('expanded');toggle.setAttribute('aria-expanded','true');form.hidden=false;input.focus();
    if(document.pointerLockElement===canvas)document.exitPointerLock();
  }
  function closeChat(){form.hidden=true;input.blur();panel.classList.remove('expanded');toggle.setAttribute('aria-expanded','false');}
  function handlesKey(event){
    if(document.activeElement===nameInput)return true;
    if(!form.hidden){if(event.code==='Escape'){event.preventDefault();closeChat();}return true;}
    if(isPlaying()&&(event.code===settings.bindings.chat||event.code==='Enter')&&!event.repeat){event.preventDefault();openChat();return true;}
    return false;
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const message=input.value.trim();if(!message)return;
    input.value='';closeChat();
    if(!session){setStatus('OFFLINE');return;}
    if(liveTransport){if(liveSocket?.readyState===WebSocket.OPEN)liveSocket.send(JSON.stringify({type:'chat',message}));return;}
    try{await post('/api/chat',{token:session.token,message});}catch(error){const row=document.createElement('p');row.textContent=error.message;log.append(row);chatActiveUntil=performance.now()+7000;panel.classList.add('recent');}
  });
  nameInput.addEventListener('change',()=>{if(session)start();});
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
  window.addEventListener('pagehide',()=>disconnect());
  function update(dt){
    if(performance.now()>chatActiveUntil)panel.classList.remove('recent');
    const position=getPlayerPosition();if(!position)return;
    const flightHeight=position.flight&&position.flight!=='jetpack';
    if(localTag)localTag.position.set(position.x,position.y+(flightHeight?5.2:position.inCar?3.7:4.35),position.z);
    if(localBubble){localBubble.position.set(position.x,position.y+(flightHeight?7:position.inCar?6.05:6.7),position.z);if(performance.now()>localBubbleUntil){removeSprite(scene,localBubble);localBubble=null;}}
    if(localMood){localMood.position.set(position.x,position.y+(flightHeight?6.2:position.inCar?4.9:5.5),position.z);if(Date.now()>localMoodUntil){removeSprite(scene,localMood);localMood=null;localMoodKind=null;}}
    for(const peer of remote.values()){
      const since=Math.min(.12,(performance.now()-peer.lastStateAt)/1000),predicted=peer.target.clone().addScaledVector(peer.velocity,since);
      peer.root.position.lerp(predicted,1-Math.exp(-dt*16));peer.root.rotation.y=peer.heading;
      const fresh=performance.now()-peer.lastStateAt<650;
      const animation=fresh?peer.animation:'Idle';
      animateCharacter?.(peer.body,{
        animation:peer.body.visible?animation:'Idle',weapon:peer.weapon,
        aiming:fresh&&peer.aiming,attacking:performance.now()<peer.attackUntil,
        attackArm:peer.attackArm
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
        const fingerprint=JSON.stringify([Math.round(position.x*50),Math.round(position.y*50),Math.round(position.z*50),Math.round(position.h*50),position.inCar,position.flight,getCharacter?.()||'Henry',appearance,animation]);
        const now=performance.now();
        if(fingerprint!==lastLiveFingerprint){
          liveSocket.send(JSON.stringify({type:'state',...position,...animation,appearance,character:getCharacter?.()||'Henry'}));
          lastLiveFingerprint=fingerprint;lastLiveSentAt=now;
        }else if(now-lastLiveSentAt>=10000){
          liveSocket.send(JSON.stringify({type:'heartbeat'}));lastLiveSentAt=now;
        }
      }
      return;
    }
    if(stateClock<=0&&!stateBusy){
      stateClock=.1;stateBusy=true;
      post('/api/state',{token:session.token,...position,...getPlayerAnimation?.(),appearance:getAppearance(),character:getCharacter?.()||'Henry'}).catch(()=>{}).finally(()=>{stateBusy=false;});
    }
  }
  function refreshCharacters(){for(const peer of remote.values())if(attachCharacter)attachCharacter(peer.body,peer.character||'Henry');}
  return {
    start,disconnect,update,handlesKey,isTyping:()=>!form.hidden,closeChat,refreshCharacters,
    // Voice chat integration. These expose the multiplayer layer's own player
    // ids, objects and connection -- voice never keeps a second copy.
    getLocalId:()=>session?.id??null,
    getLocalPosition:()=>getPlayerPosition(),
    getPeerObject:id=>remote.get(id)?.root??null,
    getPeerName:id=>remote.get(id)?.name??null,
    listPeers:()=>[...remote.entries()].map(([id,peer])=>({id,name:peer.name||'Player',object:peer.root})),
    sendVoiceSignal,setSpeaking,
    onVoiceSignal:handler=>voiceSignalHandlers.push(handler),
    onPeerLeave:handler=>peerLeaveHandlers.push(handler),
    onSessionEnd:handler=>sessionEndHandlers.push(handler)
  };
}

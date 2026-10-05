import { VoicePeer } from './VoicePeer.js';
import { ProximityVoice } from './ProximityVoice.js';
import { VoiceActivityDetector } from './VoiceActivityDetector.js';
import { VoiceHUD } from './VoiceHUD.js';
import {
  VOICE_PTT_CODE,
  VOICE_PTT_LABEL,
  VOICE_OPEN_MIC_CODE,
  VOICE_MEDIA_CONSTRAINTS,
  VOICE_PEER_CONNECT_DISTANCE,
  VOICE_PEER_RELEASE_DISTANCE,
  VOICE_LEVEL_INTERVAL,
  VOICE_TOPOLOGY_INTERVAL,
  VOICE_STORAGE_KEY,
  VOICE_RETRY_BACKOFF_MS,
  VOICE_RETRY_SOON_MS,
  VOICE_LOG_PREFIX,
  resolveIceServers,
  iceServersExpired
} from './voiceConfig.js';

const log = (...parts) => console.debug(VOICE_LOG_PREFIX, ...parts);
const warn = (...parts) => console.warn(VOICE_LOG_PREFIX, ...parts);

function micErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone blocked in browser settings';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone found';
    case 'NotReadableError':
      return 'Microphone is in use by another app';
    default:
      return error?.message ? `Microphone error: ${error.message}` : 'Microphone unavailable';
  }
}

function typingSomewhere() {
  const active = document.activeElement;
  if (!active) return false;
  if (active.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
}

// Owns the whole voice feature: microphone, peers, push to talk, mute state,
// and teardown. Game code only constructs one of these and calls update().
export class VoiceChatManager {
  constructor({ network, camera, getAudioContext, isEnteringCheat, isRebinding, notify }) {
    this.network = network;
    this.camera = camera;
    this.getAudioContext = getAudioContext;
    this.isEnteringCheat = isEnteringCheat ?? (() => false);
    this.isRebinding = isRebinding ?? (() => false);
    this.notify = notify ?? (() => {});

    this.enabled = false;
    this.starting = false;
    this.selfMuted = false;
    this.talking = false;
    this.openMic = false;
    this.openMicRequested = false;
    this.pttHeld = false;
    this.suspended = document.hidden;
    this.micStream = null;
    this.micTrack = null;
    this.localDetector = null;
    this.proximity = null;
    this.peers = new Map();       // playerId -> VoicePeer
    this.pendingStreams = new Map(); // streams received before an avatar exists
    this.detectors = new Map();   // playerId -> VoiceActivityDetector
    this.speaking = new Set();    // playerIds currently heard speaking
    this.retryAfter = new Map();  // playerId -> timestamp, after a failed connection
    this.ice = null;              // resolved ICE servers, refreshed before expiry
    this.mutedPlayers = this.loadMuted();
    this.levelClock = 0;
    this.topologyClock = 0;
    this.rosterDirty = true;
    this.communicationAllowed = true;

    this.hud = new VoiceHUD({
      onEnable: () => void this.enable(),
      onToggleSelfMute: () => this.setSelfMuted(!this.selfMuted),
      onToggleOpenMic: () => this.toggleOpenMic(),
      onToggleMute: id => this.toggleMuted(id)
    });

    // Bound once, in one place, so push to talk can never register twice.
    this.onKeyDown = event => this.handleKeyDown(event);
    this.onKeyUp = event => this.handleKeyUp(event);
    this.onBlur = () => { this.suspended = true; this.pttHeld = false; this.syncTransmission(); };
    this.onFocus = () => { this.suspended = document.hidden; this.syncTransmission(); };
    this.onVisibility = () => { this.suspended = document.hidden || !document.hasFocus(); if (document.hidden) this.pttHeld = false; this.syncTransmission(); };
    this.onPageHide = () => this.shutdown();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);

    // Signalling arrives on the multiplayer connection that is already open.
    network.onVoiceSignal((fromId, payload) => void this.handleSignal(fromId, payload));
    network.onPeerLeave(id => this.releasePeer(id, 'left the district'));
    network.onSessionEnd(() => this.releaseAllPeers());
  }

  // ---------------------------------------------------------------- mute state

  loadMuted() {
    try {
      const stored = JSON.parse(localStorage.getItem(VOICE_STORAGE_KEY) || '{}');
      return stored && typeof stored === 'object' ? stored : {};
    } catch {
      return {};
    }
  }

  saveMuted() {
    try {
      // Keep only active mutes, newest last, so the record cannot grow without
      // bound across sessions.
      const entries = Object.entries(this.mutedPlayers).filter(([, muted]) => muted === true);
      this.mutedPlayers = Object.fromEntries(entries.slice(-200));
      localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(this.mutedPlayers));
    } catch {}
  }

  isMuted(playerId) {
    return this.mutedPlayers[playerId] === true;
  }

  toggleMuted(playerId) {
    this.setMuted(playerId, !this.isMuted(playerId));
  }

  // Muting only silences that player's audio. The peer connection, their
  // avatar, and all game state synchronisation are untouched.
  setMuted(playerId, muted) {
    this.mutedPlayers[playerId] = muted;
    if (!muted) delete this.mutedPlayers[playerId];
    this.saveMuted();
    this.proximity?.setMuted(playerId, muted);
    if (muted) {
      this.speaking.delete(playerId);
      this.detectors.get(playerId)?.reset();
      this.network.setSpeaking(playerId, false);
    }
    this.rosterDirty = true;
    const name = this.network.getPeerName(playerId) || 'Player';
    this.notify(`${muted ? 'Muted' : 'Unmuted'} ${name}`);
  }

  setSelfMuted(muted) {
    if (!this.enabled) return;
    this.selfMuted = muted;
    this.syncTransmission();
  }

  setCommunicationAllowed(allowed) {
    this.communicationAllowed = allowed !== false;
    if (!this.communicationAllowed) {
      this.pttHeld = false;
      this.openMic = false;
      this.openMicRequested = false;
      this.hud.setOpenMic(false);
    }
    this.syncTransmission();
  }

  toggleOpenMic() {
    if (!this.enabled) {
      this.openMicRequested = !this.openMicRequested;
      if (this.openMicRequested) void this.enable();
      return;
    }
    this.openMic = !this.openMic;
    if (this.openMic) this.selfMuted = false;
    this.hud.setOpenMic(this.openMic);
    this.syncTransmission();
    this.notify(this.openMic ? 'Open mic on · nearby players can hear you' : `Open mic off · hold ${VOICE_PTT_LABEL} to talk`);
  }

  // ----------------------------------------------------------- microphone

  async enable() {
    if (!this.communicationAllowed) return;
    if (this.enabled || this.starting) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection !== 'function') {
      // Also the path for an insecure origin, where mediaDevices is absent.
      const insecure = !window.isSecureContext;
      this.hud.setState('unavailable', insecure
        ? 'Voice needs HTTPS or localhost'
        : 'Browser does not support voice chat');
      warn('Voice chat unsupported in this browser or context');
      return;
    }

    this.starting = true;
    this.hud.setState('connecting');
    // Fetch relay credentials while the player is still looking at the
    // permission prompt, rather than adding a round trip after it.
    const icePending = resolveIceServers();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(VOICE_MEDIA_CONSTRAINTS);
    } catch (error) {
      this.starting = false;
      this.openMicRequested = false;
      icePending.catch(() => {});
      const message = micErrorMessage(error);
      this.hud.setState('unavailable', message);
      this.notify(`Voice chat off · ${message}`);
      warn('Microphone request failed', error);
      return;   // The game keeps running exactly as before.
    }

    this.starting = false;
    this.micStream = stream;
    this.micTrack = stream.getAudioTracks()[0] ?? null;
    if (!this.micTrack) {
      this.openMicRequested = false;
      this.hud.setState('unavailable', 'No microphone track available');
      this.stopMicStream();
      return;
    }
    // Push to talk starts closed: nothing is captured until V is held.
    this.micTrack.enabled = false;
    this.micTrack.addEventListener('ended', () => {
      warn('Microphone track ended');
      this.shutdown('Microphone disconnected');
    });

    this.ice = await icePending;

    const audioContext = this.getAudioContext?.() ?? null;
    this.proximity = new ProximityVoice({ camera: this.camera, audioContext });
    this.proximity.resume();
    try {
      this.localDetector = new VoiceActivityDetector(this.proximity.audioContext, stream);
    } catch {
      this.localDetector = null;
    }

    this.enabled = true;
    if (this.openMicRequested) {
      this.openMic = true;
      this.openMicRequested = false;
      this.hud.setOpenMic(true);
      this.syncTransmission();
    }
    this.refreshStatus();
    this.notify(this.openMic ? 'Open mic on · nearby players can hear you' : `Voice chat ready · hold ${VOICE_PTT_LABEL} to talk`);
    log('Microphone initialized · ICE from', this.ice.description);
    this.topologyClock = 0;

    // Tell everyone already nearby that this player can now talk. Without it,
    // whoever enabled voice first would sit on an offer this player dropped
    // while the microphone was still being granted.
    for (const peer of this.network.listPeers()) {
      this.network.sendVoiceSignal(peer.id, { type: 'voice:ready' });
    }
  }

  stopMicStream() {
    for (const track of this.micStream?.getTracks() ?? []) {
      try { track.stop(); } catch {}
    }
    this.micStream = null;
    this.micTrack = null;
  }

  // ------------------------------------------------------------ push to talk

  handleKeyDown(event) {
    if (!this.communicationAllowed) return;
    if (event.code === VOICE_OPEN_MIC_CODE) {
      if (typingSomewhere() || this.network.isTyping() || this.isEnteringCheat() || this.isRebinding()) return;
      event.preventDefault();
      if (!event.repeat) this.toggleOpenMic();
      return;
    }
    if (event.code !== VOICE_PTT_CODE || event.repeat) return;
    if (typingSomewhere() || this.network.isTyping()) return;
    if (!this.enabled || this.selfMuted) return;
    this.pttHeld = true;
    this.syncTransmission();
  }

  handleKeyUp(event) {
    if (event.code !== VOICE_PTT_CODE) return;
    this.pttHeld = false;
    this.syncTransmission();
  }

  syncTransmission() {
    const shouldTransmit = !!(this.communicationAllowed && this.enabled && this.micTrack && !this.selfMuted && !this.suspended && (this.openMic || this.pttHeld));
    if (this.talking === shouldTransmit) { this.refreshStatus(); return; }
    this.talking = shouldTransmit;
    if (this.micTrack) this.micTrack.enabled = shouldTransmit;
    if (shouldTransmit) this.proximity?.resume();
    else this.localDetector?.reset();
    for (const peer of this.peers.values()) void peer.setTransmitting(shouldTransmit);
    this.refreshStatus();
  }

  refreshStatus() {
    if (!this.enabled) return;
    if (this.selfMuted) this.hud.setState('muted');
    else if (this.openMic) this.hud.setState('open');
    else if (this.talking) this.hud.setState('talking');
    else this.hud.setState('ready');
  }

  // --------------------------------------------------------------- peers

  createPeer(remoteId) {
    const localId = this.network.getLocalId();
    if (!localId || !this.micTrack || remoteId === localId) return null;
    let peer = this.peers.get(remoteId);
    if (peer) return peer;
    const blockedUntil = this.retryAfter.get(remoteId) ?? 0;
    if (blockedUntil > Date.now()) return null;
    peer = new VoicePeer({
      localId,
      remoteId,
      micTrack: this.micTrack,
      iceServers: this.ice?.iceServers,
      sendSignal: (target, payload) => this.network.sendVoiceSignal(target, payload),
      onStream: stream => this.bindRemoteStream(remoteId, stream),
      onClose: id => {
        // A peer that could not be reached is usually one who has not enabled
        // voice; wait before trying again rather than reconnecting in a loop.
        if (this.peers.get(id)?.failed) this.retryAfter.set(id, Date.now() + VOICE_RETRY_BACKOFF_MS);
        this.releasePeer(id);
      },
      onState: state => {
        if (state === 'connected') log(`Peer connected: ${remoteId}`);
        this.rosterDirty = true;
      }
    });
    this.peers.set(remoteId, peer);
    if (this.talking) void peer.setTransmitting(true);
    this.rosterDirty = true;
    log(`Peer created: ${remoteId}`);
    return peer;
  }

  bindRemoteStream(remoteId, stream) {
    this.pendingStreams.set(remoteId, stream);
    const anchor = this.network.getPeerObject(remoteId);
    if (!anchor || !this.proximity) return;
    const voice = this.proximity.attach(remoteId, stream, anchor, { muted: this.isMuted(remoteId) });
    if (!voice) return;
    this.pendingStreams.delete(remoteId);
    this.detectors.get(remoteId)?.dispose();
    try {
      this.detectors.set(remoteId, new VoiceActivityDetector(this.proximity.audioContext, stream));
    } catch {}
    this.rosterDirty = true;
  }

  releasePeer(remoteId, reason = '') {
    const peer = this.peers.get(remoteId);
    if (peer) {
      this.peers.delete(remoteId);
      peer.close();
    }
    this.pendingStreams.delete(remoteId);
    this.detectors.get(remoteId)?.dispose();
    this.detectors.delete(remoteId);
    this.proximity?.detach(remoteId);
    if (this.speaking.delete(remoteId)) this.network.setSpeaking(remoteId, false);
    this.rosterDirty = true;
    if (peer) log(`Peer disconnected: ${remoteId}${reason ? ` (${reason})` : ''}`);
  }

  releaseAllPeers() {
    this.retryAfter.clear();
    for (const remoteId of [...this.peers.keys()]) this.releasePeer(remoteId);
    for (const remoteId of [...this.detectors.keys()]) this.releasePeer(remoteId);
    this.hud.clearRoster();
  }

  async handleSignal(fromId, payload) {
    if (!fromId || !payload) return;

    if (!this.enabled) {
      // Say so rather than staying silent, so the caller tears down its
      // half-open connection instead of waiting for an answer forever.
      if (payload.type === 'voice:offer') {
        this.network.sendVoiceSignal(fromId, { type: 'voice:unavailable' });
      }
      return;
    }

    if (payload.type === 'voice:ready') {
      // They just turned voice on. Drop any handshake that was started while
      // they could not answer, and let the next sweep reconnect by distance.
      this.retryAfter.delete(fromId);
      const existing = this.peers.get(fromId);
      if (existing && !existing.everConnected) this.releasePeer(fromId, 'peer enabled voice');
      this.topologyClock = 0;
      return;
    }

    if (payload.type === 'voice:unavailable') {
      this.releasePeer(fromId, 'peer has voice disabled');
      this.retryAfter.set(fromId, Date.now() + VOICE_RETRY_BACKOFF_MS);
      return;
    }

    // An inbound offer from a peer we have not reached yet is a valid way to
    // learn about them, so create the connection on demand.
    const peer = this.peers.get(fromId)
      ?? (payload.type === 'voice:offer' ? this.createPeer(fromId) : null);
    if (!peer) return;
    await peer.handleSignal(payload);
  }

  // --------------------------------------------------------------- update

  // Called once per rendered frame but does real work only on its own clocks.
  // Positional audio itself needs nothing here: the scene graph moves it.
  update(dt) {
    if (!this.enabled) return;

    this.topologyClock -= dt;
    if (this.topologyClock <= 0) {
      this.topologyClock = VOICE_TOPOLOGY_INTERVAL;
      // Short-lived relay credentials: renew before they lapse, so a peer
      // created later in a long session still gets a usable relay.
      if (iceServersExpired()) {
        resolveIceServers({ force: true })
          .then(ice => { this.ice = ice; log('Relay credentials renewed'); })
          .catch(() => {});
      }
      this.syncTopology();
    }

    this.levelClock -= dt;
    if (this.levelClock <= 0) {
      this.levelClock = VOICE_LEVEL_INTERVAL;
      this.sampleLevels();
    }

    if (this.rosterDirty) {
      this.rosterDirty = false;
      this.hud.syncRoster(this.network.listPeers().map(peer => ({
        id: peer.id,
        name: peer.name,
        muted: this.isMuted(peer.id),
        speaking: this.speaking.has(peer.id),
        connected: this.peers.get(peer.id)?.pc.connectionState === 'connected'
      })));
    }
  }

  // Hold connections only for players close enough to be heard, with
  // hysteresis between the connect and release radii.
  syncTopology() {
    const localId = this.network.getLocalId();
    const here = this.network.getLocalPosition();
    if (!localId || !here) {
      if (this.peers.size) this.releaseAllPeers();
      return;
    }
    const live = new Set();
    for (const peer of this.network.listPeers()) {
      live.add(peer.id);
      const anchor = peer.object;
      if (!anchor) continue;
      const pendingStream = this.pendingStreams.get(peer.id);
      if (pendingStream && this.proximity && !this.proximity.has(peer.id)) {
        this.bindRemoteStream(peer.id, pendingStream);
      }
      const distance = Math.hypot(
        anchor.position.x - here.x,
        anchor.position.y - here.y,
        anchor.position.z - here.z
      );
      const connection = this.peers.get(peer.id);
      if (connection?.stalled) {
        // A handshake that never completed: rebuild it shortly rather than
        // leaving a connection stuck waiting on an answer that never arrives.
        this.releasePeer(peer.id, 'negotiation timed out');
        this.retryAfter.set(peer.id, Date.now() + VOICE_RETRY_SOON_MS);
      }
      else if (!connection && distance <= VOICE_PEER_CONNECT_DISTANCE) this.createPeer(peer.id);
      else if (connection && distance > VOICE_PEER_RELEASE_DISTANCE) this.releasePeer(peer.id, 'out of range');
      else if (connection && this.proximity?.has(peer.id)) this.proximity.reanchor(peer.id, anchor);
    }
    // Anyone the multiplayer layer no longer lists has gone.
    for (const remoteId of [...this.peers.keys()]) {
      if (!live.has(remoteId)) this.releasePeer(remoteId, 'no longer present');
    }
    for (const remoteId of [...this.retryAfter.keys()]) {
      if (!live.has(remoteId)) this.retryAfter.delete(remoteId);
    }
    this.rosterDirty = true;
  }

  sampleLevels() {
    const now = performance.now();
    if (this.localDetector && this.talking) this.localDetector.sample(now);
    for (const [remoteId, detector] of this.detectors) {
      if (this.isMuted(remoteId)) continue;
      if (!detector.sample(now)) continue;
      // Only actual incoming audio flips the indicator, never the mere
      // existence of a peer connection.
      if (detector.speaking) this.speaking.add(remoteId);
      else this.speaking.delete(remoteId);
      this.network.setSpeaking(remoteId, detector.speaking);
      this.rosterDirty = true;
    }
  }

  // --------------------------------------------------------------- teardown

  shutdown(message = '') {
    const wasEnabled = this.enabled;
    this.enabled = false;
    this.openMic = false;
    this.openMicRequested = false;
    this.pttHeld = false;
    this.syncTransmission();
    this.hud.setOpenMic(false);
    this.releaseAllPeers();
    this.localDetector?.dispose();
    this.localDetector = null;
    this.proximity?.dispose();
    this.proximity = null;
    this.stopMicStream();
    this.selfMuted = false;
    this.talking = false;
    if (message) {
      this.hud.setState('unavailable', message);
      if (wasEnabled) this.notify(`Voice chat off · ${message}`);
    } else {
      this.hud.setState('off');
    }
    if (wasEnabled) log('Voice chat shut down');
  }

  dispose() {
    this.shutdown();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
  }
}

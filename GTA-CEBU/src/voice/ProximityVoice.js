import * as THREE from 'three';
import {
  VOICE_MIN_DISTANCE,
  VOICE_MAX_DISTANCE,
  VOICE_LOG_PREFIX
} from './voiceConfig.js';

const HEAD_HEIGHT = 1.7;

// Three.js spatialisation for remote voices.
//
// Exactly one AudioListener exists and it lives on the active game camera, so
// left/right/behind all follow the camera the player is already looking
// through. Each remote voice is a PositionalAudio parented to that player's
// existing multiplayer Object3D -- the scene graph moves it, so there is no
// per-frame position maths here and no second copy of player positions.
export class ProximityVoice {
  constructor({ camera, audioContext }) {
    // Share the game's existing AudioContext so engine audio and voice run on
    // one clock. Must happen before the listener is constructed.
    if (audioContext) {
      try { THREE.AudioContext.setContext(audioContext); } catch {}
    }
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.context = this.listener.context;
    this.voices = new Map();
  }

  get audioContext() {
    return this.context;
  }

  resume() {
    if (this.context?.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
  }

  // `anchor` is the remote player's Object3D from the multiplayer registry.
  attach(playerId, stream, anchor, { muted = false } = {}) {
    if (!anchor) return null;
    this.detach(playerId);
    let audio;
    try {
      audio = new THREE.PositionalAudio(this.listener);
      audio.setMediaStreamSource(stream);
    } catch (error) {
      console.warn(`${VOICE_LOG_PREFIX} Positional audio unavailable: ${playerId}`, error);
      return null;
    }
    // Linear rolloff: full volume to VOICE_MIN_DISTANCE, a smooth ramp to
    // VOICE_MAX_DISTANCE, silence beyond. No stepped volume levels.
    audio.setDistanceModel('linear');
    audio.setRefDistance(VOICE_MIN_DISTANCE);
    audio.setMaxDistance(VOICE_MAX_DISTANCE);
    audio.setRolloffFactor(1);
    audio.setVolume(muted ? 0 : 1);
    audio.position.y = HEAD_HEIGHT;
    anchor.add(audio);

    // Chromium only pulls samples from a remote MediaStream once it is also
    // bound to a media element. The element stays muted; all audible output
    // comes from the Web Audio graph above.
    const sink = new Audio();
    sink.srcObject = stream;
    sink.muted = true;
    sink.autoplay = true;
    sink.play?.().catch(() => {});

    const voice = { audio, anchor, sink, stream, muted };
    this.voices.set(playerId, voice);
    return voice;
  }

  // Re-parent an existing voice, for a player whose Object3D was rebuilt.
  reanchor(playerId, anchor) {
    const voice = this.voices.get(playerId);
    if (!voice || !anchor || voice.anchor === anchor) return;
    try { voice.anchor.remove(voice.audio); } catch {}
    anchor.add(voice.audio);
    voice.anchor = anchor;
  }

  setMuted(playerId, muted) {
    const voice = this.voices.get(playerId);
    if (!voice) return;
    voice.muted = muted;
    voice.audio.setVolume(muted ? 0 : 1);
  }

  has(playerId) {
    return this.voices.has(playerId);
  }

  getStream(playerId) {
    return this.voices.get(playerId)?.stream ?? null;
  }

  // Straight-line distance from the listener to a remote voice, used only for
  // HUD readouts. The audible attenuation is the PannerNode's own.
  distanceTo(playerId) {
    const voice = this.voices.get(playerId);
    if (!voice) return Infinity;
    const here = new THREE.Vector3();
    const there = new THREE.Vector3();
    this.listener.getWorldPosition(here);
    voice.audio.getWorldPosition(there);
    return here.distanceTo(there);
  }

  detach(playerId) {
    const voice = this.voices.get(playerId);
    if (!voice) return;
    this.voices.delete(playerId);
    try { voice.audio.disconnect(); } catch {}
    try { voice.anchor?.remove(voice.audio); } catch {}
    try {
      voice.sink.pause();
      voice.sink.srcObject = null;
    } catch {}
  }

  dispose() {
    for (const playerId of [...this.voices.keys()]) this.detach(playerId);
    try { this.listener.parent?.remove(this.listener); } catch {}
  }
}

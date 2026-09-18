import { RTC_BASE_CONFIG, VOICE_LOG_PREFIX, VOICE_NEGOTIATION_TIMEOUT_MS } from './voiceConfig.js';

// One remote player's RTCPeerConnection.
//
// Uses the "perfect negotiation" pattern so that both sides can start at the
// same moment without glare. Politeness is derived from the multiplayer player
// ids, which both sides already agree on, so no extra handshake is needed: the
// lexicographically smaller id is impolite and makes the initial offer.
export class VoicePeer {
  constructor({ localId, remoteId, micTrack, iceServers, sendSignal, onStream, onClose, onState }) {
    this.localId = localId;
    this.remoteId = remoteId;
    this.sendSignal = sendSignal;
    this.onStream = onStream;
    this.onClose = onClose;
    this.onState = onState;
    this.polite = localId > remoteId;
    this.stream = null;
    this.closed = false;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.pendingCandidates = [];
    this.transmitting = false;
    this.restarted = false;
    this.failed = false;
    this.everConnected = false;
    this.createdAt = Date.now();
    this.micTrack = micTrack;

    this.pc = new RTCPeerConnection({ ...RTC_BASE_CONFIG, iceServers });

    // A stable sendrecv audio line created up front. Push to talk then swaps
    // the outgoing track in and out without ever renegotiating.
    this.sender = this.pc.addTrack(micTrack, new MediaStream([micTrack]));
    void this.setTransmitting(false);

    this.pc.addEventListener('negotiationneeded', async () => {
      if (this.closed) return;
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        this.signal({ type: 'voice:offer', offer: this.pc.localDescription });
        console.debug(`${VOICE_LOG_PREFIX} Offer sent: ${remoteId}`);
      } catch (error) {
        console.warn(`${VOICE_LOG_PREFIX} Negotiation failed: ${remoteId}`, error);
      } finally {
        this.makingOffer = false;
      }
    });

    this.pc.addEventListener('icecandidate', ({ candidate }) => {
      if (candidate) this.signal({ type: 'voice:ice-candidate', candidate });
    });

    this.pc.addEventListener('track', event => {
      const [stream] = event.streams;
      this.stream = stream ?? new MediaStream([event.track]);
      console.debug(`${VOICE_LOG_PREFIX} Remote stream received: ${remoteId}`);
      this.onStream?.(this.stream);
    });

    this.pc.addEventListener('connectionstatechange', () => {
      const state = this.pc.connectionState;
      this.onState?.(state);
      if (state === 'connected') this.everConnected = true;
      if (state === 'failed') {
        // Exactly one restart attempt. A peer that still cannot be reached --
        // most often one who simply has not enabled voice -- is dropped, and
        // the manager backs off instead of rebuilding it on every sweep.
        if (this.restarted) {
          this.failed = true;
          console.warn(`${VOICE_LOG_PREFIX} Giving up on peer: ${remoteId}`);
          this.close();
          return;
        }
        this.restarted = true;
        console.warn(`${VOICE_LOG_PREFIX} Connection failed, restarting ICE: ${remoteId}`);
        try { this.pc.restartIce(); } catch { this.failed = true; this.close(); }
      } else if (state === 'closed') {
        this.close();
      }
    });
  }

  // True when negotiation never completed in time -- an offer or answer went
  // missing, most often because the other side enabled voice a moment later.
  get stalled() {
    return !this.closed && !this.everConnected
      && Date.now() - this.createdAt > VOICE_NEGOTIATION_TIMEOUT_MS;
  }

  signal(payload) {
    if (this.closed) return;
    this.sendSignal?.(this.remoteId, payload);
  }

  // Push to talk. replaceTrack(null) stops outgoing RTP entirely rather than
  // sending silence, and needs no renegotiation.
  async setTransmitting(on) {
    if (this.closed || !this.sender || this.transmitting === on) return;
    this.transmitting = on;
    try {
      await this.sender.replaceTrack(on ? this.micTrack : null);
    } catch (error) {
      console.warn(`${VOICE_LOG_PREFIX} Could not toggle transmission: ${this.remoteId}`, error);
    }
  }

  async setMicTrack(micTrack) {
    this.micTrack = micTrack;
    if (this.closed || !this.sender || !this.transmitting) return;
    try { await this.sender.replaceTrack(micTrack); } catch {}
  }

  async handleSignal(payload) {
    if (this.closed || !payload) return;
    try {
      if (payload.type === 'voice:offer' || payload.type === 'voice:answer') {
        const description = payload.offer ?? payload.answer;
        if (!description) return;
        const collision = description.type === 'offer'
          && (this.makingOffer || this.pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;
        await this.pc.setRemoteDescription(description);
        await this.flushCandidates();
        if (description.type === 'offer') {
          await this.pc.setLocalDescription();
          this.signal({ type: 'voice:answer', answer: this.pc.localDescription });
        }
      } else if (payload.type === 'voice:ice-candidate' && payload.candidate) {
        if (!this.pc.remoteDescription) {
          this.pendingCandidates.push(payload.candidate);
          return;
        }
        try {
          await this.pc.addIceCandidate(payload.candidate);
        } catch (error) {
          if (!this.ignoreOffer) throw error;
        }
      }
    } catch (error) {
      console.warn(`${VOICE_LOG_PREFIX} Signal handling failed: ${this.remoteId}`, error);
    }
  }

  async flushCandidates() {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try { await this.pc.addIceCandidate(candidate); } catch {}
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pendingCandidates = [];
    try { this.sender?.replaceTrack(null); } catch {}
    try {
      // Drop every transceiver before closing so the remote track is released.
      for (const transceiver of this.pc.getTransceivers()) {
        try { transceiver.stop?.(); } catch {}
      }
    } catch {}
    try { this.pc.close(); } catch {}
    this.stream = null;
    this.onClose?.(this.remoteId);
  }
}

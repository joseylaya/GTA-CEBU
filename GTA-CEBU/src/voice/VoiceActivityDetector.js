import { VOICE_ACTIVE_RMS, VOICE_RELEASE_MS } from './voiceConfig.js';

// Reads the short-term loudness of one MediaStream and reports whether it
// currently carries speech. Sampling is driven by the voice manager's throttled
// tick, never by the render loop, and the analyser is deliberately small so a
// sample costs a few microseconds.
export class VoiceActivityDetector {
  constructor(context, stream) {
    this.context = context;
    this.speaking = false;
    this.level = 0;
    this.quietSince = 0;
    this.source = null;
    this.analyser = null;
    this.buffer = null;
    try {
      this.source = context.createMediaStreamSource(stream);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.6;
      this.buffer = new Float32Array(this.analyser.fftSize);
      // Terminates here on purpose: the analyser is a tap, not a playback path.
      this.source.connect(this.analyser);
    } catch {
      this.analyser = null;
    }
  }

  // Returns true when the speaking state changed on this sample.
  sample(now = performance.now()) {
    if (!this.analyser) return false;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i];
    const rms = Math.sqrt(sum / this.buffer.length);
    this.level = rms;
    const was = this.speaking;
    if (rms >= VOICE_ACTIVE_RMS) {
      this.speaking = true;
      this.quietSince = 0;
    } else if (this.speaking) {
      // Release on a timer rather than a second level threshold. A quiet but
      // non-zero signal -- WebRTC's concealment noise once a sender stops, for
      // instance -- must still let the indicator clear, and a time based hold
      // is what actually stops it flickering through natural pauses.
      if (!this.quietSince) this.quietSince = now;
      else if (now - this.quietSince >= VOICE_RELEASE_MS) this.speaking = false;
    }
    return this.speaking !== was;
  }

  reset() {
    this.speaking = false;
    this.level = 0;
    this.quietSince = 0;
  }

  dispose() {
    try { this.source?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    this.source = null;
    this.analyser = null;
    this.buffer = null;
  }
}

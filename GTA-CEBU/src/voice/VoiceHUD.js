import { VOICE_PTT_LABEL, VOICE_OPEN_MIC_LABEL } from './voiceConfig.js';

const STATUS = {
  off:         { text: 'VOICE OFF',        icon: '🎙️', className: '' },
  connecting:  { text: 'STARTING MIC…',    icon: '🎙️', className: 'pending' },
  ready:       { text: 'VOICE READY',      icon: '🎙️', className: 'ready' },
  talking:     { text: 'TALKING',          icon: '🎙️', className: 'talking' },
  open:        { text: 'OPEN MIC',         icon: '🎙️', className: 'open' },
  muted:       { text: 'MUTED',            icon: '🔇', className: 'muted' },
  unavailable: { text: 'MIC UNAVAILABLE',  icon: '🚫', className: 'unavailable' }
};

// Presentation only. Every interaction is handed back to the voice manager
// through the callbacks passed in; the HUD keeps no voice state of its own.
export class VoiceHUD {
  constructor({ onEnable, onToggleSelfMute, onToggleOpenMic, onToggleMute }) {
    this.onEnable = onEnable;
    this.onToggleMute = onToggleMute;
    this.panel = document.getElementById('voice-panel');
    this.statusButton = document.getElementById('voice-status');
    this.statusIcon = document.getElementById('voice-status-icon');
    this.statusText = document.getElementById('voice-status-text');
    this.modeButton = document.getElementById('voice-mode');
    this.hint = document.getElementById('voice-hint');
    this.roster = document.getElementById('voice-roster');
    this.rows = new Map();
    this.state = 'off';

    this.statusButton?.addEventListener('click', () => {
      if (this.state === 'off' || this.state === 'unavailable') onEnable?.();
      else if (this.state !== 'connecting') onToggleSelfMute?.();
    });
    this.modeButton?.addEventListener('click', () => onToggleOpenMic?.());
    this.setState('off');
    this.setOpenMic(false);
  }

  setOpenMic(open) {
    if (!this.modeButton) return;
    this.modeButton.textContent = `OPEN MIC ${open ? 'ON' : 'OFF'} · ${VOICE_OPEN_MIC_LABEL}`;
    this.modeButton.setAttribute('aria-pressed', String(open));
  }

  setState(state, detail = '') {
    const preset = STATUS[state] ?? STATUS.off;
    this.state = state;
    if (this.statusIcon) this.statusIcon.textContent = preset.icon;
    if (this.statusText) this.statusText.textContent = preset.text;
    if (this.statusButton) {
      this.statusButton.className = `voice-status ${preset.className}`;
      this.statusButton.setAttribute('aria-label', `Voice chat: ${preset.text}`);
    }
    if (this.hint) {
      this.hint.textContent = detail
        || (state === 'off' ? 'Click to enable microphone'
          : state === 'unavailable' ? 'Click to retry'
          : state === 'muted' ? 'Click to unmute yourself'
          : state === 'connecting' ? ''
          : state === 'open' ? 'Everyone nearby can hear you · click mic to mute'
          : `Hold ${VOICE_PTT_LABEL} to talk · click mic to mute`);
      this.hint.hidden = !this.hint.textContent;
    }
  }

  // players: [{ id, name, muted, speaking, connected }]
  syncRoster(players) {
    if (!this.roster) return;
    const seen = new Set();
    for (const player of players) {
      seen.add(player.id);
      let row = this.rows.get(player.id);
      if (!row) {
        const item = document.createElement('li');
        const dot = document.createElement('i');
        dot.className = 'voice-dot';
        const name = document.createElement('span');
        const button = document.createElement('button');
        button.type = 'button';
        button.addEventListener('click', () => this.onToggleMute?.(player.id));
        item.append(dot, name, button);
        this.roster.append(item);
        row = { item, dot, name, button, muted: null, speaking: null, name_: null };
        this.rows.set(player.id, row);
      }
      if (row.name_ !== player.name) {
        row.name.textContent = player.name;
        row.name_ = player.name;
      }
      if (row.muted !== player.muted) {
        row.button.textContent = player.muted ? 'UNMUTE' : 'MUTE';
        row.button.setAttribute('aria-label', `${player.muted ? 'Unmute' : 'Mute'} ${player.name}`);
        row.item.classList.toggle('is-muted', player.muted);
        row.muted = player.muted;
      }
      const speaking = player.speaking && !player.muted;
      if (row.speaking !== speaking) {
        row.dot.classList.toggle('is-speaking', speaking);
        row.speaking = speaking;
      }
      row.item.classList.toggle('is-linked', !!player.connected);
    }
    for (const [id, row] of this.rows) {
      if (seen.has(id)) continue;
      row.item.remove();
      this.rows.delete(id);
    }
    if (this.panel) this.panel.classList.toggle('has-peers', this.rows.size > 0);
  }

  clearRoster() {
    for (const row of this.rows.values()) row.item.remove();
    this.rows.clear();
    this.panel?.classList.remove('has-peers');
  }
}

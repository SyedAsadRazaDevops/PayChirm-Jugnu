// Chime (Web Audio) and spoken line (browser speech synthesis).

const LANG_TAG = { en: 'en', ur: 'ur', hi: 'hi' };

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.voices = [];
    if ('speechSynthesis' in window) {
      const load = () => { this.voices = window.speechSynthesis.getVoices(); };
      load();
      window.speechSynthesis.addEventListener?.('voiceschanged', load);
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Browsers only allow sound after a tap. Call this from a click handler. */
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    try { await this.ctx?.resume(); } catch { /* ignore */ }
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    return this.ready;
  }

  _bell(freq, start, { gain = 0.5, decay = 1.1, type = 'sine', partials = [[1, 1], [2.01, 0.35], [3.02, 0.16]] } = {}) {
    const t0 = this.ctx.currentTime + start;
    for (const [mult, g] of partials) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq * mult;
      const peak = Math.max(0.0002, gain * g * this.volume);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      osc.connect(env).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + decay + 0.05);
    }
  }

  /** verified: a bright rising three-note bell. unverified: a softer, falling two-note tone, so the ear can tell them apart. */
  chime(kind = 'verified') {
    if (!this.ready) return 0;
    if (kind === 'verified') {
      this._bell(784.0, 0.0);
      this._bell(1046.5, 0.13);
      this._bell(1318.5, 0.26, { decay: 1.4 });
      return 1000;
    }
    this._bell(523.25, 0, { type: 'triangle', gain: 0.45, decay: 0.7, partials: [[1, 1], [2, 0.2]] });
    this._bell(392.0, 0.22, { type: 'triangle', gain: 0.45, decay: 0.9, partials: [[1, 1], [2, 0.2]] });
    return 900;
  }

  _voiceFor(lang) {
    const tag = LANG_TAG[lang] || 'en';
    return this.voices.find((v) => v.lang.toLowerCase().startsWith(tag)) || null;
  }

  hasVoice(lang) {
    return !!this._voiceFor(lang);
  }

  /** Speak `text` in `lang`. If this device has no voice for it, speak `fallback` (English) so the cashier still hears something. */
  speak(text, lang, fallback) {
    if (!('speechSynthesis' in window)) return;
    let line = text;
    let useLang = lang;
    if (lang !== 'en' && !this._voiceFor(lang) && fallback) {
      line = fallback;
      useLang = 'en';
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    const voice = this._voiceFor(useLang);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = useLang === 'en' ? 'en-IN' : useLang; }
    u.volume = Math.min(1, this.volume);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }

  stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}

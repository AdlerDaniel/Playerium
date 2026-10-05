import { Equalizer } from './equalizer.js';
// Android's hardware bands are mapped to the same saved ten-band interface.
export class NativeEqualizer {
  constructor() {
    this.isEnabled = true; this.currentPreset = 'flat'; this.gains = Array(10).fill(0);
    try {
      const saved = JSON.parse(localStorage.getItem('sp_equalizer'));
      if (saved) { this.isEnabled = saved.enabled !== false; this.currentPreset = saved.preset || 'flat';
        if (saved.gains?.length === 10) this.gains = saved.gains.map(x => Math.max(-12, Math.min(12, Number(x) || 0))); }
    } catch {}
    this.sync();
  }
  sync() {
    window.AndroidBridge.setEqualizer(JSON.stringify({ enabled: this.isEnabled, gains: this.gains }));
    localStorage.setItem('sp_equalizer', JSON.stringify({ enabled: this.isEnabled, preset: this.currentPreset, gains: this.gains }));
  }
  setGain(i, value) { this.gains[i] = Math.max(-12, Math.min(12, Number(value) || 0)); this.currentPreset = 'custom'; this.sync(); }
  setEnabled(value) { this.isEnabled = !!value; this.sync(); }
  applyPreset(key) { const preset = Equalizer.PRESETS[key]; if (preset) { this.currentPreset = key; this.gains = [...preset.values]; this.sync(); } }
}

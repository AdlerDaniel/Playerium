/**
 * Spotify Local Player - Web Audio API 10-Band Equalizer
 * Frequencies: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz
 */

export class Equalizer {
  static FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  
  static PRESETS = {
    "flat": { name: "Прямой (Flat)", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    "bass-boost": { name: "Усиление басов (Bass Boost)", values: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
    "bass-reducer": { name: "Снижение басов (Bass Reducer)", values: [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0] },
    "electronic": { name: "Электронная (Electronic)", values: [5, 4, 2, 0, -2, 2, 1, 2, 4, 5] },
    "rock": { name: "Рок (Rock)", values: [4, 3, 2, 0, -1, 1, 3, 4, 4, 4] },
    "pop": { name: "Поп (Pop)", values: [-1, 1, 3, 4, 4, 3, 1, -1, -1, -1] },
    "vocal": { name: "Вокал (Vocal Boost)", values: [-2, -2, 0, 2, 5, 5, 3, 1, 0, -1] },
    "classical": { name: "Классика (Classical)", values: [4, 3, 2, 2, -1, -1, 0, 2, 3, 3] },
    "treble-boost": { name: "Усиление высоких (Treble Boost)", values: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
    "acoustic": { name: "Акустика (Acoustic)", values: [3, 2, 1, 1, 1, 1, 2, 3, 3, 2] }
  };

  constructor(audioContext) {
    this.ctx = audioContext;
    this.filters = [];
    this.isEnabled = true;
    this.currentPreset = "flat";
    this.gains = [...Equalizer.PRESETS["flat"].values];

    this.inputNode = this.ctx.createGain();
    this.outputNode = this.ctx.createGain();

    this.buildFilters();
    this.loadSavedSettings();
  }

  buildFilters() {
    this.filters = Equalizer.FREQUENCIES.map((freq, index) => {
      const filter = this.ctx.createBiquadFilter();
      if (index === 0) {
        filter.type = "lowshelf";
      } else if (index === Equalizer.FREQUENCIES.length - 1) {
        filter.type = "highshelf";
      } else {
        filter.type = "peaking";
        filter.Q.value = 1.4;
      }
      filter.frequency.value = freq;
      filter.gain.value = 0;
      return filter;
    });

    // Connect filters in series: input -> filter[0] -> filter[1] -> ... -> output
    let prevNode = this.inputNode;
    this.filters.forEach((filter) => {
      prevNode.connect(filter);
      prevNode = filter;
    });
    prevNode.connect(this.outputNode);
  }

  connectSource(sourceNode) {
    sourceNode.connect(this.inputNode);
  }

  connectDestination(destinationNode) {
    this.outputNode.connect(destinationNode);
  }

  setGain(index, value) {
    if (index >= 0 && index < this.filters.length) {
      const clamped = Math.max(-12, Math.min(12, parseFloat(value) || 0));
      this.gains[index] = clamped;
      if (this.isEnabled) {
        this.filters[index].gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
      }
      this.currentPreset = "custom";
      this.saveSettings();
    }
  }

  applyPreset(presetKey) {
    const preset = Equalizer.PRESETS[presetKey];
    if (!preset) return;
    this.currentPreset = presetKey;
    this.gains = [...preset.values];
    this.gains.forEach((val, i) => {
      if (this.isEnabled) {
        this.filters[i].gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
      }
    });
    this.saveSettings();
  }

  setEnabled(enabled) {
    this.isEnabled = !!enabled;
    this.filters.forEach((filter, i) => {
      const targetGain = this.isEnabled ? this.gains[i] : 0;
      filter.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
    });
    this.saveSettings();
  }

  saveSettings() {
    try {
      localStorage.setItem("sp_equalizer", JSON.stringify({
        enabled: this.isEnabled,
        preset: this.currentPreset,
        gains: this.gains
      }));
    } catch {}
  }

  loadSavedSettings() {
    try {
      const data = localStorage.getItem("sp_equalizer");
      if (data) {
        const parsed = JSON.parse(data);
        if (typeof parsed.enabled === "boolean") this.isEnabled = parsed.enabled;
        if (Array.isArray(parsed.gains) && parsed.gains.length === 10) {
          this.gains = parsed.gains;
        }
        if (parsed.preset) this.currentPreset = parsed.preset;
        
        // Apply loaded values
        this.filters.forEach((filter, i) => {
          filter.gain.value = this.isEnabled ? this.gains[i] : 0;
        });
      }
    } catch {}
  }
}

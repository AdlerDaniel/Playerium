/**
 * Spotify Local Player - Audio Engine
 * Coordinates HTML5 Audio, Web Audio API, Equalizer, Queuing, Shuffle, and Repeat.
 */

import { NativeEqualizer } from "./native-equalizer.js";
import { Equalizer } from "./equalizer.js";

export class AudioPlayer {
  constructor(library) {
    this.library = library;
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.crossOrigin = "anonymous";
    this.playRequest = 0;
    this.sourceUrl = null;
    this.nativePlayback = false;
    this.onError = null;
    this.failedTracks = new Set();
    window.onNativePlayerState = state => this.applyNativeState(state);

    // Web Audio API context & nodes
    this.audioCtx = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.equalizer = null;
    this.isWebAudioInitialized = false;

    // Playback state
    this.currentTrack = null;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = "off"; // 'off' | 'all' | 'one'
    this.volume = 0.8;
    this.isMuted = false;
    this.previousVolume = 0.8;

    // Queue & Context
    this.queue = [];
    this.originalQueue = [];
    this.queueIndex = -1;
    this.playbackContext = null;

    // Callbacks for UI updates
    this.onPlayStateChange = null;
    this.onTrackChange = null;
    this.onTimeUpdate = null;
    this.onQueueChange = null;
    this.onVolumeChange = null;
    this.onShuffleChange = null;
    this.onRepeatChange = null;

    this.setupAudioEvents();
    this.setupMediaSession();
    this.loadSavedPreferences();
  }

  initWebAudio() {
    if (window.AndroidBridge?.setEqualizer) { this.equalizer ||= new NativeEqualizer(); return; }
    if (this.isWebAudioInitialized) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.volume;

      this.equalizer = new Equalizer(this.audioCtx);
      this.audio.volume = 1;
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      // Graph: source -> equalizer input -> equalizer output -> gainNode -> destination
      this.equalizer.connectSource(this.sourceNode);
      this.equalizer.connectDestination(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.isWebAudioInitialized = true;
    } catch (e) {
      console.warn("Web Audio API initialization failed, falling back to basic audio:", e);
    }
  }

  setupAudioEvents() {
    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
      this.notifyAndroidPlayback(true);
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
      this.notifyAndroidPlayback(false);
    });

    this.audio.addEventListener("timeupdate", () => {
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      }
    });

    this.audio.addEventListener("ended", () => {
      this.notifyAndroidPlayback(false);
      this.handleTrackEnded();
    });

    this.audio.addEventListener("error", () => this.handlePlaybackError("Не удалось воспроизвести файл. Проверьте доступ к папке."));
  }

  notifyAndroidPlayback(isPlaying) {
    if (window.AndroidBridge && typeof window.AndroidBridge.updatePlaybackState === "function") {
      try {
        const t = this.currentTrack;
        if (t) {
          window.AndroidBridge.updatePlaybackState(
            t.title || "Неизвестный трек",
            t.artist || "Неизвестный исполнитель",
            t.album || "",
            Boolean(isPlaying),
            t.pictureUrl || ""
          );
        }
      } catch (err) {
        console.warn("AndroidBridge updatePlaybackState error:", err);
      }
    }
  }

  setupMediaSession() {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => this.play());
    navigator.mediaSession.setActionHandler("pause", () => this.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => this.prev());
    navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (Number.isFinite(details.seekTime)) this.seekToTime(details.seekTime);
    });
  }

  updateMediaSessionMetadata(track) {
    if (!("mediaSession" in navigator) || !track) return;
    const artwork = [];
    if (track.pictureUrl) {
      artwork.push({ src: track.pictureUrl, sizes: "512x512", type: "image/jpeg" });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Неизвестный трек",
      artist: track.artist || "Неизвестный исполнитель",
      album: track.album || "",
      artwork
    });
  }

  // --- Playback Control ---

  async playTrack(track, queueIndex = 0, newQueue = null, context = null) {
    if (!track) return;
    const request = ++this.playRequest;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.sourceUrl?.startsWith("blob:")) URL.revokeObjectURL(this.sourceUrl);
    this.sourceUrl = null;

    // Ensure AudioContext is resumed on user gesture
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
      if (request !== this.playRequest) return;
    }

    if (newQueue) {
      this.originalQueue = [...newQueue];
      if (this.isShuffle) {
        this.queue = this.createShuffledQueue(newQueue, track);
        this.queueIndex = 0;
      } else {
        this.queue = [...newQueue];
        this.queueIndex = queueIndex;
      }
    } else if (this.queue.length === 0) {
      this.queue = [track];
      this.originalQueue = [track];
      this.queueIndex = 0;
    } else {
      this.queueIndex = queueIndex;
    }

    if (newQueue) this.playbackContext = context ? { ...context } : null;

    this.currentTrack = track;

    this.nativePlayback = !!(track.nativeUri && window.AndroidBridge?.setPlaybackQueue && this.queue.every(t => t.nativeUri));
    if (this.nativePlayback) {
      this.syncNativeQueue(true, true);
      this.equalizer?.sync?.();
      this.onTrackChange?.(track);
      this.onQueueChange?.(this.queue, this.queueIndex);
      return;
    }
    window.AndroidBridge?.playbackCommand?.("stop", 0);
    try {
      if (track.unavailable) throw new Error("Файл недоступен. Восстановите доступ к папке через «Добавить папку».");
      let url;
      if (track.filePath && window.electronAPI?.getAudioSource) url = await window.electronAPI.getAudioSource(track.filePath);
      else {
        const file = await this.library.getAudioFile(track);
        if (request !== this.playRequest) return;
        if (!file) throw new Error("Нет доступа к файлу. Добавьте папку заново, чтобы восстановить доступ.");
        url = URL.createObjectURL(file);
      }
      if (request !== this.playRequest) { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); return; }
      this.sourceUrl = url;
      this.audio.src = url;
      await this.audio.play();
      if (request !== this.playRequest) return;
      this.failedTracks.clear();
      this.updateMediaSessionMetadata(track);
      this.onTrackChange?.(track);
      this.onQueueChange?.(this.queue, this.queueIndex);
    } catch (error) {
      if (request !== this.playRequest) return;
      this.audio.pause();
      this.isPlaying = false;
      this.onPlayStateChange?.(false);
      this.onError?.(error.message || "Не удалось воспроизвести трек");
    }
  }

  syncNativeQueue(play = this.isPlaying, reset = false) {
    if (!this.nativePlayback) return;
    window.AndroidBridge.setPlaybackQueue(JSON.stringify({ tracks: this.queue.map(t => ({ id: t.id, uri: t.nativeUri,
      title: t.title, artist: t.artist, album: t.album })), index: this.queueIndex, play, reset,
      repeat: this.repeatMode, volume: this.volume }));
  }

  applyNativeState(state) {
    if (!state) return;
    if (state.error) this.onError?.(state.error);
    if (!this.nativePlayback && state.queue?.length && !this.currentTrack) {
      this.queue = state.queue.map(id => this.library.getTrackById(id)).filter(Boolean);
      if (this.queue.length) { this.originalQueue = [...this.queue]; this.nativePlayback = true; }
    }
    if (!this.nativePlayback) return;
    const index = Number.isInteger(state.index) && this.queue[state.index]?.id === state.id ? state.index : this.queue.findIndex(t => t.id === state.id);
    if (index < 0) return;
    if (this.currentTrack?.id !== state.id || this.queueIndex !== index) {
      this.queueIndex = index;
      this.currentTrack = this.queue[index];
      this.onTrackChange?.(this.currentTrack);
      this.onQueueChange?.(this.queue, index);
    }
    if (this.isPlaying !== state.playing) {
      this.isPlaying = state.playing;
      this.onPlayStateChange?.(state.playing);
    }
    this.nativeTime = state.position / 1000;
    this.nativeDuration = state.duration / 1000;
    this.onTimeUpdate?.(this.nativeTime, this.nativeDuration);
  }

  getCurrentTime() { return this.nativePlayback ? this.nativeTime || 0 : this.audio.currentTime; }

  getDuration() { return this.nativePlayback ? this.nativeDuration || this.currentTrack?.duration || 0 : this.audio.duration; }

  handlePlaybackError(message) {
    const id = this.currentTrack?.id;
    if (!id || this.failedTracks.has(id)) { this.pause(); return; }
    this.failedTracks.add(id);
    this.onError?.(message);
    if (this.failedTracks.size >= this.queue.length) { this.pause(); return; }
    // Errors bypass repeat-one; never loop forever on broken tracks.
    const next = this.queue.findIndex((t, i) => i > this.queueIndex && !this.failedTracks.has(t.id));
    if (next >= 0) this.playTrack(this.queue[next], next);
    else this.pause();
  }

  togglePlay() {
    if (!this.currentTrack && this.queue.length > 0) {
      this.playTrack(this.queue[0], 0);
      return;
    }
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.nativePlayback) { window.AndroidBridge.playbackCommand("play", 0); return; }
    if (!this.currentTrack || !this.sourceUrl) return;
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    this.audio.play().catch(() => this.onError?.("Не удалось продолжить воспроизведение"));
  }

  pause() {
    if (this.nativePlayback) window.AndroidBridge.playbackCommand("pause", 0);
    this.audio.pause();
  }

  next() {
    if (this.queue.length === 0) return;

    let nextIndex = this.queueIndex + 1;
    if (nextIndex >= this.queue.length) {
      if (this.repeatMode === "all") {
        nextIndex = 0;
      } else {
        // End of queue reached
        this.pause();
        return;
      }
    }

    this.queueIndex = nextIndex;
    this.playTrack(this.queue[this.queueIndex], this.queueIndex);
  }

  prev() {
    if (this.queue.length === 0) return;

    // If more than 3 seconds in, restart current track
    if ((this.nativePlayback ? this.nativeTime : this.audio.currentTime) > 3) {
      this.seek(0);
      return;
    }

    let prevIndex = this.queueIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.repeatMode === "all" ? this.queue.length - 1 : 0;
    }

    this.queueIndex = prevIndex;
    this.playTrack(this.queue[this.queueIndex], this.queueIndex);
  }

  handleTrackEnded() {
    if (this.repeatMode === "one") {
      this.seek(0);
      this.play();
    } else {
      this.next();
    }
  }

  seek(percent) {
    if (this.nativePlayback) { this.seekToTime(this.getDuration() * percent / 100); return; }
    if (this.audio.duration) {
      const time = (percent / 100) * this.audio.duration;
      this.audio.currentTime = time;
    }
  }

  seekToTime(seconds) {
    if (this.nativePlayback) { window.AndroidBridge.playbackCommand("seek", Math.max(0, seconds) * 1000); return; }
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
    }
  }

  setVolume(val) {
    const v = Math.max(0, Math.min(1, parseFloat(val)));
    this.volume = Number.isFinite(v) ? v : 0.8;
    if (this.nativePlayback) window.AndroidBridge.playbackCommand("volume", this.volume);
    this.isMuted = this.volume === 0;
    if (this.volume > 0) this.previousVolume = this.volume;

    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    } else {
      this.audio.volume = this.volume;
    }

    if (this.onVolumeChange) this.onVolumeChange(this.volume, this.isMuted);
    this.savePreferences();
  }

  toggleMute() {
    if (this.isMuted) {
      this.setVolume(this.previousVolume || 0.8);
      this.isMuted = false;
    } else {
      this.previousVolume = this.volume;
      this.setVolume(0);
      this.isMuted = true;
    }
    if (this.onVolumeChange) this.onVolumeChange(this.volume, this.isMuted);
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) {
      this.queue = this.createShuffledQueue(this.originalQueue, this.currentTrack);
      this.queueIndex = 0;
    } else {
      this.queue = [...this.originalQueue];
      this.queueIndex = this.currentTrack
        ? this.queue.findIndex((t) => t.id === this.currentTrack.id)
        : 0;
    }

    this.syncNativeQueue();
    this.savePreferences();
    if (this.onShuffleChange) this.onShuffleChange(this.isShuffle);
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  createShuffledQueue(list, current) {
    const result = [...list];
    // Fisher-Yates shuffle
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    // Place current track at index 0 if present
    if (current) {
      const curIdx = result.findIndex((t) => t.id === current.id);
      if (curIdx > -1) {
        result.splice(curIdx, 1);
        result.unshift(current);
      }
    }
    return result;
  }

  toggleRepeat() {
    if (this.repeatMode === "off") {
      this.repeatMode = "all";
    } else if (this.repeatMode === "all") {
      this.repeatMode = "one";
    } else {
      this.repeatMode = "off";
    }
    if (this.nativePlayback) window.AndroidBridge.playbackCommand("repeat", ["off", "one", "all"].indexOf(this.repeatMode));
    if (this.onRepeatChange) this.onRepeatChange(this.repeatMode);
    this.savePreferences();
  }

  // --- Queue Actions ---

  addToQueue(track) {
    this.queue.push(track);
    this.originalQueue.push(track);
    this.syncNativeQueue();
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  playNext(track) {
    const insertIdx = this.queueIndex + 1;
    this.queue.splice(insertIdx, 0, track);
    this.originalQueue.splice(insertIdx, 0, track);
    this.syncNativeQueue();
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    const [removed] = this.queue.splice(index, 1);
    const originalIndex = this.originalQueue.findIndex(t => t.id === removed.id);
    if (originalIndex >= 0) this.originalQueue.splice(originalIndex, 1);
    if (index < this.queueIndex) this.queueIndex--;
    else if (index === this.queueIndex) {
      if (this.queue.length) { this.queueIndex = Math.min(index, this.queue.length - 1); this.playTrack(this.queue[this.queueIndex], this.queueIndex); }
      else this.stop();
    }
    this.syncNativeQueue();
    this.onQueueChange?.(this.queue, this.queueIndex);
  }

  clearUpcomingQueue() {
    this.queue = this.queue.slice(0, this.queueIndex + 1);
    const keep = new Set(this.queue.map(t => t.id));
    this.originalQueue = this.originalQueue.filter(t => keep.has(t.id));
    this.syncNativeQueue();
    this.onQueueChange?.(this.queue, this.queueIndex);
  }

  stop() {
    ++this.playRequest;
    this.pause();
    window.AndroidBridge?.playbackCommand?.("stop", 0);
    this.audio.removeAttribute("src"); this.audio.load();
    if (this.sourceUrl?.startsWith("blob:")) URL.revokeObjectURL(this.sourceUrl);
    this.sourceUrl = null; this.nativePlayback = false; this.currentTrack = null;
    this.queue = []; this.originalQueue = []; this.queueIndex = -1; this.isPlaying = false;
    this.playbackContext = null;
    this.onTrackChange?.(null);
    this.onPlayStateChange?.(false); this.onQueueChange?.([], -1);
  }

  // --- Preferences Persistence ---

  savePreferences() {
    try {
      localStorage.setItem("sp_audio_prefs", JSON.stringify({
        volume: this.volume,
        repeatMode: this.repeatMode,
        isShuffle: this.isShuffle
      }));
    } catch {}
  }

  loadSavedPreferences() {
    try {
      const data = localStorage.getItem("sp_audio_prefs");
      if (data) {
        const parsed = JSON.parse(data);
        if (typeof parsed.volume === "number") this.volume = Math.max(0, Math.min(1, parsed.volume));
        if (["off", "all", "one"].includes(parsed.repeatMode)) this.repeatMode = parsed.repeatMode;
        if (typeof parsed.isShuffle === "boolean") this.isShuffle = parsed.isShuffle;
      }
    } catch {}
    this.audio.volume = this.volume;
    this.isMuted = this.volume === 0;
  }
}

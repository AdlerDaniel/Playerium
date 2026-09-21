/**
 * Spotify Local Player - Audio Engine
 * Coordinates HTML5 Audio, Web Audio API, Equalizer, Queuing, Shuffle, and Repeat.
 */

import { Equalizer } from "./equalizer.js";

export class AudioPlayer {
  constructor(library) {
    this.library = library;
    this.audio = new Audio();
    this.audio.preload = "auto";

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
    if (this.isWebAudioInitialized) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.volume;

      this.equalizer = new Equalizer(this.audioCtx);
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

    this.audio.addEventListener("error", (e) => {
      console.error("Audio playback error:", e);
      // Try next track if current fails
      this.next();
    });
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
      if (details.seekTime) this.seekToTime(details.seekTime);
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

    // Ensure AudioContext is resumed on user gesture
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
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

    if (context) {
      this.playbackContext = context;
    }

    this.currentTrack = track;

    // Get playable audio URL (either from memory blob or created object URL)
    let audioBlob = this.library.audioBlobs.get(track.id);

    // If not in memory, try loading from PC file path or Android URI
    if (!audioBlob && track.filePath && window.electronAPI && window.electronAPI.readFile) {
      try {
        const buffer = await window.electronAPI.readFile(track.filePath);
        if (buffer) {
          audioBlob = new Blob([buffer]);
          this.library.audioBlobs.set(track.id, audioBlob);
        }
      } catch (e) {
        console.warn("Failed to load file from disk:", e);
      }
    }
    if (!audioBlob && track.nativeUri && window.AndroidBridge && window.AndroidBridge.readFileAsBase64) {
      try {
        const b64 = window.AndroidBridge.readFileAsBase64(track.nativeUri);
        if (b64) {
          const byteCharacters = atob(b64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          audioBlob = new Blob([byteArray], { type: "audio/mpeg" });
          this.library.audioBlobs.set(track.id, audioBlob);
        }
      } catch (e) {
        console.warn("Failed to load file from Android URI:", e);
      }
    }

    if (!audioBlob) {
      console.warn("Audio file data not loaded in session for track:", track.title);
    } else {
      const srcUrl = URL.createObjectURL(audioBlob);
      this.audio.src = srcUrl;
    }

    try {
      await this.audio.play();
    } catch (e) {
      console.warn("Playback could not start automatically:", e);
    }

    this.updateMediaSessionMetadata(track);
    this.notifyAndroidPlayback(true);

    if (this.onTrackChange) this.onTrackChange(track);
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
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
    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    this.audio.play().catch((e) => console.warn(e));
  }

  pause() {
    this.audio.pause();
  }

  next() {
    if (this.queue.length === 0) return;

    if (this.repeatMode === "one" && this.currentTrack) {
      this.seek(0);
      this.play();
      return;
    }

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
    if (this.audio.currentTime > 3) {
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
    if (this.audio.duration) {
      const time = (percent / 100) * this.audio.duration;
      this.audio.currentTime = time;
    }
  }

  seekToTime(seconds) {
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
    }
  }

  setVolume(val) {
    const v = Math.max(0, Math.min(1, parseFloat(val)));
    this.volume = v;
    this.isMuted = v === 0;

    if (this.gainNode) {
      this.gainNode.gain.value = v;
    } else {
      this.audio.volume = v;
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
    if (this.onRepeatChange) this.onRepeatChange(this.repeatMode);
    this.savePreferences();
  }

  // --- Queue Actions ---

  addToQueue(track) {
    this.queue.push(track);
    this.originalQueue.push(track);
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  playNext(track) {
    const insertIdx = this.queueIndex + 1;
    this.queue.splice(insertIdx, 0, track);
    this.originalQueue.splice(insertIdx, 0, track);
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  removeFromQueue(index) {
    if (index >= 0 && index < this.queue.length) {
      this.queue.splice(index, 1);
      if (index < this.queueIndex) {
        this.queueIndex--;
      }
      if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
    }
  }

  clearUpcomingQueue() {
    this.queue = this.queue.slice(0, this.queueIndex + 1);
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
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
        if (typeof parsed.volume === "number") this.volume = parsed.volume;
        if (parsed.repeatMode) this.repeatMode = parsed.repeatMode;
        if (typeof parsed.isShuffle === "boolean") this.isShuffle = parsed.isShuffle;
      }
    } catch {}
  }
}

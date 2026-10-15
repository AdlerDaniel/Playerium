/**
 * Spotify Local Player - Audio Engine
 * Coordinates HTML5 Audio, Web Audio API, Equalizer, Queuing, Shuffle, and Repeat.
 */

import { NativeEqualizer } from "./native-equalizer.js";
import { Equalizer } from "./equalizer.js";
import {browserLoudness} from './loudness.js';

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
    this.normalizationNode = null;
    this.normalizationGain = 1;
    this.browserLoudnessCache=new Map();
    this.loudnessPending=new Map();
    this.nativeArtworkSent=new Map();
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
      this.normalizationNode=this.audioCtx.createGain();
      this.normalizationNode.gain.value=this.normalizationGain;
      const limiter=this.audioCtx.createDynamicsCompressor();
      limiter.threshold.value=-1;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.15;

      // Graph: source -> equalizer input -> equalizer output -> gainNode -> destination
      this.sourceNode.connect(this.normalizationNode);
      this.equalizer.connectSource(this.normalizationNode);
      this.equalizer.connectDestination(this.gainNode);
      this.gainNode.connect(limiter);limiter.connect(this.audioCtx.destination);

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
            "",
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
    // Android's service owns the system media session, including notification controls.
    if(window.AndroidBridge?.setPlaybackQueue)return;
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
    if(window.AndroidBridge?.setPlaybackQueue)return;
    if (!("mediaSession" in navigator) || !track) return;
    const artwork = [];
    if (track.pictureUrl) {
      artwork.push({ src: track.pictureUrl, sizes: "512x512", type: "image/jpeg" });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Неизвестный трек",
      artist: track.artist || "Неизвестный исполнитель",
      artwork
    });
  }

  // --- Playback Control ---

  async playTrack(track, queueIndex = 0, newQueue = null, context = null) {
    if (!track) return;
    const request = ++this.playRequest;
    if(track.catalog) {
      try {
        const pendingId=track.id;track=await this.library.ensureTrack(track);
        if(request!==this.playRequest)return;
        if(newQueue){newQueue=newQueue.map(t=>t.id===pendingId?track:t);queueIndex=newQueue.findIndex(t=>t.id===track.id);}
        this.queue=this.queue.map(t=>t.id===pendingId?track:t);
        this.originalQueue=this.originalQueue.map(t=>t.id===pendingId?track:t);
      }catch(error){if(request===this.playRequest)this.onError?.(error.message);return;}
    }
    if(track.nativeUri && newQueue && window.AndroidBridge?.setPlaybackQueue){newQueue=newQueue.filter(t=>t.nativeUri);queueIndex=newQueue.findIndex(t=>t.id===track.id);}
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
      if (this.isShuffle && !(track.nativeUri && window.AndroidBridge?.setPlaybackQueue)) {
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
    this.normalizationGain=1;
    if(this.normalizationNode){this.normalizationNode.gain.cancelScheduledValues(this.audioCtx.currentTime);this.normalizationNode.gain.setValueAtTime(1,this.audioCtx.currentTime);}

    this.nativePlayback = !!(track.nativeUri && window.AndroidBridge?.setPlaybackQueue && this.queue.every(t => t.nativeUri));
    if (this.nativePlayback) {
      // The native service applies cached gain and measures in its own background worker.
      // Sending the queue must never wait for a full-file analysis through the bridge.
      try{const measured=await this.measureLoudness(track);if(request!==this.playRequest)return;if(measured)this.applyNormalization(measured.gain,false);}catch{}
      if(request!==this.playRequest)return;
      this.syncNativeQueue(true, true);
      this.equalizer?.sync?.();
      this.onTrackChange?.(track);
      this.onQueueChange?.(this.queue, this.queueIndex);
      return;
    }
    window.AndroidBridge?.playbackCommand?.("stop", 0);
    try {
      if (track.unavailable) throw new Error("Файл недоступен. Восстановите доступ к папке через «Добавить папку».");
      let url,file;
      if (track.filePath && window.electronAPI?.getAudioSource) url = await window.electronAPI.getAudioSource(track.filePath);
      else {
        file = await this.library.getAudioFile(track);
        if (request !== this.playRequest) return;
        if (!file) throw new Error("Нет доступа к файлу. Добавьте папку заново, чтобы восстановить доступ.");
        url = URL.createObjectURL(file);
      }
      if (request !== this.playRequest) { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); return; }
      this.sourceUrl = url;
      this.audio.src = url;
      let cached=this.browserLoudnessCache.get(this.loudnessKey(track,file));
      if(!cached&&track.filePath&&window.electronAPI?.getCachedLoudness)cached=await window.electronAPI.getCachedLoudness(track.filePath).catch(()=>null);
      if(!cached&&track.normalizationKey===this.loudnessKey(track,file))cached={gain:track.normalizationGain};
      if(!cached){try{cached=await this.measureLoudness(track,file);}catch{}}
      if(request!==this.playRequest)return;
      if(cached)this.applyNormalization(cached.gain,false);
      if(request!==this.playRequest)return;
      await this.audio.play();
      if (request !== this.playRequest) return;
      this.failedTracks.clear();
      this.updateMediaSessionMetadata(track);
      this.onTrackChange?.(track);
      this.onQueueChange?.(this.queue, this.queueIndex);
      this.normalizationTask=this.normalizeInBackground(track,file,request);
      const next=this.queue[this.queueIndex+1];
      if(next?.filePath&&window.electronAPI?.getLoudness)this.measureLoudness(next).catch(()=>{});
    } catch (error) {
      if (request !== this.playRequest) return;
      this.audio.pause();
      this.isPlaying = false;
      this.onPlayStateChange?.(false);
      this.onError?.(error.message || "Не удалось воспроизвести трек");
    }
  }

  loudnessKey(track,file) {
    return `${track.filePath||track.nativeUri||track.id}|${file?.size??track.fileSize}|${file?.lastModified??track.lastModified}`;
  }

  applyNormalization(gain,smooth=true) {
    if(!Number.isFinite(gain)||gain<=0||gain>8)return;
    this.normalizationGain=gain;
    if(!this.normalizationNode||!this.audioCtx)return;
    const param=this.normalizationNode.gain,time=this.audioCtx.currentTime;
    param.cancelScheduledValues(time);
    if(smooth)param.setTargetAtTime(gain,time,.08);
    else param.setValueAtTime(gain,time);
  }

  async measureLoudness(track,file) {
    const key=this.loudnessKey(track,file);
    if(this.browserLoudnessCache.has(key))return this.browserLoudnessCache.get(key);
    if(this.loudnessPending.has(key))return this.loudnessPending.get(key);
    let task;
    if(track.nativeUri&&this.library.getLoudness)task=this.library.getLoudness(track);
    else if(track.filePath&&window.electronAPI?.getLoudness)task=window.electronAPI.getLoudness(track.filePath);
    else if(file&&file.size<=64*1024*1024&&this.audioCtx&&this.normalizationNode)task=browserLoudness(file,this.audioCtx);
    else return null;
    const pending=Promise.resolve(task).then(result=>{
      if(Number.isFinite(result?.gain)&&result.gain>0&&result.gain<=8){
        this.browserLoudnessCache.set(key,result);
        track.normalizationGain=result.gain;track.normalizationKey=key;
        this.library.putInStore?.('tracks',track).catch(()=>{});
        if(this.browserLoudnessCache.size>200)this.browserLoudnessCache.delete(this.browserLoudnessCache.keys().next().value);
      }
      return result;
    });
    this.loudnessPending.set(key,pending);
    try{return await pending;}finally{this.loudnessPending.delete(key);}
  }

  async normalizeInBackground(track,file,request) {
    try {
      // Cache for a future start; changing gain after playback starts is audible.
      await this.measureLoudness(track,file);
    }catch{/* Optional analysis must not delay or interrupt playback. */}
  }

  syncNativeQueue(play = this.isPlaying, reset = false, position = null) {
    if (!this.nativePlayback) return;
    this.nativeMediaIds=this.queue.map(t=>t.id);
    window.AndroidBridge.setPlaybackQueue(JSON.stringify({ tracks: this.queue.map(t => ({ id: t.id, uri: t.nativeUri,
      title: t.title, artist: t.artist, cloudKey:t.cloudKey, normalizationGain:t.normalizationGain })), index: this.queueIndex, play, reset,
      repeat: this.repeatMode, shuffle:this.isShuffle, volume: this.volume,
      ...(Number.isFinite(position) ? {position:Math.max(0,Math.round(position * 1000))} : {}) }));
    this.publishNativeArtwork();
  }

  publishNativeArtwork() {
    if(!this.nativePlayback||!window.AndroidBridge?.storePlaybackArtwork)return;
    for(const track of [this.currentTrack,this.queue[this.queueIndex+1]]) {
      const blob=track?.pictureBlob;
      const nativeId=this.nativeMediaIds?.[this.queue.indexOf(track)]||track?.id;
      if(!blob||blob.size>4*1024*1024||this.nativeArtworkSent.get(nativeId)===blob)continue;
      this.nativeArtworkSent.set(nativeId,blob);
      if(this.nativeArtworkSent.size>256)this.nativeArtworkSent.delete(this.nativeArtworkSent.keys().next().value);
      blob.arrayBuffer().then(buffer=>{
        const bytes=new Uint8Array(buffer),chunks=[];
        for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
        window.AndroidBridge?.storePlaybackArtwork?.(nativeId,btoa(chunks.join('')));
      }).catch(()=>{if(this.nativeArtworkSent.get(nativeId)===blob)this.nativeArtworkSent.delete(nativeId);});
    }
  }

  stopTrack() {
    ++this.playRequest;this.pause();window.AndroidBridge?.playbackCommand?.('stop',0);
    this.audio.removeAttribute('src');this.audio.load();
    if(this.sourceUrl?.startsWith('blob:'))URL.revokeObjectURL(this.sourceUrl);this.sourceUrl=null;
    this.currentTrack=null;this.nativePlayback=false;this.onTrackChange?.(null);
  }

  removeTrack(id) {
    const currentId=this.currentTrack?.id;
    this.queue=this.queue.filter(t=>t.id!==id);this.originalQueue=this.originalQueue.filter(t=>t.id!==id);
    this.queueIndex=currentId?this.queue.findIndex(t=>t.id===currentId):-1;
    if(this.nativePlayback)this.syncNativeQueue();this.onQueueChange?.(this.queue,this.queueIndex);
  }

  applyNativeState(state) {
    if (!state) return;
    if(state.queue)this.nativeMediaIds=state.queue;
    if (state.error) this.onError?.(state.error);
    if (state.queue?.length && ((!this.nativePlayback && !this.currentTrack) || state.queue.length!==this.queue.length || state.tracks?.some((saved,i)=>saved?.uri&&saved.uri!==this.queue[i]?.nativeUri))) {
      this.queue = state.queue.map((id, index) => {
        const saved = state.tracks?.[index];
        return this.library.getTrackById(id)
          || (saved?.uri && [...(this.library.tracks?.values() || [])].find(t => t.nativeUri === saved.uri))
          || (saved?.uri ? {id, nativeUri:saved.uri, title:saved.title, artist:saved.artist, cloudKey:saved.cloudKey, duration:Math.max(0,state.duration / 1000)} : null);
      });
      // Preserve native indices; never replace the playing queue with a partial import.
      if (this.queue.some(track => !track)) { this.queue = []; return; }
      if (this.queue.length) { this.originalQueue = [...this.queue]; this.nativePlayback = true; }
    }
    if (!this.nativePlayback) return;
    if(Number.isFinite(state.volume)&&state.volume>=0&&state.volume<=1&&this.volume!==state.volume){this.volume=state.volume;this.onVolumeChange?.(this.volume);this.savePreferences();}
    // Replace provisional native metadata once the library has finished loading.
    this.queue = this.queue.map(track => this.library.getTrackById?.(track.id)
      || [...(this.library.tracks?.values() || [])].find(saved => saved.nativeUri === track.nativeUri)
      || track);
    if(typeof state.shuffle==='boolean'&&this.isShuffle!==state.shuffle){this.isShuffle=state.shuffle;this.onShuffleChange?.(this.isShuffle);this.savePreferences();}
    const repeat=['off','one','all'][state.repeat];
    if(repeat&&repeat!==this.repeatMode){this.repeatMode=repeat;this.onRepeatChange?.(repeat);this.savePreferences();}
    const nativeUri = state.tracks?.[state.index]?.uri;
    const index = Number.isInteger(state.index) && (this.queue[state.index]?.id === state.id || (nativeUri && this.queue[state.index]?.nativeUri === nativeUri)) ? state.index : this.queue.findIndex(t => t.id === state.id);
    if (index < 0) return;
    if (this.currentTrack !== this.queue[index] || this.queueIndex !== index) {
      this.queueIndex = index;
      this.currentTrack = this.queue[index];
      this.onTrackChange?.(this.currentTrack);
      this.onQueueChange?.(this.queue, index);
      this.publishNativeArtwork();
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
    if(this.nativePlayback){window.AndroidBridge?.playbackCommand?.('next',0);return;}

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
    if(this.nativePlayback){window.AndroidBridge?.playbackCommand?.('previous',0);return;}

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
    if(this.nativePlayback){
      window.AndroidBridge?.playbackCommand?.('shuffle',this.isShuffle?1:0);
      this.savePreferences();this.onShuffleChange?.(this.isShuffle);return;
    }
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

  moveUpcomingTrack(from, to) {
    // Editing the future queue must never reload or seek the playing track.
    const first=this.queueIndex+1;
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<first||to<first||from>=this.queue.length||to>=this.queue.length||from===to)return;
    const [track]=this.queue.splice(from,1);this.queue.splice(to,0,track);
    if(!this.isShuffle)this.originalQueue=this.queue.slice();
    this.syncNativeQueue();this.onQueueChange?.(this.queue,this.queueIndex);
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

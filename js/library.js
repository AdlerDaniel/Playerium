/**
 * Spotify Local Player - Library & Database Layer
 * IndexedDB persistence for tracks, playlists, folders, and likes.
 */

import { ID3Parser } from "./id3-parser.js";

const DB_NAME = "spotify_local_player_db";
const DB_VERSION = 2;

export class Library {
  constructor() {
    this.db = null;
    this.tracks = new Map(); // id -> track
    this.playlists = new Map(); // id -> playlist
    this.folders = [];
    this.audioBlobs = new Map(); // id -> Blob/File (for active session playback)
    this.fileHandles = new Map(); // id -> FileSystemFileHandle (if supported)
    this.onLibraryChanged = null;
    this.importChain = Promise.resolve();
    this.coverUrls = new Map();
  }

  async init() {
    this.db = await this.openDatabase();
    await this.loadAll();
    if (window.AndroidBridge?.getLegacyLibrary) {
      const legacy = window.AndroidBridge.getLegacyLibrary();
      if (legacy) {
        const data = JSON.parse(legacy);
        for (const name of ["tracks", "playlists", "folders"]) {
          for (const item of data[name] || []) await this.putInStore(name, item);
        }
        for (const [key, value] of Object.entries(data.settings || {})) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
        this.tracks.clear(); this.playlists.clear(); await this.loadAll();
      }
      window.AndroidBridge.completeLegacyMigration();
    }
    this.ensureDefaultPlaylists();
  }

  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
        if (!db.objectStoreNames.contains("tracks")) {
          const trackStore = db.createObjectStore("tracks", { keyPath: "id" });
          trackStore.createIndex("title", "title", { unique: false });
          trackStore.createIndex("artist", "artist", { unique: false });
          trackStore.createIndex("album", "album", { unique: false });
          trackStore.createIndex("liked", "liked", { unique: false });
        }
        if (!db.objectStoreNames.contains("playlists")) {
          db.createObjectStore("playlists", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("folders")) {
          db.createObjectStore("folders", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };
    });
  }

  async loadAll() {
    const tracks = await this.getAllFromStore("tracks");
    tracks.forEach((t) => {
      t.pictureUrl = t.pictureBlob ? this.coverURL(t.id, t.pictureBlob) : null;
      this.tracks.set(t.id, t);
    });

    const playlists = await this.getAllFromStore("playlists");
    playlists.forEach((p) => this.playlists.set(p.id, p));

    this.folders = await this.getAllFromStore("folders");
  }

  ensureDefaultPlaylists() {
    // Check if Liked Songs pseudo-playlist needs initial representation
    const likedTracks = this.getLikedTracks();
    // Default playlists are ready
  }

  getAllFromStore(storeName) {
    return new Promise((resolve) => {
      const tx = this.db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  coverURL(id, blob) {
    if (this.coverUrls.has(id)) URL.revokeObjectURL(this.coverUrls.get(id));
    const url = URL.createObjectURL(blob);
    this.coverUrls.set(id, url);
    return url;
  }

  putInStore(storeName, item) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const stored = storeName === "tracks" ? { ...item, pictureUrl: null } : item;
      tx.objectStore(storeName).put(stored);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Не удалось сохранить библиотеку"));
    });
  }

  deleteFromStore(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Не удалось сохранить библиотеку"));
    });
  }

  getFromStore(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAudioFile(track) {
    if (this.audioBlobs.has(track.id)) return this.audioBlobs.get(track.id);
    const saved = await this.getFromStore("files", track.id);
    if (saved?.handle) return saved.handle.getFile();
    return saved?.blob || null;
  }

  async probeDuration(file) { return ID3Parser.probeDuration(file); }

  // --- Track Management ---

  getTracks() {
    return Array.from(this.tracks.values());
  }

  getTrackById(id) {
    return this.tracks.get(id);
  }

  async toggleLike(trackId) {
    const track = this.tracks.get(trackId);
    if (!track) return false;
    track.liked = !track.liked;
    await this.putInStore("tracks", track);
    if (this.onLibraryChanged) this.onLibraryChanged();
    return track.liked;
  }

  getLikedTracks() {
    return this.getTracks().filter((t) => t.liked);
  }

  // --- Playlist Management ---

  getPlaylists() {
    return Array.from(this.playlists.values());
  }

  getPlaylistById(id) {
    return this.playlists.get(id);
  }

  async createPlaylist(name, description = "") {
    const id = "pl_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const playlist = {
      id,
      name: name || `Мой плейлист #${this.playlists.size + 1}`,
      description,
      trackIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      coverUrl: null
    };
    this.playlists.set(id, playlist);
    await this.putInStore("playlists", playlist);
    if (this.onLibraryChanged) this.onLibraryChanged();
    return playlist;
  }

  async renamePlaylist(id, newName, newDesc) {
    const playlist = this.playlists.get(id);
    if (!playlist) return;
    playlist.name = newName || playlist.name;
    if (typeof newDesc === "string") playlist.description = newDesc;
    playlist.updatedAt = Date.now();
    await this.putInStore("playlists", playlist);
    if (this.onLibraryChanged) this.onLibraryChanged();
  }

  async deletePlaylist(id) {
    this.playlists.delete(id);
    await this.deleteFromStore("playlists", id);
    if (this.onLibraryChanged) this.onLibraryChanged();
  }

  async addTrackToPlaylist(playlistId, trackId) {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return;
    if (!playlist.trackIds.includes(trackId)) {
      playlist.trackIds.push(trackId);
      playlist.updatedAt = Date.now();
      await this.putInStore("playlists", playlist);
      if (this.onLibraryChanged) this.onLibraryChanged();
    }
  }

  async removeTrackFromPlaylist(playlistId, trackId) {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return;
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
    playlist.updatedAt = Date.now();
    await this.putInStore("playlists", playlist);
    if (this.onLibraryChanged) this.onLibraryChanged();
  }

  getPlaylistTracks(playlistId) {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return [];
    return playlist.trackIds.map((id) => this.tracks.get(id)).filter(Boolean);
  }

  // --- Artist & Album Grouping ---

  getArtists() {
    const artistMap = new Map();
    this.getTracks().forEach((track) => {
      const artist = track.artist || "Неизвестный исполнитель";
      if (!artistMap.has(artist)) {
        artistMap.set(artist, {
          name: artist,
          trackCount: 0,
          pictureUrl: track.pictureUrl || null,
          tracks: []
        });
      }
      const entry = artistMap.get(artist);
      entry.trackCount++;
      entry.tracks.push(track);
      if (!entry.pictureUrl && track.pictureUrl) {
        entry.pictureUrl = track.pictureUrl;
      }
    });
    return Array.from(artistMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getAlbums() {
    const albumMap = new Map();
    this.getTracks().forEach((track) => {
      const album = track.album || "Неизвестный альбом";
      const key = `${album}___${track.artist}`;
      if (!albumMap.has(key)) {
        albumMap.set(key, {
          name: album,
          artist: track.artist || "Неизвестный исполнитель",
          year: track.year || "",
          trackCount: 0,
          pictureUrl: track.pictureUrl || null,
          tracks: []
        });
      }
      const entry = albumMap.get(key);
      entry.trackCount++;
      entry.tracks.push(track);
      if (!entry.pictureUrl && track.pictureUrl) {
        entry.pictureUrl = track.pictureUrl;
      }
    });
    return Array.from(albumMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  // --- Sorting & Searching ---

  search(query) {
    if (!query || !query.trim()) return this.getTracks();
    const q = query.trim().toLowerCase();
    return this.getTracks().filter((t) => {
      return (t.title && t.title.toLowerCase().includes(q)) ||
             (t.artist && t.artist.toLowerCase().includes(q)) ||
             (t.album && t.album.toLowerCase().includes(q));
    });
  }

  sortTracks(tracks, sortBy = "dateAdded", sortAsc = true) {
    const list = [...tracks];
    list.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case "title":
          valA = (a.title || "").toLowerCase();
          valB = (b.title || "").toLowerCase();
          break;
        case "artist":
          valA = (a.artist || "").toLowerCase();
          valB = (b.artist || "").toLowerCase();
          break;
        case "album":
          valA = (a.album || "").toLowerCase();
          valB = (b.album || "").toLowerCase();
          break;
        case "duration":
          valA = a.duration || 0;
          valB = b.duration || 0;
          break;
        case "dateAdded":
        default:
          valA = a.dateAdded || 0;
          valB = b.dateAdded || 0;
          break;
      }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }

  // --- Folder & File Import ---

  /**
   * Process a list of File objects (from directory picker or drag-and-drop)
   */
  async processFiles(files, folderName = "Локальная музыка", progressCallback = null, source = null) {
    // File objects must stay available until committed, including after a restart.
    const folderSource = source || `web:${folderName}`;
    const descriptors = files.map(file => ({ name: file.name, size: file.size, lastModified: file.lastModified,
      relativePath: file.relativePath || file.webkitRelativePath || file.name, file, handle: file.handle }));
    const result = await this.syncFolderToPlaylist(folderName, folderSource, descriptors, false, progressCallback, false);
    return result.addedCount;
  }

  /**
   * Scan directory using modern File System Access API (showDirectoryPicker)
   */
  async scanDirectoryHandle(dirHandle, progressCallback) {
    const files = [];
    async function readDirectory(handle) {
      for await (const entry of handle.values()) {
        if (entry.kind === "file") {
          const file = await entry.getFile();
          files.push(file);
        } else if (entry.kind === "directory") {
          await readDirectory(entry);
        }
      }
    }
    await readDirectory(dirHandle);
    return await this.processFiles(files, dirHandle.name, progressCallback);
  }

  /**
   * Remove folder and its tracks from library
   */
  async removeFolder(folderId) {
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder) return;
    
    // Find tracks in this folder
    const tracksToRemove = this.getTracks().filter((t) => t.folderName === folder.name);
    for (const t of tracksToRemove) {
      this.tracks.delete(t.id);
      this.audioBlobs.delete(t.id);
      await this.deleteFromStore("tracks", t.id);
    }

    this.folders = this.folders.filter((f) => f.id !== folderId);
    await this.deleteFromStore("folders", folderId);

    if (this.onLibraryChanged) this.onLibraryChanged();
  }

  /**
   * Clear all tracks and library data
   */
  async clearAll() {
    this.tracks.clear();
    this.audioBlobs.clear();
    for (const url of this.coverUrls.values()) URL.revokeObjectURL(url);
    this.coverUrls.clear();
    this.playlists.clear();
    this.folders = [];

    const tx = this.db.transaction(["tracks", "playlists", "folders", "files"], "readwrite");
    tx.objectStore("tracks").clear();
    tx.objectStore("playlists").clear();
    tx.objectStore("folders").clear();
    tx.objectStore("files").clear();
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); });

    if (this.onLibraryChanged) this.onLibraryChanged();
  }

  // --- Folder Synced Playlists ---

  findPlaylistByFolderSource(source) {
    if (!source) return null;
    return this.getPlaylists().find((p) => p.folderSource === source);
  }

  syncFolderToPlaylist(...args) {
    // Watcher events and manual imports cannot mutate the same playlist concurrently.
    const result = this.importChain.catch(() => {}).then(() => this.importFolder(...args));
    this.importChain = result;
    return result;
  }

  async importFolder(folderName, folderSource, files, isAndroid = false, progressCallback = null, replaceContents = true) {
    const audio = files.filter(f => /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(f.name));
    const identity = f => f.fullPath || f.uri || `${folderSource}/${f.relativePath || f.name}`;
    const lyricsKey = f => (f.relativePath || f.fullPath || f.uri || f.name).replace(/\.[^/.]+$/, "").toLowerCase();
    const lyrics = new Map(files.filter(f => /\.lrc$/i.test(f.name)).map(f => [lyricsKey(f), f]));
    let playlist = this.findPlaylistByFolderSource(folderSource);
    const isNewPlaylist = !playlist;
    if (!playlist) {
      playlist = { id: `pl_fld_${crypto.randomUUID()}`, name: folderName, description: `Авто-плейлист папки: ${folderName}`,
        trackIds: [], createdAt: Date.now(), updatedAt: Date.now(), coverUrl: null, isFolderPlaylist: true, folderSource, isAndroid };
    }
    const index = new Map(this.getTracks().map(t => [t.sourceKey || t.filePath || t.nativeUri, t]));
    const ids = [];
    const playlistIds = new Set(playlist.trackIds);
    let addedCount = 0;
    let failedCount = 0;
    for (let i = 0; i < audio.length; i++) {
      const f = audio[i];
      const key = identity(f);
      let track = index.get(key);
      const lyricsFile = lyrics.get(lyricsKey(f));
      const lyricsModified = lyricsFile?.lastModified || lyricsFile?.file?.lastModified || f.metadata?.lyricsModified || 0;
      const changed = !track || track.lyricsModified !== lyricsModified || track.fileSize !== f.size || track.lastModified !== f.lastModified || !track.metadataImported;
      if (changed) {
        const cleanName = f.name.replace(/\.[^/.]+$/, "");
        const parts = cleanName.split(" - ");
        let metadata = { title: parts.length > 1 ? parts.slice(1).join(" - ") : cleanName,
          artist: parts.length > 1 ? parts[0] : "Неизвестный исполнитель", album: folderName, duration: 0 };
        let parsed = true;
        try {
          if (f.file) metadata = { ...metadata, ...await ID3Parser.parseFile(f.file) };
          else if (f.fullPath && window.electronAPI) {
            const native = await window.electronAPI.getMetadata(f.fullPath);
            for (const [k,v] of Object.entries(native)) if (v !== undefined && v !== null && v !== "") metadata[k] = v;
            if (native.picture) metadata.pictureBlob = new Blob([native.picture.data], { type: native.picture.type });
          } else if (f.metadata) {
            for (const [k,v] of Object.entries(f.metadata)) if (v !== undefined && v !== null && v !== "") metadata[k] = v;
            if (f.metadata.pictureBase64) {
              const bytes = Uint8Array.from(atob(f.metadata.pictureBase64), c => c.charCodeAt(0));
              metadata.pictureBlob = new Blob([bytes], { type: "image/jpeg" });
            }
          }
          const lrc = lyrics.get(lyricsKey(f));
          if (lrc) metadata.lyrics = lrc.file ? await lrc.file.text() : await window.electronAPI.readLyrics(lrc.fullPath);
        } catch (error) { parsed = false; failedCount++; console.warn("Metadata import failed:", f.name, error); }
        const id = track?.id || `trk_${crypto.randomUUID()}`;
        const previous = track;
        track = { ...metadata, id, fileName: f.name, fileSize: f.size || 0, lastModified: f.lastModified,
          sourceKey: key, folderSource, folderName, lyricsModified, filePath: f.fullPath || null, nativeUri: f.uri || null,
          liked: previous?.liked || false, dateAdded: previous?.dateAdded || Date.now(), metadataImported: parsed, unavailable: false };
        delete track.picture; delete track.pictureBase64;
        if (track.pictureBlob) track.pictureUrl = this.coverURL(id, track.pictureBlob);
        else {
          if (this.coverUrls.has(id)) URL.revokeObjectURL(this.coverUrls.get(id));
          this.coverUrls.delete(id); track.pictureUrl = null;
        }
        // Never store ephemeral object URLs produced by the parser.
        if (metadata.pictureUrl) URL.revokeObjectURL(metadata.pictureUrl);
        if (f.file) await this.putInStore("files", { id, ...(f.handle ? { handle: f.handle } : { blob: f.file }) });
        await this.putInStore("tracks", track);
        this.tracks.set(id, track); index.set(key, track);
      } else if (track.unavailable) {
        track.unavailable = false; await this.putInStore("tracks", track);
      }
      if (!playlistIds.has(track.id)) addedCount++;
      ids.push(track.id);
      progressCallback?.(i + 1, audio.length, f.name);
      if (i % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    // Preserve IDs/likes/manual playlists, but remove disappeared files from the folder playlist.
    const importedIds = new Set(ids);
    for (const id of (replaceContents ? playlist.trackIds.filter(id => !importedIds.has(id)) : [])) {
      const t = this.tracks.get(id);
      if (t) { t.unavailable = true; await this.putInStore("tracks", t); }
    }
    playlist.trackIds = [...new Set(replaceContents ? ids : [...playlist.trackIds, ...ids])];
    playlist.updatedAt = Date.now();
    await this.putInStore("playlists", playlist);
    this.playlists.set(playlist.id, playlist);
    this.onLibraryChanged?.();
    return { playlist, addedCount, failedCount, isNewPlaylist };
  }

  async initFolderWatchers() {
    for (const p of this.getPlaylists()) {
      if (!p.isFolderPlaylist || !p.folderSource) continue;
      try {
        if (window.electronAPI && !p.isAndroid && !p.folderSource.startsWith("web:")) {
          const files = await window.electronAPI.watchFolder(p.folderSource);
          await this.syncFolderToPlaylist(p.name, p.folderSource, files);
        } else if (window.AndroidBridge && p.isAndroid) window.AndroidBridge.rescanFolder(p.folderSource);
      } catch (error) { this.onAccessError?.(p, error); }
    }
  }
}

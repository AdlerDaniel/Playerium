/**
 * Spotify Local Player - Library & Database Layer
 * IndexedDB persistence for tracks, playlists, folders, and likes.
 */

import { ID3Parser } from "./id3-parser.js";

const DB_NAME = "spotify_local_player_db";
const DB_VERSION = 1;

export class Library {
  constructor() {
    this.db = null;
    this.tracks = new Map(); // id -> track
    this.playlists = new Map(); // id -> playlist
    this.folders = [];
    this.audioBlobs = new Map(); // id -> Blob/File (for active session playback)
    this.fileHandles = new Map(); // id -> FileSystemFileHandle (if supported)
    this.onLibraryChanged = null;
  }

  async init() {
    this.db = await this.openDatabase();
    await this.loadAll();
    this.ensureDefaultPlaylists();
  }

  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
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
    tracks.forEach((t) => this.tracks.set(t.id, t));

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

  putInStore(storeName, item) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  deleteFromStore(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

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
  async processFiles(files, folderName = "Локальная музыка", progressCallback = null) {
    const audioExtensions = [".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac"];
    const lrcFiles = new Map(); // basename -> File
    const audioFiles = [];

    // First pass: categorize audio and lyrics
    for (const file of files) {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      const baseName = file.name.substring(0, file.name.lastIndexOf(".")).toLowerCase();
      if (audioExtensions.includes(ext)) {
        audioFiles.push(file);
      } else if (ext === ".lrc" || ext === ".txt") {
        lrcFiles.set(baseName, file);
      }
    }

    if (audioFiles.length === 0) return 0;

    let importedCount = 0;
    const total = audioFiles.length;

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      try {
        const metadata = await ID3Parser.parseFile(file);
        const trackId = "trk_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();

        // Check if there is an external .lrc file matching this audio file
        const baseName = file.name.substring(0, file.name.lastIndexOf(".")).toLowerCase();
        if (lrcFiles.has(baseName) && !metadata.lyrics) {
          try {
            metadata.lyrics = await lrcFiles.get(baseName).text();
          } catch {}
        }

        const track = {
          id: trackId,
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          year: metadata.year,
          trackNo: metadata.trackNo,
          duration: metadata.duration,
          pictureUrl: metadata.pictureUrl,
          lyrics: metadata.lyrics,
          fileName: file.name,
          fileSize: file.size,
          folderName,
          dateAdded: Date.now(),
          liked: false
        };

        // Cache file blob for instant playback
        this.audioBlobs.set(trackId, file);
        this.tracks.set(trackId, track);
        await this.putInStore("tracks", track);
        importedCount++;

        if (progressCallback) {
          progressCallback(importedCount, total, file.name);
        }
      } catch (err) {
        console.warn("Failed to process file:", file.name, err);
      }
    }

    // Register folder
    const folderId = "fld_" + Date.now();
    const folderObj = {
      id: folderId,
      name: folderName,
      count: importedCount,
      dateAdded: Date.now()
    };
    this.folders.push(folderObj);
    await this.putInStore("folders", folderObj);

    if (this.onLibraryChanged) this.onLibraryChanged();
    return importedCount;
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
    this.playlists.clear();
    this.folders = [];

    const tx = this.db.transaction(["tracks", "playlists", "folders"], "readwrite");
    tx.objectStore("tracks").clear();
    tx.objectStore("playlists").clear();
    tx.objectStore("folders").clear();

    if (this.onLibraryChanged) this.onLibraryChanged();
  }

  // --- Folder Synced Playlists ---

  findPlaylistByFolderSource(source) {
    if (!source) return null;
    return this.getPlaylists().find((p) => p.folderSource === source);
  }

  async syncFolderToPlaylist(folderName, folderSource, files, isAndroid = false) {
    let playlist = this.findPlaylistByFolderSource(folderSource);
    let isNewPlaylist = false;

    if (!playlist) {
      isNewPlaylist = true;
      const id = "pl_fld_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
      playlist = {
        id,
        name: folderName || "Музыкальная папка",
        description: `Авто-плейлист папки: ${folderName}`,
        trackIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        coverUrl: null,
        isFolderPlaylist: true,
        folderSource: folderSource,
        isAndroid: isAndroid
      };
      this.playlists.set(id, playlist);
      await this.putInStore("playlists", playlist);
    }

    let addedCount = 0;
    const existingTracks = this.getTracks();

    for (const f of files) {
      let track = existingTracks.find((t) => {
        if (t.filePath && f.fullPath && t.filePath === f.fullPath) return true;
        if (t.nativeUri && f.uri && t.nativeUri === f.uri) return true;
        if (t.fileName === f.name && t.fileSize === f.size) return true;
        return false;
      });

      if (!track) {
        let rawName = f.name.replace(/\.[^/.]+$/, "");
        let artist = "Неизвестный исполнитель";
        let title = rawName;
        if (rawName.includes(" - ")) {
          const parts = rawName.split(" - ");
          artist = parts[0].trim();
          title = parts.slice(1).join(" - ").trim();
        }

        const trackId = "trk_fld_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
        track = {
          id: trackId,
          title: title,
          artist: artist,
          album: folderName || "Локальный альбом",
          year: "",
          trackNo: "",
          duration: 0,
          pictureUrl: null,
          lyrics: null,
          fileName: f.name,
          filePath: f.fullPath || null,
          nativeUri: f.uri || null,
          fileSize: f.size || 0,
          folderName: folderName,
          dateAdded: Date.now(),
          liked: false
        };

        this.tracks.set(trackId, track);
        await this.putInStore("tracks", track);
        existingTracks.push(track);
      }

      if (!playlist.trackIds.includes(track.id)) {
        playlist.trackIds.push(track.id);
        addedCount++;
      }
    }

    if (addedCount > 0 || isNewPlaylist) {
      playlist.updatedAt = Date.now();
      await this.putInStore("playlists", playlist);
      if (this.onLibraryChanged) this.onLibraryChanged();
    }

    return { playlist, addedCount, isNewPlaylist };
  }

  initFolderWatchers() {
    for (const p of this.getPlaylists()) {
      if (p.isFolderPlaylist && p.folderSource) {
        if (window.electronAPI && window.electronAPI.watchFolder && !p.isAndroid) {
          window.electronAPI.watchFolder(p.folderSource);
        } else if (window.AndroidBridge && window.AndroidBridge.rescanFolder && p.isAndroid) {
          window.AndroidBridge.rescanFolder(p.folderSource);
        }
      }
    }
  }
}

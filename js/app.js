import { bindUpdateController } from "./update-controller.js";
/**
 * Spotify Local Player - Main Entry Point
 */

import { Library } from "./library.js";
import { AudioPlayer } from "./audio-player.js";
import { UIController } from "./ui-controller.js";
import { ShortcutsManager } from "./shortcuts.js";
import { MusicCatalog } from './music-catalog.js';

class App {
  constructor() {
    this.library = new Library();
    this.player = new AudioPlayer(this.library);
    this.ui = new UIController(this.library, this.player);
    this.music = new MusicCatalog(this.library, this.ui);
    this.ui.music = this.music;
    this.shortcuts = new ShortcutsManager(this.player, this.ui);
    this.player.onError = message => this.ui.showToast(message, "error");
    this.library.onAccessError = p => this.ui.showToast(`Нет доступа к папке «${p.name}». Нажмите «Добавить папку», чтобы восстановить доступ.`, "error");
  }

  async start() {
    try {
      // Expose globally for native Android WebView bridge & Electron IPC
      window.playerApp = this;

      await this.library.init();
      // Android can relocate old downloads before exposing playable library rows.
      if(window.AndroidBridge)await this.music.restore();
      this.player.loadSavedPreferences();
      this.ui.init();
      if(!window.AndroidBridge)this.music.restore();
      if (window.AndroidBridge?.getPlaybackState) {
        try { this.player.applyNativeState(JSON.parse(window.AndroidBridge.getPlaybackState()));this.player.syncNativeQueue(); } catch {}
      }

      // Hook UI folder picker to universal selector
      this.ui.triggerFolderPicker = () => this.selectMusicFolder();

      bindUpdateController.call(this);

      // Hook hidden fallback inputs
      const hiddenFolder = document.getElementById("hiddenFolderPicker");
      if (hiddenFolder) {
        hiddenFolder.addEventListener("change", async (e) => {
          const files = Array.from(e.target.files);
          if (files.length > 0) {
            const folderName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : "Локальная музыка";
            await this.library.processFiles(files, folderName);
            this.ui.refreshCurrentView();
          }
        });
      }

      const hiddenAudio = document.getElementById("hiddenAudioFilesPicker");
      if (hiddenAudio) {
        hiddenAudio.addEventListener("change", async (e) => {
          const files = Array.from(e.target.files);
          if (files.length > 0) {
            const count = await this.library.processFiles(files, "Мои треки");
            this.ui.showToast(`Добавлено аудиофайлов: ${count}`, "success");
            this.ui.renderSidebar();
            this.ui.refreshCurrentView();
          }
        });
      }

      // Electron directory watcher events
      if (window.electronAPI) {
        window.electronAPI.onFolderUpdated?.(async (data) => {
          if (data?.error) this.ui.showToast(data.error, "error");
          if (data && data.files) {
            await this.handleFolderFilesReceived(data.folderName, data.folderPath, data.files, false, data.isInitial);
          }
        });

        // Initialize watchers for saved folder playlists
        this.library.initFolderWatchers();
      }

      // Android folder watcher callback
      if (window.AndroidBridge) {
        this.library.initFolderWatchers();
      }

      console.log("Playerium initialized successfully.");
      setTimeout(()=>this.music.repairCovers().catch(console.warn),1000);
    } catch (e) {
      console.error("Failed to start Playerium:", e);
    }
  }

  /**
   * Called by native Android bridge when folder files are scanned
   */
  async onFolderImported(data) {
    if (!data || !data.files) return;
    await this.handleFolderFilesReceived(data.folderName, data.folderUri, data.files, true, data.isInitial);
  }

  async handleFolderFilesReceived(folderName, folderSource, files, isAndroid, isInitial) {
    if (isInitial) this.library.blockedSources.delete(folderSource);
    const res = await this.library.syncFolderToPlaylist(folderName, folderSource, files, isAndroid);
    if (res.ignored) return;
    if (res.failedCount) this.ui.showToast(`Не удалось прочитать метаданные ${res.failedCount} файлов. Повторите импорт.`, "error");
    if (res.addedCount > 0) this.ui.showToast(`В «Добавленные» добавлено ${res.addedCount} треков`, "success");

    this.ui.renderSidebar();
    this.ui.refreshCurrentView();
  }

  /**
   * Universal folder selector for Android, PC (Electron), or Web
   */
  async selectMusicFolder() {
    // 1. Android Native Document Tree
    if (window.AndroidBridge && typeof window.AndroidBridge.openFolderPicker === "function") {
      window.AndroidBridge.openFolderPicker();
      return;
    }

    // 2. PC Electron Dialog
    if (window.electronAPI && typeof window.electronAPI.selectFolder === "function") {
      const data = await window.electronAPI.selectFolder();
      if (data && data.folderPath) {
        await this.handleFolderFilesReceived(data.folderName, data.folderPath, data.files, false, true);
      }
      return;
    }

    // 3. Web File System Access API
    if ("showDirectoryPicker" in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        const files = [];
        async function readDir(handle, prefix = "") {
          for await (const entry of handle.values()) {
            if (entry.kind === "file") {
              const file = await entry.getFile();
              file.relativePath = prefix + file.name;
              file.handle = entry;
              files.push(file);
            } else if (entry.kind === "directory") {
              await readDir(entry, prefix + entry.name + "/");
            }
          }
        }
        await readDir(dirHandle);
        const count = await this.library.processFiles(files, dirHandle.name);
        this.ui.showToast(`Импортировано ${count} треков из ${dirHandle.name}`, "success");
        this.ui.renderSidebar();
        this.ui.refreshCurrentView();
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("Folder picker error:", err);
        }
      }
      return;
    }

    // 4. Fallback: Hidden folder input
    const input = document.getElementById("hiddenFolderPicker");
    if (input) {
      input.click();
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.start();
});

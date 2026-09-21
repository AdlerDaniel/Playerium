/**
 * Spotify Local Player - Main Entry Point
 */

import { Library } from "./library.js";
import { AudioPlayer } from "./audio-player.js";
import { UIController } from "./ui-controller.js";
import { ShortcutsManager } from "./shortcuts.js";

class App {
  constructor() {
    this.library = new Library();
    this.player = new AudioPlayer(this.library);
    this.ui = new UIController(this.library, this.player);
    this.shortcuts = new ShortcutsManager(this.player, this.ui);
  }

  async start() {
    try {
      // Expose globally for native Android WebView bridge & Electron IPC
      window.playerApp = this;

      await this.library.init();
      this.ui.init();

      // Hook UI folder picker to universal selector
      this.ui.triggerFolderPicker = () => this.selectMusicFolder();

      // Hook update modal with visual download feedback
      this.lastUpdateInfo = null;
      this.ui.showUpdateModal = (info) => {
        this.lastUpdateInfo = info;
        const modal = document.getElementById("modalUpdateAvailable");
        if (!modal) return;
        document.getElementById("updateModalLatestVer").textContent = "v" + info.latestVersion;
        document.getElementById("updateModalCurrentVer").textContent = "v" + info.currentVersion;
        document.getElementById("updateModalNotes").textContent = info.releaseNotes || "Новая версия Playerium доступна для загрузки.";

        const statusBox = document.getElementById("updateDownloadStatus");
        if (statusBox) statusBox.style.display = "none";
        const dlBtn = document.getElementById("btnDownloadUpdate");
        const dlText = document.getElementById("btnDownloadUpdateText");
        const dlIcon = document.getElementById("btnDownloadUpdateIcon");
        if (dlBtn) {
          dlBtn.disabled = false;
          dlBtn.style.opacity = "1";
          dlBtn.onclick = () => this.ui.handleDownloadUpdate(info);
        }
        if (dlText) dlText.textContent = "Скачать обновление";
        if (dlIcon) {
          dlIcon.innerHTML = `<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>`;
        }

        modal.classList.add("active");
      };

      this.ui.handleDownloadUpdate = (info) => {
        const updateInfo = info || this.lastUpdateInfo || { latestVersion: "1.0.2" };
        const dlBtn = document.getElementById("btnDownloadUpdate");
        const statusBox = document.getElementById("updateDownloadStatus");
        const statusText = document.getElementById("updateStatusText");
        const statusDetail = document.getElementById("updateStatusDetail");
        const dlText = document.getElementById("btnDownloadUpdateText");
        const dlIcon = document.getElementById("btnDownloadUpdateIcon");

        const url = updateInfo.downloadUrl || updateInfo.htmlUrl || "https://github.com/AdlerDaniel/Playerium/releases/latest";
        const isAndroid = /Android/i.test(navigator.userAgent) || Boolean(window.AndroidBridge);
        const fileName = isAndroid ? `Playerium-${updateInfo.latestVersion || "1.0.2"}.apk` : `Playerium-Setup-${updateInfo.latestVersion || "1.0.2"}.exe`;

        // Immediate visual response
        if (dlText) dlText.textContent = "Загрузка...";
        if (dlBtn) {
          dlBtn.disabled = true;
          dlBtn.style.opacity = "0.85";
        }
        if (dlIcon) {
          dlIcon.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border: 2px solid #000; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span>`;
        }
        if (statusBox) {
          statusBox.style.display = "block";
        }
        if (statusText) {
          statusText.textContent = isAndroid ? "Загрузка APK началась..." : "Загрузка обновления началась...";
        }
        if (statusDetail) {
          statusDetail.textContent = isAndroid
            ? `Файл ${fileName} загружается. Проверьте системную шторку уведомлений Android.`
            : `Файл ${fileName} загружается через браузер.`;
        }

        this.ui.showToast(`📥 Загрузка ${fileName} начата! Проверьте уведомления`, "success");

        // Native Android Bridge or Electron or Browser
        if (window.AndroidBridge && typeof window.AndroidBridge.downloadUpdate === "function") {
          window.AndroidBridge.downloadUpdate(url, fileName);
        } else if (window.AndroidBridge && typeof window.AndroidBridge.openExternalUrl === "function") {
          window.AndroidBridge.openExternalUrl(url);
        } else if (window.electronAPI && typeof window.electronAPI.openExternal === "function") {
          window.electronAPI.openExternal(url);
        } else {
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        setTimeout(() => {
          if (dlText) dlText.textContent = "Скачать повторно";
          if (dlBtn) {
            dlBtn.disabled = false;
            dlBtn.style.opacity = "1";
          }
          if (dlIcon) {
            dlIcon.innerHTML = `<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>`;
          }
          if (statusText) {
            statusText.textContent = "Файл отправлен на загрузку!";
          }
        }, 4000);
      };

      // Hook hidden fallback inputs
      const hiddenFolder = document.getElementById("hiddenFolderPicker");
      if (hiddenFolder) {
        hiddenFolder.addEventListener("change", async (e) => {
          const files = Array.from(e.target.files);
          if (files.length > 0) {
            const folderName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : "Локальная музыка";
            await this.handleFolderFilesReceived(folderName, folderName, files, false, true);
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
    const res = await this.library.syncFolderToPlaylist(folderName, folderSource, files, isAndroid);
    if (res.isNewPlaylist) {
      this.ui.showToast(`Создан плейлист «${res.playlist.name}» (${res.addedCount} треков)`, "success");
    } else if (res.addedCount > 0) {
      this.ui.showToast(`В плейлист «${res.playlist.name}» добавлено ${res.addedCount} новых треков`, "success");
    }

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
        async function readDir(handle) {
          for await (const entry of handle.values()) {
            if (entry.kind === "file") {
              const file = await entry.getFile();
              files.push(file);
            } else if (entry.kind === "directory") {
              await readDir(entry);
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

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
      // Hook update modal with visual download feedback
      this.lastUpdateInfo = null;
      this.activeDownloadedUpdateId = null;

      this.ui.showUpdateModal = (info) => {
        this.lastUpdateInfo = info;
        this.activeDownloadedUpdateId = null;
        const modal = document.getElementById("modalUpdateAvailable");
        if (!modal) return;
        document.getElementById("updateModalLatestVer").textContent = "v" + info.latestVersion;
        document.getElementById("updateModalCurrentVer").textContent = "v" + info.currentVersion;
        document.getElementById("updateModalNotes").textContent = info.releaseNotes || "Новая версия Playerium доступна для загрузки.";

        const statusBox = document.getElementById("updateDownloadStatus");
        if (statusBox) statusBox.style.display = "none";
        const progressFill = document.getElementById("updateProgressBarFill");
        if (progressFill) progressFill.style.width = "0%";
        const percentText = document.getElementById("updatePercentText");
        if (percentText) percentText.textContent = "0%";
        const spinner = document.getElementById("updateSpinner");
        if (spinner) spinner.style.display = "inline-block";

        const dlBtn = document.getElementById("btnDownloadUpdate");
        const dlText = document.getElementById("btnDownloadUpdateText");
        const dlIcon = document.getElementById("btnDownloadUpdateIcon");
        if (dlBtn) {
          dlBtn.disabled = false;
          dlBtn.style.opacity = "1";
          dlBtn.style.backgroundColor = "";
          dlBtn.style.color = "";
          dlBtn.onclick = () => this.ui.handleDownloadUpdate(info);
        }
        if (dlText) dlText.textContent = "Скачать обновление";
        if (dlIcon) {
          dlIcon.innerHTML = `<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>`;
        }

        modal.classList.add("active");
      };

      // Called from Android Native Bridge during download
      this.onUpdateDownloadProgress = (percent, bytesDownloaded, totalBytes) => {
        const p = Math.max(0, Math.min(100, percent || 0));
        const progressFill = document.getElementById("updateProgressBarFill");
        if (progressFill) progressFill.style.width = p + "%";
        const percentText = document.getElementById("updatePercentText");
        if (percentText) percentText.textContent = p + "%";
        const statusText = document.getElementById("updateStatusText");
        if (statusText) statusText.textContent = `Загрузка обновления (${p}%)...`;
        const statusDetail = document.getElementById("updateStatusDetail");
        if (statusDetail) {
          if (totalBytes > 0 && bytesDownloaded > 0) {
            const mbDown = (bytesDownloaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
            statusDetail.textContent = `${mbDown} МБ из ${mbTotal} МБ скачано`;
          } else {
            statusDetail.textContent = `Загрузка файла обновления (${p}%)...`;
          }
        }
      };

      // Called from Android Native Bridge when download finishes
      this.onUpdateDownloadComplete = (downloadId) => {
        this.activeDownloadedUpdateId = downloadId;
        const progressFill = document.getElementById("updateProgressBarFill");
        if (progressFill) progressFill.style.width = "100%";
        const percentText = document.getElementById("updatePercentText");
        if (percentText) percentText.textContent = "100%";
        const statusText = document.getElementById("updateStatusText");
        if (statusText) statusText.textContent = "Обновление готово к установке!";
        const statusDetail = document.getElementById("updateStatusDetail");
        if (statusDetail) statusDetail.textContent = "Файл успешно загружен. Нажмите кнопку «Установить обновление» ниже.";
        const spinner = document.getElementById("updateSpinner");
        if (spinner) spinner.style.display = "none";

        const dlBtn = document.getElementById("btnDownloadUpdate");
        const dlText = document.getElementById("btnDownloadUpdateText");
        const dlIcon = document.getElementById("btnDownloadUpdateIcon");
        if (dlBtn) {
          dlBtn.disabled = false;
          dlBtn.style.opacity = "1";
          dlBtn.style.backgroundColor = "var(--sp-green)";
          dlBtn.style.color = "var(--sp-black)";
          dlBtn.onclick = () => this.installUpdate(downloadId);
        }
        if (dlText) dlText.textContent = "Установить обновление";
        if (dlIcon) {
          dlIcon.innerHTML = `<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>`;
        }

        this.ui.showToast("✅ Обновление скачано! Нажмите «Установить»", "success");
      };

      // Called from Android Native Bridge if download fails
      this.onUpdateDownloadFailed = (reason) => {
        const statusText = document.getElementById("updateStatusText");
        if (statusText) statusText.textContent = "Ошибка загрузки";
        const statusDetail = document.getElementById("updateStatusDetail");
        if (statusDetail) statusDetail.textContent = reason || "Не удалось загрузить файл обновления. Попробуйте еще раз.";
        const spinner = document.getElementById("updateSpinner");
        if (spinner) spinner.style.display = "none";

        const dlBtn = document.getElementById("btnDownloadUpdate");
        const dlText = document.getElementById("btnDownloadUpdateText");
        if (dlBtn) {
          dlBtn.disabled = false;
          dlBtn.style.opacity = "1";
        }
        if (dlText) dlText.textContent = "Повторить загрузку";
        this.ui.showToast("❌ Ошибка при загрузке обновления", "danger");
      };

      // Trigger installation of downloaded APK
      this.installUpdate = (downloadId) => {
        const id = downloadId || this.activeDownloadedUpdateId || 0;
        if (window.AndroidBridge && typeof window.AndroidBridge.installDownloadedUpdate === "function") {
          window.AndroidBridge.installDownloadedUpdate(id);
        } else {
          this.ui.showToast("Запуск инсталлятора...", "success");
        }
      };

      this.ui.handleDownloadUpdate = (info) => {
        const updateInfo = info || this.lastUpdateInfo || { latestVersion: "1.0.5" };
        const dlBtn = document.getElementById("btnDownloadUpdate");
        const statusBox = document.getElementById("updateDownloadStatus");
        const statusText = document.getElementById("updateStatusText");
        const statusDetail = document.getElementById("updateStatusDetail");
        const dlText = document.getElementById("btnDownloadUpdateText");
        const dlIcon = document.getElementById("btnDownloadUpdateIcon");
        const progressFill = document.getElementById("updateProgressBarFill");
        const percentText = document.getElementById("updatePercentText");
        const spinner = document.getElementById("updateSpinner");

        const url = updateInfo.downloadUrl || updateInfo.htmlUrl || "https://github.com/AdlerDaniel/Playerium/releases/latest";
        const isAndroid = /Android/i.test(navigator.userAgent) || Boolean(window.AndroidBridge);
        const fileName = isAndroid ? `Playerium-${updateInfo.latestVersion || "1.0.5"}.apk` : `Playerium-Setup-${updateInfo.latestVersion || "1.0.5"}.exe`;

        if (dlText) dlText.textContent = "Загрузка...";
        if (dlBtn) {
          dlBtn.disabled = true;
          dlBtn.style.opacity = "0.85";
        }
        if (dlIcon) {
          dlIcon.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border: 2px solid #000; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite;"></span>`;
        }
        if (statusBox) statusBox.style.display = "block";
        if (progressFill) progressFill.style.width = "0%";
        if (percentText) percentText.textContent = "0%";
        if (spinner) spinner.style.display = "inline-block";
        if (statusText) statusText.textContent = isAndroid ? "Подготовка к загрузке..." : "Загрузка обновления...";
        if (statusDetail) {
          statusDetail.textContent = isAndroid
            ? `Файл ${fileName} загружается. Прогресс отображается ниже.`
            : `Файл ${fileName} загружается через браузер.`;
        }

        this.ui.showToast(`📥 Загрузка ${fileName} начата!`, "success");

        if (window.AndroidBridge && typeof window.AndroidBridge.downloadUpdate === "function") {
          window.AndroidBridge.downloadUpdate(url, fileName);
        } else if (window.AndroidBridge && typeof window.AndroidBridge.openExternalUrl === "function") {
          window.AndroidBridge.openExternalUrl(url);
        } else if (window.electronAPI && typeof window.electronAPI.openExternal === "function") {
          window.electronAPI.openExternal(url);
        } else {
          // Browser fallback: simulate progress for web preview
          let simPercent = 0;
          const simInterval = setInterval(() => {
            simPercent += 20;
            if (simPercent >= 100) {
              clearInterval(simInterval);
              this.onUpdateDownloadComplete(1);
            } else {
              this.onUpdateDownloadProgress(simPercent, simPercent * 250000, 25000000);
            }
          }, 350);

          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
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

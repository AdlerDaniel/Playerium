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
      await this.library.init();
      this.ui.init();

      // Electron titlebar / IPC setup if running in Electron
      if (window.electronAPI) {
        window.electronAPI.onFolderSelected?.(async (folderPath, files) => {
          if (files && files.length > 0) {
            const count = await this.library.processFiles(files, folderPath);
            this.ui.showToast(`Импортировано ${count} файлов из ${folderPath}`, "success");
            this.ui.renderSidebar();
            this.ui.refreshCurrentView();
          }
        });
      }

      console.log("Spotify Local Player initialized successfully.");
    } catch (e) {
      console.error("Failed to start player:", e);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.start();
});

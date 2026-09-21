/**
 * Spotify Local Player - Keyboard Shortcuts Manager
 */

export class ShortcutsManager {
  constructor(player, uiController) {
    this.player = player;
    this.ui = uiController;
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener("keydown", (e) => {
      // Ignore shortcut if user is typing in an input or textarea
      const target = e.target;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Escape always closes modals/context menus
      if (e.key === "Escape") {
        this.ui.closeModals();
        this.ui.closeContextMenu();
        return;
      }

      if (isInput) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          this.player.togglePlay();
          break;

        case "ArrowRight":
          if (e.ctrlKey) {
            e.preventDefault();
            this.player.next();
          } else {
            // Seek +5 seconds
            e.preventDefault();
            this.player.seekToTime(this.player.audio.currentTime + 5);
          }
          break;

        case "ArrowLeft":
          if (e.ctrlKey) {
            e.preventDefault();
            this.player.prev();
          } else {
            // Seek -5 seconds
            e.preventDefault();
            this.player.seekToTime(this.player.audio.currentTime - 5);
          }
          break;

        case "ArrowUp":
          if (e.ctrlKey) {
            e.preventDefault();
            this.player.setVolume(Math.min(1, this.player.volume + 0.05));
          }
          break;

        case "ArrowDown":
          if (e.ctrlKey) {
            e.preventDefault();
            this.player.setVolume(Math.max(0, this.player.volume - 0.05));
          }
          break;

        case "KeyM":
          this.player.toggleMute();
          break;

        case "KeyL":
          if (e.ctrlKey) {
            e.preventDefault();
            this.ui.focusSearch();
          }
          break;

        case "KeyQ":
          this.ui.toggleRightPanel("queue");
          break;

        case "KeyK":
          this.ui.toggleLyricsView();
          break;

        default:
          break;
      }
    });
  }
}

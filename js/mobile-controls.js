export function bindMobileEvents() {
    // 1. Mobile Navigation Bar Tabs
    const navHome = document.getElementById("mobileNavHome");
    const navSearch = document.getElementById("mobileNavSearch");
    const navLibrary = document.getElementById("mobileNavLibrary");

    if (navHome) {
      navHome.addEventListener("click", () => {
        this.searchQuery = "";
        document.getElementById("mainSearchInput").value = "";
        document.getElementById("searchClearBtn").classList.remove("visible");
        this.updateMobileNavActive("home");
        this.navigateTo({ type: "home", title: "Главная" });
      });
    }
    if (navSearch) {
      navSearch.addEventListener("click", () => {
        this.updateMobileNavActive("search");
        this.navigateTo({ type: "search", title: "Поиск" });
        setTimeout(() => document.querySelector(".mobile-search-input")?.focus(), 100);
      });
    }
    if (navLibrary) {
      navLibrary.addEventListener("click", () => {
        this.updateMobileNavActive("library");
        this.navigateTo({ type: "library", title: "Моя медиатека" });
      });
    }

    // 2. Mobile Mini-Player (Tap to expand fullscreen)
    const miniPlayer = document.getElementById("mobileMiniPlayer");
    const fsPlayer = document.getElementById("mobileFullscreenPlayer");
    if (miniPlayer) {
      miniPlayer.addEventListener("click", (e) => {
        if (e.target.closest("#mobileMiniLike") || e.target.closest("#mobileMiniPlayPause")) return;
        if (this.player.currentTrack && fsPlayer) {
          fsPlayer.classList.add("active");
        }
      });
    }

    // Mini-player buttons
    document.getElementById("mobileMiniPlayPause")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.player.togglePlay();
    });

    document.getElementById("mobileMiniLike")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (this.player.currentTrack) {
        const liked = await this.library.toggleLike(this.player.currentTrack.id);
        this.updateLikeButtons(this.player.currentTrack.id, liked);
        this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
      }
    });

    // 3. Mobile Fullscreen Player Controls
    document.getElementById("btnMobileFsClose")?.addEventListener("click", () => {
      fsPlayer?.classList.remove("active");
    });

    document.getElementById("btnMobileFsPlayPause")?.addEventListener("click", () => {
      this.player.togglePlay();
    });

    document.getElementById("btnMobileFsNext")?.addEventListener("click", () => {
      this.player.next();
    });

    document.getElementById("btnMobileFsPrev")?.addEventListener("click", () => {
      this.player.prev();
    });

    document.getElementById("btnMobileFsShuffle")?.addEventListener("click", () => {
      this.player.toggleShuffle();
    });

    document.getElementById("btnMobileFsRepeat")?.addEventListener("click", () => {
      this.player.toggleRepeat();
    });

    document.getElementById("btnMobileFsLike")?.addEventListener("click", async () => {
      if (this.player.currentTrack) {
        const liked = await this.library.toggleLike(this.player.currentTrack.id);
        this.updateLikeButtons(this.player.currentTrack.id, liked);
        this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
      }
    });

    // Fullscreen Scrubber slider
    const fsSlider = document.getElementById("mobileFsSlider");
    if (fsSlider) {
      fsSlider.setAttribute('aria-label', 'Позиция воспроизведения');
      fsSlider.addEventListener('pointerdown', () => { fsSlider.dataset.dragging = 'true'; });
      fsSlider.addEventListener('keydown', e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) fsSlider.dataset.dragging = 'true'; });
      const finishSeek = () => { delete fsSlider.dataset.dragging; };
      fsSlider.addEventListener('pointercancel', finishSeek);
      fsSlider.addEventListener('blur', finishSeek);
      fsSlider.addEventListener('pointerup', finishSeek);
      fsSlider.addEventListener('keyup', finishSeek);
      fsSlider.addEventListener("input", (e) => {
        fsSlider.style.setProperty('--seek-progress', e.target.value + '%');
        const dur = this.player.getDuration();
        if (dur > 0) {
          const seekTime = (parseFloat(e.target.value) / 100) * dur;
          document.getElementById("mobileFsTimeCurrent").textContent = this.formatTime(seekTime);
        }
      });
      fsSlider.addEventListener("change", (e) => {
        const dur = this.player.getDuration();
        if (dur > 0) {
          const seekTime = (parseFloat(e.target.value) / 100) * dur;
          this.player.seekToTime(seekTime);
          finishSeek();
        }
      });
    }

    // Fullscreen Equalizer & Queue
    document.getElementById("btnMobileFsEq")?.addEventListener("click", () => {
      fsPlayer?.classList.remove("active");
      this.navigateTo({ type: "settings", title: "Настройки" });
    });

    document.getElementById("btnMobileFsQueue")?.addEventListener("click", () => {
      fsPlayer?.classList.remove("active");
      this.toggleRightPanel("queue");
    });

    // Fullscreen Options Button
    document.getElementById("btnMobileFsOptions")?.addEventListener("click", () => {
      if (this.player.currentTrack) {
        this.showMobileTrackOptionsSheet(this.player.currentTrack, this.player.queueIndex, this.player.queue, null);
      }
    });

    // File-picker imports are bound once by App.

}

export function updateMobileNavActive(tab) {
    document.querySelectorAll(".mobile-nav-item").forEach((btn) => btn.classList.remove("active"));
    if (tab === "home") document.getElementById("mobileNavHome")?.classList.add("active");
    if (tab === "search") document.getElementById("mobileNavSearch")?.classList.add("active");
    if (tab === "library") document.getElementById("mobileNavLibrary")?.classList.add("active");
}

export function showMobileTrackOptionsSheet(track, index, tracks, playlistContext = null) {
    const sheet = document.createElement("div");
    sheet.className = "mobile-bottom-sheet";
    const coverHtml = track.pictureUrl
      ? `<img src="${track.pictureUrl}" alt="Cover" />`
      : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

    sheet.innerHTML = `
      <div class="mobile-sheet-overlay"></div>
      <div class="mobile-sheet-content">
        <div class="mobile-sheet-handle"></div>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);">
          <div style="width: 48px; height: 48px; border-radius: 4px; overflow: hidden; background: #282828; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
            ${coverHtml}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 15px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHTML(track.title)}</div>
            <div style="font-size: 13px; color: var(--sp-text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHTML(track.artist)}</div>
          </div>
        </div>
        <button class="mobile-sheet-item" id="sheetOptLike">
          <svg viewBox="0 0 16 16" width="20" height="20"><path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
          <span>${track.liked ? "Удалить из любимых треков" : "Добавить в любимые треки"}</span>
        </button>
        <button class="mobile-sheet-item" id="sheetOptQueue">
          <svg viewBox="0 0 16 16" width="20" height="20"><path d="M15 15H1v-1.5h14V15zm0-4.5H1V9h14v1.5zm-14-7A2.5 2.5 0 0 1 3.5 1h9a2.5 2.5 0 0 1 2.5 2.5v2a.75.75 0 0 1-1.5 0v-2a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v2a.75.75 0 0 1-1.5 0v-2z"/></svg>
          <span>Добавить в очередь воспроизведения</span>
        </button>
        <button class="mobile-sheet-item" id="sheetOptAddToPlaylist">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
          <span>Добавить в плейлист...</span>
        </button>
        <button class="mobile-sheet-item" id="sheetOptArtist">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          <span>Перейти к исполнителю: ${this.escapeHTML(track.artist)}</span>
        </button>
        <button class="mobile-sheet-cancel" id="sheetOptCancel">Закрыть</button>
      </div>
    `;

    document.querySelectorAll('.mobile-bottom-sheet').forEach(s => s.remove());
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("active"));

    const closeSheet = () => {
      sheet.classList.remove("active");
      setTimeout(() => sheet.remove(), 300);
    };

    sheet.querySelector(".mobile-sheet-overlay").addEventListener("click", closeSheet);
    sheet.querySelector("#sheetOptCancel").addEventListener("click", closeSheet);

    sheet.querySelector("#sheetOptLike").addEventListener("click", async () => {
      closeSheet();
      const liked = await this.library.toggleLike(track.id);
      this.updateLikeButtons(track.id, liked);
      this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
    });

    sheet.querySelector("#sheetOptQueue").addEventListener("click", () => {
      closeSheet();
      this.player.addToQueue(track);
      this.showToast("Добавлено в очередь");
    });

    sheet.querySelector("#sheetOptAddToPlaylist").addEventListener("click", () => {
      closeSheet();
      this.showAddToPlaylistModal(track.id);
    });

    sheet.querySelector("#sheetOptArtist").addEventListener("click", () => {
      closeSheet();
      document.getElementById("mobileFullscreenPlayer")?.classList.remove("active");
      this.navigateTo({ type: "artist", id: track.artist, title: track.artist });
    });

}

export function showMobileAddSheet() {
    const sheet = document.createElement("div");
    sheet.className = "mobile-bottom-sheet";
    sheet.innerHTML = `
      <div class="mobile-sheet-overlay"></div>
      <div class="mobile-sheet-content">
        <div class="mobile-sheet-handle"></div>
        <h3 class="mobile-sheet-title">Добавить в медиатеку</h3>
        <button class="mobile-sheet-item" id="sheetAddFiles">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          <span>Выбрать аудиофайлы с телефона</span>
        </button>
        <button class="mobile-sheet-item" id="sheetCreatePl">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
          <span>Создать новый плейлист</span>
        </button>
        <button class="mobile-sheet-item" id="sheetAddFolder">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          <span>Выбрать папку с музыкой</span>
        </button>
        <button class="mobile-sheet-cancel" id="sheetCancel">Отмена</button>
      </div>
    `;

    document.querySelectorAll('.mobile-bottom-sheet').forEach(s => s.remove());
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("active"));

    const closeSheet = () => {
      sheet.classList.remove("active");
      setTimeout(() => sheet.remove(), 300);
    };

    sheet.querySelector(".mobile-sheet-overlay").addEventListener("click", closeSheet);
    sheet.querySelector("#sheetCancel").addEventListener("click", closeSheet);

    sheet.querySelector("#sheetAddFiles").addEventListener("click", () => {
      closeSheet();
      this.triggerMobileFileImport();
    });

    sheet.querySelector("#sheetCreatePl").addEventListener("click", () => {
      closeSheet();
      this.showCreatePlaylistModal();
    });

    sheet.querySelector("#sheetAddFolder").addEventListener("click", () => {
      closeSheet();
      this.triggerFolderPicker();
    });
}

export function triggerMobileFileImport() {
    const audioPicker = document.getElementById("hiddenAudioFilesPicker");
    if (audioPicker) {
      audioPicker.click();
    } else {
      this.triggerFolderPicker();
    }
}

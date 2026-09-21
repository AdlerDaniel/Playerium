/**
 * Playerium - UI Controller & DOM Coordinator
 */

import { LyricsEngine } from "./lyrics.js";
import { AutoUpdater } from "./updater.js";

export class UIController {
  constructor(library, player) {
    this.library = library;
    this.player = player;
    this.lyricsEngine = new LyricsEngine();
    this.updater = new AutoUpdater();
    this.updater.onUpdateFound = (info) => this.showUpdateModal(info);

    // Navigation state
    this.history = [];
    this.historyIndex = -1;
    this.currentView = { type: "home", id: null, title: "Все треки" };

    // Search query & sorting
    this.searchQuery = "";
    this.sortBy = "dateAdded";
    this.sortAsc = false;
    this.sidebarFilter = "all"; // 'all' | 'playlists' | 'artists' | 'albums'

    // UI state
    this.activeRightTab = "nowPlaying"; // 'nowPlaying' | 'queue'
    this.isRightPanelOpen = false;
    this.contextTarget = null; // target data for right-click context menu
  }

  init() {
    this.initMobileState();
    this.bindDOM();
    this.bindMobileEvents();
    this.bindPlayerEvents();
    this.renderSidebar();
    this.navigateTo({ type: "home", title: "Все треки" });
    this.setupDropZone();
    setTimeout(() => this.updater.checkForUpdates(false), 2000);
  }

  initMobileState() {
    this.isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (this.isMobile) {
      document.body.classList.add("is-mobile");
    }
    window.addEventListener("resize", () => {
      const mobileNow = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || window.innerWidth <= 768;
      if (mobileNow !== this.isMobile) {
        this.isMobile = mobileNow;
        document.body.classList.toggle("is-mobile", this.isMobile);
        this.refreshCurrentView();
      }
    });
  }

  // --- DOM Binding ---

  bindDOM() {
    // Navigation arrows
    document.getElementById("btnNavBack").addEventListener("click", () => this.navigateBack());
    document.getElementById("btnNavForward").addEventListener("click", () => this.navigateForward());

    // Search input
    const searchInput = document.getElementById("mainSearchInput");
    const searchClear = document.getElementById("searchClearBtn");
    searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.trim();
      searchClear.classList.toggle("visible", !!this.searchQuery);
      this.refreshCurrentView();
    });
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      this.searchQuery = "";
      searchClear.classList.remove("visible");
      this.refreshCurrentView();
    });

    // Topbar Settings button
    document.getElementById("btnOpenSettings").addEventListener("click", () => {
      this.navigateTo({ type: "settings", title: "Настройки" });
    });

    // Sidebar '+' and 'Add Folder'
    document.getElementById("btnCreatePlaylist").addEventListener("click", () => this.showCreatePlaylistModal());
    document.getElementById("btnAddMusicFolder").addEventListener("click", () => this.triggerFolderPicker());

    // Sidebar filter pills
    document.querySelectorAll(".sidebar-filters .pill-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".sidebar-filters .pill-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.sidebarFilter = btn.dataset.filter;
        this.renderSidebar();
      });
    });

    // Player bottom controls
    document.getElementById("btnPlayPause").addEventListener("click", () => this.player.togglePlay());
    document.getElementById("btnNext").addEventListener("click", () => this.player.next());
    document.getElementById("btnPrev").addEventListener("click", () => this.player.prev());
    document.getElementById("btnShuffle").addEventListener("click", () => this.player.toggleShuffle());
    document.getElementById("btnRepeat").addEventListener("click", () => this.player.toggleRepeat());
    document.getElementById("btnPlayerLike").addEventListener("click", async () => {
      if (this.player.currentTrack) {
        const liked = await this.library.toggleLike(this.player.currentTrack.id);
        this.updateLikeButtons(this.player.currentTrack.id, liked);
        this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
      }
    });

    // Scrubber / Progress slider
    const progressContainer = document.getElementById("progressSliderContainer");
    const progressFill = document.getElementById("progressSliderFill");
    const progressTooltip = document.getElementById("timeHoverTooltip");

    let isSeeking = false;
    const updateSeekFromEvent = (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      progressFill.style.width = percent + "%";
      return percent;
    };

    progressContainer.addEventListener("mousemove", (e) => {
      if (this.player.audio.duration) {
        const rect = progressContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const previewSec = ratio * this.player.audio.duration;
        progressTooltip.textContent = this.formatTime(previewSec);
        progressTooltip.style.left = (ratio * 100) + "%";
      }
    });

    progressContainer.addEventListener("mousedown", (e) => {
      isSeeking = true;
      const pct = updateSeekFromEvent(e);
      this.player.seek(pct);

      const onMouseMove = (moveEvent) => {
        if (isSeeking) {
          const p = updateSeekFromEvent(moveEvent);
          this.player.seek(p);
        }
      };

      const onMouseUp = () => {
        isSeeking = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    // Volume controls
    const volumeContainer = document.getElementById("volumeSliderContainer");
    const volumeFill = document.getElementById("volumeSliderFill");
    const volumeBtn = document.getElementById("btnVolumeIcon");

    volumeBtn.addEventListener("click", () => this.player.toggleMute());

    let isVolDragging = false;
    const updateVolFromEvent = (e) => {
      const rect = volumeContainer.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.player.setVolume(ratio);
    };

    volumeContainer.addEventListener("mousedown", (e) => {
      isVolDragging = true;
      updateVolFromEvent(e);

      const onVolMove = (ev) => {
        if (isVolDragging) updateVolFromEvent(ev);
      };
      const onVolUp = () => {
        isVolDragging = false;
        window.removeEventListener("mousemove", onVolMove);
        window.removeEventListener("mouseup", onVolUp);
      };

      window.addEventListener("mousemove", onVolMove);
      window.addEventListener("mouseup", onVolUp);
    });

    // Right Panel buttons
    document.getElementById("btnToggleLyrics").addEventListener("click", () => this.toggleLyricsView());
    document.getElementById("btnToggleQueue").addEventListener("click", () => this.toggleRightPanel("queue"));
    document.getElementById("btnCloseRightPanel").addEventListener("click", () => this.closeRightPanel());

    // Right panel tab switcher
    document.getElementById("tabBtnNowPlaying").addEventListener("click", () => this.switchRightTab("nowPlaying"));
    document.getElementById("tabBtnQueue").addEventListener("click", () => this.switchRightTab("queue"));

    // Close modals on overlay click
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeModals();
      });
    });

    document.getElementById("btnUpdateLater")?.addEventListener("click", () => {
      document.getElementById("modalUpdateAvailable")?.classList.remove("active");
    });

    // Close context menu on any document click
    document.addEventListener("click", () => this.closeContextMenu());
    document.addEventListener("contextmenu", (e) => {
      if (!e.target.closest(".track-row") && !e.target.closest(".sidebar-item")) {
        this.closeContextMenu();
      }
    });

    // Hidden file input fallback for directory choosing
    const dirInput = document.getElementById("hiddenFolderPicker");
    if (dirInput) {
      dirInput.addEventListener("change", async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const count = await this.library.processFiles(Array.from(e.target.files), "Локальная музыка", (done, total) => {
            this.showToast(`Сканирование: ${done} из ${total} файлов...`);
          });
          this.showToast(`Добавлено треков: ${count}`, "success");
          this.renderSidebar();
          this.refreshCurrentView();
        }
      });
    }
  }

  // --- Mobile Spotify Navigation & Mini-Player Events ---

  bindMobileEvents() {
    // 1. Mobile Navigation Bar Tabs
    const navHome = document.getElementById("mobileNavHome");
    const navSearch = document.getElementById("mobileNavSearch");
    const navLibrary = document.getElementById("mobileNavLibrary");

    if (navHome) {
      navHome.addEventListener("click", () => {
        this.updateMobileNavActive("home");
        this.navigateTo({ type: "home", title: "Главная" });
      });
    }
    if (navSearch) {
      navSearch.addEventListener("click", () => {
        this.updateMobileNavActive("search");
        this.navigateTo({ type: "search", title: "Поиск" });
        setTimeout(() => document.getElementById("mainSearchInput")?.focus(), 100);
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
      fsSlider.addEventListener("input", (e) => {
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
        }
      });
    }

    // Lyrics Card tap on fullscreen player
    document.getElementById("mobileFsLyricsCard")?.addEventListener("click", () => {
      fsPlayer?.classList.remove("active");
      this.navigateTo({ type: "lyrics", title: "Текст песни" });
    });

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

    // 4. Android/Mobile Audio Files Picker
    const audioFilesInput = document.getElementById("hiddenAudioFilesPicker");
    if (audioFilesInput) {
      audioFilesInput.addEventListener("change", async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          const count = await this.library.processFiles(Array.from(e.target.files), "Мои треки", (done, total) => {
            this.showToast(`Загрузка: ${done} из ${total}...`);
          });
          this.showToast(`Добавлено аудиофайлов: ${count}`, "success");
          this.renderSidebar();
          this.refreshCurrentView();
        }
      });
    }
  }

  updateMobileNavActive(tab) {
    document.querySelectorAll(".mobile-nav-item").forEach((btn) => btn.classList.remove("active"));
    if (tab === "home") document.getElementById("mobileNavHome")?.classList.add("active");
    if (tab === "search") document.getElementById("mobileNavSearch")?.classList.add("active");
    if (tab === "library") document.getElementById("mobileNavLibrary")?.classList.add("active");
  }

  // --- Drag and Drop Folders/Files ---

  setupDropZone() {
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const items = e.dataTransfer.items;
      const files = [];

      if (items) {
        const queue = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
          if (entry) {
            queue.push(this.traverseFileTree(entry, files));
          }
        }
        await Promise.all(queue);
      } else if (e.dataTransfer.files) {
        files.push(...Array.from(e.dataTransfer.files));
      }

      if (files.length > 0) {
        this.showToast(`Обработка ${files.length} файлов...`);
        const count = await this.library.processFiles(files, "Перетащенная музыка", (done, total) => {
          this.showToast(`Добавление: ${done}/${total}...`);
        });
        this.showToast(`Успешно добавлено ${count} аудиофайлов!`, "success");
        this.renderSidebar();
        this.refreshCurrentView();
      }
    });
  }

  traverseFileTree(item, fileList) {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file((file) => {
          fileList.push(file);
          resolve();
        });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const readEntries = () => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              resolve();
            } else {
              const subTasks = entries.map((entry) => this.traverseFileTree(entry, fileList));
              await Promise.all(subTasks);
              readEntries();
            }
          });
        };
        readEntries();
      } else {
        resolve();
      }
    });
  }

  // --- Audio Player Event Subscriptions ---

  bindPlayerEvents() {
    this.player.onPlayStateChange = (isPlaying) => {
      const playIcon = document.getElementById("playerPlayIcon");
      const pauseIcon = document.getElementById("playerPauseIcon");
      if (playIcon && pauseIcon) {
        playIcon.style.display = isPlaying ? "none" : "block";
        pauseIcon.style.display = isPlaying ? "block" : "none";
      }

      // Mobile mini player play/pause
      const miniPlayIcon = document.getElementById("mobileMiniPlayIcon");
      const miniPauseIcon = document.getElementById("mobileMiniPauseIcon");
      if (miniPlayIcon && miniPauseIcon) {
        miniPlayIcon.style.display = isPlaying ? "none" : "block";
        miniPauseIcon.style.display = isPlaying ? "block" : "none";
      }

      // Mobile fullscreen player play/pause
      const fsPlayIcon = document.getElementById("mobileFsPlayIcon");
      const fsPauseIcon = document.getElementById("mobileFsPauseIcon");
      if (fsPlayIcon && fsPauseIcon) {
        fsPlayIcon.style.display = isPlaying ? "none" : "block";
        fsPauseIcon.style.display = isPlaying ? "block" : "none";
      }

      // Update table play states
      document.querySelectorAll(".track-row").forEach((row) => {
        if (row.dataset.trackId === this.player.currentTrack?.id) {
          row.classList.toggle("is-playing", isPlaying);
        } else {
          row.classList.remove("is-playing");
        }
      });
    };

    this.player.onTrackChange = (track) => {
      // Update bottom player
      document.getElementById("nowPlayingTitle").textContent = track.title || "Неизвестный трек";
      document.getElementById("nowPlayingArtist").textContent = track.artist || "Неизвестный исполнитель";
      
      const thumb = document.getElementById("nowPlayingCover");
      if (track.pictureUrl) {
        thumb.innerHTML = `<img src="${track.pictureUrl}" alt="Cover" />`;
      } else {
        thumb.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
      }

      // Update Mobile Mini-Player
      const miniPlayer = document.getElementById("mobileMiniPlayer");
      if (miniPlayer) {
        miniPlayer.classList.remove("hidden");
        document.getElementById("mobileMiniTitle").textContent = track.title || "Неизвестный трек";
        document.getElementById("mobileMiniArtist").textContent = track.artist || "Неизвестный исполнитель";
        const miniCover = document.getElementById("mobileMiniCover");
        if (track.pictureUrl) {
          miniCover.innerHTML = `<img src="${track.pictureUrl}" alt="Cover" />`;
        } else {
          miniCover.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
        }
      }

      // Update Mobile Fullscreen Player
      const fsArtwork = document.getElementById("mobileFsArtwork");
      if (fsArtwork) {
        if (track.pictureUrl) {
          fsArtwork.innerHTML = `<img src="${track.pictureUrl}" alt="Cover" />`;
        } else {
          fsArtwork.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
        }
      }
      document.getElementById("mobileFsTitle").textContent = track.title || "Неизвестный трек";
      document.getElementById("mobileFsArtist").textContent = track.artist || "Неизвестный исполнитель";
      document.getElementById("mobileFsContextTitle").textContent = this.currentView.title || "Все треки";

      this.updateLikeButtons(track.id, track.liked);

      // Update lyrics engine
      this.lyricsEngine.loadLyrics(track.lyrics);
      if (this.currentView.type === "lyrics") {
        this.renderLyricsView();
      }

      // Update lyrics snippet on mobile fullscreen player card
      const snippetEl = document.getElementById("mobileFsLyricsSnippet");
      if (snippetEl) {
        if (this.lyricsEngine.hasLyrics()) {
          snippetEl.textContent = this.lyricsEngine.lines[0]?.text || "Текст доступен для воспроизведения";
        } else {
          snippetEl.textContent = "Для этого трека текст не найден";
        }
      }

      // Update Right Panel Now Playing tab
      this.renderRightNowPlaying(track);

      // Highlight playing row in current table
      document.querySelectorAll(".track-row").forEach((row) => {
        const isCurrent = row.dataset.trackId === track.id;
        row.classList.toggle("playing", isCurrent);
        row.classList.toggle("is-playing", isCurrent && this.player.isPlaying);
      });
    };

    this.player.onTimeUpdate = (currentTime, duration) => {
      document.getElementById("currentTimeLabel").textContent = this.formatTime(currentTime);
      document.getElementById("totalTimeLabel").textContent = this.formatTime(duration);

      const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
      document.getElementById("progressSliderFill").style.width = percent + "%";

      // Mobile mini-player progress
      const miniFill = document.getElementById("mobileMiniProgressFill");
      if (miniFill) miniFill.style.width = percent + "%";

      // Mobile fullscreen scrubber & times
      const fsSlider = document.getElementById("mobileFsSlider");
      if (fsSlider && !fsSlider.matches(":active")) {
        fsSlider.value = percent;
      }
      const fsCurrent = document.getElementById("mobileFsTimeCurrent");
      const fsTotal = document.getElementById("mobileFsTimeTotal");
      if (fsCurrent) fsCurrent.textContent = this.formatTime(currentTime);
      if (fsTotal) fsTotal.textContent = this.formatTime(duration);

      // Sync Lyrics if active
      if (this.lyricsEngine.isSynced) {
        const activeIdx = this.lyricsEngine.updateTime(currentTime);
        if (activeIdx !== -1) {
          if (this.currentView.type === "lyrics") {
            this.highlightLyricsLine(activeIdx);
          }
          const snippetEl = document.getElementById("mobileFsLyricsSnippet");
          if (snippetEl && this.lyricsEngine.lines[activeIdx]) {
            snippetEl.textContent = this.lyricsEngine.lines[activeIdx].text;
          }
        }
      }
    };

    this.player.onQueueChange = (queue, queueIndex) => {
      if (this.activeRightTab === "queue" && this.isRightPanelOpen) {
        this.renderRightQueue();
      }
    };

    this.player.onVolumeChange = (volume, isMuted) => {
      const volFill = document.getElementById("volumeSliderFill");
      const volIcon = document.getElementById("btnVolumeIcon");
      volFill.style.width = (isMuted ? 0 : volume * 100) + "%";

      // Spotify volume icons based on level
      if (isMuted || volume === 0) {
        volIcon.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M13.86 5.47a.75.75 0 0 0-1.061 0l-1.47 1.47-1.47-1.47A.75.75 0 0 0 8.8 6.53L10.269 8l-1.47 1.47a.75.75 0 1 0 1.06 1.06l1.47-1.47 1.47 1.47a.75.75 0 0 0 1.06-1.06L12.39 8l1.47-1.47a.75.75 0 0 0 0-1.06zM3.208 4.25H1.75A.75.75 0 0 0 1 5v6a.75.75 0 0 0 .75.75h1.458l3.96 3.659A.75.75 0 0 0 8.5 14.86V1.14a.75.75 0 0 0-1.332-.549L3.208 4.25z"/></svg>`;
      } else if (volume < 0.5) {
        volIcon.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4H.75A.75.75 0 0 1 0 10.4V5.6a.75.75 0 0 1 .75-.75h1.316l6.925-4a.75.75 0 0 1 .75 0zm-2 2.53L2.991 6.13H1.5v3.74h1.491l4.75 2.75V3.38zm4.28 1.83a.75.75 0 0 1 1.06 0 4 4 0 0 1 0 5.66.75.75 0 1 1-1.06-1.06 2.5 2.5 0 0 0 0-3.54.75.75 0 0 1 0-1.06z"/></svg>`;
      } else {
        volIcon.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4H.75A.75.75 0 0 1 0 10.4V5.6a.75.75 0 0 1 .75-.75h1.316l6.925-4a.75.75 0 0 1 .75 0zm-2 2.53L2.991 6.13H1.5v3.74h1.491l4.75 2.75V3.38zm4.28 1.83a.75.75 0 0 1 1.06 0 4 4 0 0 1 0 5.66.75.75 0 1 1-1.06-1.06 2.5 2.5 0 0 0 0-3.54.75.75 0 0 1 0-1.06zm2.122-2.122a.75.75 0 0 1 1.06 0 7 7 0 0 1 0 9.9.75.75 0 1 1-1.06-1.06 5.5 5.5 0 0 0 0-7.78.75.75 0 0 1 0-1.06z"/></svg>`;
      }
    };

    this.player.onShuffleChange = (isShuffle) => {
      document.getElementById("btnShuffle").classList.toggle("active", isShuffle);
      document.getElementById("btnMobileFsShuffle")?.classList.toggle("active", isShuffle);
    };

    this.player.onRepeatChange = (repeatMode) => {
      const btn = document.getElementById("btnRepeat");
      const fsBtn = document.getElementById("btnMobileFsRepeat");
      btn.classList.toggle("active", repeatMode !== "off");
      fsBtn?.classList.toggle("active", repeatMode !== "off");
      if (repeatMode === "one") {
        btn.setAttribute("data-tooltip", "Повтор текущего трека");
      } else if (repeatMode === "all") {
        btn.setAttribute("data-tooltip", "Повтор всех треков");
      } else {
        btn.setAttribute("data-tooltip", "Повтор отключен");
      }
    };

    this.library.onLibraryChanged = () => {
      this.renderSidebar();
      this.refreshCurrentView();
    };
  }

  // --- Sidebar Rendering ---

  renderSidebar() {
    const list = document.getElementById("sidebarList");
    list.innerHTML = "";

    const likedTracks = this.library.getLikedTracks();

    // 1. Liked Songs Item (always first unless filtered out)
    if (this.sidebarFilter === "all" || this.sidebarFilter === "playlists") {
      const likedItem = document.createElement("div");
      likedItem.className = "sidebar-item" + (this.currentView.type === "liked" ? " active" : "");
      likedItem.innerHTML = `
        <div class="item-thumb liked-songs-thumb">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
        <div class="item-info">
          <span class="item-title">Любимые треки</span>
          <span class="item-subtitle">Закреплено • ${likedTracks.length} треков</span>
        </div>
      `;
      likedItem.addEventListener("click", () => {
        this.navigateTo({ type: "liked", title: "Любимые треки" });
      });
      list.appendChild(likedItem);
    }

    // 2. Playlists
    if (this.sidebarFilter === "all" || this.sidebarFilter === "playlists") {
      const playlists = this.library.getPlaylists();
      playlists.forEach((pl) => {
        const item = document.createElement("div");
        item.className = "sidebar-item" + (this.currentView.type === "playlist" && this.currentView.id === pl.id ? " active" : "");
        item.dataset.playlistId = pl.id;

        item.innerHTML = `
          <div class="item-thumb">
            <svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
          </div>
          <div class="item-info">
            <span class="item-title">${this.escapeHTML(pl.name)}</span>
            <span class="item-subtitle">Плейлист • ${pl.trackIds.length} треков</span>
          </div>
        `;

        item.addEventListener("click", () => {
          this.navigateTo({ type: "playlist", id: pl.id, title: pl.name });
        });

        // Right-click context menu on playlist
        item.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this.showPlaylistContextMenu(e.clientX, e.clientY, pl);
        });

        list.appendChild(item);
      });
    }

    // 3. Artists
    if (this.sidebarFilter === "all" || this.sidebarFilter === "artists") {
      const artists = this.library.getArtists();
      artists.forEach((art) => {
        const item = document.createElement("div");
        item.className = "sidebar-item" + (this.currentView.type === "artist" && this.currentView.id === art.name ? " active" : "");
        const thumbHtml = art.pictureUrl
          ? `<img src="${art.pictureUrl}" alt="Artist" />`
          : `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

        item.innerHTML = `
          <div class="item-thumb round">${thumbHtml}</div>
          <div class="item-info">
            <span class="item-title">${this.escapeHTML(art.name)}</span>
            <span class="item-subtitle">Исполнитель</span>
          </div>
        `;

        item.addEventListener("click", () => {
          this.navigateTo({ type: "artist", id: art.name, title: art.name });
        });
        list.appendChild(item);
      });
    }

    // 4. Albums
    if (this.sidebarFilter === "all" || this.sidebarFilter === "albums") {
      const albums = this.library.getAlbums();
      albums.forEach((alb) => {
        const item = document.createElement("div");
        item.className = "sidebar-item" + (this.currentView.type === "album" && this.currentView.id === alb.name ? " active" : "");
        const thumbHtml = alb.pictureUrl
          ? `<img src="${alb.pictureUrl}" alt="Album" />`
          : `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`;

        item.innerHTML = `
          <div class="item-thumb">${thumbHtml}</div>
          <div class="item-info">
            <span class="item-title">${this.escapeHTML(alb.name)}</span>
            <span class="item-subtitle">Альбом • ${this.escapeHTML(alb.artist)}</span>
          </div>
        `;

        item.addEventListener("click", () => {
          this.navigateTo({ type: "album", id: alb.name, title: alb.name, extra: alb.artist });
        });
        list.appendChild(item);
      });
    }
  }

  // --- View Navigation ---

  navigateTo(view) {
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(view);
    this.historyIndex = this.history.length - 1;
    this.loadView(view);
    this.updateNavButtons();
  }

  navigateBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadView(this.history[this.historyIndex]);
      this.updateNavButtons();
    }
  }

  navigateForward() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.loadView(this.history[this.historyIndex]);
      this.updateNavButtons();
    }
  }

  updateNavButtons() {
    document.getElementById("btnNavBack").disabled = this.historyIndex <= 0;
    document.getElementById("btnNavForward").disabled = this.historyIndex >= this.history.length - 1;
  }

  refreshCurrentView() {
    this.loadView(this.currentView);
  }

  loadView(view) {
    this.currentView = view;
    if (view.type === "home") this.updateMobileNavActive("home");
    else if (view.type === "search") this.updateMobileNavActive("search");
    else if (view.type === "library") this.updateMobileNavActive("library");
    else this.updateMobileNavActive("");

    const container = document.getElementById("mainViewContent");
    container.innerHTML = "";

    switch (view.type) {
      case "home":
        this.renderHomeView(container);
        break;
      case "search":
        this.renderSearchView(container);
        break;
      case "library":
        this.renderLibraryView(container);
        break;
      case "liked":
        this.renderLikedView(container);
        break;
      case "playlist":
        this.renderPlaylistView(container, view.id);
        break;
      case "artist":
        this.renderArtistView(container, view.id);
        break;
      case "album":
        this.renderAlbumView(container, view.id, view.extra);
        break;
      case "lyrics":
        this.renderLyricsView(container);
        break;
      case "settings":
        this.renderSettingsView(container);
        break;
      default:
        this.renderHomeView(container);
        break;
    }

    // Scroll to top
    document.getElementById("mainScrollContainer").scrollTop = 0;
  }

  // --- View Renderers ---

  renderHomeView(container) {
    let tracks = this.library.getTracks();
    if (this.searchQuery) {
      tracks = this.library.search(this.searchQuery);
    }
    tracks = this.library.sortTracks(tracks, this.sortBy, this.sortAsc);

    // If on mobile and not searching, show authentic Spotify Mobile Home!
    if (this.isMobile && !this.searchQuery) {
      const homeWrapper = document.createElement("div");
      homeWrapper.className = "mobile-home-view";

      const hour = new Date().getHours();
      let greeting = "Добрый день";
      if (hour >= 5 && hour < 12) greeting = "Доброе утро";
      else if (hour >= 18 && hour < 23) greeting = "Добрый вечер";
      else if (hour >= 23 || hour < 5) greeting = "Доброй ночи";

      const header = document.createElement("div");
      header.className = "mobile-home-header";
      header.innerHTML = `
        <div class="mobile-home-greeting">${greeting}</div>
      `;
      homeWrapper.appendChild(header);

      // 2x3 Quick Access Grid
      const quickGrid = document.createElement("div");
      quickGrid.className = "mobile-quick-grid";

      // 1. Liked Songs
      const likedCard = document.createElement("div");
      likedCard.className = "mobile-quick-card";
      likedCard.innerHTML = `
        <div class="mobile-quick-thumb fav-thumb">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
        <div class="mobile-quick-title">Любимые треки</div>
      `;
      likedCard.addEventListener("click", () => this.navigateTo({ type: "liked", title: "Любимые треки" }));
      quickGrid.appendChild(likedCard);

      // 2. All Tracks
      const allCard = document.createElement("div");
      allCard.className = "mobile-quick-card";
      allCard.innerHTML = `
        <div class="mobile-quick-thumb" style="background: linear-gradient(135deg, #1db954, #121212);">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <div class="mobile-quick-title">Все треки</div>
      `;
      allCard.addEventListener("click", () => {
        if (tracks.length > 0) this.player.playTrack(tracks[0], 0, tracks);
      });
      quickGrid.appendChild(allCard);

      // 3-6. Playlists or Artists
      const playlists = this.library.getPlaylists().slice(0, 4);
      playlists.forEach((pl) => {
        const card = document.createElement("div");
        card.className = "mobile-quick-card";
        card.innerHTML = `
          <div class="mobile-quick-thumb">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--sp-text-subdued)"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
          </div>
          <div class="mobile-quick-title">${this.escapeHTML(pl.name)}</div>
        `;
        card.addEventListener("click", () => this.navigateTo({ type: "playlist", id: pl.id, title: pl.name }));
        quickGrid.appendChild(card);
      });

      homeWrapper.appendChild(quickGrid);

      // Section title
      const secTitle = document.createElement("h2");
      secTitle.className = "mobile-section-title";
      secTitle.textContent = "Ваши треки";
      homeWrapper.appendChild(secTitle);

      homeWrapper.appendChild(this.createActionBar(tracks));
      homeWrapper.appendChild(this.createTrackTable(tracks));

      container.appendChild(homeWrapper);
      return;
    }

    // Standard desktop home view
    const totalDur = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

    const header = document.createElement("div");
    header.className = "view-header";
    header.innerHTML = `
      <div class="view-header-cover" style="background: linear-gradient(135deg, #1fdf64, #121212);">
        <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
      </div>
      <div class="view-header-details">
        <span class="view-type-badge">ЛОКАЛЬНАЯ МЕДИАТЕКА</span>
        <h1 class="view-title">${this.searchQuery ? `Поиск: "${this.escapeHTML(this.searchQuery)}"` : "Все треки"}</h1>
        <div class="view-metadata">
          <strong>Ваш компьютер</strong>
          <span class="dot">•</span>
          <span>${tracks.length} треков</span>
          <span class="dot">•</span>
          <span>${this.formatDurationHours(totalDur)}</span>
        </div>
      </div>
    `;

    container.appendChild(header);
    container.appendChild(this.createActionBar(tracks));
    container.appendChild(this.createTrackTable(tracks));
  }

  renderSearchView(container) {
    const searchWrapper = document.createElement("div");
    searchWrapper.className = "mobile-search-view";

    const title = document.createElement("h1");
    title.className = "mobile-search-title";
    title.textContent = "Поиск";
    searchWrapper.appendChild(title);

    const searchBar = document.createElement("div");
    searchBar.className = "mobile-search-bar-box";
    searchBar.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20"><path d="M10.533 1.279c-5.18 0-9.407 4.14-9.407 9.279s4.226 9.279 9.407 9.279c2.234 0 4.29-.77 5.907-2.058l4.353 4.353a1 1 0 1 0 1.414-1.414l-4.344-4.344a9.157 9.157 0 0 0 2.077-5.816c0-5.14-4.226-9.279-9.407-9.279zm-7.407 9.279c0-4.006 3.302-7.279 7.407-7.279s7.407 3.273 7.407 7.279-3.302 7.279-7.407 7.279-7.407-3.273-7.407-7.279z"/></svg>
      <input type="text" class="mobile-search-input" placeholder="Что хотите послушать?" value="${this.escapeHTML(this.searchQuery)}" />
      ${this.searchQuery ? '<button class="mobile-search-clear" title="Очистить">&times;</button>' : ""}
    `;
    searchWrapper.appendChild(searchBar);

    const input = searchBar.querySelector(".mobile-search-input");
    const clearBtn = searchBar.querySelector(".mobile-search-clear");

    input.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.trim();
      const desktopInput = document.getElementById("mainSearchInput");
      if (desktopInput) desktopInput.value = this.searchQuery;
      this.refreshCurrentView();
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this.searchQuery = "";
        const desktopInput = document.getElementById("mainSearchInput");
        if (desktopInput) desktopInput.value = "";
        this.refreshCurrentView();
      });
    }

    if (!this.searchQuery) {
      const catHeader = document.createElement("h2");
      catHeader.className = "mobile-section-title";
      catHeader.textContent = "Все категории";
      searchWrapper.appendChild(catHeader);

      const catGrid = document.createElement("div");
      catGrid.className = "mobile-search-categories";
      catGrid.innerHTML = `
        <div class="mobile-cat-card cat-purple" data-action="liked">
          <span>Любимые треки</span>
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
        <div class="mobile-cat-card cat-blue" data-action="artists">
          <span>Исполнители</span>
          <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </div>
        <div class="mobile-cat-card cat-orange" data-action="albums">
          <span>Альбомы</span>
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
        </div>
        <div class="mobile-cat-card cat-green" data-action="playlists">
          <span>Плейлисты</span>
          <svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
        </div>
        <div class="mobile-cat-card cat-teal" data-action="import">
          <span>Добавить файлы</span>
          <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </div>
        <div class="mobile-cat-card cat-pink" data-action="all">
          <span>Все треки</span>
          <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
      `;

      catGrid.querySelector('[data-action="liked"]').addEventListener("click", () => this.navigateTo({ type: "liked", title: "Любимые треки" }));
      catGrid.querySelector('[data-action="artists"]').addEventListener("click", () => this.navigateTo({ type: "library", title: "Моя медиатека", tab: "artists" }));
      catGrid.querySelector('[data-action="albums"]').addEventListener("click", () => this.navigateTo({ type: "library", title: "Моя медиатека", tab: "albums" }));
      catGrid.querySelector('[data-action="playlists"]').addEventListener("click", () => this.navigateTo({ type: "library", title: "Моя медиатека", tab: "playlists" }));
      catGrid.querySelector('[data-action="import"]').addEventListener("click", () => this.triggerMobileFileImport());
      catGrid.querySelector('[data-action="all"]').addEventListener("click", () => this.navigateTo({ type: "home", title: "Все треки" }));

      searchWrapper.appendChild(catGrid);
    } else {
      const results = this.library.search(this.searchQuery);
      const resHeader = document.createElement("h2");
      resHeader.className = "mobile-section-title";
      resHeader.textContent = `Найдено треков: ${results.length}`;
      searchWrapper.appendChild(resHeader);

      if (results.length > 0) {
        searchWrapper.appendChild(this.createTrackTable(results));
      } else {
        const empty = document.createElement("div");
        empty.style.cssText = "padding: 40px 0; text-align: center; color: var(--sp-text-subdued);";
        empty.innerHTML = `<h3>Ничего не найдено</h3><p style="margin-top: 8px;">Попробуйте поискать по другому названию или исполнителю.</p>`;
        searchWrapper.appendChild(empty);
      }
    }

    container.appendChild(searchWrapper);
  }

  renderLibraryView(container) {
    const libWrapper = document.createElement("div");
    libWrapper.className = "mobile-library-view";

    const header = document.createElement("div");
    header.className = "mobile-library-header";
    header.innerHTML = `
      <div class="mobile-library-title-row">
        <h1 class="mobile-library-title">Моя медиатека</h1>
        <div class="mobile-library-actions">
          <button class="mobile-lib-btn" id="btnMobileLibAdd" title="Добавить">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
        </div>
      </div>
      <div class="mobile-library-pills">
        <button class="mobile-lib-pill active" data-filter="all">Все</button>
        <button class="mobile-lib-pill" data-filter="playlists">Плейлисты</button>
        <button class="mobile-lib-pill" data-filter="artists">Исполнители</button>
        <button class="mobile-lib-pill" data-filter="albums">Альбомы</button>
      </div>
    `;
    libWrapper.appendChild(header);

    const listContainer = document.createElement("div");
    listContainer.className = "mobile-library-list";
    libWrapper.appendChild(listContainer);

    let activeFilter = this.currentView.tab || "all";

    const renderItems = (filter) => {
      listContainer.innerHTML = "";

      // 1. Liked songs
      if (filter === "all" || filter === "playlists") {
        const likedTracks = this.library.getLikedTracks();
        const likedRow = document.createElement("div");
        likedRow.className = "mobile-lib-row";
        likedRow.innerHTML = `
          <div class="mobile-lib-thumb liked-thumb">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </div>
          <div class="mobile-lib-meta">
            <span class="mobile-lib-name">Любимые треки</span>
            <span class="mobile-lib-sub">Закреплено • Плейлист • ${likedTracks.length} треков</span>
          </div>
        `;
        likedRow.addEventListener("click", () => this.navigateTo({ type: "liked", title: "Любимые треки" }));
        listContainer.appendChild(likedRow);
      }

      // 2. Playlists
      if (filter === "all" || filter === "playlists") {
        const playlists = this.library.getPlaylists();
        playlists.forEach((pl) => {
          const row = document.createElement("div");
          row.className = "mobile-lib-row";
          row.innerHTML = `
            <div class="mobile-lib-thumb">
              <svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
            </div>
            <div class="mobile-lib-meta">
              <span class="mobile-lib-name">${this.escapeHTML(pl.name)}</span>
              <span class="mobile-lib-sub">Плейлист • ${pl.trackIds.length} треков</span>
            </div>
          `;
          row.addEventListener("click", () => this.navigateTo({ type: "playlist", id: pl.id, title: pl.name }));
          listContainer.appendChild(row);
        });
      }

      // 3. Artists
      if (filter === "all" || filter === "artists") {
        const artists = this.library.getArtists();
        artists.forEach((art) => {
          const row = document.createElement("div");
          row.className = "mobile-lib-row";
          const thumbHtml = art.pictureUrl
            ? `<img src="${art.pictureUrl}" alt="Artist" />`
            : `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
          row.innerHTML = `
            <div class="mobile-lib-thumb round">${thumbHtml}</div>
            <div class="mobile-lib-meta">
              <span class="mobile-lib-name">${this.escapeHTML(art.name)}</span>
              <span class="mobile-lib-sub">Исполнитель</span>
            </div>
          `;
          row.addEventListener("click", () => this.navigateTo({ type: "artist", id: art.name, title: art.name }));
          listContainer.appendChild(row);
        });
      }

      // 4. Albums
      if (filter === "all" || filter === "albums") {
        const albums = this.library.getAlbums();
        albums.forEach((alb) => {
          const row = document.createElement("div");
          row.className = "mobile-lib-row";
          const thumbHtml = alb.pictureUrl
            ? `<img src="${alb.pictureUrl}" alt="Album" />`
            : `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>`;
          row.innerHTML = `
            <div class="mobile-lib-thumb">${thumbHtml}</div>
            <div class="mobile-lib-meta">
              <span class="mobile-lib-name">${this.escapeHTML(alb.name)}</span>
              <span class="mobile-lib-sub">Альбом • ${this.escapeHTML(alb.artist)}</span>
            </div>
          `;
          row.addEventListener("click", () => this.navigateTo({ type: "album", id: alb.name, title: alb.name, extra: alb.artist }));
          listContainer.appendChild(row);
        });
      }
    };

    header.querySelectorAll(".mobile-lib-pill").forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.filter === activeFilter);
      pill.addEventListener("click", () => {
        header.querySelectorAll(".mobile-lib-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        activeFilter = pill.dataset.filter;
        renderItems(activeFilter);
      });
    });

    renderItems(activeFilter);

    header.querySelector("#btnMobileLibAdd")?.addEventListener("click", () => {
      this.showMobileAddSheet();
    });

    container.appendChild(libWrapper);
  }

  renderLikedView(container) {
    let tracks = this.library.getLikedTracks();
    if (this.searchQuery) {
      tracks = tracks.filter((t) =>
        (t.title || "").toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (t.artist || "").toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
    tracks = this.library.sortTracks(tracks, this.sortBy, this.sortAsc);

    const totalDur = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

    const header = document.createElement("div");
    header.className = "view-header";
    header.innerHTML = `
      <div class="view-header-cover liked-banner">
        <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </div>
      <div class="view-header-details">
        <span class="view-type-badge">ПЛЕЙЛИСТ</span>
        <h1 class="view-title">Любимые треки</h1>
        <div class="view-metadata">
          <strong>Вы</strong>
          <span class="dot">•</span>
          <span>${tracks.length} треков</span>
          <span class="dot">•</span>
          <span>${this.formatDurationHours(totalDur)}</span>
        </div>
      </div>
    `;

    container.appendChild(header);
    container.appendChild(this.createActionBar(tracks));
    container.appendChild(this.createTrackTable(tracks));
  }

  renderPlaylistView(container, playlistId) {
    const pl = this.library.getPlaylistById(playlistId);
    if (!pl) {
      container.innerHTML = `<div style="padding: 40px;">Плейлист не найден.</div>`;
      return;
    }

    let tracks = this.library.getPlaylistTracks(playlistId);
    if (this.searchQuery) {
      tracks = tracks.filter((t) =>
        (t.title || "").toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        (t.artist || "").toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
    tracks = this.library.sortTracks(tracks, this.sortBy, this.sortAsc);

    const totalDur = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);

    const header = document.createElement("div");
    header.className = "view-header";
    header.innerHTML = `
      <div class="view-header-cover" style="background: linear-gradient(135deg, #450af5, #121212);">
        <svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
      </div>
      <div class="view-header-details">
        <span class="view-type-badge">ПЛЕЙЛИСТ</span>
        <h1 class="view-title">${this.escapeHTML(pl.name)}</h1>
        ${pl.description ? `<p style="color: var(--sp-text-secondary); margin-bottom: 8px;">${this.escapeHTML(pl.description)}</p>` : ""}
        <div class="view-metadata">
          <strong>Вы</strong>
          <span class="dot">•</span>
          <span>${tracks.length} треков</span>
          <span class="dot">•</span>
          <span>${this.formatDurationHours(totalDur)}</span>
        </div>
      </div>
    `;

    container.appendChild(header);
    container.appendChild(this.createActionBar(tracks, pl));
    container.appendChild(this.createTrackTable(tracks, pl));
  }

  renderArtistView(container, artistName) {
    const artistTracks = this.library.getTracks().filter((t) => t.artist === artistName);
    const sorted = this.library.sortTracks(artistTracks, "title", true);

    const coverUrl = sorted.find((t) => t.pictureUrl)?.pictureUrl;

    const header = document.createElement("div");
    header.className = "view-header";
    header.innerHTML = `
      <div class="view-header-cover" style="border-radius: 50%; ${coverUrl ? `background-image: url('${coverUrl}'); background-size: cover;` : ""}">
        ${!coverUrl ? `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>` : ""}
      </div>
      <div class="view-header-details">
        <span class="view-type-badge">ИСПОЛНИТЕЛЬ</span>
        <h1 class="view-title">${this.escapeHTML(artistName)}</h1>
        <div class="view-metadata">
          <span>${sorted.length} треков</span>
        </div>
      </div>
    `;

    container.appendChild(header);
    container.appendChild(this.createActionBar(sorted));
    container.appendChild(this.createTrackTable(sorted));
  }

  renderAlbumView(container, albumName, artistName) {
    const albumTracks = this.library.getTracks().filter((t) => t.album === albumName);
    const coverUrl = albumTracks.find((t) => t.pictureUrl)?.pictureUrl;
    const sorted = this.library.sortTracks(albumTracks, "trackNo", true);
    const totalDur = sorted.reduce((acc, t) => acc + (t.duration || 0), 0);

    const header = document.createElement("div");
    header.className = "view-header";
    header.innerHTML = `
      <div class="view-header-cover" style="${coverUrl ? `background-image: url('${coverUrl}'); background-size: cover;` : ""}">
        ${!coverUrl ? `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>` : ""}
      </div>
      <div class="view-header-details">
        <span class="view-type-badge">АЛЬБОМ</span>
        <h1 class="view-title">${this.escapeHTML(albumName)}</h1>
        <div class="view-metadata">
          <strong>${this.escapeHTML(artistName || sorted[0]?.artist || "")}</strong>
          ${sorted[0]?.year ? `<span class="dot">•</span><span>${sorted[0].year}</span>` : ""}
          <span class="dot">•</span>
          <span>${sorted.length} треков</span>
          <span class="dot">•</span>
          <span>${this.formatDurationHours(totalDur)}</span>
        </div>
      </div>
    `;

    container.appendChild(header);
    container.appendChild(this.createActionBar(sorted));
    container.appendChild(this.createTrackTable(sorted, null, false));
  }

  renderSettingsView(container) {
    const settingsDiv = document.createElement("div");
    settingsDiv.className = "settings-container";

    const eq = this.player.equalizer;
    const presetsOptions = Object.keys(eq ? eq.constructor.PRESETS : {})
      .map((key) => `<option value="${key}" ${eq && eq.currentPreset === key ? "selected" : ""}>${eq.constructor.PRESETS[key].name}</option>`)
      .join("");

    const foldersListHtml = this.library.folders.map((f) => `
      <div class="folder-item">
        <div class="folder-path-wrap">
          <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          <span class="folder-path">${this.escapeHTML(f.name)}</span>
          <span class="folder-count">(${f.count} файлов)</span>
        </div>
        <button class="btn-remove-folder" data-folder-id="${f.id}" title="Удалить из медиатеки">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `).join("");

    settingsDiv.innerHTML = `
      <div class="settings-header">
        <h1>Настройки</h1>
      </div>

      <!-- Folders Management -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          Локальные файлы и папки
        </h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Папки с музыкой на компьютере</span>
              <span class="settings-desc">Укажите каталоги, где хранятся ваши MP3, FLAC, WAV или M4A треки.</span>
            </div>
            <button class="settings-btn-primary" id="btnSettingsAddFolder">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Добавить папку
            </button>
          </div>
          <div class="folder-list" id="settingsFolderList">
            ${foldersListHtml || `<div style="color: var(--sp-text-subdued); font-size: 13px;">Папки пока не добавлены. Нажмите «Добавить папку» или перетащите аудиофайлы в окно плеера.</div>`}
          </div>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <button class="settings-btn-secondary" id="btnClearAllLibrary">Очистить всю медиатеку</button>
          </div>
        </div>
      </div>

      <!-- Equalizer Section -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z"/></svg>
          10-полосный эквалайзер
        </h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Включить эквалайзер</span>
              <span class="settings-desc">Настройте частоты или выберите готовый аудио-пресет.</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="settingsEqToggle" ${eq && eq.isEnabled ? "checked" : ""}>
              <span class="slider-toggle"></span>
            </label>
          </div>
          <div class="eq-presets-row">
            <span class="settings-label" style="font-size: 13px;">Пресет:</span>
            <select class="eq-select" id="settingsEqPreset">
              ${presetsOptions}
              <option value="custom" ${eq && eq.currentPreset === "custom" ? "selected" : ""}>Пользовательский (Custom)</option>
            </select>
          </div>
          <div class="eq-faders-container" id="eqFadersContainer">
            ${eq ? eq.constructor.FREQUENCIES.map((freq, idx) => `
              <div class="eq-fader-col">
                <span class="eq-fader-val" id="eqVal_${idx}">${eq.gains[idx] > 0 ? "+" : ""}${eq.gains[idx]}dB</span>
                <input type="range" class="eq-slider-vertical" min="-12" max="12" step="1" value="${eq.gains[idx]}" data-band-index="${idx}">
                <span class="eq-fader-freq">${freq >= 1000 ? freq / 1000 + "k" : freq}</span>
              </div>
            `).join("") : ""}
          </div>
        </div>
      </div>

      <!-- Appearance & UI Scaling -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.22 19.59 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>
          Внешний вид и акцентный цвет
        </h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Цветовая тема</span>
              <span class="settings-desc">Выберите акцентный цвет кнопок и индикаторов в приложении.</span>
            </div>
            <div class="theme-colors-row">
              <div class="theme-dot active" style="background-color: #1ed760;" data-color="#1ed760" title="Spotify Green"></div>
              <div class="theme-dot" style="background-color: #1d75d9;" data-color="#1d75d9" title="Blue"></div>
              <div class="theme-dot" style="background-color: #8400e7;" data-color="#8400e7" title="Purple"></div>
              <div class="theme-dot" style="background-color: #e91429;" data-color="#e91429" title="Red"></div>
              <div class="theme-dot" style="background-color: #f59b23;" data-color="#f59b23" title="Orange"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Keyboard Shortcuts Reference -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/></svg>
          Горячие клавиши
        </h2>
        <div class="shortcuts-grid">
          <div class="shortcut-card"><span class="shortcut-action">Воспроизведение / Пауза</span><span class="kbd">Пробел</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Следующий трек</span><span class="kbd">Ctrl + →</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Предыдущий трек</span><span class="kbd">Ctrl + ←</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Перемотка ±5 сек</span><span class="kbd">← / →</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Громкость ±5%</span><span class="kbd">Ctrl + ↑ / ↓</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Отключение звука</span><span class="kbd">M</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Фокус поиска</span><span class="kbd">Ctrl + L</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Очередь воспроизведения</span><span class="kbd">Q</span></div>
          <div class="shortcut-card"><span class="shortcut-action">Текст песни (Lyrics)</span><span class="kbd">K</span></div>
        </div>
      </div>

      <!-- Playerium Updates Section -->
      <div class="settings-section">
        <h2 class="settings-section-title">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>
          Обновления Playerium
        </h2>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Текущая версия</span>
              <span class="settings-desc">Установленная версия приложения: <strong>v${this.updater.currentVersion}</strong></span>
            </div>
            <button class="settings-btn-primary" id="btnCheckUpdatesManual">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
              Проверить обновления
            </button>
          </div>
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Репозиторий GitHub</span>
              <span class="settings-desc">Проект для проверки релизов (например, <code>username/Playerium</code>).</span>
            </div>
            <input type="text" id="inputSettingsGithubRepo" class="search-input" style="width: 260px; height: 38px; padding: 0 12px;" value="${this.escapeHTML(this.updater.repo)}" placeholder="owner/Playerium" />
          </div>
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Автопроверка при входе</span>
              <span class="settings-desc">Автоматически проверять релизы на GitHub при каждом запуске плеера.</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggleAutoUpdateCheck" ${this.updater.autoCheckEnabled ? "checked" : ""}>
              <span class="slider-toggle"></span>
            </label>
          </div>
          <div id="updateCheckStatusWrap" style="font-size: 13px; color: var(--sp-text-subdued); margin-top: 4px; display: none;"></div>
        </div>
      </div>
    `;

    container.appendChild(settingsDiv);

    // Bind update settings
    const repoInput = document.getElementById("inputSettingsGithubRepo");
    repoInput?.addEventListener("change", (e) => {
      this.updater.setRepo(e.target.value);
      this.showToast("Репозиторий GitHub сохранен");
    });

    const toggleAuto = document.getElementById("toggleAutoUpdateCheck");
    toggleAuto?.addEventListener("change", (e) => {
      this.updater.setAutoCheck(e.target.checked);
      this.showToast(e.target.checked ? "Автопроверка обновлений включена" : "Автопроверка отключена");
    });

    const btnCheck = document.getElementById("btnCheckUpdatesManual");
    const statusWrap = document.getElementById("updateCheckStatusWrap");
    btnCheck?.addEventListener("click", async () => {
      if (statusWrap) {
        statusWrap.style.display = "block";
        statusWrap.innerHTML = `<span style="color: var(--sp-text-subdued);">Проверка обновлений на GitHub...</span>`;
      }
      const res = await this.updater.checkForUpdates(true);
      if (res.hasUpdate) {
        if (statusWrap) {
          statusWrap.innerHTML = `<span style="color: var(--sp-green); font-weight: 600;">Найдено обновление: v${res.latestVersion}!</span>`;
        }
        this.showUpdateModal(res);
      } else if (res.error) {
        if (statusWrap) {
          statusWrap.innerHTML = `<span style="color: var(--sp-red);">${this.escapeHTML(res.error)}</span>`;
        }
      } else {
        if (statusWrap) {
          statusWrap.innerHTML = `<span style="color: var(--sp-green);">У вас установлена последняя версия Playerium (v${this.updater.currentVersion}).</span>`;
        }
        this.showToast("Обновлений не найдено. Вы используете последнюю версию!");
      }
    });

    // Bind settings event listeners
    document.getElementById("btnSettingsAddFolder").addEventListener("click", () => this.triggerFolderPicker());

    // Remove folder buttons
    settingsDiv.querySelectorAll(".btn-remove-folder").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const folderId = btn.dataset.folderId;
        await this.library.removeFolder(folderId);
        this.showToast("Папка удалена из медиатеки");
        this.renderSettingsView(container);
      });
    });

    // Clear all
    document.getElementById("btnClearAllLibrary").addEventListener("click", async () => {
      if (confirm("Вы действительно хотите очистить всю локальную медиатеку? Все треки и плейлисты будут удалены из базы плеера.")) {
        await this.library.clearAll();
        this.showToast("Медиатека очищена", "danger");
        this.renderSettingsView(container);
      }
    });

    // Equalizer toggle
    document.getElementById("settingsEqToggle").addEventListener("change", (e) => {
      if (this.player.equalizer) {
        this.player.equalizer.setEnabled(e.target.checked);
        this.showToast(e.target.checked ? "Эквалайзер включен" : "Эквалайзер выключен");
      }
    });

    // Equalizer preset
    document.getElementById("settingsEqPreset").addEventListener("change", (e) => {
      if (this.player.equalizer && e.target.value !== "custom") {
        this.player.equalizer.applyPreset(e.target.value);
        // Update slider values
        this.player.equalizer.gains.forEach((val, i) => {
          const slider = settingsDiv.querySelector(`input[data-band-index="${i}"]`);
          const label = document.getElementById(`eqVal_${i}`);
          if (slider) slider.value = val;
          if (label) label.textContent = (val > 0 ? "+" : "") + val + "dB";
        });
      }
    });

    // Equalizer vertical sliders
    settingsDiv.querySelectorAll(".eq-slider-vertical").forEach((slider) => {
      slider.addEventListener("input", (e) => {
        const idx = parseInt(e.target.dataset.bandIndex, 10);
        const val = parseFloat(e.target.value);
        if (this.player.equalizer) {
          this.player.equalizer.setGain(idx, val);
          const label = document.getElementById(`eqVal_${idx}`);
          if (label) label.textContent = (val > 0 ? "+" : "") + val + "dB";
          document.getElementById("settingsEqPreset").value = "custom";
        }
      });
    });

    // Theme color dots
    settingsDiv.querySelectorAll(".theme-dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        settingsDiv.querySelectorAll(".theme-dot").forEach((d) => d.classList.remove("active"));
        dot.classList.add("active");
        const color = dot.dataset.color;
        document.documentElement.style.setProperty("--sp-green", color);
        document.documentElement.style.setProperty("--sp-green-hover", color);
      });
    });
  }

  renderLyricsView(container) {
    if (!container) container = document.getElementById("mainViewContent");
    container.innerHTML = "";

    const track = this.player.currentTrack;
    if (!track) {
      container.innerHTML = `
        <div class="lyrics-view-container">
          <div class="lyrics-empty">
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <h3>Сейчас ничего не играет</h3>
            <p>Включите любой трек, чтобы посмотреть текст песни.</p>
          </div>
        </div>
      `;
      return;
    }

    const lyricsContainer = document.createElement("div");
    lyricsContainer.className = "lyrics-view-container";

    const header = document.createElement("div");
    header.className = "lyrics-header";
    header.innerHTML = `
      <div class="lyrics-header-thumb">
        ${track.pictureUrl ? `<img src="${track.pictureUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" />` : `<svg viewBox="0 0 24 24" width="32" height="32" fill="var(--sp-text-subdued)"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`}
      </div>
      <div class="lyrics-header-meta">
        <span class="lyrics-song-title">${this.escapeHTML(track.title)}</span>
        <span class="lyrics-song-artist">${this.escapeHTML(track.artist)}</span>
      </div>
    `;
    lyricsContainer.appendChild(header);

    if (!this.lyricsEngine.hasLyrics()) {
      const empty = document.createElement("div");
      empty.className = "lyrics-empty";
      empty.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        <h3>Текст песни не найден</h3>
        <p>Для отображения текста поместите файл <code>${this.escapeHTML(track.fileName.replace(/\.[^/.]+$/, ""))}.lrc</code> рядом с аудиофайлом или добавьте его в теги трека.</p>
      `;
      lyricsContainer.appendChild(empty);
    } else {
      const content = document.createElement("div");
      content.className = "lyrics-content";

      this.lyricsEngine.lines.forEach((lineObj, idx) => {
        const lineEl = document.createElement("div");
        lineEl.className = "lyrics-line" + (idx === this.lyricsEngine.activeLineIndex ? " active" : "");
        lineEl.id = `lyricsLine_${idx}`;
        lineEl.textContent = lineObj.text;

        if (this.lyricsEngine.isSynced && lineObj.time !== null) {
          lineEl.addEventListener("click", () => {
            this.player.seekToTime(lineObj.time);
          });
        }
        content.appendChild(lineEl);
      });
      lyricsContainer.appendChild(content);
    }

    container.appendChild(lyricsContainer);
  }

  highlightLyricsLine(activeIdx) {
    document.querySelectorAll(".lyrics-line").forEach((el, idx) => {
      if (idx === activeIdx) {
        el.className = "lyrics-line active";
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (idx < activeIdx) {
        el.className = "lyrics-line past";
      } else {
        el.className = "lyrics-line";
      }
    });
  }

  toggleLyricsView() {
    if (this.currentView.type === "lyrics") {
      this.navigateBack();
    } else {
      this.navigateTo({ type: "lyrics", title: "Текст песни" });
    }
  }

  // --- Right Panel (Now Playing / Queue) ---

  toggleRightPanel(tab = "nowPlaying") {
    const panel = document.getElementById("rightPanel");
    if (this.isRightPanelOpen && this.activeRightTab === tab) {
      this.closeRightPanel();
    } else {
      this.openRightPanel(tab);
    }
  }

  openRightPanel(tab = "nowPlaying") {
    this.isRightPanelOpen = true;
    document.getElementById("rightPanel").classList.remove("hidden");
    document.getElementById("btnToggleQueue").classList.toggle("active", tab === "queue");
    this.switchRightTab(tab);
  }

  closeRightPanel() {
    this.isRightPanelOpen = false;
    document.getElementById("rightPanel").classList.add("hidden");
    document.getElementById("btnToggleQueue").classList.remove("active");
  }

  switchRightTab(tab) {
    this.activeRightTab = tab;
    document.getElementById("tabBtnNowPlaying").classList.toggle("active", tab === "nowPlaying");
    document.getElementById("tabBtnQueue").classList.toggle("active", tab === "queue");

    if (tab === "nowPlaying") {
      this.renderRightNowPlaying(this.player.currentTrack);
    } else {
      this.renderRightQueue();
    }
  }

  renderRightNowPlaying(track) {
    const container = document.getElementById("rightPanelContent");
    if (!track) {
      container.innerHTML = `<div style="color: var(--sp-text-subdued); text-align: center; margin-top: 40px;">Нет играющего трека</div>`;
      return;
    }

    const coverHtml = track.pictureUrl
      ? `<img src="${track.pictureUrl}" alt="Cover" />`
      : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

    container.innerHTML = `
      <div class="now-playing-panel-cover">${coverHtml}</div>
      <div class="now-playing-panel-meta">
        <div class="now-playing-panel-title">${this.escapeHTML(track.title)}</div>
        <div class="now-playing-panel-artist">${this.escapeHTML(track.artist)}</div>
      </div>

      <div class="now-playing-panel-card">
        <div class="panel-card-heading">Информация о треке</div>
        <div class="panel-card-row">
          <span class="panel-card-label">Альбом</span>
          <span class="panel-card-val">${this.escapeHTML(track.album || "—")}</span>
        </div>
        ${track.year ? `
        <div class="panel-card-row">
          <span class="panel-card-label">Год релиза</span>
          <span class="panel-card-val">${this.escapeHTML(track.year)}</span>
        </div>` : ""}
        <div class="panel-card-row">
          <span class="panel-card-label">Длительность</span>
          <span class="panel-card-val">${this.formatTime(track.duration)}</span>
        </div>
        <div class="panel-card-row">
          <span class="panel-card-label">Файл</span>
          <span class="panel-card-val" title="${this.escapeHTML(track.fileName)}">${this.escapeHTML(track.fileName)}</span>
        </div>
        <div class="panel-card-row">
          <span class="panel-card-label">Размер</span>
          <span class="panel-card-val">${(track.fileSize / (1024 * 1024)).toFixed(1)} МБ</span>
        </div>
        <div class="panel-card-row">
          <span class="panel-card-label">Папка</span>
          <span class="panel-card-val">${this.escapeHTML(track.folderName || "Компьютер")}</span>
        </div>
      </div>
    `;
  }

  renderRightQueue() {
    const container = document.getElementById("rightPanelContent");
    container.innerHTML = "";

    const curTrack = this.player.currentTrack;
    const upcoming = this.player.queue.slice(this.player.queueIndex + 1);

    let html = `
      <div class="queue-section-title">Сейчас играет</div>
    `;

    if (curTrack) {
      html += `
        <div class="queue-item current">
          <div class="queue-item-thumb">
            ${curTrack.pictureUrl ? `<img src="${curTrack.pictureUrl}" />` : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`}
          </div>
          <div class="queue-item-info">
            <div class="queue-item-title">${this.escapeHTML(curTrack.title)}</div>
            <div class="queue-item-artist">${this.escapeHTML(curTrack.artist)}</div>
          </div>
        </div>
      `;
    }

    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
        <div class="queue-section-title" style="margin:0;">Следующие в очереди (${upcoming.length})</div>
        ${upcoming.length > 0 ? `<button id="btnClearQueueBtn" style="font-size: 11px; font-weight: 600; color: var(--sp-text-subdued);">Очистить</button>` : ""}
      </div>
      <div class="queue-list" style="margin-top: 8px;">
    `;

    if (upcoming.length === 0) {
      html += `<div style="color: var(--sp-text-subdued); font-size: 13px; padding: 12px 0;">Очередь пуста. Вы можете нажать «Добавить в очередь» у любого трека.</div>`;
    } else {
      upcoming.forEach((track, idx) => {
        const queueListIdx = this.player.queueIndex + 1 + idx;
        html += `
          <div class="queue-item" data-queue-idx="${queueListIdx}">
            <div class="queue-item-thumb">
              ${track.pictureUrl ? `<img src="${track.pictureUrl}" />` : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`}
            </div>
            <div class="queue-item-info">
              <div class="queue-item-title">${this.escapeHTML(track.title)}</div>
              <div class="queue-item-artist">${this.escapeHTML(track.artist)}</div>
            </div>
            <button class="queue-item-remove" data-remove-idx="${queueListIdx}" title="Удалить из очереди">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        `;
      });
    }

    html += `</div>`;
    container.innerHTML = html;

    // Bind queue click events
    container.querySelectorAll(".queue-item:not(.current)").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.closest(".queue-item-remove")) return;
        const qIdx = parseInt(item.dataset.queueIdx, 10);
        this.player.queueIndex = qIdx;
        this.player.playTrack(this.player.queue[qIdx], qIdx);
      });
    });

    container.querySelectorAll(".queue-item-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rIdx = parseInt(btn.dataset.removeIdx, 10);
        this.player.removeFromQueue(rIdx);
        this.renderRightQueue();
      });
    });

    const clearBtn = document.getElementById("btnClearQueueBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this.player.clearUpcomingQueue();
        this.renderRightQueue();
      });
    }
  }

  // --- Track Table & Action Bar Components ---

  createActionBar(tracks, playlist = null) {
    const bar = document.createElement("div");
    bar.className = "view-actions";

    bar.innerHTML = `
      <div class="view-actions-left">
        <button class="btn-primary-play" id="btnHeroPlay" title="Воспроизвести все">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        ${playlist ? `
          <button class="action-icon-btn" id="btnDeletePlaylist" title="Удалить плейлист">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        ` : ""}
      </div>
      <div class="view-actions-right">
        <select class="sort-dropdown" id="tableSortDropdown">
          <option value="dateAdded" ${this.sortBy === "dateAdded" ? "selected" : ""}>По дате добавления</option>
          <option value="title" ${this.sortBy === "title" ? "selected" : ""}>По названию трека</option>
          <option value="artist" ${this.sortBy === "artist" ? "selected" : ""}>По исполнителю</option>
          <option value="album" ${this.sortBy === "album" ? "selected" : ""}>По альбому</option>
          <option value="duration" ${this.sortBy === "duration" ? "selected" : ""}>По длительности</option>
        </select>
      </div>
    `;

    // Hero Play click
    bar.querySelector("#btnHeroPlay").addEventListener("click", () => {
      if (tracks.length > 0) {
        this.player.playTrack(tracks[0], 0, tracks);
      }
    });

    // Delete playlist button
    if (playlist) {
      bar.querySelector("#btnDeletePlaylist").addEventListener("click", async () => {
        if (confirm(`Удалить плейлист «${playlist.name}»?`)) {
          await this.library.deletePlaylist(playlist.id);
          this.showToast("Плейлист удален");
          this.navigateTo({ type: "home", title: "Все треки" });
        }
      });
    }

    // Sort change
    bar.querySelector("#tableSortDropdown").addEventListener("change", (e) => {
      this.sortBy = e.target.value;
      this.sortAsc = this.sortBy === "title" || this.sortBy === "artist" || this.sortBy === "album";
      this.refreshCurrentView();
    });

    return bar;
  }

  createTrackTable(tracks, playlistContext = null, showAlbumCol = true) {
    const table = document.createElement("div");
    table.className = "track-table";

    if (tracks.length === 0) {
      table.innerHTML = `
        <div style="padding: 60px 0; text-align: center; color: var(--sp-text-subdued);">
          <h3>Треки не найдены</h3>
          <p style="margin-top: 8px;">Добавьте папку с музыкой на вашем компьютере или перетащите файлы в плеер.</p>
          <button class="settings-btn-primary" style="margin-top: 20px;" id="btnEmptyAddFolder">Добавить музыку</button>
        </div>
      `;
      const btn = table.querySelector("#btnEmptyAddFolder");
      if (btn) btn.addEventListener("click", () => this.triggerFolderPicker());
      return table;
    }

    const header = document.createElement("div");
    header.className = "track-table-header" + (!showAlbumCol ? " no-album" : "");
    header.innerHTML = `
      <div class="th-num">#</div>
      <div>НАЗВАНИЕ</div>
      ${showAlbumCol ? `<div>АЛЬБОМ</div>` : ""}
      <div>ДАТА ДОБАВЛЕНИЯ</div>
      <div class="th-duration">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm9-3.25V8H5.75a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 .75-.75V4.75a.75.75 0 0 0-1.5 0z"/></svg>
      </div>
    `;
    table.appendChild(header);

    tracks.forEach((track, index) => {
      const row = document.createElement("div");
      const isCurrent = this.player.currentTrack && this.player.currentTrack.id === track.id;
      row.className = `track-row ${!showAlbumCol ? "no-album" : ""} ${isCurrent ? "playing" : ""} ${isCurrent && this.player.isPlaying ? "is-playing" : ""}`;
      row.dataset.trackId = track.id;

      const coverHtml = track.pictureUrl
        ? `<img src="${track.pictureUrl}" alt="Cover" />`
        : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

      row.innerHTML = `
        <div class="track-col-num">
          <span class="track-number">${index + 1}</span>
          <span class="track-row-play">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </span>
          <div class="equalizer-bars">
            <div class="eq-bar"></div>
            <div class="eq-bar"></div>
            <div class="eq-bar"></div>
            <div class="eq-bar"></div>
          </div>
        </div>
        <div class="track-col-title">
          <div class="track-mini-thumb">${coverHtml}</div>
          <div class="track-meta">
            <span class="track-name">${this.escapeHTML(track.title)}</span>
            <span class="track-artist" data-artist="${this.escapeHTML(track.artist)}">${this.escapeHTML(track.artist)}</span>
          </div>
        </div>
        ${showAlbumCol ? `
        <div class="track-col-album" data-album="${this.escapeHTML(track.album)}">${this.escapeHTML(track.album)}</div>
        ` : ""}
        <div class="track-col-date">${this.formatDate(track.dateAdded)}</div>
        <div class="track-col-duration">
          <button class="track-like-btn ${track.liked ? "liked" : ""}" data-like-id="${track.id}" title="${track.liked ? "Удалить из любимых" : "Добавить в любимые"}">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
          </button>
          <span>${this.formatTime(track.duration)}</span>
          <button class="track-menu-btn" data-track-id="${track.id}" title="Ещё">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
          </button>
        </div>
      `;

      // Play on mobile single tap or desktop double-click
      row.addEventListener("click", (e) => {
        if (this.isMobile) {
          if (!e.target.closest(".track-like-btn") && !e.target.closest(".track-menu-btn") && !e.target.closest(".track-artist") && !e.target.closest(".track-col-album")) {
            this.player.playTrack(track, index, tracks, playlistContext);
          }
        }
      });
      row.addEventListener("dblclick", () => {
        if (!this.isMobile) {
          this.player.playTrack(track, index, tracks, playlistContext);
        }
      });
      row.querySelector(".track-row-play").addEventListener("click", (e) => {
        e.stopPropagation();
        if (isCurrent && this.player.isPlaying) {
          this.player.pause();
        } else {
          this.player.playTrack(track, index, tracks, playlistContext);
        }
      });

      // Like button click
      const likeBtn = row.querySelector(".track-like-btn");
      likeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const liked = await this.library.toggleLike(track.id);
        this.updateLikeButtons(track.id, liked);
        this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
      });

      // Artist link
      const artistEl = row.querySelector(".track-artist");
      artistEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.navigateTo({ type: "artist", id: track.artist, title: track.artist });
      });

      // Album link
      if (showAlbumCol) {
        const albumEl = row.querySelector(".track-col-album");
        albumEl.addEventListener("click", (e) => {
          e.stopPropagation();
          this.navigateTo({ type: "album", id: track.album, title: track.album, extra: track.artist });
        });
      }

      // Context menu
      const moreBtn = row.querySelector(".track-menu-btn");
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.isMobile) {
          this.showMobileTrackOptionsSheet(track, index, tracks, playlistContext);
        } else {
          this.showTrackContextMenu(e.clientX, e.clientY, track, playlistContext);
        }
      });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (this.isMobile) {
          this.showMobileTrackOptionsSheet(track, index, tracks, playlistContext);
        } else {
          this.showTrackContextMenu(e.clientX, e.clientY, track, playlistContext);
        }
      });

      table.appendChild(row);
    });

    return table;
  }

  // --- Context Menus ---

  showTrackContextMenu(x, y, track, playlistContext = null) {
    const menu = document.getElementById("appContextMenu");
    const playlists = this.library.getPlaylists();

    const playlistSubmenuHtml = playlists.length > 0
      ? playlists.map((p) => `<div class="context-menu-item add-to-pl" data-pl-id="${p.id}"><svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>${this.escapeHTML(p.name)}</div>`).join("")
      : `<div class="context-menu-item" style="opacity: 0.5;">Нет созданных плейлистов</div>`;

    menu.innerHTML = `
      <div class="context-menu-item" id="ctxPlayNow">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Воспроизвести сейчас
      </div>
      <div class="context-menu-item" id="ctxPlayNext">
        <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg> Включить следующим
      </div>
      <div class="context-menu-item" id="ctxAddToQueue">
        <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg> Добавить в очередь
      </div>
      <div class="context-divider"></div>
      <div class="context-menu-item" id="ctxToggleLike">
        <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> ${track.liked ? "Удалить из любимых" : "Добавить в Любимые"}
      </div>
      <div class="context-divider"></div>
      <div style="padding: 4px 12px; font-size: 11px; color: var(--sp-text-subdued); text-transform: uppercase;">Добавить в плейлист</div>
      ${playlistSubmenuHtml}
      ${playlistContext ? `
        <div class="context-divider"></div>
        <div class="context-menu-item" id="ctxRemoveFromPl" style="color: var(--sp-red);">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Удалить из этого плейлиста
        </div>
      ` : ""}
    `;

    // Position menu within viewport
    menu.style.display = "block";
    const w = menu.offsetWidth || 220;
    const h = menu.offsetHeight || 260;
    menu.style.left = Math.min(x, window.innerWidth - w - 10) + "px";
    menu.style.top = Math.min(y, window.innerHeight - h - 10) + "px";
    menu.classList.add("active");

    // Bind item clicks
    menu.querySelector("#ctxPlayNow").addEventListener("click", () => {
      this.player.playTrack(track, 0, [track]);
      this.closeContextMenu();
    });

    menu.querySelector("#ctxPlayNext").addEventListener("click", () => {
      this.player.playNext(track);
      this.showToast("Будет воспроизведено следующим");
      this.closeContextMenu();
    });

    menu.querySelector("#ctxAddToQueue").addEventListener("click", () => {
      this.player.addToQueue(track);
      this.showToast("Добавлено в очередь");
      this.closeContextMenu();
    });

    menu.querySelector("#ctxToggleLike").addEventListener("click", async () => {
      const liked = await this.library.toggleLike(track.id);
      this.updateLikeButtons(track.id, liked);
      this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
      this.closeContextMenu();
    });

    menu.querySelectorAll(".add-to-pl").forEach((el) => {
      el.addEventListener("click", async () => {
        const plId = el.dataset.plId;
        await this.library.addTrackToPlaylist(plId, track.id);
        const pl = this.library.getPlaylistById(plId);
        this.showToast(`Добавлено в «${pl.name}»`);
        this.closeContextMenu();
      });
    });

    if (playlistContext && menu.querySelector("#ctxRemoveFromPl")) {
      menu.querySelector("#ctxRemoveFromPl").addEventListener("click", async () => {
        await this.library.removeTrackFromPlaylist(playlistContext.id, track.id);
        this.showToast("Трек удален из плейлиста");
        this.closeContextMenu();
      });
    }
  }

  showPlaylistContextMenu(x, y, playlist) {
    const menu = document.getElementById("appContextMenu");
    menu.innerHTML = `
      <div class="context-menu-item" id="ctxPlPlay">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Воспроизвести
      </div>
      <div class="context-menu-item" id="ctxPlRename">
        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg> Переименовать
      </div>
      <div class="context-divider"></div>
      <div class="context-menu-item" id="ctxPlDelete" style="color: var(--sp-red);">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Удалить плейлист
      </div>
    `;

    menu.style.display = "block";
    const w = 200;
    menu.style.left = Math.min(x, window.innerWidth - w - 10) + "px";
    menu.style.top = y + "px";
    menu.classList.add("active");

    menu.querySelector("#ctxPlPlay").addEventListener("click", () => {
      const tracks = this.library.getPlaylistTracks(playlist.id);
      if (tracks.length > 0) this.player.playTrack(tracks[0], 0, tracks, playlist);
      this.closeContextMenu();
    });

    menu.querySelector("#ctxPlRename").addEventListener("click", () => {
      this.closeContextMenu();
      const newName = prompt("Новое название плейлиста:", playlist.name);
      if (newName && newName.trim()) {
        this.library.renamePlaylist(playlist.id, newName.trim());
      }
    });

    menu.querySelector("#ctxPlDelete").addEventListener("click", async () => {
      this.closeContextMenu();
      if (confirm(`Удалить плейлист «${playlist.name}»?`)) {
        await this.library.deletePlaylist(playlist.id);
        this.showToast("Плейлист удален");
      }
    });
  }

  closeContextMenu() {
    const menu = document.getElementById("appContextMenu");
    menu.classList.remove("active");
    menu.style.display = "none";
  }

  // --- Modals & Pickers ---

  showCreatePlaylistModal() {
    const overlay = document.getElementById("modalCreatePlaylist");
    const input = document.getElementById("inputPlaylistName");
    const descInput = document.getElementById("inputPlaylistDesc");
    input.value = `Мой плейлист #${this.library.getPlaylists().length + 1}`;
    descInput.value = "";
    overlay.classList.add("active");
    input.focus();
    input.select();

    const btnCreate = document.getElementById("btnConfirmCreatePlaylist");
    const handler = async () => {
      const name = input.value.trim();
      if (name) {
        const pl = await this.library.createPlaylist(name, descInput.value.trim());
        this.closeModals();
        this.navigateTo({ type: "playlist", id: pl.id, title: pl.name });
        this.showToast(`Плейлист «${pl.name}» создан`, "success");
      }
      btnCreate.removeEventListener("click", handler);
    };
    btnCreate.addEventListener("click", handler);
  }

  showUpdateModal(info) {
    const modal = document.getElementById("modalUpdateAvailable");
    if (!modal) return;
    document.getElementById("updateModalLatestVer").textContent = "v" + info.latestVersion;
    document.getElementById("updateModalCurrentVer").textContent = "v" + info.currentVersion;
    document.getElementById("updateModalNotes").textContent = info.releaseNotes || "Новая версия Playerium доступна для загрузки.";
    const dlBtn = document.getElementById("btnDownloadUpdate");
    if (dlBtn) {
      dlBtn.href = info.downloadUrl || info.htmlUrl;
      dlBtn.title = info.assetName || "Скачать релиз";
    }
    modal.classList.add("active");
  }

  closeModals() {
    document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.remove("active"));
  }

  async triggerFolderPicker() {
    // Check modern File System Access API support
    if (window.showDirectoryPicker) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        this.showToast(`Сканирование папки «${dirHandle.name}»...`);
        const count = await this.library.scanDirectoryHandle(dirHandle, (done, total, cur) => {
          this.showToast(`Импорт: ${done}/${total} (${cur.slice(0, 20)}...)`);
        });
        this.showToast(`Успешно добавлено ${count} аудиофайлов!`, "success");
        this.renderSidebar();
        this.refreshCurrentView();
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // User cancelled
        console.warn("Directory picker error, falling back to input:", e);
      }
    }

    // Fallback: trigger HTML file input
    const input = document.getElementById("hiddenFolderPicker");
    if (input) input.click();
  }

  // --- UI Helpers ---

  updateLikeButtons(trackId, isLiked) {
    document.querySelectorAll(`.track-like-btn[data-like-id="${trackId}"]`).forEach((btn) => {
      btn.classList.toggle("liked", isLiked);
      btn.title = isLiked ? "Удалить из любимых" : "Добавить в любимые";
    });

    if (this.player.currentTrack && this.player.currentTrack.id === trackId) {
      document.getElementById("btnPlayerLike")?.classList.toggle("liked", isLiked);
      document.getElementById("mobileMiniLike")?.classList.toggle("liked", isLiked);
      document.getElementById("btnMobileFsLike")?.classList.toggle("liked", isLiked);
    }
  }

  showMobileTrackOptionsSheet(track, index, tracks, playlistContext = null) {
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
        <button class="mobile-sheet-item" id="sheetOptLyrics">
          <svg viewBox="0 0 16 16" width="20" height="20"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.693l-3.247-3.247L1.879 10.82a.75.75 0 0 0-.22.53v2.899c0 .414.336.75.75.75h2.899a.75.75 0 0 0 .53-.22L10.5 8.693z"/></svg>
          <span>Показать текст песни</span>
        </button>
        <button class="mobile-sheet-cancel" id="sheetOptCancel">Закрыть</button>
      </div>
    `;

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

    sheet.querySelector("#sheetOptLyrics").addEventListener("click", () => {
      closeSheet();
      document.getElementById("mobileFullscreenPlayer")?.classList.remove("active");
      this.navigateTo({ type: "lyrics", title: "Текст песни" });
    });
  }

  showMobileAddSheet() {
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

  triggerMobileFileImport() {
    const audioPicker = document.getElementById("hiddenAudioFilesPicker");
    if (audioPicker) {
      audioPicker.click();
    } else {
      this.triggerFolderPicker();
    }
  }

  focusSearch() {
    const input = document.getElementById("mainSearchInput");
    input.focus();
    input.select();
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  formatDurationHours(seconds) {
    if (!seconds || seconds <= 0) return "0 мин.";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} ч. ${mins} мин.`;
    }
    return `${mins} мин.`;
  }

  formatDate(timestamp) {
    if (!timestamp) return "";
    const d = new Date(timestamp);
    const months = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
  }

  escapeHTML(str) {
    if (!str) return "";
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

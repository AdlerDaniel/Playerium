import { saveIcon } from "./design-icons.js";
import { renderSidebar, renderAllTracksView, renderHomeView, renderSearchView, renderLibraryView, renderLikedView, renderPlaylistView, renderArtistView, renderAlbumView, createActionBar } from "./library-views.js";
import { renderSettingsView } from "./settings-view.js";
import { bindMobileEvents, updateMobileNavActive, showMobileTrackOptionsSheet, showMobileAddSheet, triggerMobileFileImport } from "./mobile-controls.js";
import { renderRightQueue } from "./queue-view.js";
import { createTrackTable } from "./track-table.js";
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
    this.currentView = { type: "home", id: null, title: "Главная" };

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
    this.navigateTo({ type: "home", title: "Главная" });
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
    for (const id of ["btnBrandHome", "btnGlobalHome"]) document.getElementById(id).addEventListener("click", () => {
      this.searchQuery = ""; document.getElementById("mainSearchInput").value = "";
      document.getElementById("searchClearBtn").classList.remove("visible");
      this.navigateTo({type:"home",title:"Главная"});
    });
    document.getElementById("btnLibraryHeader").addEventListener("click", () => this.navigateTo({type:"library",title:"Моя медиатека"}));
    document.getElementById("librarySearchInput").addEventListener("input", e => {this.libraryQuery=e.target.value.trim();this.renderSidebar();});
    for(const id of ["btnPlayerLike","mobileMiniLike","btnMobileFsLike"]) {
      document.getElementById(id).innerHTML=saveIcon;
      document.getElementById(id).setAttribute("aria-pressed", "false");
    }
    // Navigation arrows
    document.getElementById("btnNavBack").addEventListener("click", () => this.navigateBack());
    document.getElementById("btnNavForward").addEventListener("click", () => this.navigateForward());

    // Search input
    const searchInput = document.getElementById("mainSearchInput");
    const searchClear = document.getElementById("searchClearBtn");
    searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.trim();
      searchClear.classList.toggle("visible", !!this.searchQuery);
      if(this.currentView.type !== "search") this.navigateTo({type:"search",title:"Поиск"});
      else this.refreshCurrentView();
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
      if (this.player.getDuration()) {
        const rect = progressContainer.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const previewSec = ratio * this.player.getDuration();
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

  bindMobileEvents(...args) { return bindMobileEvents.apply(this, args); }

  updateMobileNavActive(...args) { return updateMobileNavActive.apply(this, args); }

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
      this.updateArtworkTheme(track.pictureUrl);
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

  renderSidebar(...args) { return renderSidebar.apply(this, args); }

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
    document.querySelector('#mainTopbar .home-filters')?.remove();
    this.currentView = view;
    document.body.dataset.view = view.type;
    document.getElementById("btnGlobalHome").classList.toggle("active",view.type === "home");
    if (view.type === "home") this.updateMobileNavActive("home");
    else if (view.type === "search") this.updateMobileNavActive("search");
    else if (view.type === "library") this.updateMobileNavActive("library");
    else this.updateMobileNavActive("");

    const focusedSearch = document.activeElement?.classList.contains("mobile-search-input");
    const caret = focusedSearch ? document.activeElement.selectionStart : null;
    const container = document.getElementById("mainViewContent");
    container.innerHTML = "";

    switch (view.type) {
      case "allTracks":
        renderAllTracksView.call(this,container);
        break;
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

    if (focusedSearch) {
      const input = container.querySelector(".mobile-search-input");
      input?.focus(); if (input && caret !== null) input.setSelectionRange(caret, caret);
    }
    this.renderSidebar();
    // Scroll to top
    document.getElementById("mainScrollContainer").scrollTop = 0;
  }

  // --- View Renderers ---

  renderHomeView(...args) { return renderHomeView.apply(this, args); }

  renderSearchView(...args) { return renderSearchView.apply(this, args); }

  renderLibraryView(...args) { return renderLibraryView.apply(this, args); }

  renderLikedView(...args) { return renderLikedView.apply(this, args); }

  renderPlaylistView(...args) { return renderPlaylistView.apply(this, args); }

  renderArtistView(...args) { return renderArtistView.apply(this, args); }

  renderAlbumView(...args) { return renderAlbumView.apply(this, args); }

  renderSettingsView(...args) { return renderSettingsView.apply(this, args); }

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

  renderRightQueue(...args) { return renderRightQueue.apply(this, args); }

  // --- Track Table & Action Bar Components ---

  createActionBar(...args) { return createActionBar.apply(this, args); }

  createTrackTable(...args) { return createTrackTable.apply(this, args); }

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

  updateArtworkTheme(url) {
    const mini = document.getElementById("mobileMiniPlayer");
    const full = document.getElementById("mobileFullscreenPlayer");
    mini.style.setProperty("--art-color", "#333333");full.style.setProperty("--art-color", "#454545");
    if (!url) return;
    const id=this.player.currentTrack?.id;
    const image=new Image();image.onload=()=>{
      if(this.player.currentTrack?.id!==id)return;
      try {
        const canvas=document.createElement("canvas");canvas.width=canvas.height=1;
        const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0,1,1);
        const [r,g,b]=ctx.getImageData(0,0,1,1).data;
        const color=`rgb(${Math.round(r*.5)}, ${Math.round(g*.5)}, ${Math.round(b*.5)})`;
        mini.style.setProperty("--art-color",color);full.style.setProperty("--art-color",color);
      } catch {} // Non-readable artwork retains the neutral background.
    };image.src=url;
  }

  // --- UI Helpers ---

  updateLikeButtons(trackId, isLiked) {
    document.querySelectorAll(`.track-like-btn[data-like-id="${trackId}"]`).forEach((btn) => {
      btn.classList.toggle("liked", isLiked);
      btn.setAttribute("aria-pressed", String(isLiked));
      btn.title = isLiked ? "Удалить из любимых" : "Добавить в любимые";
    });

    if (this.player.currentTrack && this.player.currentTrack.id === trackId) {
      for(const id of ["btnPlayerLike","mobileMiniLike","btnMobileFsLike"]) {
        const button=document.getElementById(id);button.classList.toggle("liked",isLiked);
        button.setAttribute("aria-pressed",String(isLiked));button.title=isLiked?"Удалить из любимых":"Добавить в любимые";
      }
    }
  }

  showMobileTrackOptionsSheet(...args) { return showMobileTrackOptionsSheet.apply(this, args); }

  showMobileAddSheet(...args) { return showMobileAddSheet.apply(this, args); }

  triggerMobileFileImport(...args) { return triggerMobileFileImport.apply(this, args); }

  focusSearch() {
    if (this.isMobile) {this.navigateTo({type:"search",title:"Поиск"});document.querySelector(".mobile-search-input")?.focus();return;}
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

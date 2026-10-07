import {mountCover} from './artwork.js';
import {collectionMenu,editPlaylist} from './collection-menu.js';
import {showTrackMenu} from './track-menu.js';
import {renderSearchView} from './search-view.js';
import { bindSlider, syncPlaybackControls } from './playback-controls.js';
import { saveIcon } from "./design-icons.js";
import { renderSidebar, renderAllTracksView, renderHomeView, renderLibraryView, renderLikedView, renderPlaylistView, renderArtistView, renderAlbumView, createActionBar } from "./library-views.js";
import { renderSettingsView } from "./settings-view.js";
import { bindMobileEvents, updateMobileNavActive, showMobileTrackOptionsSheet, showMobileAddSheet, triggerMobileFileImport } from "./mobile-controls.js";
import { renderRightQueue } from "./queue-view.js";
import { createTrackTable } from "./track-table.js";
/**
 * Playerium - UI Controller & DOM Coordinator
 */

import { AutoUpdater } from "./updater.js";

export class UIController {
  constructor(library, player) {
    this.library = library;
    this.player = player;
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
      this.searchQuery = e.target.value;
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

    bindSlider(progressContainer, {
      label: 'Позиция воспроизведения',
      getValue: () => this.player.getDuration() > 0 ? this.player.getCurrentTime() / this.player.getDuration() * 100 : 0,
      enabled: () => Number.isFinite(this.player.getDuration()) && this.player.getDuration() > 0,
      preview: percent => {
        progressFill.style.width = percent + '%';
        document.getElementById('currentTimeLabel').textContent = this.formatTime(percent / 100 * this.player.getDuration());
      },
      commit: percent => this.player.seek(percent),
      step: () => 500 / this.player.getDuration(),
    });
    progressContainer.addEventListener('pointermove', e => {
      const rect = progressContainer.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      progressTooltip.textContent = this.formatTime(ratio * this.player.getDuration());
      progressTooltip.style.left = ratio * 100 + '%';
    });
    const volumeContainer = document.getElementById('volumeSliderContainer');
    document.getElementById('btnVolumeIcon').addEventListener('click', () => this.player.toggleMute());
    bindSlider(volumeContainer, {
      label: 'Громкость', getValue: () => this.player.volume * 100,
      preview: percent => this.player.setVolume(percent / 100),
      commit: percent => this.player.setVolume(percent / 100), step: 5,
    });

    // Right Panel buttons
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


    // Close context menu on any document click
    document.addEventListener("click", e => {if(!e.target.closest("#appContextMenu"))this.closeContextMenu();});
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

      for (const id of ['btnPlayPause', 'mobileMiniPlayPause', 'btnMobileFsPlayPause']) {
        const button = document.getElementById(id);
        if (button) { button.title = isPlaying ? 'Пауза' : 'Воспроизвести'; button.setAttribute('aria-label', button.title); }
      }
      syncPlaybackControls(this.player);
      const currentButton=document.querySelector('.queue-current-toggle');if(currentButton){currentButton.innerHTML=isPlaying?'<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';currentButton.setAttribute('aria-label',isPlaying?'Пауза':'Воспроизвести');}
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
      if (!track) {
        document.getElementById('mobileMiniPlayer').classList.add('hidden');
        document.getElementById('mobileFullscreenPlayer').classList.remove('active');
        document.getElementById('nowPlayingTitle').textContent = 'Выберите трек';
        document.getElementById('nowPlayingArtist').textContent = '';
        document.getElementById('nowPlayingCover').innerHTML = '';
        if (this.activeRightTab === 'nowPlaying') this.renderRightNowPlaying(null);
        this.player.onTimeUpdate?.(0, 0);
        syncPlaybackControls(this.player);
        return;
      }
      this.updateArtworkTheme(track.pictureUrl);
      // Update bottom player
      document.getElementById("nowPlayingTitle").textContent = track.title || "Неизвестный трек";
      document.getElementById("nowPlayingArtist").textContent = track.artist || "Неизвестный исполнитель";
      
      const thumb = document.getElementById("nowPlayingCover");
      mountCover(thumb,track,true);

      // Update Mobile Mini-Player
      const miniPlayer = document.getElementById("mobileMiniPlayer");
      if (miniPlayer) {
        miniPlayer.classList.remove("hidden");
        document.getElementById("mobileMiniTitle").textContent = track.title || "Неизвестный трек";
        document.getElementById("mobileMiniArtist").textContent = track.artist || "Неизвестный исполнитель";
        const miniCover = document.getElementById("mobileMiniCover");
        mountCover(miniCover,track,true);
      }

      // Update Mobile Fullscreen Player
      const fsArtwork = document.getElementById("mobileFsArtwork");
      if(fsArtwork)mountCover(fsArtwork,track,true);
      document.getElementById("mobileFsTitle").textContent = track.title || "Неизвестный трек";
      document.getElementById("mobileFsArtist").textContent = track.artist || "Неизвестный исполнитель";
      document.getElementById("mobileFsContextTitle").textContent = this.player.playbackContext?.title || "Добавленные";
      const contextType=this.player.playbackContext?.type;
      document.querySelector('.mobile-fs-context-subtitle').textContent=contextType==='album'?'Играет из альбома':contextType==='artist'?'Играет из исполнителя':contextType==='search'?'Играет из поиска':'Играет из плейлиста';
      document.getElementById('mobileFsAlbum').textContent=track.album||'Добавленные';
      document.getElementById('mobileFsAboutArtist').textContent=track.artist||'Неизвестный исполнитель';

      this.updateLikeButtons(track.id, track.liked);

      // Update Right Panel Now Playing tab
      if (this.activeRightTab === 'nowPlaying') this.renderRightNowPlaying(track);
      else if (this.isRightPanelOpen) this.renderRightQueue();

      syncPlaybackControls(this.player);
      // Highlight playing row in current table
      document.querySelectorAll(".track-row").forEach((row) => {
        const isCurrent = row.dataset.trackId === track.id;
        row.classList.toggle("playing", isCurrent);
        row.classList.toggle("is-playing", isCurrent && this.player.isPlaying);
      });
    };

    this.player.onTimeUpdate = (currentTime, duration) => {
      const seeking = document.getElementById("progressSliderContainer").dataset.dragging;
      if (!seeking) document.getElementById("currentTimeLabel").textContent = this.formatTime(currentTime);
      document.getElementById("totalTimeLabel").textContent = this.formatTime(duration);

      const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
      if (!seeking) {
        document.getElementById("progressSliderFill").style.width = percent + "%";
        document.getElementById("progressSliderContainer").setAttribute('aria-valuenow', String(Math.round(percent)));
      }

      // Mobile mini-player progress
      const miniFill = document.getElementById("mobileMiniProgressFill");
      if (miniFill) miniFill.style.width = percent + "%";

      // Mobile fullscreen scrubber & times
      const fsSlider = document.getElementById("mobileFsSlider");
      if (fsSlider && !fsSlider.dataset.dragging) {
        fsSlider.value = percent;
        fsSlider.style.setProperty('--seek-progress', percent + '%');
      }
      const fsCurrent = document.getElementById("mobileFsTimeCurrent");
      const fsTotal = document.getElementById("mobileFsTimeTotal");
      if (fsCurrent && !fsSlider?.dataset.dragging) fsCurrent.textContent = this.formatTime(currentTime);
      if (fsTotal) fsTotal.textContent = this.formatTime(duration);

    };

    this.player.onQueueChange = (queue, queueIndex) => {
      syncPlaybackControls(this.player);
      if (this.activeRightTab === "queue" && this.isRightPanelOpen) {
        this.renderRightQueue();
      }
    };

    this.player.onVolumeChange = (volume, isMuted) => {
      const volFill = document.getElementById("volumeSliderFill");
      const volIcon = document.getElementById("btnVolumeIcon");
      volFill.style.width = (isMuted ? 0 : volume * 100) + "%";
      document.getElementById('volumeSliderContainer').setAttribute('aria-valuenow', String(Math.round(volume * 100)));
      volIcon.title = isMuted ? 'Включить звук' : 'Выключить звук';
      volIcon.setAttribute('aria-label', volIcon.title);

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
      document.querySelectorAll('.collection-shuffle').forEach(button=>button.setAttribute('aria-pressed',String(isShuffle)));
      for (const id of ['btnShuffle', 'btnMobileFsShuffle']) document.getElementById(id)?.setAttribute('aria-pressed', String(isShuffle));
      document.getElementById("btnShuffle").classList.toggle("active", isShuffle);
      document.getElementById("btnMobileFsShuffle")?.classList.toggle("active", isShuffle);
    };

    this.player.onRepeatChange = (repeatMode) => {
      const btn = document.getElementById("btnRepeat");
      const fsBtn = document.getElementById("btnMobileFsRepeat");
      btn.classList.toggle("active", repeatMode !== "off");
      fsBtn?.classList.toggle("active", repeatMode !== "off");
      for (const button of [btn, fsBtn].filter(Boolean)) {
        button.dataset.repeat = repeatMode;
        button.setAttribute('aria-pressed', String(repeatMode !== 'off'));
        button.title = repeatMode === 'one' ? 'Повтор одного трека' : repeatMode === 'all' ? 'Повтор всех треков' : 'Повтор выключен';
        button.setAttribute('aria-label', button.title);
      }
      if (repeatMode === "one") {
        btn.setAttribute("data-tooltip", "Повтор текущего трека");
      } else if (repeatMode === "all") {
        btn.setAttribute("data-tooltip", "Повтор всех треков");
      } else {
        btn.setAttribute("data-tooltip", "Повтор отключен");
      }
    };

    this.player.onVolumeChange(this.player.volume, this.player.isMuted);
    this.player.onShuffleChange(this.player.isShuffle);
    this.player.onRepeatChange(this.player.repeatMode);
    this.player.onPlayStateChange(this.player.isPlaying);
    this.library.onLibraryChanged = () => {
      this.renderSidebar();
      this.refreshCurrentView();
    };
  }

  // --- Sidebar Rendering ---

  renderSidebar(...args) { return renderSidebar.apply(this, args); }

  // --- View Navigation ---

  navigateTo(view) {
    if (this.historyIndex >= 0 && this.currentView.type === view.type && this.currentView.id === view.id && this.currentView.extra === view.extra && this.currentView.tab === view.tab) return;
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    if (this.currentView.type === 'search' && view.type !== 'search') {
      this.searchQuery = '';
      document.getElementById('mainSearchInput').value = '';
      document.getElementById('searchClearBtn').classList.remove('visible');
    }
    this.history.push({ ...view });
    this.historyIndex = this.history.length - 1;
    this.loadView(this.history[this.historyIndex]);
    this.updateNavButtons();
  }

  navigateBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadView(this.history[this.historyIndex]);
      this.updateNavButtons();
    }
  }

  handleBack() {
    if(this.dismissTrackMenu){this.dismissTrackMenu();return true;}
    if(this.dismissSurface){this.dismissSurface();return true;}
    const fullscreen=document.getElementById('mobileFullscreenPlayer');
    if(fullscreen.classList.contains('active')){fullscreen.classList.remove('active');return true;}
    if(this.isRightPanelOpen){this.closeRightPanel();return true;}
    if(this.historyIndex>0){this.navigateBack();return true;}
    return false;
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
    this.loadView(this.currentView, true);
  }

  loadView(view, preserveScroll = false) {
    const scroll = document.getElementById('mainScrollContainer');
    if (this.currentView) this.currentView.scrollTop = scroll.scrollTop;
    const restoreScroll = preserveScroll ? scroll.scrollTop : view.scrollTop || 0;
    document.querySelector('#mainTopbar .home-filters')?.remove();
    this.currentView = view;
    scroll.style.removeProperty('--collection-color');
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
    scroll.scrollTop = restoreScroll;
    syncPlaybackControls(this.player);
    container.classList.remove('view-enter');if(!preserveScroll){void container.offsetWidth;container.classList.add('view-enter');}
    const header=container.querySelector('.view-header');
    if(header){header.classList.add('collection-header',`collection-${view.type}`);const cover=header.querySelector('img');if(cover){const color=()=>{if(!header.isConnected)return;try{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(cover,0,0,1,1);const [r,g,b]=ctx.getImageData(0,0,1,1).data;scroll.style.setProperty('--collection-color',`rgb(${r*.55},${g*.55},${b*.55})`);}catch{}};cover.complete?color():cover.addEventListener('load',color,{once:true});}}
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
    document.querySelector('.right-panel-title').textContent=tab==='queue'?'Очередь':'Сейчас играет';
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

    container.innerHTML = `
      <div class="now-playing-panel-cover"></div>
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
    mountCover(container.querySelector('.now-playing-panel-cover'),track,true);
    const artist=container.querySelector('.now-playing-panel-artist');artist.tabIndex=0;artist.setAttribute('role','link');artist.onclick=()=>this.navigateTo({type:'artist',id:track.artist,title:track.artist});artist.onkeydown=e=>{if(e.key==='Enter')artist.click();};
  }

  renderRightQueue(...args) { return renderRightQueue.apply(this, args); }

  // --- Track Table & Action Bar Components ---

  createActionBar(...args) { return createActionBar.apply(this, args); }

  createTrackTable(...args) { return createTrackTable.apply(this, args); }

  // --- Context Menus ---

  showTrackContextMenu(x, y, track, playlistContext = null) {
    return showTrackMenu(this,track,{x,y,playlistContext});
  }

  showPlaylistContextMenu(x,y,playlist) {return collectionMenu(this,{playlist,tracks:this.library.getPlaylistTracks(playlist.id),anchor:{getBoundingClientRect:()=>({left:x,bottom:y})}});}

  closeContextMenu() {
    const menu = document.getElementById("appContextMenu");
    menu.classList.remove("active");
    menu.style.display = "none";
  }

  // --- Modals & Pickers ---

  showCreatePlaylistModal() {return editPlaylist(this);}

  showUpdateModal(info) { this.pendingUpdateInfo = info; }

  closeModals() {
    this.dismissSurface?.();
    document.querySelectorAll(".modal-overlay").forEach((m) => { if (m.dataset.busy !== 'true') m.classList.remove("active"); });
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
    toast.setAttribute("role",type==="error"?"alert":"status");
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, type === "error" ? 8000 : 2800);
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

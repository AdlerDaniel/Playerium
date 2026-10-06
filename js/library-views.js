import { bindCollectionPlay } from './playback-controls.js';
import { renderHomeDashboard } from "./home-view.js";
import { icons } from "./design-icons.js";
export function renderSidebar() {
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

    if (this.sidebarFilter === "all" || this.sidebarFilter === "playlists") {
      const added = document.createElement('div');
      added.className = 'sidebar-item' + (this.currentView.type === 'allTracks' ? ' active' : '');
      added.innerHTML = `<div class="item-thumb local-art">${icons.music}</div><div class="item-info"><span class="item-title">Добавленные</span><span class="item-subtitle">${this.library.getTracks().length} треков</span></div>`;
      added.addEventListener('click', () => this.navigateTo({ type: 'allTracks', title: 'Добавленные' }));
      list.append(added);
    }

    // 2. Playlists
    if (this.sidebarFilter === "all" || this.sidebarFilter === "playlists") {
      const playlists = this.library.getPlaylists().filter(p => !p.isFolderPlaylist);
      playlists.forEach((pl) => {
        const cover = this.library.getPlaylistTracks(pl.id).find(t => t.pictureUrl)?.pictureUrl;
        const item = document.createElement("div");
        item.className = "sidebar-item" + (this.currentView.type === "playlist" && this.currentView.id === pl.id ? " active" : "");
        item.dataset.playlistId = pl.id;

        item.innerHTML = `
          <div class="item-thumb">${cover ? `<img src="${this.escapeHTML(cover)}" alt="">` : icons.music}</div>
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
    if (this.sidebarFilter === "artists") {
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
    if (this.sidebarFilter === "albums") {
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
    const query = (this.libraryQuery || "").toLocaleLowerCase();
    for (const item of list.children) {
      item.hidden = query && !item.textContent.toLocaleLowerCase().includes(query);
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " ") {e.preventDefault();item.click();} });
    }
}

export function renderHomeView(container) {
  return renderHomeDashboard.call(this, container);
}

export function renderAllTracksView(container) {
    let tracks = this.library.getTracks();
    if (this.searchQuery) tracks = this.library.search(this.searchQuery);
    tracks = this.library.sortTracks(tracks, this.sortBy, this.sortAsc);
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
        <h1 class="view-title">${this.searchQuery ? `Поиск: "${this.escapeHTML(this.searchQuery)}"` : "Добавленные"}</h1>
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

export function renderSearchView(container) {
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
          <span>Добавленные</span>
          <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
      `;

      catGrid.querySelector('[data-action="liked"]').addEventListener("click", () => this.navigateTo({ type: "liked", title: "Любимые треки" }));
      catGrid.querySelector('[data-action="artists"]').addEventListener("click", () => this.navigateTo({ type: "library", title: "Моя медиатека", tab: "artists" }));
      catGrid.querySelector('[data-action="albums"]').addEventListener("click", () => this.navigateTo({ type: "library", title: "Моя медиатека", tab: "albums" }));
      catGrid.querySelector('[data-action="playlists"]').addEventListener("click", () => this.navigateTo({ type: "library", title: "Моя медиатека", tab: "playlists" }));
      catGrid.querySelector('[data-action="import"]').addEventListener("click", () => this.triggerMobileFileImport());
      catGrid.querySelector('[data-action="all"]').addEventListener("click", () => this.navigateTo({ type: "allTracks", title: "Добавленные" }));

      catGrid.querySelectorAll(".mobile-cat-card").forEach(card => {
        card.tabIndex = 0; card.setAttribute("role", "button");
        card.addEventListener("keydown", e => {if(e.key === "Enter" || e.key === " "){e.preventDefault();card.click();}});
      });
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

export function renderLibraryView(container) {
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

      if (filter === "all" || filter === "playlists") {
        const all = document.createElement("div");all.className="mobile-lib-row";
        all.innerHTML=`<div class="mobile-lib-thumb local-art">${icons.music}</div><div class="mobile-lib-meta"><span class="mobile-lib-name">Добавленные</span><span class="mobile-lib-sub">${this.library.getTracks().length} треков</span></div>`;
        all.addEventListener("click",()=>this.navigateTo({type:"allTracks",title:"Добавленные"}));listContainer.append(all);
      }
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
        const playlists = this.library.getPlaylists().filter(p => !p.isFolderPlaylist);
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
      if (filter === "artists") {
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
      if (filter === "albums") {
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
      pill.setAttribute("aria-pressed", String(pill.dataset.filter === activeFilter));
      pill.addEventListener("click", () => {
        header.querySelectorAll(".mobile-lib-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        activeFilter = pill.dataset.filter;
        header.querySelectorAll(".mobile-lib-pill").forEach(p => p.setAttribute("aria-pressed", String(p === pill)));
        this.currentView.tab = activeFilter;
        renderItems(activeFilter);
      });
    });

    renderItems(activeFilter);
    const makeAccessible = () => listContainer.querySelectorAll(".mobile-lib-row").forEach(row => {
      row.tabIndex = 0; row.setAttribute("role", "button");
      row.onkeydown = e => { if(e.key === "Enter" || e.key === " ") {e.preventDefault();row.click();} };
    });
    makeAccessible();
    const accessibilityObserver = new MutationObserver(makeAccessible);
    accessibilityObserver.observe(listContainer,{childList:true});
    const cleanupObserver = new MutationObserver(() => {if(!libWrapper.isConnected){accessibilityObserver.disconnect();cleanupObserver.disconnect();}});
    requestAnimationFrame(()=>cleanupObserver.observe(container,{childList:true}));

    header.querySelector("#btnMobileLibAdd")?.addEventListener("click", () => {
      this.showMobileAddSheet();
    });

    container.appendChild(libWrapper);
}

export function renderLikedView(container) {
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
        <span class="view-type-badge">Плейлист</span>
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

export function renderPlaylistView(container, playlistId) {
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
    const playlistCover = tracks.find(t => t.pictureUrl)?.pictureUrl;

    const header = document.createElement("div");
    header.className = "view-header";
    header.innerHTML = `
      <div class="view-header-cover" style="background: linear-gradient(135deg, #450af5, #121212);">
        <svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
      </div>
      <div class="view-header-details">
        <span class="view-type-badge">Плейлист</span>
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

    if (playlistCover) header.querySelector(".view-header-cover").innerHTML = `<img src="${this.escapeHTML(playlistCover)}" alt="">`;
    container.appendChild(header);
    container.appendChild(this.createActionBar(tracks, pl));
    container.appendChild(this.createTrackTable(tracks, pl));
}

export function renderArtistView(container, artistName) {
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
        <span class="view-type-badge">Исполнитель</span>
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

export function renderAlbumView(container, albumName, artistName) {
    const albumTracks = this.library.getTracks().filter((t) => t.album === albumName && (!artistName || t.artist === artistName));
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
        <span class="view-type-badge">Альбом</span>
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

export function createActionBar(tracks, playlist = null) {
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

    bindCollectionPlay(this, bar.querySelector("#btnHeroPlay"), tracks, { ...this.currentView });

    // Delete playlist button
    if (playlist) {
      bar.querySelector("#btnDeletePlaylist").addEventListener("click", async () => {
        if (confirm(`Удалить плейлист «${playlist.name}»?`)) {
          await this.library.deletePlaylist(playlist.id);
          this.showToast("Плейлист удален");
          this.navigateTo({ type: "allTracks", title: "Добавленные" });
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

import { mountTrackRows } from "./virtual-list.js";
export function createTrackTable(tracks, playlistContext = null, showAlbumCol = true) {
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

    const createRow = (track, index) => {
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

      row.tabIndex = 0;
      row.setAttribute("aria-label", `${track.title}, ${track.artist}`);
      row.addEventListener("keydown", event => {
        if ((event.key === "Enter" || event.key === " ") && event.target === row) {
          event.preventDefault(); this.player.playTrack(track, index, tracks, playlistContext);
        }
      });
      return row;
    };
    mountTrackRows(table, tracks, createRow);

    return table;
  }

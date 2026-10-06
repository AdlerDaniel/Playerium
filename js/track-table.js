import { saveIcon, icons } from "./design-icons.js";
import { mountTrackRows } from "./virtual-list.js";
import { playRow } from './playback-controls.js';
export function createTrackTable(tracks, playlistContext = null, showAlbumCol = true) {
    const playbackContext = { ...this.currentView };
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
      <div>Название</div>
      ${showAlbumCol ? `<div>Альбом</div>` : ""}
      <div class="th-date">Дата добавления</div>
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
        ? `<img src="${this.escapeHTML(track.pictureUrl)}" alt="" loading="lazy" />`
        : `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;

      row.innerHTML = `
        <div class="track-col-num">
          <span class="track-number">${index + 1}</span>
          <button class="track-row-play" title="Воспроизвести" aria-label="Воспроизвести">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
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
          ${track.catalog ? `<button class="track-download-btn" title="Скачать" aria-label="Скачать ${this.escapeHTML(track.title)}"><svg viewBox="0 0 24 24"><path d="M11 3h2v10l3-3 1.4 1.4L12 17l-5.4-5.6L8 10l3 3V3zM5 19h14v2H5z"/></svg></button>` : ''}
          <button class="track-like-btn ${track.liked ? "liked" : ""}" data-like-id="${track.id}" title="${track.liked ? "Удалить из любимых" : "Добавить в любимые"}">
${saveIcon}
          </button>
          <span>${this.formatTime(track.duration)}</span>
          <button class="track-menu-btn" data-track-id="${track.id}" title="Ещё">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
          </button>
        </div>
      `;

      // The entire row plays; only explicit action buttons intercept the click.
      row.addEventListener("click", (e) => {
        if (e.detail > 1 || e.target.closest('button')) return;
        playRow(this, track, tracks, playbackContext);
      });
      row.querySelector(".track-row-play").addEventListener("click", (e) => {
        e.stopPropagation();
        playRow(this, track, tracks, playbackContext, true);
      });

      const playButton = row.querySelector('.track-row-play');
      playButton.innerHTML = isCurrent && this.player.isPlaying ? icons.pause : icons.play;
      playButton.title = isCurrent && this.player.isPlaying ? 'Пауза' : 'Воспроизвести';
      playButton.setAttribute('aria-label', playButton.title);

      // Like button click
      const likeBtn = row.querySelector(".track-like-btn");
      likeBtn.setAttribute("aria-pressed",String(!!track.liked));
      likeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const saved=track.catalog?await this.music.ensureTrack(track):track;
          const liked = await this.library.toggleLike(saved.id);
          this.updateLikeButtons(saved.id, liked);
          this.showToast(liked ? "Добавлено в «Любимые треки»" : "Удалено из «Любимых треков»");
        }catch(error){this.showToast(error.message,'error');}
      });

      row.querySelector('.track-download-btn')?.addEventListener('click',async e=>{
        e.stopPropagation();try{await this.music.ensureTrack(track);this.showToast('Трек сохранён','success');this.refreshCurrentView();}
        catch(error){this.showToast(error.message,'error');}
      });
      if(this.music?.downloads.has(track.id)){row.dataset.downloading='true';const download=row.querySelector('.track-download-btn');if(download)download.disabled=true;}

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
          event.preventDefault(); playRow(this, track, tracks, playbackContext);
        }
      });
      return row;
    };
    mountTrackRows(table, tracks, createRow);

    return table;
  }

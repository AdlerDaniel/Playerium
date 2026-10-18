import {mountCover} from './artwork.js';
import { saveIcon, icons } from "./design-icons.js";
import { mountTrackRows } from "./virtual-list.js";
import { playRow } from './playback-controls.js';
import {changeTrackSort} from './track-sort.js';
import {attachTrackSelection} from './track-selection.js';
import {decorateTrackState} from './track-state.js';
import {installPlaylistDrop} from './playlist-composer.js';
export function createTrackTable(tracks, playlistContext = null) {
    tracks=tracks.filter(track=>!this.pendingTrackRemoval?.has(track.id));
    this.interfaceTracks||=new Map();for(const track of tracks)if(track.catalog)this.interfaceTracks.set(track.id,track);
    while(this.interfaceTracks.size>2000)this.interfaceTracks.delete(this.interfaceTracks.keys().next().value);
    if(this.tableSortExplicit)tracks=this.library.sortTracks(tracks,this.sortBy,this.sortAsc);
    const playbackContext = { ...this.currentView };
    const table = document.createElement("div");
    table.className = "track-table";
    table.setAttribute('role','table');
    table.setAttribute('aria-colcount','4');table.setAttribute('aria-rowcount',String(tracks.length+1));

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
    header.className = "track-table-header compact-columns";
    header.setAttribute('role','row');
    header.innerHTML = `
      <div class="th-num" role="columnheader">#</div>
      <div role="columnheader" data-sort-column="title"><button class="track-sort-button" data-track-sort="title">Название</button></div>
      <div class="th-date" role="columnheader" data-sort-column="dateAdded"><button class="track-sort-button" data-track-sort="dateAdded">Дата добавления</button></div>
      <div class="th-duration" role="columnheader" data-sort-column="duration">
        <button class="track-sort-button" data-track-sort="duration" aria-label="Сортировать по длительности"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm9-3.25V8H5.75a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 .75-.75V4.75a.75.75 0 0 0-1.5 0z"/></svg></button>
      </div>
    `;
    table.appendChild(header);
    for(const button of header.querySelectorAll('[data-track-sort]')){
      const field=button.dataset.trackSort,active=this.sortBy===field&&(this.tableSortExplicit||(['allTracks','liked'].includes(this.currentView.type)||this.currentView.type==='playlist'&&!playlistContext?.manualOrder));
      button.parentElement.setAttribute('aria-sort',active?(this.sortAsc?'ascending':'descending'):'none');
      if(active){const arrow=document.createElement('span');arrow.className='track-sort-direction';arrow.setAttribute('aria-hidden','true');arrow.textContent=this.sortAsc?'▴':'▾';button.append(arrow);}
      button.onclick=()=>changeTrackSort(this,field);
    }

    installPlaylistDrop(this,table,playlistContext);
    const selection=attachTrackSelection(this,table,tracks,playlistContext);
    const createRow = (track, index, virtual = false) => {
      const row = document.createElement("div");
      const isCurrent = this.player.currentTrack && this.player.currentTrack.id === track.id;
      row.className = `track-row compact-columns ${isCurrent ? "playing" : ""} ${isCurrent && this.player.isPlaying ? "is-playing" : ""}`;
      row.dataset.trackId = track.id;
      row.setAttribute('role','row');row.setAttribute('aria-rowindex',String(index+2));
      const pending=this.pendingPlayback?.id===track.id;row.setAttribute('aria-busy',String(pending));row.classList.toggle('track-pending',pending&&this.playbackLoadingVisible);

      row.innerHTML = `
        <div class="track-col-num">
          <label class="track-select-wrap"><input type="checkbox" class="track-select" aria-label="Выбрать ${this.escapeHTML(track.title)}"></label>
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
          <div class="track-mini-thumb"></div>
          <div class="track-meta">
            <span class="track-name">${this.escapeHTML(track.title)}</span>
            <span class="track-artist" data-artist="${this.escapeHTML(track.artist)}">${this.escapeHTML(track.artist)}</span>
          </div>
        </div>
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

      mountCover(row.querySelector('.track-mini-thumb'),track,virtual || index < 12);
      row.classList.toggle('track-selected',selection.state.ids.has(track.id));row.setAttribute('aria-selected',String(selection.state.ids.has(track.id)));row.querySelector('.track-select').checked=selection.state.ids.has(track.id);
      decorateTrackState(this,row,track);
      if(!this.isMobile){row.draggable=true;row.addEventListener('dragstart',event=>{const ids=selection.state.ids.has(track.id)?tracks.filter(t=>selection.state.ids.has(t.id)).map(t=>t.id):[track.id];event.dataTransfer.setData('application/x-playerium-tracks',JSON.stringify(ids));if(playlistContext)event.dataTransfer.setData('application/x-playerium-playlist',playlistContext.id);event.dataTransfer.effectAllowed='copyMove';});}
      for(const cell of row.children)cell.setAttribute('role','cell');
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
        e.stopPropagation();const task=this.music.ensureTrack(track);decorateTrackState(this,row,track,true);try{await task;this.showToast('Трек сохранён','success');this.refreshCurrentView();}
        catch(error){this.showToast(error.message,'error');}finally{if(row.isConnected)decorateTrackState(this,row,track);}
      });
      if(this.music?.downloads.has(track.id)){row.dataset.downloading='true';const download=row.querySelector('.track-download-btn');if(download)download.disabled=true;}

      // Context menu
      const moreBtn = row.querySelector(".track-menu-btn");
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.isMobile) {
          this.showMobileTrackOptionsSheet(track, index, tracks, playlistContext);
        } else {
          const rect=moreBtn.getBoundingClientRect();
          this.showTrackContextMenu(e.clientX||rect.right, e.clientY||rect.bottom, track, playlistContext);
        }
      });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if(this.isMobile&&selection.state.ids.size)return;
        if (this.isMobile) {
          this.showMobileTrackOptionsSheet(track, index, tracks, playlistContext);
        } else {
          const rect=moreBtn.getBoundingClientRect();
          this.showTrackContextMenu(e.clientX||rect.right, e.clientY||rect.bottom, track, playlistContext);
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

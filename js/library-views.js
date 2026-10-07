import {renderLibrary} from './library-view.js';
import {mountCover} from './artwork.js';
import {collectionMenu,editPlaylist} from './collection-menu.js';
import {showSurfaceMenu} from './surface-menu.js';
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
    list.querySelectorAll('.item-thumb img').forEach(img=>mountCover(img.parentElement,{pictureUrl:img.getAttribute('src')}));
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

export function renderLibraryView(container) { return renderLibrary(this,container); }

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

    if (playlistCover) mountCover(header.querySelector('.view-header-cover'),{pictureUrl:playlistCover},true);
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
      <div class="view-header-cover artist-hero-art">${icons.artist}</div>
      <div class="view-header-details">
        <span class="view-type-badge">Исполнитель</span>
        <h1 class="view-title">${this.escapeHTML(artistName)}</h1>
        <div class="view-metadata">
          <span>${sorted.length} треков</span>
        </div>
      </div>
    `;

    if(coverUrl) mountCover(header.querySelector('.view-header-cover'),{pictureUrl:coverUrl},true);
    container.appendChild(header);
    container.appendChild(this.createActionBar(sorted));
    const heading=document.createElement('h2');heading.className='collection-section-heading';heading.textContent='Треки';container.append(heading);
    container.appendChild(this.createTrackTable(sorted));
    const albums=this.library.getAlbums().filter(a=>a.artist===artistName);
    if(albums.length){const section=document.createElement('section');section.className='artist-discography';section.innerHTML='<h2>Дискография</h2><div class="shelf-cards"></div>';
      for(const album of albums){const card=document.createElement('button');card.className='shelf-card';card.innerHTML=`<div class="shelf-art"></div><div class="shelf-title">${this.escapeHTML(album.name)}</div><div class="shelf-subtitle">Альбом</div>`;mountCover(card.firstElementChild,album);card.onclick=()=>this.navigateTo({type:'album',id:album.name,extra:artistName,title:album.name});section.lastElementChild.append(card);}container.append(section);}

}

export function renderAlbumView(container, albumName, artistName) {
    const albumTracks = this.library.getTracks().filter((t) => t.album === albumName && (!artistName || t.artist === artistName));
    const coverUrl = albumTracks.find((t) => t.pictureUrl)?.pictureUrl;
    const sorted = this.library.sortTracks(albumTracks, "trackNo", true);
    const totalDur = sorted.reduce((acc, t) => acc + (t.duration || 0), 0);

    const header = document.createElement("div");
    header.className = "view-header";
    header.innerHTML = `
      <div class="view-header-cover">${icons.music}</div>
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

    if(coverUrl)mountCover(header.querySelector('.view-header-cover'),{pictureUrl:coverUrl},true);
    const artistLink=header.querySelector('.view-metadata strong');artistLink.tabIndex=0;artistLink.setAttribute('role','link');const openArtist=()=>this.navigateTo({type:'artist',id:artistName||sorted[0]?.artist,title:artistName||sorted[0]?.artist});artistLink.onclick=openArtist;artistLink.onkeydown=e=>{if(e.key==='Enter')openArtist();};
    container.appendChild(header);
    container.appendChild(this.createActionBar(sorted));
    container.appendChild(this.createTrackTable(sorted, null, false));
}

export function createActionBar(tracks, playlist = null) {
    const bar=document.createElement('div');bar.className='view-actions';
    bar.innerHTML=`<div class="view-actions-left"><button class="btn-primary-play" id="btnHeroPlay" title="Воспроизвести все">${icons.play}</button><button class="action-icon-btn collection-shuffle" aria-label="Перемешать" aria-pressed="${this.player.isShuffle}">${icons.shuffle}</button><button class="action-icon-btn collection-more" aria-label="Действия с коллекцией">${icons.more}</button></div><div class="view-actions-right">${playlist?`<button class="collection-tool collection-add">${icons.plus}Добавить</button><button class="collection-tool collection-edit">${icons.edit}Изменить</button>`:''}<button class="collection-tool collection-sort">${icons.sort}Сортировать</button></div>`;
    bindCollectionPlay(this,bar.querySelector('#btnHeroPlay'),tracks,{...this.currentView});
    bar.querySelector('.collection-shuffle').onclick=()=>{this.player.toggleShuffle();};
    bar.querySelector('.collection-more').onclick=e=>collectionMenu(this,{tracks,playlist,anchor:e.currentTarget});
    if(playlist){bar.querySelector('.collection-add').onclick=()=>this.navigateTo({type:'search',title:'Поиск'});bar.querySelector('.collection-edit').onclick=()=>editPlaylist(this,playlist);}
    const labels={dateAdded:'По дате добавления',title:'По названию трека',artist:'По исполнителю',album:'По альбому',duration:'По длительности'};
    bar.querySelector('.collection-sort').onclick=e=>showSurfaceMenu(this,{title:'Сортировка треков',anchor:e.currentTarget,items:Object.entries(labels).map(([value,label])=>({label,selected:this.sortBy===value,icon:icons.sort,action:()=>{this.sortBy=value;this.sortAsc=['title','artist','album'].includes(value);this.refreshCurrentView();}}))});
    return bar;
}

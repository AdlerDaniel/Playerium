import {renderLibrary} from './library-view.js';
import {renderArtistProfile} from './artist-profile.js';
import {mountCover,retainArtwork} from './artwork.js';
import {collectionMenu,editPlaylist} from './collection-menu.js';
import {showSurfaceMenu} from './surface-menu.js';
import { bindCollectionPlay } from './playback-controls.js';
import { renderHomeDashboard } from "./home-view.js";
import { icons } from "./design-icons.js";
import { viewFingerprint } from './view-stability.js';
import {addedArtwork,bindPlaylistCover,mountPlaylistArt,mountArtistPortrait} from './visual-art.js';
import {changeTrackSort} from './track-sort.js';
export function renderSidebar() {
 const list=document.getElementById('sidebarList');
 if(this.isMobile){retainArtwork(list);list.replaceChildren();this.sidebarSignature=null;return;}
 const signature=JSON.stringify([viewFingerprint(this),this.currentView?.type,this.currentView?.id]);
 if(list.children.length&&this.sidebarSignature===signature)return;this.sidebarSignature=signature;
 const scroll=list.scrollLeft;retainArtwork(list);list.replaceChildren();
 const items=[{art:addedArtwork(this.library),tracks:this.library.getTracks(),name:'Добавленные',view:{type:'allTracks',title:'Добавленные'}},...this.library.getPlaylists().filter(p=>!p.isFolderPlaylist).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id)).map(p=>({art:p,tracks:this.library.getPlaylistTracks(p.id),name:p.name,view:{type:'playlist',id:p.id,title:p.name}}))];
 for(const item of items){const button=document.createElement('button');button.className='sidebar-item library-album';button.dataset.playlistId=item.art.id;button.setAttribute('aria-label',item.name);button.title=item.name;button.setAttribute('aria-current',String(this.currentView.type===item.view.type&&this.currentView.id===item.view.id));
  const cover=document.createElement('span');cover.className='item-thumb';cover.setAttribute('aria-hidden','true');mountPlaylistArt(cover,item.art,item.tracks);const placeholder=cover.querySelector('.playlist-letter-art');if(placeholder)placeholder.innerHTML=icons.music;button.append(cover);button.onclick=()=>this.navigateTo(item.view);
  button.oncontextmenu=e=>{e.preventDefault();collectionMenu(this,{playlist:item.view.type==='playlist'?item.art:null,tracks:item.tracks,anchor:button});};list.append(button);
 }list.scrollLeft=scroll;
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

    const art=addedArtwork(this.library),cover=header.querySelector('.view-header-cover');
    mountPlaylistArt(cover,art,this.library.getTracks());bindPlaylistCover(this,cover,art);
    container.appendChild(header);
    container.appendChild(this.createActionBar(tracks));
    container.appendChild(this.createTrackTable(tracks));
}

export function renderLibraryView(container) { return renderLibrary(this,container); }

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
    if(!pl.manualOrder||this.tableSortExplicit)tracks = this.library.sortTracks(tracks, this.sortBy, this.sortAsc);

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

    mountPlaylistArt(header.querySelector('.view-header-cover'),pl,tracks);
    bindPlaylistCover(this,header.querySelector('.view-header-cover'),pl);
    container.appendChild(header);
    container.appendChild(this.createActionBar(tracks, pl));
    container.appendChild(this.createTrackTable(tracks, pl));
}

export function renderArtistView(container, artistName) {
    return renderArtistProfile.call(this,container,artistName);
}

export function createActionBar(tracks, playlist = null) {
    const bar=document.createElement('div');bar.className='view-actions';
    bar.innerHTML=`<div class="view-actions-left"><button class="btn-primary-play" id="btnHeroPlay" title="Воспроизвести все">${icons.play}</button><button class="action-icon-btn collection-shuffle" aria-label="Перемешать" aria-pressed="${this.player.isShuffle}">${icons.shuffle}</button><button class="action-icon-btn collection-more" aria-label="Действия с коллекцией">${icons.more}</button></div><div class="view-actions-right">${playlist?`<button class="collection-tool collection-add">${icons.plus}Добавить</button><button class="collection-tool collection-edit">${icons.edit}Изменить</button>`:''}<button class="collection-tool collection-sort">${icons.sort}Сортировать</button></div>`;
    bindCollectionPlay(this,bar.querySelector('#btnHeroPlay'),tracks,{...this.currentView});
    bar.querySelector('.collection-shuffle').onclick=()=>{this.player.toggleShuffle();};
    bar.querySelector('.collection-more').onclick=e=>collectionMenu(this,{tracks,playlist,anchor:e.currentTarget});
    if(playlist){bar.querySelector('.collection-add').onclick=()=>this.navigateTo({type:'search',title:'Поиск'});bar.querySelector('.collection-edit').onclick=()=>editPlaylist(this,playlist);}
    const labels={dateAdded:'По дате добавления',title:'По названию трека',artist:'По исполнителю',duration:'По длительности'};
    bar.querySelector('.collection-sort').onclick=e=>showSurfaceMenu(this,{title:'Сортировка треков',anchor:e.currentTarget,items:Object.entries(labels).map(([value,label])=>({label,selected:this.sortBy===value,icon:icons.sort,action:()=>changeTrackSort(this,value,false)}))});
    return bar;
}

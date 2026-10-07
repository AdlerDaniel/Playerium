import { bindCollectionPlay, playRow } from './playback-controls.js';
import { icons } from './design-icons.js';
import {mountCover} from './artwork.js';

function artwork(ui, item) {
  return item.pictureUrl ? '<span class="card-cover"></span>' : icons[item.icon || 'music'];
}
function activate(element, action) {
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.addEventListener('click', action);
  element.addEventListener('keydown', e => {
    if (e.target === element && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); action(); }
  });
}
export function renderHomeDashboard(container) {
  const ui = this;
  const tracks = this.library.sortTracks(this.library.getTracks(), 'dateAdded', false);
  const playlists = this.library.getPlaylists().filter(p => !p.isFolderPlaylist).map(pl => ({
    title: pl.name, subtitle: `Плейлист • ${pl.trackIds.length} треков`,
    pictureUrl: this.library.getPlaylistTracks(pl.id).find(t => t.pictureUrl)?.pictureUrl,
    view: {type:'playlist',id:pl.id,title:pl.name}, tracks: this.library.getPlaylistTracks(pl.id),
  }));
  const albums = this.library.getAlbums().map(a => ({title:a.name,subtitle:a.artist,pictureUrl:a.pictureUrl,
    view:{type:'album',id:a.name,title:a.name,extra:a.artist},tracks:a.tracks}));
  const artists = this.library.getArtists().map(a => ({title:a.name,subtitle:'Исполнитель',pictureUrl:a.pictureUrl,icon:'artist',round:true,
    view:{type:'artist',id:a.name,title:a.name},tracks:a.tracks}));
  const filter = this.homeFilter || 'all';
  const home = document.createElement('div'); home.className='home-dashboard';
  const filters = document.createElement('div'); filters.className='home-filters';
  for (const [value,label] of [['all','Все'],['playlists','Плейлисты'],['artists','Исполнители'],['albums','Альбомы']]) {
    const button=document.createElement('button'); button.className='pill-btn'+(filter===value?' active':'');
    button.textContent=label;button.setAttribute('aria-pressed',String(filter===value));
    button.addEventListener('click',()=>{this.homeFilter=value;this.refreshCurrentView();});filters.append(button);
  }
  if (this.isMobile) document.getElementById('mainTopbar').append(filters);
  else home.append(filters);
  const quick=document.createElement('div');quick.className='home-quick-grid';
  const liked={title:'Любимые треки',icon:'heart',className:'liked-art',view:{type:'liked',title:'Любимые треки'},tracks:this.library.getLikedTracks()};
  const all={title:'Добавленные',icon:'music',className:'local-art',view:{type:'allTracks',title:'Добавленные'},tracks};
  const quickItems=filter==='all'?[liked,all,...playlists]:filter==='playlists'?[liked,...playlists]:filter==='artists'?artists:albums;
  for (const item of quickItems.slice(0,8)) {
    const card=document.createElement('div');card.className='home-quick-card';
    card.innerHTML=`<div class="home-quick-art ${item.className||''}">${artwork(ui,item)}</div><span>${this.escapeHTML(item.title)}</span>`;
    if(item.pictureUrl)mountCover(card.querySelector('.card-cover'),item);
    activate(card,()=>this.navigateTo(item.view));quick.append(card);
  }
  home.append(quick);
  const shelf=(title,items,view)=>{
    if(!items.length) return;
    const section=document.createElement('section');section.className='home-shelf';
    const heading=document.createElement('div');heading.className='shelf-heading';
    const h=document.createElement('h2');h.textContent=title;heading.append(h);
    const more=document.createElement('button');more.className='shelf-more';more.textContent='Показать все';
    more.addEventListener('click',()=>this.navigateTo(view));heading.append(more);section.append(heading);
    const cards=document.createElement('div');cards.className='shelf-cards';
    for(const item of items.slice(0,12)) {
      const card=document.createElement('div');card.className='shelf-card'+(item.round?' artist':'');
      card.innerHTML=`<div class="shelf-art">${artwork(ui,item)}<button class="shelf-play" aria-label="Воспроизвести ${this.escapeHTML(item.title)}">${icons.play}</button></div><div class="shelf-title">${this.escapeHTML(item.title)}</div><div class="shelf-subtitle">${this.escapeHTML(item.subtitle)}</div>`;
      if(item.pictureUrl)mountCover(card.querySelector('.card-cover'),item);
      activate(card,()=>item.view?this.navigateTo(item.view):playRow(this,item.tracks[0],tracks,all.view));
      const button=card.querySelector('.shelf-play');
      if(item.view) bindCollectionPlay(this,button,item.tracks,item.view);
      else { button.dataset.trackPlayId=item.tracks[0].id; button.addEventListener('click',()=>playRow(this,item.tracks[0],tracks,all.view,true)); }
      button.addEventListener('click',e=>e.stopPropagation());
      cards.append(card);
    }
    section.append(cards);home.append(section);
  };
  if(filter==='all') shelf('Недавно добавленные',tracks.slice(0,12).map(t=>({title:t.title,subtitle:t.artist,pictureUrl:t.pictureUrl,tracks:[t,...tracks.filter(x=>x.id!==t.id)]})),all.view);
  if(filter==='albums') shelf('Ваши альбомы',albums,{type:'library',title:'Моя медиатека',tab:'albums'});
  if(filter==='artists') shelf('Ваши исполнители',artists,{type:'library',title:'Моя медиатека',tab:'artists'});
  if(filter==='all'){shelf('Ваши альбомы',albums,{type:'library',title:'Моя медиатека',tab:'albums'});shelf('Ваши исполнители',artists,{type:'library',title:'Моя медиатека',tab:'artists'});}
  if(filter==='all'||filter==='playlists') shelf('Ваши плейлисты',playlists,{type:'library',title:'Моя медиатека',tab:'playlists'});
  if(!home.querySelector('.home-shelf')) {
    const empty=document.createElement('section');empty.className='home-onboarding';
    empty.innerHTML=`<h2>${tracks.length?'Ваша музыка — в одном месте':'Начните с любимой музыки'}</h2><p>Добавьте музыку и соберите свою коллекцию треков, альбомов и плейлистов.</p><div><button class="home-import">Добавить музыку</button><button class="home-create">Создать плейлист</button></div>`;
    empty.querySelector('.home-import').addEventListener('click',()=>this.isMobile?this.showMobileAddSheet():this.triggerFolderPicker());
    empty.querySelector('.home-create').addEventListener('click',()=>this.showCreatePlaylistModal());home.append(empty);
  }
  container.append(home);
}

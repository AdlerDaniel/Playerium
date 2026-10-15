import {mountCover,retainArtwork} from './artwork.js';
import {icons} from './design-icons.js';
import {artistCredits,belongsToArtist} from './music-artists.js';
import {artistKey} from './music-match.js';
import {loadingRows,loadingIndicator} from './loading.js';
import {mountArtistPortrait} from './visual-art.js';

export function renderArtistProfile(container,name) {
  const ui=this,requested=ui.currentView.artist||{name};
  const root=document.createElement('section');root.className='artist-profile';container.append(root);
  let expanded=false,profile={artist:requested,tracks:ui.library.getTracks().filter(t=>belongsToArtist(t,requested))},busy=!!ui.music?.available;
  const render=()=>{
    retainArtwork(root);root.replaceChildren();const {artist,tracks}=profile;
    const header=document.createElement('div');header.className='view-header';
    header.innerHTML=`<div class="view-header-cover artist-hero-art">${icons.artist}</div><div class="view-header-details"><span class="view-type-badge">Исполнитель</span><h1 class="view-title">${ui.escapeHTML(artist.name)}</h1><div class="view-metadata">${tracks.length?`${tracks.length} треков`:''}</div></div>`;
    mountArtistPortrait(ui,header.firstElementChild,artist);
    root.append(header);if(tracks.length)root.append(ui.createActionBar(tracks));
    if(busy&&!tracks.length)root.append(loadingRows(6));
    root.setAttribute('aria-busy',String(busy));
    const status=busy?loadingIndicator('Загрузка песен…'):document.createElement('p');status.classList.add('artist-profile-status');status.setAttribute('role','status');if(!busy)status.textContent=profile.offline?'Не удалось загрузить каталог. Показаны доступные треки.':'';root.append(status);
    const section=(title,list)=>{if(!list.length)return;const h=document.createElement('h2');h.className='collection-section-heading';h.textContent=title;root.append(h,ui.createTrackTable(list));};
    section('Популярные',expanded?tracks:tracks.slice(0,10));
    if(tracks.length>10){const more=document.createElement('button');more.className='search-show-all';more.textContent=expanded?'Показать меньше':'Показать все песни';more.onclick=()=>{expanded=!expanded;render();};root.append(more);}
    const features=tracks.filter(t=>artistKey(t.artist)!==artistKey(artist.name)||artistCredits(t).length>1);
    section('Совместные записи',features);
    if(!busy&&!tracks.length){const empty=document.createElement('p');empty.className='artist-profile-status';empty.textContent=profile.offline?'Проверьте подключение и попробуйте ещё раз.':'Песни этого исполнителя пока не найдены.';root.append(empty);}
    if(!busy&&profile.offline){const retry=document.createElement('button');retry.className='search-show-all';retry.textContent='Повторить';retry.onclick=()=>ui.refreshCurrentView();root.append(retry);}
    if(ui.experience)ui.experience.compactHeader(root);
  };
  render();
  if(ui.music?.available)ui.music.artistProfile(requested).then(value=>{if(!root.isConnected||ui.currentView.type!=='artist'||ui.currentView.id!==name)return;profile=value;busy=false;render();}).catch(()=>{if(!root.isConnected)return;busy=false;profile.offline=true;render();});
}

import {mountCover,retainArtwork} from './artwork.js';
import {icons} from './design-icons.js';
import {artistCredits,belongsToArtist} from './music-artists.js';
import {artistKey} from './music-match.js';
import {loadingRows,loadingIndicator} from './loading.js';
import {mountArtistPortrait} from './visual-art.js';

export function renderArtistProfile(container,name) {
  const ui=this,requested=ui.currentView.artist||{name};
  const root=document.createElement('section');root.className='artist-profile';container.append(root);
  let expanded=false,selected='popular',profile={artist:requested,tracks:ui.library.getTracks().filter(t=>belongsToArtist(t,requested))},busy=!!ui.music?.available;
  const render=()=>{
    retainArtwork(root);root.replaceChildren();const {artist,tracks}=profile;
    const header=document.createElement('div');header.className='view-header';
    header.innerHTML=`<div class="view-header-cover artist-hero-art">${icons.artist}</div><div class="view-header-details"><span class="view-type-badge">Исполнитель</span><h1 class="view-title">${ui.escapeHTML(artist.name)}</h1><div class="view-metadata">${tracks.length?`${tracks.length} треков`:''}</div></div>`;
    mountArtistPortrait(ui,header.firstElementChild,artist);
    root.append(header);if(tracks.length)root.append(ui.createActionBar(tracks));
    if(busy&&!tracks.length)root.append(loadingRows(6));
    root.setAttribute('aria-busy',String(busy));
    const status=busy?loadingIndicator('Загрузка песен…'):document.createElement('p');status.classList.add('artist-profile-status');status.setAttribute('role','status');if(!busy)status.textContent=profile.offline?'Не удалось загрузить каталог. Показаны доступные треки.':'';root.append(status);
    const features=tracks.filter(t=>artistKey(t.artist)!==artistKey(artist.name)||artistCredits(t).length>1);
    const saved=ui.library.getTracks().filter(t=>belongsToArtist(t,artist));
    const tabs=document.createElement('div');tabs.className='artist-section-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Песни исполнителя');
    const groups=[['popular','Популярные',expanded?tracks:tracks.slice(0,10)],['all','Все песни',[...tracks].sort((a,b)=>a.title.localeCompare(b.title,'ru'))],['features','Совместные записи',features],['saved','В вашей медиатеке',saved]];
    for(const [i,[id,label,list]] of groups.entries()){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(selected===id));button.setAttribute('aria-controls','artist-section-results');button.tabIndex=selected===id?0:-1;button.dataset.artistSection=id;button.onclick=()=>{selected=id;render();root.querySelector(`[data-artist-section="${id}"]`)?.focus({preventScroll:true});};button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const at=e.key==='Home'?0:e.key==='End'?groups.length-1:(i+(e.key==='ArrowRight'?1:groups.length-1))%groups.length;tabs.children[at].click();}};tabs.append(button);}
    root.append(tabs);const result=document.createElement('div');result.id='artist-section-results';result.setAttribute('role','tabpanel');const group=groups.find(([id])=>id===selected);const title=document.createElement('h2');title.className='collection-section-heading';title.textContent=`${group[1]} · ${selected==='popular'?tracks.length:group[2].length}`;result.append(title);
    if(group[2].length)result.append(ui.createTrackTable(group[2]));else if(!busy){const empty=document.createElement('p');empty.className='artist-profile-status';empty.textContent=selected==='saved'?'Вы ещё не сохранили песни этого исполнителя.':selected==='features'?'Совместных записей пока не найдено.':'Песни пока не найдены.';result.append(empty);}else result.append(loadingRows(3));root.append(result);
    if(selected==='popular'&&tracks.length>10){const more=document.createElement('button');more.className='search-show-all';more.textContent=expanded?'Показать меньше':'Показать все песни';more.onclick=()=>{expanded=!expanded;render();};root.append(more);}
    if(!busy&&!tracks.length){const empty=document.createElement('p');empty.className='artist-profile-status';empty.textContent=profile.offline?'Проверьте подключение и попробуйте ещё раз.':'Песни этого исполнителя пока не найдены.';root.append(empty);}
    if(!busy&&profile.offline){const retry=document.createElement('button');retry.className='search-show-all';retry.textContent='Повторить';retry.onclick=()=>ui.refreshCurrentView();root.append(retry);}
    if(ui.experience)ui.experience.compactHeader(root);
  };
  render();
  if(ui.music?.available)ui.music.artistProfile(requested).then(value=>{if(!root.isConnected||ui.currentView.type!=='artist'||ui.currentView.id!==name)return;profile=value;busy=false;render();}).catch(()=>{if(!root.isConnected)return;busy=false;profile.offline=true;render();});
}

import {artistResults} from './music-artists.js';
import {icons} from './design-icons.js';
import {mountCover} from './artwork.js';
import {playRow} from './playback-controls.js';
import {normalize} from './music-match.js';
const historyKey='playerium_search_history';
function history(){try{return JSON.parse(localStorage.getItem(historyKey)||'[]').filter(q=>typeof q==='string').slice(0,8);}catch{return [];}}
function remember(query){if(query.trim().length<2)return;try{localStorage.setItem(historyKey,JSON.stringify([query.trim(),...history().filter(q=>q!==query.trim())].slice(0,8)));}catch{}}
export function renderSearchView(container) {
  const ui=this,raw=ui.searchQuery||'',query=raw.trim();
  const wrapper=document.createElement('section');wrapper.className='mobile-search-view spotify-search'+(query?' search-active':'');
  wrapper.innerHTML=`<h1 class="mobile-search-title">Поиск</h1><div class="search-input-line"><button class="search-back" aria-label="Назад">‹</button><div class="mobile-search-bar-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 5 5" stroke="currentColor" stroke-width="2"/></svg><input class="mobile-search-input" type="search" inputmode="search" autocomplete="off" spellcheck="false" aria-label="Поиск песен, исполнителей и альбомов" placeholder="Что хотите послушать?" value="${ui.escapeHTML(raw)}"><button class="mobile-search-clear" aria-label="Очистить поиск">×</button></div></div>`;
  const input=wrapper.querySelector('input');
  const setQuery=q=>{ui.searchQuery=q;document.getElementById('mainSearchInput').value=q;ui.refreshCurrentView();};
  input.addEventListener('input',()=>setQuery(input.value));
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){remember(input.value);input.blur();}});
  wrapper.querySelector('.mobile-search-clear').addEventListener('click',()=>{setQuery('');document.querySelector('.mobile-search-input')?.focus();});
  wrapper.querySelector('.search-back').addEventListener('click',()=>{setQuery('');});
  container.append(wrapper);
  if(!query){
    const recent=history();
    if(recent.length){
      const section=document.createElement('section');section.className='search-recent';section.innerHTML='<h2>Недавние поиски</h2>';
      for(const q of recent){const row=document.createElement('div');row.className='search-recent-row';row.innerHTML=`<button class="search-recent-query">${icons.music}<span>${ui.escapeHTML(q)}</span></button><button class="search-history-remove" aria-label="Удалить из истории ${ui.escapeHTML(q)}">×</button>`;
        row.firstElementChild.onclick=()=>setQuery(q);row.lastElementChild.onclick=()=>{localStorage.setItem(historyKey,JSON.stringify(history().filter(item=>item!==q)));ui.refreshCurrentView();};section.append(row);}
      wrapper.append(section);
    }
    const heading=document.createElement('h2');heading.textContent='Все категории';wrapper.append(heading);
    const grid=document.createElement('div');grid.className='mobile-search-categories';
    const categories=[['Любимые треки','cat-purple',icons.heart,()=>ui.navigateTo({type:'liked',title:'Любимые треки'})],['Исполнители','cat-blue',icons.artist,()=>ui.navigateTo({type:'library',tab:'artists',title:'Моя медиатека'})],['Альбомы','cat-orange',icons.music,()=>ui.navigateTo({type:'library',tab:'albums',title:'Моя медиатека'})],['Плейлисты','cat-green',icons.music,()=>ui.navigateTo({type:'library',tab:'playlists',title:'Моя медиатека'})],['Добавить файлы','cat-teal',icons.music,()=>ui.triggerMobileFileImport()],['Добавленные','cat-pink',icons.music,()=>ui.navigateTo({type:'allTracks',title:'Добавленные'})]];
    for(const [label,color,icon,action] of categories){const card=document.createElement('button');card.className=`mobile-cat-card ${color}`;card.innerHTML=`<span>${label}</span>${icon}`;card.onclick=action;grid.append(card);}wrapper.append(grid);return;
  }
  const tabs=document.createElement('div');tabs.className='search-filter-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Тип результатов');
  const results=document.createElement('div');results.className='song-search-results';results.id='searchResults';results.setAttribute('role','tabpanel');
  wrapper.append(tabs,results);
  const filters=[['all','Все'],['songs','Песни'],['artists','Исполнители'],['albums','Альбомы'],['playlists','Плейлисты']];
  if(!filters.some(([key])=>key===ui.searchFilter))ui.searchFilter='all';
  let tracks=[],artists=[],loading=true,error=null,first=true;
  const render=()=>{
    const focused=document.activeElement,focusedRow=focused?.closest('.track-row'),focusedClass=focused?.className;
    results.replaceChildren();
    const status=document.createElement('p');status.className='song-search-status';status.setAttribute('role','status');status.textContent=loading?'Поиск…':error||'';results.append(status);
    const table=(list,compact=false)=>{const table=ui.createTrackTable(list,null,!compact);if(compact)table.classList.add('search-compact-table');return table;};
    if(ui.searchFilter==='songs'){
      if(tracks.length){const h=document.createElement('h2');h.textContent='Песни';results.append(h,table(tracks));}
    }else if(ui.searchFilter==='all'&&tracks.length){
      const columns=document.createElement('div');columns.className='search-main-results';
      const top=document.createElement('section');top.className='search-top-result';top.innerHTML='<h2>Лучший результат</h2>';
      const card=document.createElement('div');card.className='search-top-card';card.innerHTML=`<div class="search-top-cover"></div><h3>${ui.escapeHTML(tracks[0].title)}</h3><p>Песня <span>•</span> ${ui.escapeHTML(tracks[0].artist)}</p><button class="search-top-play" aria-label="Воспроизвести ${ui.escapeHTML(tracks[0].title)}">${icons.play}</button>`;
      mountCover(card.firstElementChild,tracks[0],true);card.querySelector('button').onclick=()=>{remember(query);playRow(ui,tracks[0],tracks,{...ui.currentView},true);};top.append(card);
      const bestArtist=artists.find(a=>normalize(a.name)===normalize(query));
      if(bestArtist){card.classList.add('search-top-artist');card.replaceChildren();const cover=document.createElement('div');cover.className='search-top-cover';mountCover(cover,bestArtist,true);const open=document.createElement('button');open.className='search-artist-open';open.innerHTML=`<h3>${ui.escapeHTML(bestArtist.name)}</h3><p>Исполнитель</p>`;open.onclick=()=>ui.navigateTo({type:'artist',id:bestArtist.name,title:bestArtist.name,artist:bestArtist});card.append(cover,open);}

      const songs=document.createElement('section');songs.className='search-song-section';songs.innerHTML='<h2>Песни</h2>';songs.append(table(tracks.slice(0,4),true));if(tracks.length>4){const all=document.createElement('button');all.className='search-show-all';all.textContent='Все песни';all.onclick=()=>tabs.children[1].click();songs.append(all);}columns.append(top,songs);results.append(columns);
    }
    if(ui.searchFilter!=='songs'){
      const makeCards=(kind,label,items)=>{
        if(ui.searchFilter!==kind&&ui.searchFilter!=='all'||!items.length)return;
        const section=document.createElement('section');section.className='search-card-section';const h=document.createElement('h2');h.textContent=label;section.append(h);
        const grid=document.createElement('div');grid.className='search-entity-grid';
        for(const item of items.slice(0,ui.searchFilter==='all'?6:60)){
          const card=document.createElement('button');card.className='search-entity-card '+kind;card.innerHTML=`<div class="search-entity-cover"></div><strong>${ui.escapeHTML(item.name)}</strong><span>${ui.escapeHTML(item.subtitle)}</span>`;mountCover(card.firstElementChild,item);card.onclick=item.action;grid.append(card);
        }section.append(grid);results.append(section);
      };
      const artistMap=new Map(),albumMap=new Map();
      for(const artist of artistResults([artists],tracks,query))artistMap.set(artist.name,{...artist,subtitle:'Исполнитель',action:()=>ui.navigateTo({type:'artist',id:artist.name,title:artist.name,artist})});
      for(const t of tracks){
        if(t.album){const key=t.album+'|'+t.artist;if(!albumMap.has(key))albumMap.set(key,{name:t.album,subtitle:`${t.year?t.year+' • ':''}${t.artist}`,pictureUrl:t.pictureUrl,action:()=>{if(!t.catalog)ui.navigateTo({type:'album',id:t.album,extra:t.artist,title:t.album});else {ui.searchFilter='songs';setQuery(t.album+' '+t.artist);}}});}}
      makeCards('artists','Исполнители',[...artistMap.values()]);makeCards('albums','Альбомы',[...albumMap.values()]);
      makeCards('playlists','Плейлисты',ui.library.getPlaylists().filter(p=>normalize(p.name).includes(normalize(query))).map(p=>({name:p.name,subtitle:'Плейлист',pictureUrl:p.pictureUrl,action:()=>ui.navigateTo({type:'playlist',id:p.id,title:p.name})})));
    }
    if(!tracks.length&&loading){const skeleton=document.createElement('div');skeleton.className='search-skeleton';skeleton.setAttribute('aria-hidden','true');skeleton.innerHTML='<i></i><i></i><i></i><i></i>';results.append(skeleton);}
    if(!loading&&results.children.length===1){const empty=document.createElement('div');empty.className='search-empty';empty.innerHTML=`<h2>${error?'Не удалось выполнить поиск':'Ничего не найдено'}</h2><p>${error?'Проверьте подключение и попробуйте ещё раз.':`Попробуйте другое название песни или исполнителя.`}</p>`;if(error){const retry=document.createElement('button');retry.textContent='Повторить';retry.onclick=()=>{ui.music.cache.delete(query.toLocaleLowerCase());ui.refreshCurrentView();};empty.append(retry);}results.append(empty);}
    if(focusedRow&&typeof focusedClass==='string'){const row=[...results.querySelectorAll('.track-row')].find(r=>r.dataset.trackId===focusedRow.dataset.trackId);const target=row&&[...row.querySelectorAll('button')].find(b=>b.className===focusedClass);target?.focus({preventScroll:true});}
  };
  filters.forEach(([key,label],index)=>{const button=document.createElement('button');button.className='search-filter'+(ui.searchFilter===key?' active':'');button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls','searchResults');button.setAttribute('aria-selected',String(ui.searchFilter===key));button.tabIndex=ui.searchFilter===key?0:-1;
    button.onclick=()=>{ui.searchFilter=key;for(const b of tabs.children){const selected=b===button;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}render();};
    button.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const next=tabs.children[(index+(e.key==='ArrowRight'?1:filters.length-1))%filters.length];next.click();next.focus();}};tabs.append(button);
  });
  const receive=(list,busy,failure,foundArtists=[])=>{if(!first&&(!wrapper.isConnected||ui.searchQuery!==raw))return;first=false;tracks=list;artists=foundArtists;loading=busy;error=failure;render();};
  if(ui.music)ui.music.schedule(query,receive);else receive(ui.library.search(query),false,null);
  // Remember selected recordings, not every partially typed character.
  results.addEventListener('click',e=>{if(e.target.closest('.track-row'))remember(query);});
}

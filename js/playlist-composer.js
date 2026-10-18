import {mountCover} from './artwork.js';
import {icons} from './design-icons.js';
import {addPlaylistTracks,persistPlaylist} from './playlist-actions.js';

export async function reorderPlaylist(ui,playlist,ids,beforeId=null){
  const live=ui.library.getPlaylistById(playlist.id);if(!live)return;
  const moving=[...new Set(ids)].filter(id=>live.trackIds.includes(id));if(!moving.length||moving.includes(beforeId))return;
  const rest=live.trackIds.filter(id=>!moving.includes(id)),at=beforeId?rest.indexOf(beforeId):-1;rest.splice(at<0?rest.length:at,0,...moving);
  live.trackIds=rest;live.manualOrder=true;ui.tableSortExplicit=false;await persistPlaylist(ui,live);ui.refreshCurrentView();
}

export function installPlaylistDrop(ui,table,playlist){
  if(!playlist||playlist.isFolderPlaylist)return;
  table.addEventListener('dragover',e=>{if(![...e.dataTransfer.types].includes('application/x-playerium-tracks'))return;e.preventDefault();table.querySelector('.playlist-drop-target')?.classList.remove('playlist-drop-target');e.target.closest('.track-row')?.classList.add('playlist-drop-target');e.dataTransfer.dropEffect=e.dataTransfer.types.includes('application/x-playerium-playlist')?'move':'copy';});
  table.addEventListener('dragleave',e=>{if(!table.contains(e.relatedTarget))table.querySelector('.playlist-drop-target')?.classList.remove('playlist-drop-target');});
  table.addEventListener('drop',async e=>{
    const raw=e.dataTransfer.getData('application/x-playerium-tracks');if(!raw)return;e.preventDefault();e.stopPropagation();table.querySelector('.playlist-drop-target')?.classList.remove('playlist-drop-target');
    try{const ids=JSON.parse(raw);if(!Array.isArray(ids)||ids.length>10000||ids.some(id=>typeof id!=='string'))return;const before=e.target.closest('.track-row')?.dataset.trackId||null;
      if(e.dataTransfer.getData('application/x-playerium-playlist')===playlist.id)await reorderPlaylist(ui,playlist,ids,before);
      else {const tracks=ids.map(id=>ui.library.getTrackById(id)||ui.interfaceTracks?.get(id)).filter(Boolean),count=await addPlaylistTracks(ui,playlist,tracks,before);const live=ui.library.getPlaylistById(playlist.id);if(live){live.manualOrder=true;await persistPlaylist(ui,live);}ui.tableSortExplicit=false;ui.refreshCurrentView();ui.showToast(count?`Добавлено: ${count}`:'Эти песни уже в плейлисте');}
    }catch(error){ui.showToast(error.message,'error');}
  });
  table.addEventListener('keydown',async e=>{if(!(e.ctrlKey||e.metaKey)||!e.shiftKey||!['ArrowUp','ArrowDown'].includes(e.key))return;const row=e.target.closest('.track-row');if(!row)return;e.preventDefault();e.stopImmediatePropagation();const live=ui.library.getPlaylistById(playlist.id),at=live?.trackIds.indexOf(row.dataset.trackId);if(at===undefined||at<0)return;const target=at+(e.key==='ArrowUp'?-1:1);if(target<0||target>=live.trackIds.length)return;const before=e.key==='ArrowUp'?live.trackIds[target]:live.trackIds[target+1]||null;await reorderPlaylist(ui,live,[row.dataset.trackId],before);document.querySelector(`[data-track-id="${CSS.escape(row.dataset.trackId)}"]`)?.focus({preventScroll:true});},true);
}

export function enhancePlaylistComposer(ui){
  const host=document.getElementById('mainViewContent'),playlist=ui.currentView.type==='playlist'&&ui.library.getPlaylistById(ui.currentView.id);if(!playlist||playlist.isFolderPlaylist||ui.isMobile)return;
  const add=host.querySelector('.collection-add');if(!add)return;
  add.onclick=()=>{ui.composingPlaylist=ui.composingPlaylist===playlist.id?null:playlist.id;mount();host.querySelector('.playlist-composer input')?.focus();};
  const mount=()=>{
    host.querySelector('.playlist-composer')?.remove();host.classList.toggle('playlist-composing',ui.composingPlaylist===playlist.id);add.setAttribute('aria-expanded',String(ui.composingPlaylist===playlist.id));if(ui.composingPlaylist!==playlist.id)return;
    const pane=document.createElement('aside');pane.className='playlist-composer';pane.setAttribute('aria-label','Добавить песни в плейлист');pane.innerHTML=`<header><h2>Добавить песни</h2><button class="composer-close" aria-label="Закрыть добавление песен">${icons.close}</button></header><p>Перетащите песню в нужное место или нажмите «Добавить».</p><input type="search" class="search-input" aria-label="Найти песни для плейлиста" placeholder="Песня или исполнитель" autocomplete="off"><p class="composer-status" role="status"></p><div class="composer-results"></div>`;host.append(pane);
    const input=pane.querySelector('input'),results=pane.querySelector('.composer-results'),status=pane.querySelector('.composer-status');let revision=0;
    pane.querySelector('.composer-close').onclick=()=>{ui.composingPlaylist=null;mount();add.focus();};
    const render=(tracks,busy,error)=>{
      if(!pane.isConnected)return;results.replaceChildren();status.textContent=busy?'Поиск…':error||(!tracks.length?'Песни не найдены.':'');pane.setAttribute('aria-busy',String(!!busy));
      for(const track of tracks.slice(0,40)){ui.interfaceTracks||=new Map();ui.interfaceTracks.set(track.id,track);const row=document.createElement('div');row.className='composer-track';row.draggable=true;row.dataset.trackId=track.id;
        row.innerHTML='<span class="composer-cover"></span><span class="composer-meta"><strong></strong><small></small></span><button type="button"></button>';row.querySelector('strong').textContent=track.title;row.querySelector('small').textContent=track.artist;mountCover(row.firstElementChild,track);const save=row.querySelector('button'),already=playlist.trackIds.includes(track.id);save.textContent=already?'Добавлено':'Добавить';save.disabled=already;save.setAttribute('aria-label',`${already?'Уже добавлено':'Добавить'}: ${track.title}`);
        save.onclick=async()=>{save.disabled=true;save.setAttribute('aria-busy','true');try{await addPlaylistTracks(ui,playlist,[track]);save.textContent='Добавлено';ui.refreshCurrentView();}catch(error){save.disabled=false;ui.showToast(error.message,'error');}finally{save.setAttribute('aria-busy','false');}};
        row.ondragstart=e=>{e.dataTransfer.setData('application/x-playerium-tracks',JSON.stringify([track.id]));e.dataTransfer.effectAllowed='copy';};results.append(row);
      }
    };
    const search=()=>{const query=input.value.trim(),version=++revision;ui.composerQuery=input.value;if(!query){render(ui.library.getTracks().filter(t=>!playlist.trackIds.includes(t.id)),false,null);return;}ui.music.schedule(query,(tracks,busy,error)=>{if(version===revision)render(tracks,busy,error);});};
    input.value=ui.composerQuery||'';input.oninput=search;input.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();ui.composingPlaylist=null;mount();add.focus();}};search();
  };mount();
}

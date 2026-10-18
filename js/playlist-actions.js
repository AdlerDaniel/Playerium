import {showSurfaceMenu} from './surface-menu.js';
import {icons} from './design-icons.js';

export async function persistPlaylist(ui,playlist){
  if(!ui.library.getPlaylistById(playlist.id))throw Error('Плейлист уже удалён.');
  playlist.updatedAt=Date.now();await ui.library.putInStore('playlists',playlist);
  ui.library.onLibraryChanged?.();ui.renderSidebar();
}
export async function addPlaylistTracks(ui,playlist,tracks,beforeId=null){
  const saved=[];for(const track of tracks)saved.push(track.catalog?await ui.music.ensureTrack(track):track);
  const live=ui.library.getPlaylistById(playlist.id);if(!live)throw Error('Плейлист уже удалён.');
  const added=saved.map(t=>t.id).filter((id,i,ids)=>!live.trackIds.includes(id)&&ids.indexOf(id)===i);
  const at=beforeId?live.trackIds.indexOf(beforeId):-1;live.trackIds.splice(at<0?live.trackIds.length:at,0,...added);
  await persistPlaylist(ui,live);return added.length;
}

// One shared surface for a track menu, batch selection and the playlist composer.
export function openPlaylistPicker(ui,tracks,anchor){
  const unique=[...new Map(tracks.map(t=>[t.id,t])).values()];if(!unique.length)return;
  showSurfaceMenu(ui,{title:unique.length===1?'Добавить в плейлисты':`Плейлисты · ${unique.length} треков`,items:[],anchor});
  const panel=document.querySelector('.surface-overlay:not(.closing) .surface-panel,.collection-sheet:not(.closing) .surface-panel');
  if(!panel)return;panel.classList.add('playlist-picker');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  const content=document.createElement('div');content.innerHTML='<label class="picker-search-label">Найти плейлист<input type="search" class="search-input" aria-label="Найти плейлист" autocomplete="off"></label><div class="playlist-picker-list"></div><div class="playlist-picker-create"><input class="search-input" maxlength="150" aria-label="Название нового плейлиста" placeholder="Новый плейлист"><button type="button" aria-label="Создать плейлист">Создать</button></div><p class="picker-status" role="status"></p><button class="settings-btn-primary picker-save" type="button">Сохранить</button>';panel.append(content);
  const search=content.querySelector('input[type=search]'),list=content.querySelector('.playlist-picker-list'),name=content.querySelector('.playlist-picker-create input'),create=content.querySelector('.playlist-picker-create button'),save=content.querySelector('.picker-save'),status=content.querySelector('.picker-status'),changes=new Map();let busy=false;
  const render=()=>{
    list.replaceChildren();const playlists=ui.library.getPlaylists().filter(p=>!p.isFolderPlaylist&&p.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));
    for(const playlist of playlists){
      const count=unique.filter(t=>playlist.trackIds.includes(t.id)).length,all=count===unique.length;
      const row=document.createElement('label');row.className='playlist-picker-row';
      const check=document.createElement('input');check.type='checkbox';check.checked=changes.has(playlist.id)?changes.get(playlist.id):all;check.indeterminate=!changes.has(playlist.id)&&count>0&&!all;
      check.setAttribute('aria-label',playlist.name);check.disabled=busy;check.onchange=()=>{changes.set(playlist.id,check.checked);check.indeterminate=false;};
      const text=document.createElement('span'),title=document.createElement('strong'),hint=document.createElement('small');title.textContent=playlist.name;hint.textContent=all?'Уже добавлено':count?`Добавлено ${count} из ${unique.length}`:`${playlist.trackIds.length} треков`;text.append(title,hint);row.append(check,text);list.append(row);
    }
    if(!playlists.length){const empty=document.createElement('p');empty.className='picker-empty';empty.textContent=search.value?'Плейлисты не найдены.':'Создайте первый плейлист ниже.';list.append(empty);}
  };
  search.oninput=render;
  const createPlaylist=async()=>{if(busy||!name.value.trim())return;busy=true;create.disabled=true;try{const playlist=await ui.library.createPlaylist(name.value.trim());changes.set(playlist.id,true);name.value='';search.value='';ui.renderSidebar();status.textContent=`Создан «${playlist.name}»`;}catch(error){status.textContent=error.message;}finally{busy=false;create.disabled=false;render();}};
  create.onclick=createPlaylist;name.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();createPlaylist();}};
  save.onclick=async()=>{if(busy)return;busy=true;save.disabled=create.disabled=true;render();status.textContent='Сохранение…';
    try{
      let saved=unique;if([...changes.values()].some(Boolean)){saved=[];for(const track of unique)saved.push(track.catalog?await ui.music.ensureTrack(track):track);}
      for(const [id,present] of changes){const playlist=ui.library.getPlaylistById(id);if(!playlist)continue;
        for(const track of saved){if(present)await ui.library.addTrackToPlaylist(id,track.id);else if(playlist.trackIds.includes(track.id))await ui.library.removeTrackFromPlaylist(id,track.id);}
      }
      ui.dismissSurface?.();ui.renderSidebar();ui.refreshCurrentView();ui.showToast('Плейлисты обновлены');
    }catch(error){status.textContent=error.message;busy=false;save.disabled=create.disabled=false;render();}
  };
  render();search.focus({preventScroll:true});return panel;
}

export function actionToast(ui,{message,label='Отменить',onAction,onExpire,timeout=8000}){
  const toast=document.createElement('div');toast.className='toast action-toast';toast.setAttribute('role','status');
  const text=document.createElement('span'),button=document.createElement('button');text.textContent=message;button.type='button';button.textContent=label;toast.append(text,button);document.getElementById('toastContainer').append(toast);
  let finished=false,timer,remaining=timeout,started;
  const finish=async action=>{if(finished)return;finished=true;clearTimeout(timer);toast.remove();try{await action?.();}catch(error){ui.showToast(error.message,'error');}};
  const resume=()=>{if(finished||timer||toast.matches(':focus-within,:hover'))return;started=Date.now();timer=setTimeout(()=>finish(onExpire),remaining);};
  const pause=()=>{if(timer){clearTimeout(timer);remaining=Math.max(0,remaining-(Date.now()-started));timer=null;}};
  toast.onpointerenter=pause;toast.onpointerleave=resume;toast.onfocusin=pause;toast.onfocusout=()=>setTimeout(resume,0);button.onclick=()=>finish(onAction);resume();return ()=>finish(onAction);
}

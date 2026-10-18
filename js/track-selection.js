import {icons} from './design-icons.js';
import {openPlaylistPicker,actionToast,persistPlaylist} from './playlist-actions.js';
import {showFormDialog} from './surface-menu.js';

export function attachTrackSelection(ui,table,tracks,playlist){
  const key=JSON.stringify([ui.currentView?.type,ui.currentView?.id,ui.currentView?.type==='search'?ui.searchQuery:'']);
  if(ui.trackSelection?.key!==key)ui.trackSelection={key,ids:new Set(),anchor:null};
  const state=ui.trackSelection,all=new Set(tracks.map(t=>t.id));for(const id of state.ids)if(!all.has(id))state.ids.delete(id);
  const chosen=()=>tracks.filter(t=>state.ids.has(t.id));
  const bar=document.createElement('div');bar.className='track-selection-bar';bar.hidden=true;bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Действия с выбранными треками');
  bar.innerHTML=`<strong class="selection-count"></strong><button class="selection-all">Все</button><button class="selection-save">${icons.plus}<span>В плейлисты</span></button><button class="selection-queue">${icons.list}<span>В очередь</span></button><button class="selection-remove">${icons.close}<span>Удалить</span></button><button class="selection-cancel" aria-label="Снять выделение">×</button>`;
  table.prepend(bar);
  const entry=document.createElement('button');entry.type='button';entry.className='selection-entry';entry.textContent='#';entry.title='Выделить все треки';entry.setAttribute('aria-label','Выделить все треки');table.querySelector('.th-num')?.replaceChildren(entry);
  const sync=()=>{const list=chosen();bar.hidden=!list.length;table.classList.toggle('selecting',!!list.length);bar.querySelector('.selection-count').textContent=`Выбрано: ${list.length}`;
    for(const row of table.querySelectorAll('.track-row')){const selected=state.ids.has(row.dataset.trackId);row.classList.toggle('track-selected',selected);row.setAttribute('aria-selected',String(selected));const box=row.querySelector('.track-select');if(box)box.checked=selected;}
    const remote=ui.connect&&ui.connect.selected!==ui.connect.id;bar.querySelector('.selection-queue').disabled=!!remote;
  };
  const select=(track,{range=false,toggle=false}={})=>{
    if(range&&state.anchor){const a=tracks.findIndex(t=>t.id===state.anchor),b=tracks.indexOf(track);if(a>=0&&b>=0)for(const t of tracks.slice(Math.min(a,b),Math.max(a,b)+1))state.ids.add(t.id);}
    else {if(!toggle)state.ids.clear();if(toggle&&state.ids.has(track.id))state.ids.delete(track.id);else state.ids.add(track.id);state.anchor=track.id;}sync();
  };
  const clear=()=>{state.ids.clear();sync();};
  entry.onclick=()=>bar.querySelector('.selection-all').click();
  bar.querySelector('.selection-all').onclick=()=>{for(const track of tracks)state.ids.add(track.id);sync();};bar.querySelector('.selection-cancel').onclick=clear;
  bar.querySelector('.selection-save').onclick=e=>openPlaylistPicker(ui,chosen(),e.currentTarget);
  bar.querySelector('.selection-queue').onclick=async()=>{try{for(const t of chosen())ui.player.addToQueue(t.catalog?await ui.music.ensureTrack(t):t);ui.showToast(`Добавлено в очередь: ${chosen().length}`);clear();}catch(error){ui.showToast(error.message,'error');}};
  bar.querySelector('.selection-remove').onclick=async()=>{
    const list=chosen(),ids=new Set(list.map(t=>t.id));if(!list.length)return;
    if(playlist){
      const live=ui.library.getPlaylistById(playlist.id);if(!live)return;const previous=[...live.trackIds];live.trackIds=live.trackIds.filter(id=>!ids.has(id));await persistPlaylist(ui,live);clear();ui.refreshCurrentView();
      actionToast(ui,{message:`Удалено из плейлиста: ${list.length}`,onAction:async()=>{
        const current=ui.library.getPlaylistById(playlist.id);if(!current)return;
        for(let i=0;i<previous.length;i++){const id=previous[i];if(!ids.has(id)||current.trackIds.includes(id)||!ui.library.getTrackById(id))continue;const next=previous.slice(i+1).find(n=>current.trackIds.includes(n)),at=next?current.trackIds.indexOf(next):current.trackIds.length;current.trackIds.splice(at,0,id);}
        await persistPlaylist(ui,current);ui.refreshCurrentView();
      }});return;
    }
    if(!await showFormDialog(ui,{title:`Удалить треки (${list.length})?`,message:'Треки будут удалены из медиатеки, файлов и синхронизированных устройств. Действие можно отменить в течение 8 секунд.',confirm:'Удалить',danger:true}))return;
    ui.pendingTrackRemoval||=new Set();for(const id of ids)ui.pendingTrackRemoval.add(id);clear();ui.refreshCurrentView();
    const restore=()=>{for(const id of ids)ui.pendingTrackRemoval.delete(id);ui.refreshCurrentView();};
    actionToast(ui,{message:`Треки будут удалены: ${list.length}`,onAction:restore,onExpire:async()=>{
      const errors=[];for(const track of list)try{if(!track.catalog&&ui.library.getTrackById(track.id))await ui.music.removeTrack(track);}catch(error){errors.push(error.message);}finally{ui.pendingTrackRemoval.delete(track.id);}
      ui.refreshCurrentView();if(errors.length)ui.showToast(`Не удалось удалить ${errors.length} треков. ${errors[0]}`,'error');
    }});
  };
  table.addEventListener('click',e=>{const row=e.target.closest('.track-row');if(!row||e.target.closest('button')&&!e.target.closest('.track-select-wrap'))return;const track=tracks.find(t=>t.id===row.dataset.trackId);if(!track)return;
    if(row.dataset.longSelected==='true'){delete row.dataset.longSelected;e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.target.closest('.track-select-wrap')||e.ctrlKey||e.metaKey||e.shiftKey||state.ids.size){e.preventDefault();e.stopImmediatePropagation();select(track,{range:e.shiftKey,toggle:!e.shiftKey});}
  },true);
  table.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')&&!e.target.classList.contains('track-select'))return;const row=e.target.closest('.track-row');if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();bar.querySelector('.selection-all').click();}else if(e.key==='Escape'&&state.ids.size){e.preventDefault();e.stopPropagation();clear();}else if(row&&(e.key===' '&&(state.ids.size||e.ctrlKey||e.metaKey)||e.shiftKey&&['ArrowUp','ArrowDown'].includes(e.key))){e.preventDefault();e.stopImmediatePropagation();const i=tracks.findIndex(t=>t.id===row.dataset.trackId),to=Math.max(0,Math.min(tracks.length-1,i+(e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0)));state.anchor||=row.dataset.trackId;select(tracks[to],{range:e.shiftKey,toggle:!e.shiftKey});table.querySelector(`[data-track-id="${CSS.escape(tracks[to].id)}"]`)?.focus({preventScroll:true});}},true);
  let hold=null,start;
  table.addEventListener('pointerdown',e=>{clearTimeout(hold);if(e.pointerType!=='touch'||e.target.closest('button,input'))return;const row=e.target.closest('.track-row');if(!row)return;start={x:e.clientX,y:e.clientY};hold=setTimeout(()=>{if(!row.isConnected)return;const track=tracks.find(t=>t.id===row.dataset.trackId);if(track){row.dataset.longSelected='true';select(track,{toggle:true});navigator.vibrate?.(12);}},450);},{passive:true});
  table.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)clearTimeout(hold);},{passive:true});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])table.addEventListener(name,()=>{clearTimeout(hold);start=null;});
  table.selectionSync=sync;sync();return {sync,select,state};
}

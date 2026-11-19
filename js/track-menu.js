import {icons} from './design-icons.js';
import {mountCover} from './artwork.js';
import {showFormDialog} from './surface-menu.js';
import {openTrackEditor} from './track-editor.js';
import {positionFloating,watchFloating} from './floating-surfaces.js';
import {openPlaylistPicker} from './playlist-actions.js';
const glyph=path=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const moreIcons={queue:glyph('M3 5h14v2H3zm0 4h14v2H3zm0 4h8v2H3zm15-1h2v4h4v2h-4v4h-2v-4h-4v-2h4z'),download:glyph('M11 3h2v10l3-3 1.4 1.4L12 17l-5.4-5.6L8 10l3 3V3zM5 19h14v2H5z')};
export function showTrackMenu(ui,track,{mobile=false,x=0,y=0,playlistContext=null}={}) {
  ui.dismissTrackMenu?.();ui.dismissSurface?.();ui.closeContextMenu();
  const opener=document.activeElement;
  let root,panel,closed=false,unwatch=()=>{};
  if(mobile){root=document.createElement('div');root.className='mobile-bottom-sheet track-options-sheet';root.innerHTML='<div class="mobile-sheet-overlay"></div><div class="mobile-sheet-content" role="dialog" aria-modal="true"></div>';panel=root.lastElementChild;document.body.append(root);requestAnimationFrame(()=>root.classList.add('active'));}
  else {root=document.getElementById('appContextMenu');panel=root;root.classList.add('track-context-menu','active');root.style.display='block';root.setAttribute('role','menu');}
  const close=()=>{if(closed)return;closed=true;unwatch();if(mobile){root.classList.remove('active');root.setAttribute('aria-hidden','true');root.inert=true;root.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));setTimeout(()=>root.remove(),240);}else ui.closeContextMenu();if(ui.dismissTrackMenu===close)ui.dismissTrackMenu=null;opener?.isConnected&&opener.focus({preventScroll:true});};
  ui.dismissTrackMenu=close;
  const execute=async action=>{close();try{await action();}catch(error){ui.showToast(error.message,'error');}};
  const button=(id,label,icon,action,submenu=false)=>{const b=document.createElement('button');b.id=id;b.className=mobile?'mobile-sheet-item':'context-menu-item';b.innerHTML=`${icon||icons.music}<span>${ui.escapeHTML(label)}</span>${submenu?'<span class="menu-chevron" aria-hidden="true">›</span>':''}`;if(!mobile)b.setAttribute('role','menuitem');b.onclick=e=>{e.stopPropagation();submenu?action():execute(action);};panel.append(b);return b;};
  const position=()=>{if(!mobile){root.scrollTop=0;positionFloating(root,{x,y});}};
  const header=()=>{if(!mobile)return;const h=document.createElement('div');h.className='sheet-track-header';h.innerHTML=`<div class="mobile-sheet-handle"></div><div class="sheet-track-info"><div class="sheet-track-cover"></div><div><strong>${ui.escapeHTML(track.title)}</strong><span>${ui.escapeHTML(track.artist)}</span></div></div>`;panel.append(h);mountCover(h.querySelector('.sheet-track-cover'),track,true);panel.setAttribute('aria-label','Действия: '+track.title);};
  const focusFirst=()=>panel.querySelector('button')?.focus({preventScroll:true});
  const navigate=kind=>{document.getElementById('mobileFullscreenPlayer')?.classList.remove('active');if(!track.catalog)ui.navigateTo({type:'artist',id:track.artist,title:track.artist});else {ui.searchQuery=track.artist;ui.searchFilter=kind==='artist'?'all':'songs';document.getElementById('mainSearchInput').value=ui.searchQuery;ui.navigateTo({type:'search',title:'Поиск'});}};
  const main=()=>{
    panel.replaceChildren();header();
    const prefix=mobile?'sheetOpt':'ctx';
    button(mobile?'sheetOptAddToPlaylist':'ctxAddToPlaylist','Добавить в плейлист',icons.music,()=>{close();openPlaylistPicker(ui,[track],mobile?null:opener);},true);
    button(mobile?'sheetOptQueue':'ctxAddToQueue','Добавить в очередь',moreIcons.queue,async()=>{ui.player.addToQueue(await ui.music.ensureTrack(track));ui.showToast('Добавлено в очередь');});
    button(prefix+'PlayNext','Включить следующим',icons.play,async()=>{ui.player.playNext(await ui.music.ensureTrack(track));ui.showToast('Будет воспроизведено следующим');});
    const divider=document.createElement('div');divider.className='context-divider';panel.append(divider);
    button(prefix+'Edit','Редактировать',icons.edit,async()=>openTrackEditor(ui,track.catalog?await ui.music.ensureTrack(track):ui.library.getTrackById(track.id)||track));
    button(prefix+'Artist','Перейти к исполнителю',icons.artist,()=>navigate('artist'));
    button(prefix+'SaveOrRemove',track.catalog?'Скачать':'Удалить трек',moreIcons.download,async()=>{if(track.catalog){await ui.music.ensureTrack(track);ui.refreshCurrentView();ui.showToast('Трек сохранён','success');}else if(await showFormDialog(ui,{title:'Удалить трек?',message:`«${track.title}» будет удалён из медиатеки.`,confirm:'Удалить',danger:true})){await ui.music.removeTrack(track);ui.showToast('Трек удалён');}});
    if(playlistContext)button(prefix+'RemoveFromPl','Удалить из этого плейлиста',icons.music,async()=>{await ui.library.removeTrackFromPlaylist(playlistContext.id,track.id);ui.refreshCurrentView();});
    position();focusFirst();
  };
  panel.onkeydown=e=>{
    const buttons=[...panel.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(['ArrowDown','ArrowUp','Tab','Home','End'].includes(e.key)){e.preventDefault();let next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowUp'||e.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();}
    else if(e.key==='ArrowRight'&&document.activeElement?.id.endsWith('AddToPlaylist')){e.preventDefault();document.activeElement.click();}
  };
  if(mobile){root.firstElementChild.onclick=close;let start=null,delta=0;panel.addEventListener('pointerdown',e=>{if(e.target.closest('.mobile-sheet-handle')){start=e.clientY;delta=0;panel.setPointerCapture(e.pointerId);}});panel.addEventListener('pointermove',e=>{if(start===null)return;delta=Math.max(0,e.clientY-start);panel.style.transform=`translateY(${delta}px)`;});const release=()=>{if(start===null)return;start=null;panel.style.transform='';if(delta>72)close();};panel.addEventListener('pointerup',release);panel.addEventListener('pointercancel',release);}
  main();
  if(!mobile)unwatch=watchFloating(root,{x,y});
}

import {icons,saveIcon} from './design-icons.js';
import {mountCover} from './artwork.js';
import {showFormDialog} from './surface-menu.js';
import {positionFloating,watchFloating} from './floating-surfaces.js';
const glyph=path=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const moreIcons={queue:glyph('M3 5h14v2H3zm0 4h14v2H3zm0 4h8v2H3zm15-1h2v4h4v2h-4v4h-2v-4h-4v-2h4z'),download:glyph('M11 3h2v10l3-3 1.4 1.4L12 17l-5.4-5.6L8 10l3 3V3zM5 19h14v2H5z'),credits:glyph('M11 10h2v8h-2zm0-4h2v2h-2zM12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 2a9 9 0 1 1 0 18 9 9 0 0 1 0-18z'),share:glyph('M18 2a4 4 0 1 1-3.6 5.7L8 11a4 4 0 0 1 0 2l6.4 3.3a4 4 0 1 1-1 2L7 15a4 4 0 1 1 0-6l6.4-3.3A4 4 0 0 1 18 2z')};
export function showTrackMenu(ui,track,{mobile=false,x=0,y=0,playlistContext=null}={}) {
  ui.dismissTrackMenu?.();ui.dismissSurface?.();ui.closeContextMenu();
  const opener=document.activeElement;
  let root,panel,closed=false,pane='main',unwatch=()=>{};
  if(mobile){root=document.createElement('div');root.className='mobile-bottom-sheet track-options-sheet';root.innerHTML='<div class="mobile-sheet-overlay"></div><div class="mobile-sheet-content" role="dialog" aria-modal="true"></div>';panel=root.lastElementChild;document.body.append(root);requestAnimationFrame(()=>root.classList.add('active'));}
  else {root=document.getElementById('appContextMenu');panel=root;root.classList.add('track-context-menu','active');root.style.display='block';root.setAttribute('role','menu');}
  const close=()=>{if(closed)return;closed=true;unwatch();if(mobile){root.classList.remove('active');setTimeout(()=>root.remove(),240);}else ui.closeContextMenu();if(ui.dismissTrackMenu===close)ui.dismissTrackMenu=null;opener?.isConnected&&opener.focus({preventScroll:true});};
  ui.dismissTrackMenu=close;
  const execute=async action=>{close();try{await action();}catch(error){ui.showToast(error.message,'error');}};
  const button=(id,label,icon,action,submenu=false)=>{const b=document.createElement('button');b.id=id;b.className=mobile?'mobile-sheet-item':'context-menu-item';b.innerHTML=`${icon||icons.music}<span>${ui.escapeHTML(label)}</span>${submenu?'<span class="menu-chevron" aria-hidden="true">›</span>':''}`;if(!mobile)b.setAttribute('role','menuitem');b.onclick=e=>{e.stopPropagation();submenu?action():execute(action);};panel.append(b);return b;};
  const position=()=>{if(!mobile){root.scrollTop=0;positionFloating(root,{x,y});}};
  const header=()=>{if(!mobile)return;const h=document.createElement('div');h.className='sheet-track-header';h.innerHTML=`<div class="mobile-sheet-handle"></div><div class="sheet-track-info"><div class="sheet-track-cover"></div><div><strong>${ui.escapeHTML(track.title)}</strong><span>${ui.escapeHTML(track.artist)}</span></div></div>`;panel.append(h);mountCover(h.querySelector('.sheet-track-cover'),track,true);panel.setAttribute('aria-label','Действия: '+track.title);};
  const focusFirst=()=>panel.querySelector('button')?.focus({preventScroll:true});
  const playlists=()=>{
    pane='playlists';panel.replaceChildren();header();
    button('trackMenuBack','Назад',icons.music,main,true);
    const title=document.createElement('h3');title.className='menu-pane-title';title.textContent='Добавить в плейлист';panel.append(title);
    const available=ui.library.getPlaylists();
    for(const p of available)button('trackPlaylist-'+p.id,p.name,icons.music,async()=>{const saved=await ui.music.ensureTrack(track);await ui.library.addTrackToPlaylist(p.id,saved.id);ui.showToast(`Добавлено в «${p.name}»`);ui.renderSidebar();});
    button('trackNewPlaylist','Новый плейлист',saveIcon,async()=>{const values=await showFormDialog(ui,{title:'Новый плейлист',fields:[{name:'name',label:'Название',required:true}]});if(!values)return;const name=values.name;const saved=await ui.music.ensureTrack(track);const p=await ui.library.createPlaylist(name.trim());await ui.library.addTrackToPlaylist(p.id,saved.id);ui.renderSidebar();ui.showToast(`Добавлено в «${p.name}»`);});
    position();focusFirst();
  };
  const credits=()=>{
    pane='credits';panel.replaceChildren();header();button('trackMenuBack','Назад',icons.music,main,true);
    const heading=document.createElement('h3');heading.className='menu-pane-title';heading.textContent='Сведения о треке';panel.append(heading);
    const dl=document.createElement('dl');dl.className='track-credits';
    for(const [label,value] of [['Название',track.title],['Исполнитель',track.artist],['Альбом',track.album],['Год',track.year],['Жанр',track.genre],['ISRC',track.isrc]]){if(!value)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);}panel.append(dl);position();focusFirst();
  };
  const navigate=kind=>{document.getElementById('mobileFullscreenPlayer')?.classList.remove('active');if(!track.catalog)ui.navigateTo(kind==='artist'?{type:'artist',id:track.artist,title:track.artist}:{type:'album',id:track.album,extra:track.artist,title:track.album});else {ui.searchQuery=kind==='artist'?track.artist:track.artist+' '+track.album;ui.searchFilter=kind==='artist'?'all':'songs';document.getElementById('mainSearchInput').value=ui.searchQuery;ui.navigateTo({type:'search',title:'Поиск'});}};
  const main=()=>{
    pane='main';panel.replaceChildren();header();
    const prefix=mobile?'sheetOpt':'ctx';
    button(mobile?'sheetOptAddToPlaylist':'ctxAddToPlaylist','Добавить в плейлист',icons.music,playlists,true);
    const liked=button(mobile?'sheetOptLike':'ctxToggleLike',track.liked?'Удалить из любимых треков':'Сохранить в любимые треки',saveIcon,async()=>{const saved=await ui.music.ensureTrack(track);const liked=await ui.library.toggleLike(saved.id);ui.updateLikeButtons(saved.id,liked);ui.showToast(liked?'Добавлено в «Любимые треки»':'Удалено из «Любимых треков»');});liked.classList.toggle('liked',!!track.liked);
    button(mobile?'sheetOptQueue':'ctxAddToQueue','Добавить в очередь',moreIcons.queue,async()=>{ui.player.addToQueue(await ui.music.ensureTrack(track));ui.showToast('Добавлено в очередь');});
    button(prefix+'PlayNext','Включить следующим',icons.play,async()=>{ui.player.playNext(await ui.music.ensureTrack(track));ui.showToast('Будет воспроизведено следующим');});
    const divider=document.createElement('div');divider.className='context-divider';panel.append(divider);
    button(prefix+'Artist','Перейти к исполнителю',icons.artist,()=>navigate('artist'));
    if(track.album)button(prefix+'Album','Перейти к альбому',icons.music,()=>navigate('album'));
    button(prefix+'Credits','Сведения о треке',moreIcons.credits,credits,true);
    button(prefix+'Share','Поделиться',moreIcons.share,async()=>{const text=`${track.artist} — ${track.title}`,url=track.sources?.[0]?.url;if(mobile&&navigator.share){await navigator.share({title:track.title,text,...(url?{url}:{})});return;}const value=url?text+'\n'+url:text;if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else {const field=document.createElement('textarea');field.value=value;document.body.append(field);field.select();const copied=document.execCommand('copy');field.remove();if(!copied)throw Error('Не удалось скопировать');}ui.showToast('Скопировано');});
    button(prefix+'SaveOrRemove',track.catalog?'Скачать':'Удалить трек',moreIcons.download,async()=>{if(track.catalog){await ui.music.ensureTrack(track);ui.refreshCurrentView();ui.showToast('Трек сохранён','success');}else if(confirm(`Удалить трек «${track.title}»?`)){await ui.music.removeTrack(track);ui.showToast('Трек удалён');}});
    if(playlistContext)button(prefix+'RemoveFromPl','Удалить из этого плейлиста',icons.music,async()=>{await ui.library.removeTrackFromPlaylist(playlistContext.id,track.id);ui.refreshCurrentView();});
    if(mobile)button('sheetOptCancel','Закрыть',icons.music,()=>{});
    position();focusFirst();
  };
  panel.onkeydown=e=>{
    const buttons=[...panel.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();pane==='main'?close():main();}
    else if(e.key==='ArrowLeft'&&pane!=='main'){e.preventDefault();main();}
    else if(['ArrowDown','ArrowUp','Tab','Home','End'].includes(e.key)){e.preventDefault();let next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowUp'||e.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();}
    else if(e.key==='ArrowRight'&&document.activeElement?.id.endsWith('AddToPlaylist')){e.preventDefault();playlists();}
  };
  if(mobile){root.firstElementChild.onclick=close;let start=null,delta=0;panel.addEventListener('pointerdown',e=>{if(e.target.closest('.mobile-sheet-handle')){start=e.clientY;delta=0;panel.setPointerCapture(e.pointerId);}});panel.addEventListener('pointermove',e=>{if(start===null)return;delta=Math.max(0,e.clientY-start);panel.style.transform=`translateY(${delta}px)`;});const release=()=>{if(start===null)return;start=null;panel.style.transform='';if(delta>72)close();};panel.addEventListener('pointerup',release);panel.addEventListener('pointercancel',release);}
  main();
  if(!mobile)unwatch=watchFloating(root,{x,y});
}

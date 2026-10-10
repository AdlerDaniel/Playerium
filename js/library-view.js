import {icons} from './design-icons.js';
import {mountCover} from './artwork.js';
import {showSurfaceMenu} from './surface-menu.js';
import {collectionMenu} from './collection-menu.js';
export function renderLibrary(ui,container) {
  const root=document.createElement('div');root.className='mobile-library-view';
  root.innerHTML=`<header class="mobile-library-header"><div class="mobile-library-title-row"><h1 class="mobile-library-title">Моя медиатека</h1><div class="mobile-library-actions"><button class="mobile-lib-btn library-search-toggle" aria-label="Поиск в медиатеке">${icons.search}</button><button class="mobile-lib-btn" id="btnMobileLibAdd" aria-label="Добавить">${icons.plus}</button></div></div><div class="mobile-library-pills"></div><div class="library-search-line" hidden><input type="search" aria-label="Найти в медиатеке" placeholder="Найти в медиатеке" autocomplete="off"><button aria-label="Закрыть поиск">×</button></div></header><div class="library-toolbar"><button class="library-sort">${icons.sort}<span></span></button><button class="library-layout" aria-label="Показать сеткой">${icons.grid}</button></div><div class="mobile-library-list"></div>`;
  let filter=ui.currentView.tab||'all';let layout=ui.libraryLayout||localStorage.getItem('playerium_library_layout')||'list';let sort=ui.librarySort||'default';
  const list=root.querySelector('.mobile-library-list'),input=root.querySelector('input'),pills=root.querySelector('.mobile-library-pills');input.value=ui.collectionQuery||'';
  const labels={default:'Ваш порядок',title:'По названию',recent:'Недавно добавленные'};
  const allItems=()=>{
    const items=[];
    if(filter==='all'||filter==='playlists'){
      items.push({name:'Добавленные',sub:`${ui.library.getTracks().length} треков`,className:'local-art',view:{type:'allTracks',title:'Добавленные'},date:Infinity},{name:'Любимые треки',sub:`Закреплено • Плейлист • ${ui.library.getLikedTracks().length} треков`,className:'liked-thumb',icon:icons.heart,view:{type:'liked',title:'Любимые треки'},date:Infinity});
      for(const p of ui.library.getPlaylists().filter(p=>!p.isFolderPlaylist)){const tracks=ui.library.getPlaylistTracks(p.id);items.push({name:p.name,sub:`Плейлист • ${tracks.length} треков`,pictureUrl:tracks.find(t=>t.pictureUrl)?.pictureUrl,playlist:p,tracks,view:{type:'playlist',id:p.id,title:p.name},date:p.updatedAt||p.createdAt});}
    }
    if(filter==='artists')for(const a of ui.library.getArtists())items.push({name:a.name,sub:'Исполнитель',pictureUrl:a.pictureUrl,round:true,icon:icons.artist,view:{type:'artist',id:a.name,title:a.name}});
    return items;
  };
  const render=()=>{
    list.replaceChildren();list.classList.toggle('library-grid',layout==='grid');
    root.querySelector('.library-sort span').textContent=labels[sort];
    const layoutButton=root.querySelector('.library-layout');layoutButton.innerHTML=layout==='grid'?icons.list:icons.grid;layoutButton.setAttribute('aria-label',layout==='grid'?'Показать списком':'Показать сеткой');
    pills.querySelectorAll('button').forEach(p=>{p.classList.toggle('active',p.dataset.filter===filter);p.setAttribute('aria-pressed',String(p.dataset.filter===filter));});
    let items=allItems().filter(i=>(i.name+' '+i.sub).toLocaleLowerCase().includes(input.value.toLocaleLowerCase()));
    if(sort==='title')items.sort((a,b)=>a.name.localeCompare(b.name,'ru'));if(sort==='recent')items.sort((a,b)=>(b.date||0)-(a.date||0));
    for(const item of items){const row=document.createElement('div');row.className='mobile-lib-row';row.tabIndex=0;row.setAttribute('role','button');
      row.innerHTML=`<div class="mobile-lib-thumb ${item.className||''} ${item.round?'round':''}"></div><div class="mobile-lib-meta"><span class="mobile-lib-name">${ui.escapeHTML(item.name)}</span><span class="mobile-lib-sub">${ui.escapeHTML(item.sub)}</span></div>`;
      const cover=row.firstElementChild;if(item.pictureUrl)mountCover(cover,item);else cover.innerHTML=item.icon||icons.music;
      row.onclick=()=>ui.navigateTo(item.view);row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();row.click();}};
      if(item.playlist){const menu=document.createElement('button');menu.className='library-item-menu';menu.setAttribute('aria-label','Действия: '+item.name);menu.innerHTML=icons.more;menu.onclick=e=>{e.stopPropagation();collectionMenu(ui,{...item,anchor:menu});};row.append(menu);row.oncontextmenu=e=>{e.preventDefault();collectionMenu(ui,{...item,anchor:menu});};}
      list.append(row);
    }
    if(!items.length){const empty=document.createElement('div');empty.className='library-empty';empty.textContent=input.value?'Ничего не найдено. Попробуйте другое название.':'В этом разделе пока ничего нет.';list.append(empty);}
  };
  for(const [value,label] of [['all','Все'],['playlists','Плейлисты'],['artists','Исполнители']]){const p=document.createElement('button');p.className='mobile-lib-pill';p.dataset.filter=value;p.textContent=label;p.onclick=()=>{filter=value;ui.currentView.tab=value;render();};pills.append(p);}
  root.querySelector('#btnMobileLibAdd').onclick=()=>ui.showMobileAddSheet();
  root.querySelector('.library-search-toggle').onclick=()=>{root.querySelector('.library-search-line').hidden=false;input.focus();};
  input.oninput=()=>{ui.collectionQuery=input.value;render();};root.querySelector('.library-search-line button').onclick=()=>{input.value='';ui.collectionQuery='';root.querySelector('.library-search-line').hidden=true;render();};
  root.querySelector('.library-layout').onclick=()=>{layout=layout==='grid'?'list':'grid';ui.libraryLayout=layout;localStorage.setItem('playerium_library_layout',layout);render();};
  root.querySelector('.library-sort').onclick=e=>showSurfaceMenu(ui,{title:'Сортировка медиатеки',anchor:e.currentTarget,items:Object.entries(labels).map(([value,label])=>({label,icon:icons.sort,selected:sort===value,action:()=>{sort=value;ui.librarySort=value;render();}}))});
  container.append(root);render();
}

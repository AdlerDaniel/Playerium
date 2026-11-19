import {icons} from './design-icons.js';
import {mountCover,retainArtwork} from './artwork.js';
import {addedArtwork,mountPlaylistArt} from './visual-art.js';
import {showSurfaceMenu} from './surface-menu.js';
import {collectionMenu} from './collection-menu.js';
import {updateSortDirection} from './track-sort.js';
export function renderLibrary(ui,container) {
  const root=document.createElement('div');root.className='mobile-library-view';
  root.innerHTML=`<header class="mobile-library-header"><div class="mobile-library-title-row"><h1 class="mobile-library-title">Моя медиатека</h1><div class="mobile-library-actions"><div class="sort-controls"><button type="button" class="library-sort" aria-label="Сортировка медиатеки">${icons.sort}</button><button type="button" class="sort-direction"></button></div><button type="button" class="mobile-lib-btn library-search-toggle" aria-label="Поиск в медиатеке">${icons.search}</button><button type="button" class="mobile-lib-btn library-layout" aria-label="Показать сеткой">${icons.grid}</button></div></div><div class="library-search-line" hidden><input type="search" aria-label="Найти в медиатеке" placeholder="Найти в медиатеке" autocomplete="off"><button aria-label="Закрыть поиск">×</button></div></header><div class="mobile-library-list"></div>`;
  let layout=ui.libraryLayout||localStorage.getItem('playerium_library_layout')||'list';let sort=ui.librarySort||'default',ascending=ui.librarySortAsc??true;
  const list=root.querySelector('.mobile-library-list'),input=root.querySelector('input');input.value=ui.collectionQuery||'';
  const labels={default:'Ваш порядок',title:'По названию',recent:'По дате добавления'};
  const collectionDate=tracks=>tracks.reduce((latest,t)=>Math.max(latest,t.dateAdded||0),0);
  const allItems=()=>{
    const items=[];
      items.push({artPlaylist:addedArtwork(ui.library),tracks:ui.library.getTracks(),name:'Добавленные',sub:`${ui.library.getTracks().length} треков`,className:'local-art',view:{type:'allTracks',title:'Добавленные'},date:collectionDate(ui.library.getTracks())});
      for(const p of ui.library.getPlaylists().filter(p=>!p.isFolderPlaylist)){const tracks=ui.library.getPlaylistTracks(p.id);items.push({name:p.name,sub:`Плейлист • ${tracks.length} треков`,pictureUrl:tracks.find(t=>t.pictureUrl)?.pictureUrl,playlist:p,tracks,view:{type:'playlist',id:p.id,title:p.name},date:p.createdAt});}
    return items;
  };
  const render=()=>{
    retainArtwork(list);list.replaceChildren();list.classList.toggle('library-grid',layout==='grid');
    root.querySelector('.library-sort').title=labels[sort];
    updateSortDirection(root.querySelector('.sort-direction'),ascending,sort==='recent'?(ascending?'Сначала старые — изменить порядок':'Сначала новые — изменить порядок'):(ascending?'По возрастанию — изменить порядок':'По убыванию — изменить порядок'));
    const layoutButton=root.querySelector('.library-layout');layoutButton.innerHTML=layout==='grid'?icons.list:icons.grid;layoutButton.setAttribute('aria-label',layout==='grid'?'Показать списком':'Показать сеткой');
    let items=allItems().filter(i=>(i.name+' '+i.sub).toLocaleLowerCase().includes(input.value.toLocaleLowerCase()));
    if(sort==='title')items.sort((a,b)=>a.name.localeCompare(b.name,'ru'));if(sort==='recent')items.sort((a,b)=>(a.date||0)-(b.date||0));
    if(!ascending)items.reverse();
    for(const item of items){const row=document.createElement('div');row.className='mobile-lib-row';row.tabIndex=0;row.setAttribute('role','button');
      row.innerHTML=`<div class="mobile-lib-thumb ${item.className||''}"></div><div class="mobile-lib-meta"><span class="mobile-lib-name">${ui.escapeHTML(item.name)}</span><span class="mobile-lib-sub">${ui.escapeHTML(item.sub)}</span></div>`;
      const cover=row.firstElementChild;if(item.artPlaylist&&(item.artPlaylist.coverUrl||item.artPlaylist.special==='added'))mountPlaylistArt(cover,item.artPlaylist,item.tracks||[]);else if(item.playlist)mountPlaylistArt(cover,item.playlist,item.tracks);else if(item.pictureUrl)mountCover(cover,item);else cover.innerHTML=item.icon||icons.music;
      row.onclick=()=>ui.navigateTo(item.view);row.onkeydown=e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();row.click();}};
      if(item.playlist){const menu=document.createElement('button');menu.className='library-item-menu';menu.setAttribute('aria-label','Действия: '+item.name);menu.innerHTML=icons.more;menu.onclick=e=>{e.stopPropagation();collectionMenu(ui,{...item,anchor:menu});};row.append(menu);row.oncontextmenu=e=>{e.preventDefault();collectionMenu(ui,{...item,anchor:menu});};}
      list.append(row);
    }
    if(!items.length){const empty=document.createElement('div');empty.className='library-empty';empty.textContent=input.value?'Ничего не найдено. Попробуйте другое название.':'В этом разделе пока ничего нет.';list.append(empty);}
  };
  root.querySelector('.library-search-toggle').onclick=()=>{root.querySelector('.library-search-line').hidden=false;input.focus();};
  input.oninput=()=>{ui.collectionQuery=input.value;render();};root.querySelector('.library-search-line button').onclick=()=>{input.value='';ui.collectionQuery='';root.querySelector('.library-search-line').hidden=true;render();};
  root.querySelector('.library-layout').onclick=()=>{layout=layout==='grid'?'list':'grid';ui.libraryLayout=layout;localStorage.setItem('playerium_library_layout',layout);render();};
  root.querySelector('.library-sort').onclick=e=>showSurfaceMenu(ui,{title:'Сортировка медиатеки',anchor:e.currentTarget,items:Object.entries(labels).map(([value,label])=>({label,icon:icons.sort,selected:sort===value,action:()=>{if(sort!==value){sort=value;ascending=value!=='recent';ui.librarySort=value;ui.librarySortAsc=ascending;}render();}}))});
  root.querySelector('.sort-direction').onclick=()=>{ascending=!ascending;ui.librarySortAsc=ascending;render();};
  container.append(root);render();
}

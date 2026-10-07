import {icons} from './design-icons.js';
import {showSurfaceMenu,showFormDialog} from './surface-menu.js';
export async function editPlaylist(ui,playlist=null) {
  const data=await showFormDialog(ui,{title:playlist?'Изменить сведения':'Создать плейлист',fields:[{name:'name',label:'Название',value:playlist?.name||`Мой плейлист #${ui.library.getPlaylists().length+1}`,required:true},{name:'description',label:'Описание',value:playlist?.description||'',multiline:true}]});
  if(!data)return;
  if(playlist){await ui.library.renamePlaylist(playlist.id,data.name,data.description);if(ui.currentView.type==='playlist'&&ui.currentView.id===playlist.id)ui.currentView.title=data.name;ui.refreshCurrentView();}
  else {const p=await ui.library.createPlaylist(data.name,data.description);ui.navigateTo({type:'playlist',id:p.id,title:p.name});}
  ui.renderSidebar();ui.showToast('Плейлист сохранён','success');
}
export function collectionMenu(ui,{playlist,tracks,anchor}) {
  const context=playlist?{type:'playlist',id:playlist.id,title:playlist.name}:{...ui.currentView};
  const items=[{label:'Воспроизвести',icon:icons.play,action:()=>{if(tracks.length)ui.player.playTrack(tracks[0],0,tracks,context);}},{label:'Добавить в очередь',icon:icons.queue,action:()=>{for(const t of tracks)ui.player.addToQueue(t);ui.showToast('Добавлено в очередь');}}];
  if(playlist)items.push({label:'Изменить сведения',icon:icons.edit,action:()=>editPlaylist(ui,playlist)},{label:'Добавить треки',icon:icons.plus,action:()=>ui.navigateTo({type:'search',title:'Поиск'})},{label:'Удалить плейлист',danger:true,icon:icons.music,action:async()=>{const answer=await showFormDialog(ui,{title:'Удалить плейлист?',message:`«${playlist.name}» будет удалён из медиатеки. Треки останутся.`,confirm:'Удалить',danger:true});if(!answer)return;await ui.library.deletePlaylist(playlist.id);if(ui.currentView.id===playlist.id)ui.navigateTo({type:'library',title:'Моя медиатека'});ui.renderSidebar();ui.showToast('Плейлист удалён');}});
  return showSurfaceMenu(ui,{title:playlist?.name||ui.currentView.title,items,anchor});
}

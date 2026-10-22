// AI Horde supports anonymous generation. Persist the job to resume after restart.
import {likedArtwork,addedArtwork,collectionTracks,persistCollectionArtwork} from './visual-art.js';
const API='https://aihorde.net/api/v2/generate';
const headers={'Content-Type':'application/json',apikey:'0000000000','Client-Agent':'Playerium:1.7.47:local-music-player'};
export function albumPrompt(playlist,tracks){
 const clean=value=>String(value||'').replace(/[\r\n#]/g,' ').slice(0,90);
 const songs=tracks.slice(0,12).map(t=>[t.title,t.artist,t.genre].map(clean).filter(Boolean).join(' — ')).join('; ');
 return `Square album cover illustration inspired by this music collection: ${clean(playlist.name)}. Songs and artists: ${songs}. Express the mood and atmosphere of the music through a cohesive visual scene, rich colors, professional music artwork, no text, no lettering, no logos. ### text, watermark, letters, nudity, gore`;
}
export function installAlbumArtGenerator(ui){
 let busy=false,timer,priority=null;const library=ui.library;
 const refresh=()=>{ui.refreshCurrentView();ui.renderSidebar();};
 const mark=(playlist,value)=>{if(playlist.generating!==value){playlist.generating=value;refresh();}};
 const request=async(path,options={})=>{const r=await fetch(API+path,{...options,headers,signal:AbortSignal.timeout(30000)});if(!r.ok){const error=Error('Cover service '+r.status);error.status=r.status;throw error;}return r.json();};
 async function step(){
  if(busy||!library.db||navigator.onLine===false)return;busy=true;
  try{const collections=[...library.getPlaylists(),likedArtwork(library),addedArtwork(library)];if(priority)collections.sort((a,b)=>Number(b.id===priority)-Number(a.id===priority));
   for(const playlist of collections){
   if(playlist.isFolderPlaylist||playlist.coverType==='custom'||(playlist.coverUrl&&!playlist.generating&&playlist.special!=='added')||playlist.coverType==='text')continue;
   const tracks=collectionTracks(library,playlist);if(!tracks.length){mark(playlist,false);continue;}
   const key='album-generation:'+playlist.id,saved=await library.getFromStore('settings',key)||{key};
   if(playlist.coverUrl&&!saved.regenerate)continue;
   if(saved.retryAt>Date.now()){mark(playlist,false);continue;}
   try{
    mark(playlist,true);
    if(!saved.job){const result=await request('/async',{method:'POST',body:JSON.stringify({prompt:albumPrompt(playlist,tracks),params:{width:512,height:512,steps:20,n:1},nsfw:false,censor_nsfw:true,r2:false,shared:false})});if(!result.id)throw Error('Missing cover job');saved.job=result.id;saved.started=Date.now();await library.putInStore('settings',saved);break;}
    const state=await request('/check/'+encodeURIComponent(saved.job));
    if(state.faulted||Date.now()-saved.started>24*60*60*1000){await request('/status/'+encodeURIComponent(saved.job),{method:'DELETE'}).catch(()=>{});delete saved.job;throw Error('Cover job expired');}
    if(!state.done)break;
    const result=await request('/status/'+encodeURIComponent(saved.job)),image=result.generations?.find(g=>!g.censored&&typeof g.img==='string');
    if(!image||!/^[A-Za-z0-9+/=]+$/.test(image.img)||image.img.length>8*1024*1024){delete saved.job;throw Error('Invalid generated cover');}
    const blob=new Blob([Uint8Array.from(atob(image.img),c=>c.charCodeAt(0))],{type:'image/webp'});const bitmap=await createImageBitmap(blob);if(bitmap.width<128||bitmap.height<128){bitmap.close();throw Error('Invalid cover size');}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=384;canvas.getContext('2d').drawImage(bitmap,0,0,384,384);bitmap.close();
    const current=await library.getFromStore('settings',key);
    const live=playlist.special==='added'?addedArtwork(library):playlist.special?likedArtwork(library):library.getPlaylistById(playlist.id);if(current?.job===saved.job&&live&&live.coverType!=='custom'&&(!live.coverUrl||saved.regenerate)){live.coverType='generated';live.coverUrl=canvas.toDataURL('image/jpeg',.8);live.updatedAt=Date.now();live.generating=false;await persistCollectionArtwork(library,live);library.onLibraryChanged?.();refresh();}
    mark(playlist,false);if(priority===playlist.id)priority=null;delete saved.regenerate;
    delete saved.job;await library.putInStore('settings',saved);break;
   }catch(error){if([404,410].includes(error.status))delete saved.job;saved.retryAt=Date.now()+30*60*1000;await library.putInStore('settings',saved);mark(playlist,false);if(priority===playlist.id)priority=null;if(playlist.special==='added')ui.showToast('Не удалось создать обложку. Нажмите на неё, чтобы повторить.','error');console.warn('Automatic album artwork postponed',error.message);break;}
  }}finally{busy=false;}
 }
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(step,2500);};
 const changed=library.onLibraryChanged;library.onLibraryChanged=(...args)=>{changed?.(...args);schedule();};
 window.addEventListener('online',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 async function regenerate(playlist){
  if(playlist.generating)return;
  if(!collectionTracks(library,playlist).length){ui.showToast('Добавьте треки для создания обложки.');return;}
  if(navigator.onLine===false){ui.showToast('Для создания обложки нужен интернет.','error');return;}
  mark(playlist,true);priority=playlist.id;
  try{await library.putInStore('settings',{key:'album-generation:'+playlist.id,regenerate:true});await step();schedule();}catch(error){mark(playlist,false);throw error;}
 }
 // Restore a replacement job without discarding the previous cover.
 library.getFromStore('settings','album-generation:__added-artwork').then(saved=>{if(saved?.regenerate&&!(saved.retryAt>Date.now())){priority=addedArtwork(library).id;mark(addedArtwork(library),true);}}).catch(console.warn);
 const interval=setInterval(()=>{if(!document.hidden)step();},20000);schedule();const controller={step,regenerate,stop(){clearTimeout(timer);clearInterval(interval);}};ui.albumArt=controller;return controller;
}

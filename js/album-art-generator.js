// AI Horde supports anonymous generation. Persist the job to resume after restart.
import {addedArtwork,collectionTracks,persistCollectionArtwork} from './visual-art.js';
const API='https://aihorde.net/api/v2/generate';
const headers={'Content-Type':'application/json',apikey:'0000000000','Client-Agent':'Playerium:1.7.51:local-music-player'};
export function albumPrompt(playlist,tracks){
 const clean=value=>String(value||'').replace(/[\r\n#]/g,' ').slice(0,90);
 const songs=tracks.slice(0,12).map(t=>[t.title,t.artist,t.genre].map(clean).filter(Boolean).join(' — ')).join('; ');
 return `Square album cover illustration inspired by this music collection: ${clean(playlist.name)}. Songs and artists: ${songs}. Express the mood and atmosphere of the music through a cohesive visual scene, rich colors, professional music artwork, no text, no lettering, no logos. ### text, watermark, letters, nudity, gore`;
}
export function installAlbumArtGenerator(ui){
 let busy=false,timer,priority=null,stopped=false;const library=ui.library;
 const refresh=()=>{ui.refreshCurrentView();ui.renderSidebar();};
 const mark=(playlist,value,note='')=>{if(playlist.generating!==value||playlist.generationNote!==note){playlist.generating=value;playlist.generationNote=note;refresh();}};
 const request=async(path,options={})=>{const r=await fetch(API+path,{...options,headers,signal:AbortSignal.timeout(45000)});if(!r.ok){const error=Error('Cover service '+r.status);error.status=r.status;const seconds=Number(r.headers.get('retry-after'));if(seconds>0)error.retryAfter=Math.min(seconds*1000,600000);throw error;}return r.json();};
 async function step(){
  if(busy||!library.db||navigator.onLine===false)return;busy=true;
  try{let submitted=false;const collections=[...library.getPlaylists(),addedArtwork(library)];if(priority)collections.sort((a,b)=>Number(b.id===priority)-Number(a.id===priority));
   for(const playlist of collections){
   if(playlist.isFolderPlaylist)continue;
   const tracks=collectionTracks(library,playlist);if(!tracks.length){mark(playlist,false);continue;}
   const key='album-generation:'+playlist.id,saved=await library.getFromStore('settings',key)||{key};
   if(['custom','text'].includes(playlist.coverType)&&!saved.regenerate)continue;
   if(playlist.coverUrl&&!saved.regenerate)continue;
   // Older versions delayed even completed jobs for 30 minutes after a single network error.
   if(saved.retryAt>Date.now()&&saved.failures){mark(playlist,!saved.permanent,saved.permanent?'':'Связь прервалась. Повторяем автоматически…');continue;}
   try{
    if(!saved.job&&submitted)continue;
    mark(playlist,true,playlist.generationNote);
    if(!saved.job){submitted=true;const result=await request('/async',{method:'POST',body:JSON.stringify({prompt:albumPrompt(playlist,tracks),params:{width:512,height:512,steps:20,n:1},nsfw:false,censor_nsfw:true,r2:false,shared:false})});if(!result.id)throw Error('Missing cover job');saved.job=result.id;saved.started=Date.now();saved.failures=0;delete saved.retryAt;delete saved.permanent;await library.putInStore('settings',saved);continue;}
    const state=await request('/check/'+encodeURIComponent(saved.job));
    if(state.faulted||Date.now()-(saved.started||Date.now())>24*60*60*1000){await request('/status/'+encodeURIComponent(saved.job),{method:'DELETE'}).catch(()=>{});delete saved.job;throw Object.assign(Error('Cover job expired'),{status:410});}
    if(!state.done){mark(playlist,true,'Обложка генерируется…'+(state.queue_position>0?' Место в очереди: '+state.queue_position+'.':''));continue;}
    const result=await request('/status/'+encodeURIComponent(saved.job)),image=result.generations?.find(g=>!g.censored&&typeof g.img==='string');
    if(!image)throw Object.assign(Error('No usable generated cover'),{status:422});
    const coverUrl=await generatedCover(image.img);
    const current=await library.getFromStore('settings',key);
    if(current?.job!==saved.job)continue;
    const live=playlist.special==='added'?addedArtwork(library):library.getPlaylistById(playlist.id);if(live&&(!['custom','text'].includes(live.coverType)||saved.regenerate)&&(!live.coverUrl||saved.regenerate)){live.coverType='generated';live.coverUrl=coverUrl;live.updatedAt=Date.now();live.generating=false;live.generationNote='';await persistCollectionArtwork(library,live);library.onLibraryChanged?.();refresh();}
    mark(playlist,false);if(priority===playlist.id)priority=null;delete saved.regenerate;
    await library.putInStore('settings',{key});
   }catch(error){
    const expired=[404,410].includes(error.status);if(expired)delete saved.job;
    saved.failures=(saved.failures||0)+1;saved.permanent=[400,401,403,422].includes(error.status);
    saved.retryAt=Date.now()+(expired?1000:saved.permanent?1800000:error.retryAfter||Math.min(15000*2**Math.min(saved.failures-1,5),300000));
    saved.lastError=String(error.message).slice(0,200);await library.putInStore('settings',saved);
    mark(playlist,!saved.permanent,saved.permanent?'':'Связь прервалась. Повторяем автоматически…');
    if(saved.permanent&&playlist.special==='added')ui.showToast('Сервис не смог создать обложку. Нажмите на неё, чтобы выбрать новый вариант.','error');
    console.warn('Automatic album artwork retry scheduled',error.message);
   }
  }}finally{busy=false;}
 }
 const schedule=()=>{if(stopped)return;clearTimeout(timer);timer=setTimeout(step,2500);};
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
 Promise.all([...library.getPlaylists(),addedArtwork(library)].map(async playlist=>{const saved=await library.getFromStore('settings','album-generation:'+playlist.id);if(saved?.job||saved?.regenerate){mark(playlist,!saved.permanent);if(playlist.special==='added')priority=playlist.id;}})).catch(console.warn);
 const interval=setInterval(()=>{if(!document.hidden)step();},20000);schedule();const controller={step,regenerate,stop(){stopped=true;clearTimeout(timer);clearInterval(interval);}};ui.albumArt=controller;return controller;
}

// Horde may return either inline WebP or a download URL, depending on worker storage.
async function generatedCover(value){
 let blob;
 if(/^https:\/\//i.test(value)){
  const host=new URL(value).hostname;
  if(!['aihorde.net','a223539ccf6caa2d76459c9727d276e6.r2.cloudflarestorage.com'].includes(host))throw Error('Unsupported cover storage');
  const response=await fetch(value,{credentials:'omit',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('Cover download '+response.status);blob=await response.blob();
 }else{
  const encoded=value.replace(/^data:image\/[^;]+;base64,/i,'').replace(/\s/g,'');
  if(!/^[A-Za-z0-9+/=]+$/.test(encoded)||encoded.length>12*1024*1024)throw Error('Invalid generated cover');
  blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/webp'});
 }
 if(!blob.size||blob.size>8*1024*1024)throw Error('Invalid cover size');
 let image,release=()=>{};
 try{
  if(typeof createImageBitmap==='function'){image=await createImageBitmap(blob);release=()=>image.close();}
  else{const url=URL.createObjectURL(blob);release=()=>URL.revokeObjectURL(url);image=new Image();image.src=url;await image.decode();}
  if(image.width<128||image.height<128)throw Error('Invalid cover dimensions');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=384;canvas.getContext('2d').drawImage(image,0,0,384,384);return canvas.toDataURL('image/jpeg',.8);
 }finally{release();}
}

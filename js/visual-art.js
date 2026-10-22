import {mountCover,resizeArtwork} from './artwork.js';
import {artistKey} from './music-match.js';
import {catalogArtists} from './music-artists.js';
import {enabled} from './visual-features.js';
export function likedArtwork(library){return library.likedArtwork||(library.likedArtwork={id:'__liked-artwork',name:'Любимые треки',special:true});}
export async function hydrateCollectionArtwork(library){const saved=await library.getFromStore('settings','liked-artwork');library.likedArtwork={id:'__liked-artwork',name:'Любимые треки',special:true,...saved?.value};}
export async function persistCollectionArtwork(library,playlist){
 if(playlist.special)await library.putInStore('settings',{key:'liked-artwork',value:{coverType:playlist.coverType,coverUrl:playlist.coverUrl,updatedAt:playlist.updatedAt}});
 else await library.putInStore('playlists',playlist);
}
export function mountPlaylistArt(host,playlist,tracks=[]){
 if(!host)return;host.classList.add('playlist-art');
 if(['custom','generated'].includes(playlist?.coverType)&&playlist.coverUrl){delete host.dataset.playlistArt;mountCover(host,{pictureUrl:playlist.coverUrl},true);return;}
 const covers=[...new Map(tracks.filter(t=>t.pictureUrl).map(t=>[t.pictureUrl,t])).values()].slice(0,4);
 const signature=JSON.stringify([playlist?.coverType,playlist?.name,covers.map(t=>t.pictureUrl)]);if(host.dataset.playlistArt===signature&&host.childElementCount)return;host.dataset.playlistArt=signature;
 host.replaceChildren();host.classList.remove('cover-loading','cover-placeholder');host.dataset.coverIdentity='';host.coverGeneration=(host.coverGeneration||0)+1;
 if(playlist?.coverType==='text'||covers.length<2){const tile=document.createElement('span');tile.className='playlist-letter-art';tile.textContent=(playlist?.name||'Музыка').slice(0,32);host.append(tile);return;}
 const grid=document.createElement('span');grid.className='playlist-mosaic';for(let i=0;i<4;i++){const cell=document.createElement('span');mountCover(cell,covers[i%covers.length],true);grid.append(cell);}host.append(grid);
}
export async function setPlaylistArt(ui,playlist,type,file){
 let url=null;
 if(type==='custom'){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>12*1024*1024)throw Error('Выберите изображение PNG, JPEG или WebP до 12 МБ.');
  const blob=await resizeArtwork(file),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=canvas.height=384;const ctx=canvas.getContext('2d'),side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,384,384);bitmap.close();url=canvas.toDataURL('image/jpeg',.8);
 }
 playlist.coverType=type;playlist.coverUrl=url;playlist.updatedAt=Date.now();await persistCollectionArtwork(ui.library,playlist);ui.library.onLibraryChanged?.();ui.refreshCurrentView();ui.renderSidebar();
}
export function choosePlaylistFile(ui,playlist){const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;document.body.append(input);input.onchange=async()=>{try{if(input.files[0])await setPlaylistArt(ui,playlist,'custom',input.files[0]);}catch(e){ui.showToast(e.message,'error');}finally{input.remove();}};input.addEventListener('cancel',()=>input.remove());input.click();}
export function bindPlaylistCover(ui,host,playlist){
 host.tabIndex=0;host.setAttribute('role','button');host.setAttribute('aria-label','Изменить обложку: '+playlist.name);host.title='Загрузить свою обложку';
 host.onclick=()=>choosePlaylistFile(ui,playlist);host.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();host.click();}};
}
const portraits=new Map(),pending=new Map();let tail=Promise.resolve();
export async function hydratePortraits(library){if(!library.db||!globalThis.IDBKeyRange)return;try{const entries=await new Promise((resolve,reject)=>{const req=library.db.transaction('settings','readonly').objectStore('settings').getAll(IDBKeyRange.bound('portrait:','portrait:\uffff'));req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});for(const entry of entries)if(typeof entry.value==='string')portraits.set(entry.key.slice(9),entry.value);}catch{}}
export function portraitFor(name){return portraits.get(artistKey(name))||null;}
export function mountArtistPortrait(ui,host,artist){
 const name=artist?.name||artist?.title||'',key=artistKey(name);host.dataset.artistPortrait=key;
 const present=artist?.portraitUrl||portraits.get(key);mountCover(host,{artist:name,pictureUrl:enabled(7)?present:artist?.pictureUrl});
 if(!enabled(7)||!ui.music?.available||!key||present)return;
 if(!pending.has(key)){
  const task=tail.catch(()=>{}).then(async()=>{
   const saved=await ui.library.getFromStore('settings','portrait:'+key);if(saved?.value){portraits.set(key,saved.value);return saved.value;}
   const candidates=catalogArtists('deezerArtists',await ui.music.request('catalog',{provider:'deezerArtists',query:name}));
   const exact=candidates.find(a=>artistKey(a.name)===key&&a.pictureUrl);if(!exact)return null;
   const image=await ui.music.request('artwork',{url:exact.pictureUrl});const blob=new Blob([Uint8Array.from(atob(image.base64),c=>c.charCodeAt(0))],{type:image.type});if(blob.size>4*1024*1024)return null;
   const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=canvas.height=384;canvas.getContext('2d').drawImage(bitmap,0,0,384,384);bitmap.close();const value=canvas.toDataURL('image/jpeg',.85);portraits.set(key,value);await ui.library.putInStore('settings',{key:'portrait:'+key,value,source:exact.pictureUrl,artist:name});return value;
  });tail=task;pending.set(key,task);
 }
 pending.get(key).then(url=>{if(url&&host.isConnected&&host.dataset.artistPortrait===key)mountCover(host,{pictureUrl:url,artist:name},true);}).catch(()=>{});
}

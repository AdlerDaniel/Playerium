import {audioCandidate,mergeSongs,sameRecording,isVariant} from './music-match.js';
const searchProviders=['youtubeMusic','soundcloud','youtubeAudio'];
const catalogProviders=['itunes','itunesUA','deezer','musicbrainz','audius','bandcamp'];
function catalogTracks(provider,data) {
  if(provider.startsWith('itunes'))return (data.results||[]).map(t=>({title:t.trackName,artist:t.artistName,album:t.collectionName,year:t.releaseDate?.slice(0,4),duration:t.trackTimeMillis/1000,trackNo:t.trackNumber,genre:t.primaryGenreName,pictureUrl:t.artworkUrl100?.replace('100x100bb','600x600bb'),official:true,catalog:true,sources:[]}));
  if(provider==='deezer')return (data.data||[]).map(t=>({title:t.title,artist:t.artist?.name,album:t.album?.title,duration:t.duration,pictureUrl:t.album?.cover_big,isrc:t.isrc,official:true,catalog:true,sources:[]}));
  if(provider==='musicbrainz')return (data.recordings||[]).filter(t=>t['artist-credit']?.length).map(t=>({title:t.title,artist:t['artist-credit'].map(a=>a.name+(a.joinphrase||'')).join(''),album:t.releases?.[0]?.title||'',year:t['first-release-date']?.slice(0,4)||'',duration:(t.length||0)/1000,isrc:t.isrcs?.[0]||'',official:true,catalog:true,sources:[]}));
  if(provider==='audius')return (data.data||[]).map(t=>({title:t.title,artist:t.user?.name,album:'',duration:t.duration,genre:t.genre,pictureUrl:t.artwork?.['480x480'],official:!!t.user?.is_verified,catalog:true,sources:t.permalink?[{provider,url:`https://audius.co${t.permalink.startsWith('/')?'':'/'}${t.permalink}`,official:!!t.user?.is_verified}]:[]}));
  if(provider==='bandcamp') {
    const dom=new DOMParser().parseFromString(data,'text/html');
    return [...dom.querySelectorAll('.searchresult')].map(item=>{
      const a=item.querySelector('.heading a'),artist=item.querySelector('.subhead')?.textContent?.replace(/^\s*by\s+/i,'').trim();
      return {title:a?.textContent?.trim(),artist,album:item.querySelector('.albumtitle')?.textContent?.trim()||'',pictureUrl:item.querySelector('img')?.src,official:true,catalog:true,sources:a?[{provider,url:a.href.split('?')[0],official:true}]:[]};
    });
  }
  return [];
}
export class MusicCatalog {
  constructor(library,ui) {
    this.library=library;this.ui=ui;this.pending=new Map();this.downloads=new Map();this.cache=new Map();this.searchRequests=new Set();this.searchVersion=0;this.counter=0;
    window.onMusicResponse=message=>{
      const task=this.pending.get(message.id);if(!task)return;
      clearTimeout(task.timer);this.pending.delete(message.id);
      message.error?task.reject(Error(message.error)):task.resolve(message.data);
    };
    window.electronAPI?.onMusicProgress?.(state=>this.progress(state));
    window.onMusicProgress=state=>this.progress(state);
    library.ensureTrack=track=>this.ensureTrack(track);
  }
  get available(){return !!(window.electronAPI?.musicRequest || window.AndroidBridge?.musicRequest);}
  request(operation,payload,search=false) {
    if(!this.available)return Promise.reject(Error('Не удалось получить треки.'));
    const id=`music-${Date.now()}-${++this.counter}`;
    if(search)this.searchRequests.add(id);
    const task=window.electronAPI?.musicRequest?window.electronAPI.musicRequest(operation,payload,id):new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);window.AndroidBridge.cancelMusic?.(id);reject(Error('Не удалось завершить действие. Попробуйте снова.'));},operation==='download'?660000:90000);
      this.pending.set(id,{resolve,reject,timer});
      try{window.AndroidBridge.musicRequest(id,operation,JSON.stringify(payload));}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
    return task.finally(()=>this.searchRequests.delete(id));
  }
  progress(state) {
    for(const row of document.querySelectorAll('[data-track-id]'))if(row.dataset.trackId===state.id){row.dataset.downloading='true';const btn=row.querySelector('.track-download-btn');if(btn){btn.disabled=true;btn.setAttribute('aria-label','Сохранение трека');}}
  }
  schedule(query,onResults) {
    for(const id of this.searchRequests){window.electronAPI?.cancelMusic?.(id);window.AndroidBridge?.cancelMusic?.(id);
      const task=this.pending.get(id);if(task){clearTimeout(task.timer);this.pending.delete(id);task.reject(Error('Поиск изменён'));}
    }
    this.searchRequests.clear();
    clearTimeout(this.timer);const version=++this.searchVersion;
    const local=this.library.search(query);
    if(!query || query.length<2 || !this.available){onResults(local,false,null);return;}
    const cached=this.cache.get(query.toLocaleLowerCase());
    if(cached && Date.now()-cached.time<300000){onResults(mergeSongs([cached.groups],query,local),false,null);return;}
    onResults(local,true,null);
    this.timer=setTimeout(async()=>{
      const groups=[];let successes=0;
      const providers=[...catalogProviders,...searchProviders];
      await Promise.allSettled(providers.map(async provider=>{
        try {
          const data=await this.request(searchProviders.includes(provider)?'search':'catalog',{provider,query},true);
          const tracks=searchProviders.includes(provider)?(data.entries||[]).map(e=>audioCandidate(e,provider)).filter(Boolean):catalogTracks(provider,data).map(t=>({...t,metadataScore:['itunes','itunesUA','deezer'].includes(provider)?3:2}));
          groups.push(tracks);successes++;
          if(version===this.searchVersion)onResults(mergeSongs(groups,query,this.library.search(query)),true,null);
        }catch{}
      }));
      if(successes)this.cache.set(query.toLocaleLowerCase(),{time:Date.now(),groups});
      if(version===this.searchVersion)onResults(mergeSongs(groups,query,this.library.search(query)),false,successes?null:'Не удалось получить результаты. Попробуйте снова.');
    },600);
  }
  async ensureTrack(track) {
    if(!track?.catalog)return track;
    const existing=this.library.getTracks().find(t=>sameRecording(t,track));if(existing)return existing;
    if(this.downloads.has(track.id))return this.downloads.get(track.id);
    const task=(async()=>{
      let sources=[...(track.sources||[])];
      const folder=this.library.folders.findLast(f=>!f.source.startsWith('web:') && f.source!=='android-files');
      const save=()=>this.request('download',{track:{...track,sources},folderSource:folder?.source||null});
      let saved;
      if(sources.length){try{saved=await save();}catch{}}
      if(!saved) {
        const results=await Promise.allSettled(searchProviders.map(async provider=>{
          const data=await this.request('search',{provider,query:`${track.artist} ${track.title}`});
          return (data.entries||[]).map(e=>audioCandidate(e,provider)).filter(t=>t&&!isVariant(t.rawTitle)&&sameRecording(track,t)).flatMap(t=>t.sources);
        }));
        for(const r of results)if(r.status==='fulfilled')sources.push(...r.value);
        sources=[...new Map(sources.map(s=>[s.url,s])).values()].sort((a,b)=>Number(b.official)-Number(a.official));
        if(!sources.length)throw Error('Не удалось сохранить этот трек. Попробуйте позже.');
        saved=await save();
      }
      const added=await this.library.addDownloaded(saved,track);
      this.cache.clear();this.ui.renderSidebar();return added;
    })();
    this.downloads.set(track.id,task);this.progress({id:track.id});
    try{return await task;}finally{this.downloads.delete(track.id);for(const row of document.querySelectorAll('[data-track-id]'))if(row.dataset.trackId===track.id){delete row.dataset.downloading;const btn=row.querySelector('.track-download-btn');if(btn)btn.disabled=false;}}
  }
  async restore(){if(!this.available)return;try{for(let file of await this.request('restore',{})){
    if(window.AndroidBridge && !this.library.getTracks().some(t=>t.sourceKey===file.uri))file=await this.request('describe',{downloadId:file.downloadId});
    await this.library.addDownloaded(file,null);
  }}catch{}}
  async removeTrack(track) {
    if(this.downloads.size && this.downloads.has(track.id))return;
    if(this.ui.player.currentTrack?.id===track.id)this.ui.player.stopTrack?.();
    if(track.downloadId)await this.request('delete',{downloadId:track.downloadId});
    await this.library.removeTrack(track.id);
    this.ui.player.removeTrack?.(track.id);this.cache.clear();this.ui.refreshCurrentView();this.ui.renderSidebar();
  }
}

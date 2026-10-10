import {catalogArtists,artistResults,belongsToArtist,popularityScore} from './music-artists.js';
import {audioCandidate,mergeSongs,sameRecording,isVariant} from './music-match.js';
import {youtubeMusicEntries} from './music-youtube.js';
import {recordingSources} from './music-recordings.js';
const searchProviders=['youtubeMusic','soundcloud','youtubeAudio'];
const catalogProviders=['itunes','itunesUA','deezer','musicbrainz','audius','bandcamp','muzend','musify','topmusicua','miyzvuk'];
export function catalogTracks(provider,data) {
  if(provider==='miyzvuk') {
    const dom=new DOMParser().parseFromString(data,'text/html');
    return [...dom.querySelectorAll('[data-src][data-title][data-subtitle][data-duration]')].flatMap(item=>{
      let url;try {
        const player=new URL(item.getAttribute('data-src'),'https://miyzvuk.net');
        if(player.origin!=='https://miyzvuk.net'||player.pathname!=='/engine/go.php')return [];
        url=new URL(atob(player.searchParams.get('url')||''));
      }catch{return [];}
      if(url.origin!=='https://miyzvuk.net'||url.username||url.password||url.search||url.hash||!/^\/uploads\/public_files\/[^?#]+\.mp3$/i.test(url.pathname))return [];
      const title=item.getAttribute('data-title'),artist=item.getAttribute('data-subtitle'),time=item.getAttribute('data-duration');
      if(!title||!artist||!/^\d+:\d{2}$/.test(time))return [];
      const duration=time.split(':').reduce((n,v)=>n*60+Number(v),0);
      return [{title,artist,duration,catalog:true,official:false,sources:[{provider,url:url.href,title,artist,duration,official:false}]}];
    });
  }
  if(provider==='musify'||provider==='topmusicua') {
    const dom=new DOMParser().parseFromString(data,'text/html');
    const items=provider==='musify'?[...dom.querySelectorAll('.tracklist__row[data-artist][data-name]')]:[...dom.querySelectorAll('main .ua-play[data-src][data-title]')].filter(item=>!item.closest('aside'));
    return items.flatMap(item=>{
      let artist,title,rawURL,time;
      if(provider==='musify') {
        artist=item.getAttribute('data-artist');title=item.getAttribute('data-name');rawURL=item.querySelector('[data-url]')?.getAttribute('data-url');time=item.querySelector('[data-duration]')?.getAttribute('data-duration');
      }else {
        const label=item.getAttribute('data-title')||'',split=label.match(/^(.*?)\s[-–—]\s(.+)$/);if(!split)return [];
        artist=split[1];title=split[2];rawURL=item.getAttribute('data-src');
        time=item.closest('.music')?.querySelector('.info')?.textContent?.match(/\b\d+:\d{2}\b/)?.[0];
      }
      let url;try{url=new URL(rawURL,provider==='musify'?'https://musify.club':'https://topmusicua.com');}catch{return [];}
      const valid=provider==='musify'?url.hostname==='musify.club'&&/^\/track\/pl\/\d+\/[^/?#]+\.mp3$/i.test(url.pathname):url.hostname==='topmusicua.com'&&/^\/uploads\/files\/[^?#]+\.mp3$/i.test(url.pathname);
      if(!valid||url.protocol!=='https:'||url.search||url.hash||url.username||url.password||url.port||!artist||!title)return [];
      const duration=time?time.split(':').reduce((n,v)=>n*60+Number(v),0):0;
      return [{title,artist,duration,catalog:true,official:false,sources:[{provider,url:url.href,title,artist,duration,official:false}]}];
    });
  }
  if(provider==='muzend') {
    const dom=new DOMParser().parseFromString(data,'text/html');
    return [...dom.querySelectorAll('[data-track][data-title][data-artist]')].flatMap(item=>{
      const url=item.getAttribute('data-track'),title=item.getAttribute('data-title'),artist=item.getAttribute('data-artist');
      if(!/^https:\/\/muzend\.net\/uploads\/music\/[^?#]+\.mp3$/i.test(url||'')||!title||!artist)return [];
      const time=item.querySelector('.track-time')?.textContent?.trim().split(':').map(Number),duration=time?.length===2?time[0]*60+time[1]:0;
      return [{title,artist,duration,catalog:true,official:false,sources:[{provider,url,title,artist,duration,official:false}]}];
    });
  }
  if(provider.startsWith('itunes'))return (data?.results||[]).filter(t=>t.trackName).map(t=>({title:t.trackName,artist:t.artistName,itunesArtistId:t.artistId,album:t.collectionName,year:t.releaseDate?.slice(0,4),duration:t.trackTimeMillis/1000,trackNo:t.trackNumber,genre:t.primaryGenreName,pictureUrl:t.artworkUrl100?.replace('100x100bb','600x600bb'),pictureUrls:[t.artworkUrl100?.replace('100x100bb','600x600bb'),t.artworkUrl100].filter(Boolean),official:true,catalog:true,sources:[]}));
  if(provider==='deezer'||provider==='deezerArtistTop')return (data?.data||[]).map(t=>({title:t.title,artist:t.artist?.name,deezerArtistId:t.artist?.id,contributors:t.contributors||[],popularity:popularityScore(t),album:t.album?.title,duration:t.duration,pictureUrl:t.album?.cover_big,pictureUrls:[t.album?.cover_big,t.album?.cover_medium,t.album?.cover].filter(Boolean),isrc:t.isrc,official:true,catalog:true,sources:[]}));
  if(provider==='musicbrainz')return (data.recordings||[]).filter(t=>t['artist-credit']?.length).map(t=>({title:t.title,artist:t['artist-credit'].map(a=>a.name+(a.joinphrase||'')).join(''),album:t.releases?.[0]?.title||'',year:t['first-release-date']?.slice(0,4)||'',duration:(t.length||0)/1000,isrc:t.isrcs?.[0]||'',official:true,catalog:true,sources:[]}));
  if(provider==='audius')return (data.data||[]).map(t=>({title:t.title,artist:t.user?.name,album:'',duration:t.duration,genre:t.genre,pictureUrl:t.artwork?.['480x480'],pictureUrls:Object.values(t.artwork||{}).filter(url=>typeof url==='string'),official:!!t.user?.is_verified,catalog:true,sources:t.permalink?[{provider,url:`https://audius.co${t.permalink.startsWith('/')?'':'/'}${t.permalink}`,official:!!t.user?.is_verified}]:[]}));
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
    library.getLoudness=track=>this.request('loudness',{uri:track.nativeUri});
  }
  get available(){return !!(window.electronAPI?.musicRequest || window.AndroidBridge?.musicRequest);}
  request(operation,payload,search=false) {
    if(!this.available)return Promise.reject(Error('Не удалось получить треки.'));
    const id=`music-${Date.now()}-${++this.counter}`;
    if(search)this.searchRequests.add(id);
    const task=window.electronAPI?.musicRequest?window.electronAPI.musicRequest(operation,payload,id):new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);window.AndroidBridge.cancelMusic?.(id);reject(Error('Не удалось завершить действие. Попробуйте снова.'));},['download','restore'].includes(operation)?660000:90000);
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
    query=String(query||'').trim();
    const local=this.library.search(query);
    if(!query || query.length<2 || !this.available){onResults(local,false,null);return;}
    const cached=this.cache.get(query.toLocaleLowerCase());
    if(cached && Date.now()-cached.time<300000){const tracks=mergeSongs(cached.groups,query,local);onResults(tracks,false,null,artistResults(cached.artists||[],tracks,query));return;}
    const known=recordingSources(query);
    onResults(mergeSongs([known],query,local),true,null);
    this.timer=setTimeout(async()=>{
      const groups=[known],artists=[];let successes=known.length?1:0;
      const providers=[...catalogProviders,...searchProviders,'deezerArtists','itunesArtists'];
      await Promise.allSettled(providers.map(async provider=>{
        try {
          const data=await this.request(searchProviders.includes(provider)?'search':'catalog',{provider,query},true);
          if(provider.endsWith('Artists')){artists.push(catalogArtists(provider,data));successes++;if(version===this.searchVersion){const tracks=mergeSongs(groups,query,this.library.search(query));onResults(tracks,true,null,artistResults(artists,tracks,query));}return;}
          const tracks=searchProviders.includes(provider)?(provider==='youtubeMusic'?youtubeMusicEntries(data):(data.entries||[])).map(e=>audioCandidate(e,provider)).filter(Boolean):catalogTracks(provider,data).map(t=>({...t,metadataScore:['itunes','itunesUA','deezer'].includes(provider)?3:2}));
          groups.push(tracks);successes++;
          if(version===this.searchVersion)onResults(mergeSongs(groups,query,this.library.search(query)),true,null,artistResults(artists,groups.flat(),query));
        }catch{}
      }));
      if(successes)this.cache.set(query.toLocaleLowerCase(),{time:Date.now(),groups,artists});
      if(version===this.searchVersion)onResults(mergeSongs(groups,query,this.library.search(query)),false,successes?null:'Не удалось получить результаты. Попробуйте снова.',artistResults(artists,groups.flat(),query));
    },600);
  }
  async artistProfile(artist) {
    const local=this.library.getTracks().filter(t=>belongsToArtist(t,artist));
    if(!this.available)return {artist,tracks:local,offline:true};
    const key='artist:'+String(artist.deezerId||artist.itunesId||artist.name);
    const cached=this.cache.get(key);if(cached&&Date.now()-cached.time<300000)return cached.profile;
    let detail={...artist};
    if(!detail.deezerId||!detail.itunesId){
      const missing=[...(!detail.deezerId?['deezerArtists']:[]),...(!detail.itunesId?['itunesArtists']:[])];
      const found=await Promise.allSettled(missing.map(async provider=>artistResults([catalogArtists(provider,await this.request('catalog',{provider,query:artist.name}))],[],artist.name).find(a=>a.name.toLocaleLowerCase()===artist.name.toLocaleLowerCase())));
      for(const r of found)if(r.status==='fulfilled'&&r.value)detail={...detail,...r.value};
    }
    const requests=[['itunes',detail.name],['itunesUA',detail.name],['deezer',`artist:"${detail.name.replaceAll('"','')}"`]];
    if(detail.deezerId)requests.push(['deezerArtistTop',String(detail.deezerId)]);
    if(detail.itunesId)requests.push(['itunesArtistTracks',String(detail.itunesId)]);
    const responses=await Promise.allSettled(requests.map(async([provider,query])=>catalogTracks(provider,await this.request('catalog',{provider,query})).map(t=>({...t,metadataScore:3}))));
    const groups=responses.filter(r=>r.status==='fulfilled').map(r=>r.value.filter(t=>belongsToArtist(t,detail)));
    const tracks=mergeSongs(groups,detail.name,local,true).sort((a,b)=>(b.popularity||0)-(a.popularity||0)),offline=!responses.some(r=>r.status==='fulfilled');
    let albums=[];if(detail.itunesId)try{const data=await this.request('catalog',{provider:'itunesArtistAlbums',query:String(detail.itunesId)});albums=(data?.results||[]).filter(a=>a.collectionId&&a.collectionName).map(a=>({name:a.collectionName,artist:a.artistName,year:a.releaseDate?.slice(0,4),pictureUrl:a.artworkUrl100?.replace('100x100bb','600x600bb'),itunesId:a.collectionId}));}catch{}
    const profile={artist:detail,tracks,albums,offline};if(!offline)this.cache.set(key,{time:Date.now(),profile});return profile;
  }
  async albumTracks(album) {
    if(!album.itunesId)return album.tracks||[];
    const data=await this.request('catalog',{provider:'itunesArtistTracks',query:String(album.itunesId)});
    return mergeSongs([catalogTracks('itunesArtistTracks',data)],'',this.library.getTracks().filter(t=>t.album===album.name&&t.artist===album.artist),true).sort((a,b)=>(a.trackNo||0)-(b.trackNo||0));
  }
  async ensureTrack(track) {
    if(!track?.catalog)return track;
    const existing=this.library.getTracks().find(t=>sameRecording(t,track));if(existing)return existing;
    if(this.downloads.has(track.id))return this.downloads.get(track.id);
    const task=(async()=>{
      if(!track.pictureUrl||!track.album) {
        const metadata=await Promise.allSettled(['itunes','itunesUA'].map(async provider=>{
          const data=await this.request('catalog',{provider,query:`${track.artist} ${track.title}`});
          return catalogTracks(provider,data).find(t=>sameRecording(track,t));
        }));
        track={...track};
        for(const result of metadata)if(result.status==='fulfilled'&&result.value)for(const field of ['album','year','trackNo','genre','isrc','pictureUrl','duration'])if(!track[field]&&result.value[field])track[field]=result.value[field];
      }
      let sources=[...(track.sources||[]),...recordingSources(`${track.artist} ${track.title}`).filter(t=>sameRecording(track,t)).flatMap(t=>t.sources)],saved,lastError,discoveryError;
      const attempted=new Set();
      const priority={audius:0,bandcamp:1,soundcloud:2,youtubeMusic:3,youtubeAudio:4,muzend:5,musify:6,topmusicua:7,miyzvuk:8};
      const folder=this.library.folders.findLast(f=>!f.source.startsWith('web:') && f.source!=='android-files');
      const save=async()=>{
        sources=[...new Map(sources.filter(s=>!attempted.has(s.url)).map(s=>[s.url,s])).values()].sort((a,b)=>(priority[a.provider]??9)-(priority[b.provider]??9)||Number(b.official)-Number(a.official));
        if(!sources.length)return;
        for(let offset=0;offset<sources.length&&!saved;offset+=8) {
          const batch=sources.slice(offset,offset+8);
          try{saved=await this.request('download',{track:{...track,sources:batch},folderSource:folder?.source||null});}
          catch(error){lastError=error;if(/папк|доступ к папке|места|компонент|Android 7/i.test(error.message))throw error;}
          finally{for(const source of batch)attempted.add(source.url);}
        }
      };
      const resolve=async providers=>{
        const results=await Promise.allSettled(providers.map(async provider=>{
          const catalog=!searchProviders.includes(provider);
          const find=async query=>{
            const data=await this.request(catalog?'catalog':'search',{provider,query});
            const candidates=catalog?catalogTracks(provider,data):(provider==='youtubeMusic'?youtubeMusicEntries(data):(data.entries||[])).map(e=>audioCandidate(e,provider)).filter(Boolean);
            return candidates.filter(t=>!isVariant(t.rawTitle||t.title,track.title)&&sameRecording(track,t)).flatMap(t=>t.sources);
          };
          const sources=await find(`${track.artist} ${track.title}`);
          return sources.length?sources:find(track.title);
        }));
        for(const r of results)if(r.status==='fulfilled')sources.push(...r.value);else discoveryError||=r.reason;
      };
      // Prefer independent artist catalogs before waiting for restricted video services.
      if(sources.length)await save();
      if(!saved){await resolve(['audius','bandcamp','muzend','musify','topmusicua','miyzvuk']);await save();}
      if(!saved){await resolve(searchProviders);await save();}
      if(!saved)throw lastError||discoveryError||Error('Не удалось найти доступную полную запись.');
      const added=await this.library.addDownloaded(saved,track);
      this.cache.clear();this.ui.renderSidebar();return added;
    })();
    this.downloads.set(track.id,task);this.progress({id:track.id});
    try{return await task;}finally{this.downloads.delete(track.id);for(const row of document.querySelectorAll('[data-track-id]'))if(row.dataset.trackId===track.id){delete row.dataset.downloading;const btn=row.querySelector('.track-download-btn');if(btn)btn.disabled=false;btn?.setAttribute('aria-label',`Скачать ${track.title}`);}}
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

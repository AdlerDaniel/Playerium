import {normalize,cleanTitle,isVariant} from './music-match.js';
import {lyricsArtist,lyricsTitlesMatch,lyricsQueryArtist,catalogQuery} from './lyrics-catalogs.js';

const MAX_TEXT=100000;
const text=value=>typeof value==='string'?value.replace(/\r\n?/g,'\n').replace(/\0/g,'').trim().slice(0,MAX_TEXT):'';
const artists=lyricsArtist;
const title=value=>normalize(cleanTitle(value).replace(/\s*[([](?:remaster(?:ed)?(?:\s+\d{4})?|\d{4}\s+remaster(?:ed)?)[)\]]/ig,''));
export const lyricsKey=track=>JSON.stringify([artists(track?.artist),title(track?.title),Math.round(Number(track?.duration)||0),normalize(track?.album)]);
export function lyricsMatch(track,candidate){
 if(!candidate||!title(track.title)||!lyricsTitlesMatch(track.title,candidate.title)||artists(track.artist)!==artists(candidate.artist)||isVariant(candidate.title,track.title))return false;
 return !track.duration||!candidate.duration||Math.abs(track.duration-candidate.duration)<=Math.max(3,Math.min(6,track.duration*.015));
}
export function parseLrc(value){
 const lines=[];let offset=Number(String(value||'').match(/\[offset:([+-]?\d+)\]/i)?.[1]||0)/1000;
 for(const row of text(value).split('\n')){
  const stamps=[...row.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
  if(!stamps.length)continue;const content=row.replace(/\[[^\]]*\]/g,'').replace(/<\d+:\d+(?:\.\d+)?>/g,'').trim();
  for(const stamp of stamps)lines.push({time:Math.max(0,Number(stamp[1])*60+Number(stamp[2])+Number('0.'+(stamp[3]||'0'))+offset),text:content});
 }
 return lines.sort((a,b)=>a.time-b.time).slice(0,3000);
}
export function makeLyrics(plain,synced,source,instrumental=false){
 synced=text(synced);const lines=parseLrc(synced);plain=text(plain)||lines.map(line=>line.text).join('\n').trim();
 return plain||lines.length||instrumental?{plain,synced,lines,source,instrumental:!!instrumental}:null;
}
export function fromLrcmux(track,data){
 if(!lyricsMatch(track,{...data?.track,duration:Number(data?.track?.duration)||0})||!Array.isArray(data.lines))return null;
 const rows=data.lines.filter(row=>typeof row.text==='string').slice(0,3000),timed=data.meta?.level!=='none';
 const synced=timed?rows.filter(row=>Number.isFinite(row.start)&&row.start>=0).map(row=>{const seconds=row.start/1000;return '['+String(Math.floor(seconds/60)).padStart(2,'0')+':'+(seconds%60).toFixed(3).padStart(6,'0')+']'+row.text;}).join('\n'):'';
 return makeLyrics(rows.map(row=>row.text).join('\n'),synced,'Lrcmux'+(data.meta?.source?.name?' · '+String(data.meta.source.name).slice(0,80):''),data.meta?.instrumental);
}

export class LyricsService{
 constructor(library,{fetcher=(...args)=>fetch(...args),timeout=5000,spacing=1600,catalogs=null}={}){this.library=library;this.fetcher=fetcher;this.timeout=timeout;this.spacing=spacing;this.catalogs=catalogs;this.pending=new Map();this.cache=new Map();this.backoff=new Map();this.chains=new Map();this.lastRequest=new Map();}
 async request(provider,url){
  if(Date.now()<(this.backoff.get(provider)||0))throw Error('Provider cooling down');
  const task=(this.chains.get(provider)||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(Date.now()<(this.backoff.get(provider)||0))throw Error('Provider cooling down');
   const wait=this.spacing-(Date.now()-(this.lastRequest.get(provider)||0));if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
   this.lastRequest.set(provider,Date.now());const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeout);
   try{
    const response=await this.fetcher(url,{signal:controller.signal,credentials:'omit',headers:{Accept:'application/json'}});
    if([429,503].includes(response.status)){const retry=Number(response.headers.get('Retry-After'));this.backoff.set(provider,Date.now()+Math.max(1000,Math.min(3600000,(Number.isFinite(retry)&&retry>0?retry:60)*1000)));throw Error('Provider unavailable');}
    if(response.status===404)return null;if(!response.ok)throw Error('Provider unavailable');
    const body=await response.text();if(body.length>1024*1024)throw Error('Response too large');return JSON.parse(body);
   }finally{clearTimeout(timer);}
  });this.chains.set(provider,task);return task;
 }
 async lookup(track,{refresh=false}={}){
  if(!track?.title||!track?.artist)return null;
  if(!refresh&&(track.embeddedLyrics||track.embeddedSyncedLyrics))return makeLyrics(track.embeddedLyrics,track.embeddedSyncedLyrics,'Встроенный текст');
  const key=lyricsKey(track);if(this.pending.has(key))return this.pending.get(key);
  const task=(async()=>{
   const cached=this.cache.get(key)||(await this.library.getFromStore?.('settings','lyrics:'+key).catch(()=>null))?.value;
   if(!refresh&&cached&&(cached.data||(cached.sourcesVersion===2&&Date.now()-cached.checkedAt<6*3600000))){this.cache.set(key,cached);return cached.data;}
   if(typeof navigator!=='undefined'&&navigator.onLine===false)return cached?.data||null;
   let result=null,failed=false;
   const searchTitle=catalogQuery(track.title),searchArtist=lyricsQueryArtist(track.artist);
   const query=new URLSearchParams({track_name:searchTitle,artist_name:searchArtist});if(track.album)query.set('album_name',track.album);if(track.duration)query.set('duration',Math.round(track.duration));
   try{
    let record=track.duration&&track.album?await this.request('lrclib','https://lrclib.net/api/get?'+query):null;
    if(!record||!lyricsMatch(track,{title:record.trackName,artist:record.artistName,duration:record.duration})){
     const search=new URLSearchParams({track_name:searchTitle,artist_name:searchArtist});const rows=await this.request('lrclib','https://lrclib.net/api/search?'+search);
     record=Array.isArray(rows)?rows.filter(row=>lyricsMatch(track,{title:row.trackName,artist:row.artistName,duration:row.duration})).sort((a,b)=>Math.abs((a.duration||0)-(track.duration||0))-Math.abs((b.duration||0)-(track.duration||0))||Number(!!b.syncedLyrics)-Number(!!a.syncedLyrics))[0]:null;
    }
    if(record&&lyricsMatch(track,{title:record.trackName,artist:record.artistName,duration:record.duration}))result=makeLyrics(record.plainLyrics,record.syncedLyrics,'LRCLIB',record.instrumental);
   }catch{failed=true;}
   if(!result)try{
    const q=new URLSearchParams({artist:searchArtist,title:searchTitle,format:'json',level:'word'});if(track.album)q.set('album',track.album);if(track.isrc)q.set('isrc',track.isrc);if(track.duration)q.set('duration',Math.round(track.duration));
    result=fromLrcmux(track,await this.request('lrcmux','https://api.lrcmux.dev/get?'+q));
   }catch{failed=true;}
   if(!result)try{const data=await this.request('ovh','https://api.lyrics.ovh/v1/'+encodeURIComponent(searchArtist)+'/'+encodeURIComponent(searchTitle));if(data?.lyrics)result=makeLyrics(data.lyrics,'','Lyrics.ovh');}catch{failed=true;}
   if(!result&&this.catalogs)try{result=await this.catalogs.lookup(track,{refresh});}catch{failed=true;}
   if(result||!failed){const saved={data:result,checkedAt:Date.now(),sourcesVersion:2};this.cache.set(key,saved);await this.library.putInStore?.('settings',{key:'lyrics:'+key,value:saved}).catch(()=>{});}
   return result||cached?.data||null;
  })();this.pending.set(key,task);try{return await task;}finally{this.pending.delete(key);}
 }
}

// Recording identity is independent of the platform that supplies its audio.
export const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const presentation = /\s*[\[(]?(?:official\s+(?:audio|lyric(?:s)?(?:\s+video)?)|audio\s+only|visuali[sz]er|lyrics?|provided to youtube)[\])]?\s*/gi;
const unwanted = /\b(?:cover|karaoke|live|concert|remix|bootleg|mashup|flip|demo|nightcore|sped up|slowed|reaction|instrumental|music video|official video|bts|behind the scenes)\b|кавер|концерт|ремикс|караоке|наживо|кліп|клип/i;
export const cleanTitle = title => String(title || '').replace(presentation,' ').replace(/\s+/g,' ').trim();
export function isVariant(title, query='') {
  const found=String(title).match(unwanted);
  return !!found && !normalize(query).includes(normalize(found[0]));
}
export function artistKey(artist) {
  return normalize(String(artist || '').replace(/\s*-\s*Topic$/i,'').split(/\s+(?:feat\.?|ft\.?|featuring|x)\s+|\s*[,\u0026]\s*/i)[0]);
}
export const songKey = track => `${artistKey(track.artist)}|${normalize(cleanTitle(track.title))}`;
export function sameRecording(a,b) {
  const titleA=normalize(cleanTitle(a.title)),titleB=normalize(cleanTitle(b.title));
  if(!titleA || titleA!==titleB)return false;
  const aa=artistKey(a.artist),bb=artistKey(b.artist);
  if(!aa||!bb||aa!==bb)return false;
  return !a.duration || !b.duration || Math.abs(a.duration-b.duration)<=Math.max(8,a.duration*.04);
}
export function audioCandidate(entry, provider) {
  if(!entry || entry.is_live || entry.was_live)return null;
  let title=entry.track || entry.title || '',artist=entry.artist || entry.artists?.join(' & ') || entry.uploader || entry.channel || '';
  const credited=entry.artist || entry.artists?.join(' & ');
  if(/\s[-–—]\s/.test(title)) {
    const parts=title.split(/\s[-–—]\s/),prefix=parts.shift();
    if(!credited){artist=prefix;title=parts.join(' - ');}
    else if(artistKey(prefix)===artistKey(artist))title=parts.join(' - ');
    else if(provider==='soundcloud')return null;
  }
  // A title written by a repost account is not evidence of the recording's author.
  if(provider==='soundcloud' && artistKey(artist)!==artistKey(entry.uploader))return null;
  if(provider==='soundcloud' && !entry.release_timestamp && !entry.channel_is_verified && !entry.uploader_verified)return null;
  artist=String(artist).replace(/\s*-\s*Topic$/i,'').trim();
  const url=entry.webpage_url || (provider.startsWith('youtube') && /^[\w-]{11}$/.test(entry.id || '') ? `https://www.youtube.com/watch?v=${entry.id}` : entry.url);
  if(!url || !/^https:\/\//.test(url))return null;
  const official=!!credited || !!entry.channel_is_verified || /- Topic$/i.test(entry.uploader || entry.channel || '') || provider==='youtubeMusic' || provider==='bandcamp' || (provider==='soundcloud' && artistKey(artist)===artistKey(entry.uploader));
  if(provider==='youtubeAudio' && (!official || (!/- Topic$/i.test(entry.uploader || entry.channel || '') && !/official audio|audio only|visuali[sz]er|lyrics?/i.test(entry.title||''))))return null;
  return {title:cleanTitle(title),artist,album:entry.album || '',duration:Number(entry.duration)||0,
    year:entry.release_year || (entry.release_timestamp?new Date(entry.release_timestamp*1000).getUTCFullYear():''),trackNo:entry.track_number || 0,genre:entry.genre || entry.genres?.[0] || '',isrc:entry.isrc || '',
    pictureUrl:entry.thumbnail || entry.thumbnails?.at(-1)?.url || null,
    rawTitle:entry.title || title,official,metadataScore:1,sources:[{provider,url,official}],catalog:true};
}
export function mergeSongs(groups, query, local=[]) {
  const tokens=normalize(query).split(' ').filter(Boolean),merged=[];
  for(const raw of groups.flat()) {
    if(!raw?.title||!raw.artist||isVariant(raw.rawTitle||raw.title,query))continue;
    if(raw.duration && (raw.duration<30||raw.duration>1800))continue;
    const text=normalize(`${raw.title} ${raw.artist}`);
    if(tokens.length && tokens.filter(t=>text.includes(t)).length/tokens.length<.65)continue;
    let existing=merged.find(t=>sameRecording(t,raw));
    if(existing) {
      existing.sources=[...new Map([...(existing.sources||[]),...(raw.sources||[])].map(s=>[s.url,s])).values()];
      for(const field of ['album','year','trackNo','genre','isrc','pictureUrl','duration'])if(!existing[field]&&raw[field])existing[field]=raw[field];
      if((raw.metadataScore||0)>(existing.metadataScore||0)){for(const field of ['title','artist','album','year','trackNo','genre','isrc','pictureUrl','duration'])if(raw[field])existing[field]=raw[field];existing.metadataScore=raw.metadataScore;}
      existing.official ||= raw.official;
    }else merged.push({...raw,sources:[...(raw.sources||[])]});
  }
  for(const track of merged) {
    track.sources.sort((a,b)=>Number(b.official)-Number(a.official));
    const saved=local.find(t=>sameRecording(t,track));
    if(saved)Object.assign(track,saved,{catalog:false});
    else {
      let hash=2166136261;for(const c of songKey(track))hash=Math.imul(hash^c.codePointAt(0),16777619);
      track.id=`song_${(hash>>>0).toString(16)}`;
    }
  }
  const result=[...local.filter(t=>!merged.some(m=>m.id===t.id)),...merged];
  const score=t => tokens.reduce((v,k)=>v+(normalize(t.title).includes(k)?3:0)+(normalize(t.artist).includes(k)?4:0),0)+(t.official?2:0)+(t.catalog?0:1);
  return result.sort((a,b)=>score(b)-score(a)).slice(0,60);
}

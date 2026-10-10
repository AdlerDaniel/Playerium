// Recording identity is independent of the platform that supplies its audio.
export const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// Search accepts Cyrillic spelling of artist names stored in Latin script.
// Recording identity stays strict: spelling similarity alone cannot replace audio.
const cyrillic={а:'a',б:'b',в:'v',г:'g',ґ:'g',д:'d',е:'e',ё:'e',є:'ye',ж:'zh',з:'z',и:'i',і:'i',ї:'yi',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const artistAliases=new Map([
  ['лилу45','lely45'],['лілу45','lely45'],['lilu45','lely45'],
  ['виталий козловский','vitaliy kozlovskiy'],['віталій козловський','vitaliy kozlovskiy'],
  ['діти інженерів','dity inzheneriv'],['саша чемеров','sasha chemerov'],
  ['океан ельзи','okean elzy']
].map(([alias,canonical])=>[normalize(alias),normalize(canonical)]));
export const normalizeSearch=value=>{
  let text=normalize(value);for(const [alias,canonical]of artistAliases)text=text.replaceAll(alias,canonical);
  return normalize(text.replace(/[а-яёіїєґ]/gu,c=>cyrillic[c]));
};
const presentation = /\s*[\[(]?(?:official\s+(?:audio|lyric(?:s)?(?:\s+video)?)|audio\s+only|visuali[sz]er|lyric(?:s)?(?:\s+video)?|provided to youtube)[\])]?\s*/gi;
const unwanted = /\b(?:cover|karaoke|concert|remix|bootleg|mashup|flip|demo|nightcore|sped up|slowed|reaction|instrumental|music video|official video|bts|behind the scenes)\b|[\[(]\s*live\b|\blive\s+(?:at|from|in|on|version|performance|session)\b|\blive\s*[\])]|кавер|концерт|ремикс|караоке|наживо|кліп|клип/i;
export const cleanTitle = title => String(title || '').replace(presentation,' ').replace(/\s+/g,' ').trim();
// This label-issued recording uses a localized title across music catalogs.
const recordingTitles=new Map([['the pinballs|blues of shichiten battou',normalize('七転八倒のブルース')]]);
const titleKey=track=>{const title=normalize(cleanTitle(track.title));return recordingTitles.get(`${artistKey(track.artist)}|${title}`)||title;};
const featured=/\s*[\[(]\s*(?:feat\.?|ft\.?|featuring)\s+([^\])]+)[\])]/gi;
const artistsKey=track=>{
  const credits=[String(track.artist||''),...[...String(track.title||'').matchAll(featured)].map(m=>m[1])].join(',');
  return [...new Set(credits.split(/\s+(?:feat\.?|ft\.?|featuring|x)\s+|\s*[,\u0026]\s*/i).map(artistKey).filter(Boolean))].sort().join('|');
};
export function isVariant(title, query='') {
  const found=String(title).match(new RegExp(unwanted.source,'gi'))||[];
  return found.some(word=>!normalize(query).includes(normalize(word)));
}
export function artistKey(artist) {
  const key=normalize(String(artist || '').replace(/\s*-\s*Topic$/i,'').split(/\s+(?:feat\.?|ft\.?|featuring|x)\s+|\s*[,\u0026]\s*/i)[0]);
  return artistAliases.get(key)||key;
}
export const songKey = track => `${artistKey(track.artist)}|${normalize(cleanTitle(track.title))}`;
export function sameRecording(a,b) {
  const titleA=titleKey(a),titleB=titleKey(b),creditsA=artistsKey(a),creditsB=artistsKey(b);
  const sameCredits=!!creditsA&&creditsA===creditsB;
  if(!titleA || (titleA!==titleB&&!(sameCredits&&normalize(cleanTitle(a.title).replace(featured,''))===normalize(cleanTitle(b.title).replace(featured,'')))))return false;
  const aa=artistKey(a.artist),bb=artistKey(b.artist);
  if(!aa||!bb||(aa!==bb&&!sameCredits))return false;
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
  return {title:cleanTitle(title),artist,duration:Number(entry.duration)||0,
    year:entry.release_year || (entry.release_timestamp?new Date(entry.release_timestamp*1000).getUTCFullYear():''),trackNo:entry.track_number || 0,genre:entry.genre || entry.genres?.[0] || '',isrc:entry.isrc || '',
    popularity:Number(entry.view_count)>0?Math.min(1,Math.log10(1+Number(entry.view_count))/10):0,
    pictureUrl:entry.thumbnail || entry.thumbnails?.at(-1)?.url || null,
    rawTitle:entry.title || title,official,metadataScore:1,sources:[{provider,url,official}],catalog:true};
}
export function mergeSongs(groups, query, local=[],allowVariants=false) {
  const tokens=normalizeSearch(query).split(' ').filter(Boolean),merged=[];
  for(const raw of groups.flat()) {
    if(!raw?.title||!raw.artist||(!allowVariants&&isVariant(raw.rawTitle||raw.title,query)))continue;
    if(raw.duration && (raw.duration<30||raw.duration>1800))continue;
    const text=normalizeSearch(`${raw.title} ${raw.artist}`);
    if(tokens.length && tokens.filter(t=>text.includes(t)).length/tokens.length<.65)continue;
    let existing=merged.find(t=>sameRecording(t,raw));
    if(existing) {
      existing.popularity=Math.max(existing.popularity||0,raw.popularity||0);
      existing.contributors=[...new Map([...(existing.contributors||[]),...(raw.contributors||[])].map(a=>[a.id||a.name,a])).values()];
      for(const field of ['deezerArtistId','itunesArtistId'])if(!existing[field]&&raw[field])existing[field]=raw[field];
      const completeArtist=existing.artist.length>=raw.artist.length?existing.artist:raw.artist;
      existing.pictureUrls=[...new Set([...(existing.pictureUrls||[]),existing.pictureUrl,raw.pictureUrl,...(raw.pictureUrls||[])].filter(Boolean))];
      existing.sources=[...new Map([...(existing.sources||[]),...(raw.sources||[])].map(s=>[s.url,s])).values()];
      for(const field of ['year','trackNo','genre','isrc','pictureUrl','duration'])if(!existing[field]&&raw[field])existing[field]=raw[field];
      if((raw.metadataScore||0)>(existing.metadataScore||0)){for(const field of ['title','artist','year','trackNo','genre','isrc','pictureUrl','duration'])if(raw[field])existing[field]=raw[field];existing.metadataScore=raw.metadataScore;}
      existing.artist=completeArtist;
      existing.official ||= raw.official;
    }else merged.push({...raw,pictureUrls:[...new Set([raw.pictureUrl,...(raw.pictureUrls||[])].filter(Boolean))],sources:[...(raw.sources||[])]});
  }
  for(const track of merged) {
    track.sources.sort((a,b)=>Number(b.official)-Number(a.official));
    const saved=local.find(t=>sameRecording(t,track));
    if(saved)Object.assign(track,saved,{catalog:false,popularity:Math.max(track.popularity||0,saved.popularity||0)});
    else {
      let hash=14695981039346656037n;for(const c of songKey(track))hash=BigInt.asUintN(64,(hash^BigInt(c.codePointAt(0)))*1099511628211n);
      track.id=`song_${hash.toString(16)}`;
    }
  }
  const result=[...local.filter(t=>!merged.some(m=>m.id===t.id)),...merged];
  const score=t => tokens.reduce((v,k)=>v+(normalizeSearch(t.title).includes(k)?3:0)+(normalizeSearch(t.artist).includes(k)?4:0),0);
  for(const track of result)delete track.album;
  return result.sort((a,b)=>score(b)-score(a)||(b.popularity||0)-(a.popularity||0)||Number(b.official)-Number(a.official)||Number(a.catalog)-Number(b.catalog)).slice(0,200);
}

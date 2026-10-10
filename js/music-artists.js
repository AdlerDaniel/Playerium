import {normalizeSearch,artistKey} from './music-match.js';

export function artistCredits(track) {
  const featured=[...String(track.title||'').matchAll(/[\[(]\s*(?:feat\.?|ft\.?|featuring)\s+([^\])]+)[\])]/gi)].map(m=>m[1]);
  return [...new Set([...(track.contributors||[]).map(a=>a.name),track.artist,...featured].filter(Boolean).flatMap(name=>String(name).split(/\s+(?:feat\.?|ft\.?|featuring|x)\s+|\s*[,;&]\s*/i)).map(n=>n.trim()).filter(Boolean))];
}
export function belongsToArtist(track,artist) {
  return artistCredits(track).some(name=>artistKey(name)===artistKey(artist.name||artist));
}
export function artistResults(groups,tracks,query) {
  const results=new Map(),tokens=normalizeSearch(query).split(' ').filter(Boolean);
  for(const artist of [...groups.flat(),...tracks.flatMap(t=>artistCredits(t).map(name=>({name,pictureUrl:t.pictureUrl})))]) {
    if(!artist?.name||!tokens.every(t=>normalizeSearch(artist.name).includes(t)))continue;
    const key=artistKey(artist.name),previous=results.get(key);
    if(!previous)results.set(key,{...artist});
    else if(artist.deezerId&&previous.deezerId&&artist.deezerId!==previous.deezerId){if((artist.fans||0)>(previous.fans||0))results.set(key,{...previous,...artist});}
    else for(const [k,v] of Object.entries(artist))if(v&&!previous[k])previous[k]=v;
  }
  return [...results.values()].sort((a,b)=>Number(normalizeSearch(b.name)===normalizeSearch(query))-Number(normalizeSearch(a.name)===normalizeSearch(query))||(b.fans||0)-(a.fans||0)).slice(0,60);
}
export function catalogArtists(provider,data) {
  if(provider==='deezerArtists')return (data?.data||[]).map(a=>({name:a.name,deezerId:a.id,pictureUrl:a.picture_big||a.picture_medium,fans:a.nb_fan||0}));
  if(provider==='itunesArtists')return (data?.results||[]).filter(a=>a.artistName&&a.artistId).map(a=>({name:a.artistName,itunesId:a.artistId}));
  return [];
}
export function popularityScore(track) {
  if(Number.isFinite(track.popularity))return Math.max(0,Math.min(1,track.popularity));
  if(track.rank>0)return Math.min(1,track.rank/1000000);
  if(track.viewCount>0)return Math.min(1,Math.log10(1+track.viewCount)/10);
  return 0;
}

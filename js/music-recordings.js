import {normalizeSearch} from './music-match.js';
// Confirmed recording pages supplement live searches; page-backed sources are
// resolved at download time so expiring player addresses are never cached here.
const recordings=[
 {title:'Blues of Shichiten Battou',artist:'THE PINBALLS',duration:190,official:true,sources:[{provider:'youtubeMusic',url:'https://www.youtube.com/watch?v=Z2Sc1X_v5wY',official:true}]},
 {title:'Give Me Everything (feat. Nayer)',artist:'Pitbull, AFROJACK, Ne-Yo, Nayer',duration:253,official:true,sources:[{provider:'youtubeMusic',url:'https://www.youtube.com/watch?v=KVuMAM80PIA',official:true}]},
 {title:'Jessica - Single Version',artist:'Schmalgauzen',duration:203.3,official:false,sources:[{provider:'hitmusic',url:'https://hit.music2019.su/track/3158',official:false}]}
];
export function recordingSources(query){
 const tokens=normalizeSearch(query).split(' ').filter(Boolean);
 if(!tokens.length)return [];
 return recordings.filter(track=>{const text=normalizeSearch(`${track.artist} ${track.title}`);return tokens.every(token=>text.includes(token));}).map(track=>({...track,catalog:true,metadataScore:2,sources:track.sources.map(source=>({...source}))}));
}

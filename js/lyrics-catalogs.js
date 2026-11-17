import {normalize,normalizeSearch,cleanTitle,isVariant} from './music-match.js';

const aliases=new Map([
 ['maks barskikh','max barskih'],['maks barskih','max barskih'],['max barskikh','max barskih'],['max barskykh','max barskih'],['maks barskykh','max barskih'],
 ['dorofyeyeva','dorofeeva'],['dorofeyeva','dorofeeva']
]);
const artistName=value=>{const key=normalizeSearch(value);return aliases.get(key)||key;};
export function lyricsArtist(value){
 value=String(value||'').replace(/\s*\(([^)]+)\)/g,(whole,alternative,offset,source)=>artistName(source.slice(0,offset))===artistName(alternative)?'':whole);
 return [...new Set(value.split(/\s*[,;&]\s*|\s+(?:feat\.?|ft\.?|featuring)\s+/i).map(artistName).filter(Boolean))].sort().join('|');
}
const language=value=>String(value||'').match(/(?:\s|[([])(ua|uk|ukrainian|українською|ru|russian|русская версия)[)\]]?$/i)?.[1]?.toLowerCase();
const withoutLanguage=value=>String(value||'').replace(/(?:\s+|\s*[([])(?:ua|uk|ukrainian|українською|ru|russian|русская версия)[)\]]?$/i,'').trim();
export const lyricsTitle=value=>normalize(cleanTitle(withoutLanguage(value)).replace(/\s*[([](?:remaster(?:ed)?(?:\s+\d{4})?|\d{4}\s+remaster(?:ed)?)[)\]]/ig,'')).replace(/і/g,'i');
export const catalogQuery=value=>withoutLanguage(value).replace(/([А-Яа-яЁёІіЇїЄєҐґ])i/g,'$1і').replace(/i(?=[А-Яа-яЁёІіЇїЄєҐґ])/g,'і').slice(0,200);
function sameTitle(a,b){
 const la=language(a),lb=language(b),group=l=>l&&(/^(ua|uk|ukrainian|українською)$/.test(l)?'uk':'ru');
 return lyricsTitle(a)===lyricsTitle(b)&&(!la||!lb||group(la)===group(lb))&&!isVariant(a,b)&&!isVariant(b,a);
}
export {sameTitle as lyricsTitlesMatch};
export const lyricsQueryArtist=value=>{
 const key=lyricsArtist(value);return key==='max barskih'?'Max Barskih':key==='dorofeeva'?'DOROFEEVA':value;
};
function sameTrack(track,candidate){return lyricsArtist(track.artist)===lyricsArtist(candidate.artist)&&sameTitle(track.title,candidate.title);}
function documentFor(html){
 if(typeof html!=='string'||html.length>1024*1024)throw Error('Invalid lyrics page');
 const template=document.createElement('template');template.innerHTML=html;const parsed=template.content;
 // Template content is inert, including its images. Remove advertising content
 // before extracting text; only literal text is passed to the lyrics player.
 parsed.querySelectorAll('iframe,script:not([type="application/ld+json"]),style,noscript,ins,[class*=google-],[class*=adsbygoogle]').forEach(node=>node.remove());
 return parsed;
}
const label=value=>String(value||'').replace(/^Текст пісні\s+/i,'').replace(/\s+текст пісні$/i,'').trim();
function splitLabel(value){const m=label(value).match(/^(.*?)\s+[-–—]\s+(.+)$/);return m?{artist:m[1],title:m[2]}:null;}
function sourcePath(provider,href){
 try{const origin=provider==='pisni'?'https://pisni.in.ua':'https://tekst-pisni.com',url=new URL(href,origin);
  if(url.origin!==origin||url.username||url.password||url.search||url.hash)return null;
  const pattern=provider==='pisni'?/^\/[a-z0-9][a-z0-9-]{0,99}\/[a-z0-9][a-z0-9-]{0,199}\/?$/:/^\/[a-z0-9][a-z0-9-]{0,239}\/$/;
  return pattern.test(url.pathname)?url.pathname:null;
 }catch{return null;}
}
export function catalogCandidates(provider,html,track){
 const document=documentFor(html),candidates=new Map();
 for(const link of document.querySelectorAll('a[href]')){
  const path=sourcePath(provider,link.getAttribute('href'));if(!path)continue;
  let score=0;
  if(provider==='tekst'){
   const candidate=splitLabel(link.textContent);if(!candidate||!sameTrack(track,candidate))continue;score=3;
  }else{
   const name=lyricsTitle(link.textContent),title=lyricsTitle(track.title);
   if(!name.startsWith(title+' ')&&name!==title)continue;
   const artist=path.split('/')[1].replace(/-/g,' ');score=lyricsArtist(artist)===lyricsArtist(track.artist)?3:1;
  }
  if(!candidates.has(path))candidates.set(path,{path,score});
 }
 return [...candidates.values()].sort((a,b)=>b.score-a.score).slice(0,3).map(item=>item.path);
}
function visibleText(node){
 if(!node)return '';const copy=node.cloneNode(true);copy.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));copy.querySelectorAll('p,div').forEach(block=>block.append('\n'));
 return copy.textContent.replace(/\u00a0/g,' ').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,100000);
}
export function parseCatalogLyrics(provider,html,track,path){
 if(!sourcePath(provider,path))return null;
 const document=documentFor(html);let candidate,plain;
 if(provider==='pisni'){
  const records=[];
  for(const script of document.querySelectorAll('script[type="application/ld+json"]'))try{const data=JSON.parse(script.textContent);records.push(...(Array.isArray(data)?data:data['@graph']||[data]));}catch{}
  const record=records.find(item=>item['@type']==='MusicRecording');if(!record)return null;
  const artists=Array.isArray(record.byArtist)?record.byArtist:[record.byArtist];candidate={title:record.name,artist:artists.map(item=>typeof item==='string'?item:item?.name||'').join(' & ')};
  plain=record.recordingOf?.lyrics?.text||record.lyrics?.text;
 }else{
  candidate=splitLabel(document.querySelector('h1')?.textContent);
  const main=document.querySelector('.lyrics main');
  if(main){
   const paragraphs=[];for(const child of main.children){if(child.tagName==='H2')break;if(child.tagName==='P')paragraphs.push(visibleText(child));}
   plain=paragraphs.join('\n\n');
  }else plain=visibleText(document.querySelector('main .lyrics'));
 }
 if(!candidate||!sameTrack(track,candidate)||typeof plain!=='string'||plain.trim().length<40||plain.length>100000)return null;
 const requestedLanguage=language(track.title),hasUkrainian=/[іїєґ]/i.test(plain),hasRussian=/[ыэъё]/i.test(plain);
 if(requestedLanguage&&(/^(ua|uk|ukrainian|українською)$/.test(requestedLanguage)?hasRussian&&!hasUkrainian:hasUkrainian&&!hasRussian))return null;
 return {plain:plain.trim(),synced:'',lines:[],source:provider==='pisni'?'Pisni.in.ua':'Tekst-pisni.com',sourceUrl:(provider==='pisni'?'https://pisni.in.ua':'https://tekst-pisni.com')+path,instrumental:false};
}

export class LyricsCatalogs{
 constructor(pageRequest,{spacing=3100}={}){this.pageRequest=pageRequest;this.spacing=spacing;this.chain=Promise.resolve();this.lastRequest=0;this.cooldown=0;this.pages=new Map();}
 page(provider,payload){
  const key=JSON.stringify([provider,payload]),cached=this.pages.get(key);if(cached&&Date.now()-cached.time<300000)return cached.task;
  const task=this.chain.catch(()=>{}).then(async()=>{
   if(Date.now()<this.cooldown)throw Error('Lyrics catalogs cooling down');
   const wait=this.spacing-(Date.now()-this.lastRequest);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
   if(Date.now()<this.cooldown)throw Error('Lyrics catalogs cooling down');
   this.lastRequest=Date.now();const response=await this.pageRequest({provider,...payload});
   if([429,503].includes(response.status)){const retry=Number(response.retryAfter);this.cooldown=Date.now()+Math.max(1000,Math.min(3600000,(retry>0?retry:60)*1000));throw Error('Lyrics catalogs unavailable');}
   if(response.status===404)return '';if(response.status!==200)throw Error('Lyrics catalog unavailable');
   return response.html;
  });
  this.chain=task;this.pages.set(key,{task,time:Date.now()});task.catch(()=>this.pages.delete(key));
  // Bound the short-lived page cache, independently of the persisted lyrics.
  if(this.pages.size>30)this.pages.delete(this.pages.keys().next().value);
  return task;
 }
 async lookup(track,{refresh=false}={}){
  if(refresh)this.pages.clear();
  let failed=false;
  for(const provider of ['pisni','tekst']){
   try{
    const html=await this.page(provider,{query:catalogQuery(track.title)});
    for(const path of catalogCandidates(provider,html,track)){
     const data=parseCatalogLyrics(provider,await this.page(provider,{path}),track,path);if(data)return data;
    }
   }catch{failed=true;}
  }
  if(failed)throw Error('Lyrics catalogs temporarily unavailable');return null;
 }
}

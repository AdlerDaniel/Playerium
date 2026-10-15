import {enabled} from './visual-features.js';
// Bound retained artwork size before saving it for the entire library.
export async function resizeArtwork(blob) {
  if (!blob || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return blob;
  let image;
  try {
    image = await createImageBitmap(blob);
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.94 });
  } catch { return blob; }
  finally { image?.close(); }
}

// Reuse decoded nodes during a view refresh instead of showing a second skeleton.
const retained=new Map();let retainedCount=0,releaseScheduled=false;
export function retainArtwork(root){
 if(!releaseScheduled){releaseScheduled=true;Promise.resolve().then(()=>{retained.clear();retainedCount=0;releaseScheduled=false;});}
 for(const host of root?.querySelectorAll('[data-cover-identity]')||[]){const image=host.querySelector('img'),key=host.dataset.coverIdentity;if(!key||!image?.complete||!image.naturalWidth)continue;image.onload=image.onerror=null;const images=retained.get(key)||[];if(!images.includes(image)){images.push(image);retained.set(key,images);retainedCount++;}}
 while(retainedCount>160){const key=retained.keys().next().value;retainedCount-=retained.get(key).length;retained.delete(key);}
}

// Keep the displayed bitmap until its replacement has decoded successfully.
export function mountCover(host, track, eager=false) {
  if(!host)return;
  const urls=[...new Set([track.pictureUrl,...(track.pictureUrls||[])].filter(url=>typeof url==='string'&&/^(https:\/\/|blob:|data:image\/)/i.test(url)))];
   const trackKey=track.id||track.artist||track.title||'';const identity=urls.length?urls.join('|'):'placeholder:'+(track.artist||track.title||'');if(host.dataset.coverIdentity===identity&&(host.querySelector('img')||host.classList.contains('cover-placeholder')&&host.childElementCount)){host.dataset.coverTrackKey=trackKey;return;}
  const sameTrack=!host.dataset.coverTrackKey||host.dataset.coverTrackKey===trackKey;
  const previous=sameTrack?host.querySelector('img'):null;
  host.dataset.coverTrackKey=trackKey;host.dataset.coverIdentity=identity;const generation=(host.coverGeneration||0)+1;host.coverGeneration=generation;
  const current=()=>host.coverGeneration===generation;
   const fallback=()=>{if(!current())return;host.classList.remove('cover-loading');host.replaceChildren();host.classList.add('cover-placeholder');if(enabled(11)&&(track.artist||track.title)){const name=track.artist||track.title;let hash=0;for(const c of name)hash=(hash*31+c.charCodeAt(0))|0;host.style.setProperty('--placeholder-hue',String(Math.abs(hash)%360));const letters=document.createElement('span');letters.className='cover-initials';letters.textContent=name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toLocaleUpperCase();host.append(letters);}else host.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>';};
  if(!urls.length){if(previous){host.classList.remove('cover-loading');return;}fallback();return;}
  const saved=retained.get(identity);if(saved?.length){const image=saved.shift();retainedCount--;if(!saved.length)retained.delete(identity);host.replaceChildren(image);host.classList.remove('cover-loading','cover-placeholder');return;}
  host.classList.remove('cover-placeholder');
  if(!previous)host.classList.add('cover-loading');else host.classList.remove('cover-loading');
  const image=document.createElement('img');image.alt='';image.loading=eager?'eager':'lazy';image.decoding='async';image.referrerPolicy='no-referrer';
  let index=0;image.onerror=()=>{if(!current())return;if(++index<urls.length)image.src=urls[index];else if(previous)host.classList.remove('cover-loading');else fallback();};
  image.onload=async()=>{const source=image.src;try{await image.decode?.();}catch{}if(current()&&image.src===source){host.replaceChildren(image);host.classList.remove('cover-loading','cover-placeholder');}};
  if(previous)image.loading='eager';image.src=urls[0];if(!previous)host.replaceChildren(image);
}

// Bound retained artwork size before saving it for the entire library.
export async function resizeArtwork(blob) {
  if (!blob || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return blob;
  let image;
  try {
    image = await createImageBitmap(blob);
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } catch { return blob; }
  finally { image?.close(); }
}

// Covers are independent of audio: try merged catalog URLs, then a neutral icon.
export function mountCover(host, track, eager=false) {
  const urls=[...new Set([track.pictureUrl,...(track.pictureUrls||[])].filter(url=>typeof url==='string'&&/^(https:\/\/|blob:|data:image\/)/i.test(url)))];
  const fallback=()=>{host.replaceChildren();host.classList.add('cover-placeholder');host.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>';};
  if(!urls.length){fallback();return;}
  host.classList.remove('cover-placeholder');
  const image=document.createElement('img');image.alt='';image.loading=eager?'eager':'lazy';image.decoding='async';image.referrerPolicy='no-referrer';
  let index=0;image.addEventListener('error',()=>{if(++index<urls.length)image.src=urls[index];else fallback();});
  image.src=urls[0];host.replaceChildren(image);
}

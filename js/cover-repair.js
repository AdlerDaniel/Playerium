import {sameRecording, isVariant, artistKey} from './music-match.js';
import {resizeArtwork, mountCover} from './artwork.js';

export function verifiedCover(track, candidate) {
  return candidate?.official && sameRecording(track, candidate) && !isVariant(candidate.title, track.title) &&
    /^https:\/\/(?:[^/]+\.)?(?:mzstatic\.com|dzcdn\.net)\//i.test(candidate.pictureUrl || '');
}

// Preserve the recording/version; an unmatched image is never installed.
export function installCoverRepair(music, catalogTracks) {
  const pending = new Map();
  music.repairCover = async track => {
    if (!music.available || !track?.id || !music.library.getTrackById || typeof createImageBitmap !== 'function' || track.pictureBlob || track.catalog || Date.now() - (track.coverCheckedAt || 0) < 86400000) return;
    if (pending.has(track.id)) return pending.get(track.id);
    const job = (async () => {
      let received = false, matched = false, failed = false;
      for (const provider of ['itunesUA','itunes','deezer']) {
        try {
          const response = await music.request('catalog',{provider,query:`${artistKey(track.artist)} ${track.title}`});
          received = true;
          const candidates = catalogTracks(provider,response).filter(t=>verifiedCover(track,t));
          matched ||= candidates.length > 0;
          for (const candidate of candidates) {
            try {
              const image = await music.request('artwork',{url:candidate.pictureUrl});
              const blob = new Blob([Uint8Array.from(atob(image.base64),c=>c.charCodeAt(0))],{type:image.type});
              if (!blob.size || blob.size > 4 * 1024 * 1024) continue;
              const bitmap = await createImageBitmap(blob);
              const valid = bitmap.width >= 32 && bitmap.height >= 32; bitmap.close();
              if (!valid || music.library.getTrackById(track.id) !== track || track.pictureBlob) continue;
              track.pictureBlob = await resizeArtwork(blob);
              track.pictureUrl = music.library.coverURL(track.id,track.pictureBlob);
              track.coverCheckedAt = Date.now();
              track.pictureSource = {provider,url:candidate.pictureUrl,title:candidate.title,artist:candidate.artist,duration:candidate.duration,isrc:candidate.isrc||'',verifiedAt:Date.now()};
              await music.library.putInStore('tracks',{...track,pictureUrl:null});
              for(const row of document.querySelectorAll('[data-track-id]')) if(row.dataset.trackId===track.id) {
                const host=row.querySelector('.track-mini-thumb');if(host)mountCover(host,track);
              }
              if(music.ui.player.currentTrack?.id===track.id)music.ui.player.onTrackChange?.(track);
              return true;
            } catch { failed=true; }
          }
        } catch { failed=true; }
      }
      if(received && !matched && !failed && music.library.getTrackById(track.id) === track) {
        track.coverCheckedAt=Date.now();await music.library.putInStore('tracks',{...track,pictureUrl:null});
      }
      return false;
    })();
    pending.set(track.id,job);
    try{return await job;}finally{pending.delete(track.id);}
  };
  let queue = null, rerun = false;
  music.repairCovers = () => {
    if(!music.available)return Promise.resolve();
    rerun=true;
    if(queue)return queue;
    queue=(async()=>{
      do {
        rerun=false;
        const tracks=music.library.getTracks().filter(t=>!t.pictureBlob&&!t.catalog);
        // A small sequential queue avoids flooding catalogs on large imports.
        for(const track of tracks) await music.repairCover(track).catch(()=>{});
      } while(rerun);
    })().finally(()=>{queue=null;});
    return queue;
  };
}

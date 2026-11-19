import {trackRange,trackVolume} from './track-edits.js';

const dispose = deck => {
 deck.audio.pause();
 deck.audio.removeAttribute('src');
 deck.audio.load();
 deck.source?.disconnect();
 deck.gain?.disconnect();
 if(deck.url?.startsWith('blob:'))URL.revokeObjectURL(deck.url);
};

/** Prepares a second deck and promotes it without restarting its audio. */
export class Crossfade {
 constructor(player){this.player=player;this.deck=null;this.interval=null;}

 watch(){
  const p=this.player;
  const needed=!p.nativePlayback&&!p.audio.paused&&(p.crossfadeSeconds>0||p.currentTrack?.userEdits?.trim);
  if(!needed&&this.interval){clearInterval(this.interval);this.interval=null;}
  if(needed&&!this.interval)this.interval=setInterval(()=>this.tick(),40);
 }

 cancel(){
  if(!this.deck)return;
  const deck=this.deck;this.deck=null;dispose(deck);this.player.applyTrackVolume();
 }

 async prepare(entry){
  const p=this.player;
  const audio=new Audio();audio.preload='auto';audio.crossOrigin='anonymous';
  const deck={audio,track:entry.track,failed:false,started:false};this.deck=deck;
  try{
   if(p.audioCtx&&p.isWebAudioInitialized){
    deck.gain=p.audioCtx.createGain();deck.gain.gain.value=0;
    deck.source=p.audioCtx.createMediaElementSource(audio);deck.source.connect(deck.gain);deck.gain.connect(p.audioCtx.destination);
   }else audio.volume=0;
   const url=await p.resolveAudioURL(entry.track);
   if(this.deck!==deck){if(url.startsWith('blob:'))URL.revokeObjectURL(url);return;}
   deck.url=url;
   audio.addEventListener('error',()=>this.fail(deck));
   audio.src=url;
   const trim=trackRange(entry.track);
   if(trim.start)audio.currentTime=trim.start;
  }catch{this.fail(deck);}
 }

 fail(deck){
  if(deck!==this.deck)return;
  deck.failed=true;dispose(deck);this.player.applyTrackVolume();
 }

 gains(){
  const deck=this.deck;
  if(!deck?.started||deck.failed)return 1;
  const p=this.player;
  const elapsed=deck.audio.currentTime-deck.startTime;
  const progress=Math.max(0,Math.min(1,elapsed/deck.seconds));
  const incoming=p.volume*trackVolume(deck.track)*progress;
  if(deck.gain)deck.gain.gain.value=incoming;
  else deck.audio.volume=Math.min(1,incoming);
  return 1-progress;
 }

 finish(){
  const p=this.player,deck=this.deck,next=p.getNextQueueEntry();
  if(!deck?.started||deck.failed||p.repeatMode==='one'||next?.track!==deck.track||deck.audio.paused||deck.audio.ended)return false;
  const old={audio:p.audio,source:p.sourceNode,gain:p.gainNode,url:p.sourceUrl};
  this.deck=null;
  p.audio=deck.audio;p.sourceNode=deck.source||null;p.gainNode=deck.gain||null;p.sourceUrl=deck.url;
  p.currentTrack=deck.track;p.queueIndex=next.index;
  p.setupAudioEvents();p.applyTrackVolume();dispose(old);
  p.updateMediaSessionMetadata(deck.track);p.failedTracks.clear();
  p.onTrackChange?.(deck.track);p.onQueueChange?.(p.queue,p.queueIndex);p.publishWebTime();
  return true;
 }

 tick(){
  const p=this.player;
  if(p.nativePlayback||p.audio.paused||p.audio.ended||p.pendingTrack||!p.currentTrack||p.audio.seeking)return;
  const range=p.webRange(),left=range.end-p.audio.currentTime;
  if(!range.duration)return;
  if(left<=0){p.handleTrackEnded();return;}
  const next=p.repeatMode==='one'?null:p.getNextQueueEntry();
  if(!p.crossfadeSeconds||!next||next.index===p.queueIndex||next.track.catalog){this.cancel();return;}
  if(this.deck&&this.deck.track!==next.track)this.cancel();
  if(left>p.crossfadeSeconds+3&&!this.deck?.started)return;
  if(!this.deck){this.prepare(next);return;}
  const deck=this.deck;
  if(deck.failed)return;
  if(deck.started){
   p.applyTrackVolume();
   if(deck.audio.currentTime-deck.startTime>=deck.seconds)this.finish();
   return;
  }
  if(deck.starting||deck.audio.readyState<3||deck.audio.seeking)return;
  const duration=trackRange(deck.track,deck.audio.duration).duration;
  if(duration<=.15||left>Math.min(p.crossfadeSeconds,duration*.5))return;
  deck.starting=true;deck.startTime=deck.audio.currentTime;deck.seconds=left;
  deck.audio.play().then(()=>{if(this.deck===deck){deck.started=true;p.applyTrackVolume();}}).catch(()=>this.fail(deck));
 }
}

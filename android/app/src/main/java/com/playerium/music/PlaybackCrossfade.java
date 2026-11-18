package com.playerium.music;

import android.os.Handler;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import java.util.Objects;

/** Keeps the MediaSession player authoritative while a second decoder mixes in the next song. */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class PlaybackCrossfade {
 interface DeckFactory { ExoPlayer create(MediaItem item); }

 private final ExoPlayer main;
 private final Handler handler;
 private final DeckFactory factory;
 private final Runnable clock=this::tick;
 private ExoPlayer incoming;
 private MediaItem nextItem;
 private int fromIndex=C.INDEX_UNSET, nextIndex=C.INDEX_UNSET;
 private long overlap, incomingStart;
 private boolean started, handingOff, failed;
 private int seconds;
 private float volume=.8f;

 PlaybackCrossfade(ExoPlayer main,Handler handler,DeckFactory factory){
  this.main=main;this.handler=handler;this.factory=factory;
 }

 int seconds(){return seconds;}
 float volume(){return volume;}

 void configure(int seconds){
  int value=Math.max(0,Math.min(10,seconds));
  if(this.seconds!=value){this.seconds=value;cancel();}
  wake();
 }

 void setVolume(double value){
  volume=(float)Math.max(0,Math.min(1,value));applyVolume();
 }

 void wake(){
  handler.removeCallbacks(clock);
  if(seconds>0&&main.getPlayWhenReady())handler.post(clock);
 }

 void cancel(){
  clearDeck();failed=false;fromIndex=C.INDEX_UNSET;main.setVolume(volume);
 }

 void release(){handler.removeCallbacks(clock);clearDeck();}

 private void clearDeck(){
  if(incoming!=null){incoming.release();incoming=null;}
  nextItem=null;nextIndex=C.INDEX_UNSET;started=false;handingOff=false;
 }

 void discontinuity(Player.PositionInfo old,Player.PositionInfo next,int reason){
  if(handingOff&&next.mediaItemIndex==nextIndex&&(old.mediaItemIndex==fromIndex||old.mediaItemIndex==nextIndex))return;
  if(reason==Player.DISCONTINUITY_REASON_AUTO_TRANSITION&&started&&next.mediaItemIndex==nextIndex&&incoming.isPlaying()){
   // Media3 can advance on its own before the last mixing tick runs.
   handOff();return;
  }
  cancel();wake();
 }

 private void handOff(){
  handingOff=true;applyVolume();
  handler.post(()->{
   if(!handingOff)return;
   main.seekTo(nextIndex,incoming.getCurrentPosition());
   wake();
  });
 }

 private void applyVolume(){
  if(incoming==null||!started){main.setVolume(volume);return;}
  float fraction=handingOff?1f:(float)Math.max(0,Math.min(1,(incoming.getCurrentPosition()-incomingStart)/(double)overlap));
  main.setVolume(volume*(1-fraction));incoming.setVolume(volume*fraction);
 }

 private void fail(){clearDeck();failed=true;main.setVolume(volume);}

 private void tick(){
  if(seconds<=0||!main.getPlayWhenReady())return;
  if(main.getPlaybackSuppressionReason()!=Player.PLAYBACK_SUPPRESSION_REASON_NONE){cancel();handler.postDelayed(clock,200);return;}
  if(handingOff){
   if(main.isPlaying()||incoming==null||incoming.getPlaybackState()==Player.STATE_ENDED){cancel();wake();}
   else handler.postDelayed(clock,30);
   return;
  }
  int current=main.getCurrentMediaItemIndex(),next=main.getNextMediaItemIndex();
  if(current!=fromIndex){cancel();fromIndex=current;}
  if(next==C.INDEX_UNSET||next==current||main.getRepeatMode()==Player.REPEAT_MODE_ONE){cancel();return;}
  MediaItem item=main.getMediaItemAt(next);
  if(incoming!=null&&(next!=nextIndex||!item.mediaId.equals(nextItem.mediaId)||!Objects.equals(item.localConfiguration,nextItem.localConfiguration)))cancel();
  long duration=main.getDuration();
  long left=duration==C.TIME_UNSET?Long.MAX_VALUE:duration-main.getCurrentPosition();
  if(!main.isPlaying()){
   if(started){fail();}
  }else if(!failed&&left>0&&left<=seconds*1000L+5500){
   if(incoming==null){
    try{incoming=factory.create(item);nextItem=item;nextIndex=next;fromIndex=current;}
    catch(RuntimeException error){fail();}
   }else if(incoming.getPlayerError()!=null||incoming.getPlaybackState()==Player.STATE_ENDED)fail();
   else if(!started&&incoming.getPlaybackState()==Player.STATE_READY){
    long nextDuration=incoming.getDuration();
    if(nextDuration>300&&left<=Math.min(seconds*1000L,nextDuration/2)){
     overlap=left;incomingStart=incoming.getCurrentPosition();started=true;incoming.play();
    }
   }else if(started){
    applyVolume();
    if(left<=65&&incoming.isPlaying())handOff();
   }
  }
  handler.postDelayed(clock,started?30:Math.min(220,Math.max(35,left-seconds*1000L)));
 }
}

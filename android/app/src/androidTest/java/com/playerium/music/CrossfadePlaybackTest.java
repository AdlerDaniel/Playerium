package com.playerium.music;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CrossfadePlaybackTest {
 private static Object field(Class<?> type,Object instance,String name)throws Exception{
  Field field=type.getDeclaredField(name);field.setAccessible(true);return field.get(instance);
 }

 @Test public void mixesClippedFilesInBackgroundAndKeepsTheIncomingPosition()throws Exception{
  Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
  File file=File.createTempFile("crossfade-fixture-",".wav",MusicEngine.managedDirectory(context));
  int rate=8000,frames=rate*9;ByteBuffer wav=ByteBuffer.allocate(44+frames*2).order(ByteOrder.LITTLE_ENDIAN);
  wav.put("RIFF".getBytes()).putInt(wav.capacity()-8).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(rate).putInt(rate*2).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(frames*2);
  for(int i=0;i<frames;i++)wav.putShort(i<rate||i>=8*rate?(short)0:(short)(Math.sin(i*2*Math.PI*440/rate)*5500));
  try(FileOutputStream output=new FileOutputStream(file)){output.write(wav.array());}
  // A previous test's disposable files must not resume on activity startup.
  var prefs=context.getSharedPreferences("playerium_playback",Context.MODE_PRIVATE);
  prefs.edit().remove("queue").commit();
  MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  try{
   String uri=Uri.fromFile(file).toString();JSONObject first=new JSONObject().put("id","crossfade-first").put("title","First").put("uri",uri).put("trimStart",1000).put("trimEnd",7500);
   java.lang.reflect.Method execute=MusicEngine.class.getDeclaredMethod("execute",String.class,JSONObject.class,String.class);execute.setAccessible(true);
   JSONObject bounds=(JSONObject)execute.invoke(MusicEngine.get(context),"trimSilence",new JSONObject().put("uri",uri),"trim-test");
   assertEquals(1,bounds.getDouble("start"),.025);assertEquals(8,bounds.getDouble("end"),.025);assertEquals(9,bounds.getDouble("duration"),.01);
   JSONObject second=new JSONObject(first.toString()).put("id","crossfade-second").put("title","Second");
   JSONObject queue=new JSONObject().put("tracks",new JSONArray().put(first).put(second)).put("index",0).put("position",0).put("play",true).put("reset",true).put("crossfade",2).put("volume",.56);
   MediaNotificationService.submitQueue(context,queue.toString());
   long deadline=System.currentTimeMillis()+18000;boolean mixed=false,background=false;JSONObject state=new JSONObject();
   while(System.currentTimeMillis()<deadline){
    state=new JSONObject(MediaNotificationService.currentState());
    if("crossfade-first".equals(state.optString("id"))&&state.optBoolean("playing")){
     assertEquals(6500,state.optLong("duration"));
     if(!background){instrumentation.runOnMainSync(()->activity.moveTaskToBack(true));background=true;}
     if(!mixed){
      AtomicBoolean both=new AtomicBoolean();
      instrumentation.runOnMainSync(()->{try{
       Object service=field(MediaNotificationService.class,null,"instance");
       Object fade=field(MediaNotificationService.class,service,"crossfade");
       ExoPlayer outgoing=(ExoPlayer)field(MediaNotificationService.class,service,"player"),incoming=(ExoPlayer)field(PlaybackCrossfade.class,fade,"incoming");
       both.set(incoming!=null&&incoming.isPlaying()&&outgoing.isPlaying()&&incoming.getVolume()>.04f&&outgoing.getVolume()>.04f&&Math.abs(incoming.getVolume()+outgoing.getVolume()-.56f)<.01f);
      }catch(Exception error){throw new AssertionError(error);}});
      mixed=both.get();
     }
    }
    if("crossfade-second".equals(state.optString("id"))&&state.optBoolean("playing"))break;
    Thread.sleep(50);
   }
   assertTrue("Both decoded tracks should overlap with a balanced volume. Last state: "+state,mixed);
   assertEquals("crossfade-second",state.optString("id"));assertTrue(state.toString(),state.optBoolean("playing"));
   assertTrue(state.toString(),state.optLong("position")>=1100);assertEquals(.56,state.optDouble("volume"),.001);
  }finally{
   context.stopService(new Intent(context,MediaNotificationService.class));
   instrumentation.runOnMainSync(activity::finish);file.delete();
  }
 }
}

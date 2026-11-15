package com.playerium.music;

import android.content.*;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.nio.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class StoragePlaybackTest {
 private String js(android.app.Instrumentation ins,WebView web,String code)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> out=new AtomicReference<>();ins.runOnMainSync(()->web.evaluateJavascript(code,value->{out.set(value);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return out.get();}
 private WebView web(MainActivity a)throws Exception{java.lang.reflect.Field f=MainActivity.class.getDeclaredField("webView");f.setAccessible(true);return(WebView)f.get(a);}
 private void ready(android.app.Instrumentation ins,WebView web)throws Exception{long end=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<end){if("true".equals(js(ins,web,"!!(window.playerApp&&window.playerApp.ui&&window.playerApp.ui.experience)")))return;Thread.sleep(100);}throw new AssertionError("App did not initialize");}
 @Test public void opaqueSafDocumentsInSubfoldersPlayAndRemainReadableAfterActivityReopens()throws Exception{
  android.app.Instrumentation ins=InstrumentationRegistry.getInstrumentation();Context c=ins.getTargetContext();
  int rate=8000,n=rate*30;ByteBuffer wav=ByteBuffer.allocate(44+n*2).order(ByteOrder.LITTLE_ENDIAN);wav.put("RIFF".getBytes()).putInt(wav.capacity()-8).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(rate).putInt(rate*2).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(n*2);for(int i=0;i<n;i++)wav.putShort((short)(Math.sin(i*2*Math.PI*440/rate)*1000));
  Bundle input=new Bundle();input.putByteArray("bytes",wav.array());input.putString("package",c.getPackageName());Bundle fixture;
  fixture=c.getContentResolver().call(Uri.parse("content://com.playerium.music.test-documents"),"treeFixture",null,input);
  Uri tree=Uri.parse(fixture.getString("tree")),deep=Uri.parse(fixture.getString("deep"));c.getContentResolver().takePersistableUriPermission(tree,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
  assertTrue(MainActivity.hasMusicPermission(c,deep));assertTrue(c.getContentResolver().openInputStream(deep).read()>=0);
  MainActivity activity=(MainActivity)ins.startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  try{
   WebView web=web(activity);ready(ins,web);java.lang.reflect.Method scan=MainActivity.class.getDeclaredMethod("scanFolderAndSend",Uri.class,boolean.class);scan.setAccessible(true);scan.invoke(activity,tree,true);
   String root=JSONObject.quote(tree.toString()),leaf=JSONObject.quote(deep.toString());long end=System.currentTimeMillis()+20000;
   String count="window.playerApp.library.getTracks().filter(t=>t.folderSource==="+root+").length";
   while(System.currentTimeMillis()<end&&!"3".equals(js(ins,web,count)))Thread.sleep(100);assertEquals("Nested tracks were not imported","3",js(ins,web,count));
   js(ins,web,"(()=>{const a=window.playerApp,t=a.library.getTracks().find(t=>t.nativeUri==="+leaf+");a.player.playTrack(t,0,[t]);return t.id;})()");
   end=System.currentTimeMillis()+15000;JSONObject state=null;while(System.currentTimeMillis()<end){state=new JSONObject(MediaNotificationService.currentState());if(state.optBoolean("playing")&&state.optLong("position")>200)break;Thread.sleep(100);}assertNotNull(state);assertTrue(state.toString(),state.optBoolean("playing"));assertEquals("",state.optString("error"));assertTrue(state.optLong("position")>200);
   js(ins,web,"(()=>{const a=window.playerApp;a.ui.lyrics.lookup=async()=>({plain:'First line\\nSecond line',synced:'[00:00]First line\\n[00:10]Second line',lines:[{time:0,text:'First line'},{time:10,text:'Second line'}],source:'Test'});a.ui.experience.openCinema();return true;})()");
   end=System.currentTimeMillis()+5000;while(System.currentTimeMillis()<end&&!"2".equals(js(ins,web,"document.querySelectorAll('.lyric-line').length")))Thread.sleep(50);assertEquals("2",js(ins,web,"document.querySelectorAll('.lyric-line').length"));
    String bounds=js(ins,web,"(()=>{const r=document.querySelector('.lyrics-layout').getBoundingClientRect();return JSON.stringify({width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,root:document.querySelector('.lyrics-player').getBoundingClientRect().toJSON()});})()");
    assertEquals(bounds,"true",js(ins,web,"(()=>{const r=document.querySelector('.lyrics-layout').getBoundingClientRect();return Math.abs(r.width-innerWidth)<=1&&Math.abs(r.height-innerHeight)<=1&&Math.abs(r.top)<=1&&Math.abs(r.left)<=1;})()"));
   js(ins,web,"document.querySelector('.lyrics-close-slot button').click()");
   MainActivity old=activity;ins.runOnMainSync(old::finish);activity=(MainActivity)ins.startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));web=web(activity);ready(ins,web);assertTrue(MainActivity.hasMusicPermission(c,deep));assertEquals("3",js(ins,web,count));
  }finally{MainActivity last=activity;ins.runOnMainSync(last::finish);c.stopService(new Intent(c,MediaNotificationService.class));}
 }
}

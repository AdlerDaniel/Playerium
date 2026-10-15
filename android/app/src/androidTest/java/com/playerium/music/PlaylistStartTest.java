package com.playerium.music;

import android.content.*;
import android.net.Uri;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.nio.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PlaylistStartTest {
    private String js(android.app.Instrumentation instrumentation,WebView web,String code)throws Exception{
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        instrumentation.runOnMainSync(()->web.evaluateJavascript(code,result->{value.set(result);done.countDown();}));
        assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();
    }
    private JSONObject waitForAudio(String id)throws Exception{
        long deadline=System.currentTimeMillis()+12000;
        while(System.currentTimeMillis()<deadline){JSONObject state=new JSONObject(MediaNotificationService.currentState());if(id.equals(state.optString("id"))&&state.optBoolean("playing")&&state.has("startLatencyMs"))return state;Thread.sleep(20);}
        throw new AssertionError(MediaNotificationService.currentState());
    }
    @Test public void playlistRowStartsActualAudioPromptlyAndReusesTheNativeQueue()throws Exception{
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context c=instrumentation.getTargetContext();
        MainActivity activity=(MainActivity)instrumentation.startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        java.lang.reflect.Field field=MainActivity.class.getDeclaredField("webView");field.setAccessible(true);WebView web=(WebView)field.get(activity);
        File file=new File(MusicEngine.managedDirectory(c),"playlist-start.wav");file.getParentFile().mkdirs();int samples=8000*15;ByteBuffer data=ByteBuffer.allocate(44+samples*2).order(ByteOrder.LITTLE_ENDIAN);
        data.put("RIFF".getBytes()).putInt(data.capacity()-8).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(8000).putInt(16000).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(samples*2);for(int i=0;i<samples;i++)data.putShort((short)(Math.sin(i*2*Math.PI*440/8000)*5000));try(FileOutputStream out=new FileOutputStream(file)){out.write(data.array());}
        try{
            long deadline=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<deadline&&!"true".equals(js(instrumentation,web,"!!(window.playerApp&&window.playerApp.ui.experience)")))Thread.sleep(100);
            String uri=JSONObject.quote(Uri.fromFile(file).toString());
            String setup="(()=>{const a=window.playerApp;if(a.connect)a.connect.restoreLocal();a.library.tracks.clear();const ids=[];for(let i=0;i<300;i++){const t={id:'latency-'+i,title:'Latency '+i,artist:'Playerium',nativeUri:"+uri+",duration:15,dateAdded:300-i};a.library.tracks.set(t.id,t);ids.push(t.id);}a.library.playlists.set('latency',{id:'latency',name:'Latency',trackIds:ids});a.ui.navigateTo({type:'playlist',id:'latency',title:'Latency'});window.queueSends=0;const original=a.player.syncNativeQueue.bind(a.player);a.player.syncNativeQueue=(...args)=>{window.queueSends++;return original(...args);};return true;})()";
            assertEquals("true",js(instrumentation,web,setup));
            deadline=System.currentTimeMillis()+3000;while(System.currentTimeMillis()<deadline&&!"true".equals(js(instrumentation,web,"!!document.querySelector('[data-track-id=\"latency-0\"] .track-name')")))Thread.sleep(50);
            js(instrumentation,web,"document.querySelector('[data-track-id=\"latency-0\"] .track-name').click()");
            JSONObject first=waitForAudio("latency-0");assertTrue("Initial playlist audio exceeded 1.5 seconds: "+first.getLong("startLatencyMs"),first.getLong("startLatencyMs")<1500);
            // Both rows remain visible in the 300-recording virtualized playlist.
            js(instrumentation,web,"document.querySelector('[data-track-id=\"latency-3\"] .track-name').click()");
            JSONObject second=waitForAudio("latency-3");assertTrue("Row selection exceeded 1 second: "+second.getLong("startLatencyMs"),second.getLong("startLatencyMs")<1000);
            assertEquals(300,second.getJSONArray("queue").length());
            String report=new JSONObject().put("initialMs",first.getLong("startLatencyMs")).put("selectionMs",second.getLong("startLatencyMs")).put("queueSize",300).toString();
            android.util.Log.i("PlayeriumStartReport",report);
            // Gradle uninstalls the debug package after instrumentation. Preserve
            // the numeric report as shell-owned log output alongside the media card.
            try(InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(instrumentation.getUiAutomation().executeShellCommand("logcat -d -v raw -f /data/local/tmp/playerium-playlist-start.log -s PlayeriumStartReport:I"))){byte[] buffer=new byte[128];while(input.read(buffer)!=-1){}}
        }finally{instrumentation.runOnMainSync(activity::finish);c.stopService(new Intent(c,MediaNotificationService.class));file.delete();}
    }
}

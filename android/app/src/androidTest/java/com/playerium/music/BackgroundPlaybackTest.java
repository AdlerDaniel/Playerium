package com.playerium.music;

import android.content.Context;
import android.content.ComponentName;
import android.content.Intent;
import android.app.NotificationManager;
import android.os.Build;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class BackgroundPlaybackTest {
    private JSONObject waitFor(boolean playing) throws Exception {
        long end=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<end){JSONObject state=new JSONObject(MediaNotificationService.currentState());
            if("background-fixture".equals(state.optString("id"))&&state.optBoolean("playing")==playing)return state;
            Thread.sleep(100);
        }
        throw new AssertionError(MediaNotificationService.currentState());
    }
    @Test public void systemMediaControlsWorkAfterActivityCloses() throws Exception {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        Context context=instrumentation.getTargetContext();
        Intent launch=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        android.app.Activity activity=instrumentation.startActivitySync(launch);
        File directory=MusicEngine.managedDirectory(context);assertTrue(directory.exists()||directory.mkdirs());
        File file=new File(directory,"background-fixture.wav");
        int rate=8000,samples=rate*90;
        ByteBuffer data=ByteBuffer.allocate(44+samples*2).order(ByteOrder.LITTLE_ENDIAN);
        data.put("RIFF".getBytes()).putInt(data.capacity()-8).put("WAVEfmt ".getBytes()).putInt(16)
            .putShort((short)1).putShort((short)1).putInt(rate).putInt(rate*2).putShort((short)2).putShort((short)16)
            .put("data".getBytes()).putInt(samples*2);
        for(int i=0;i<samples;i++)data.putShort((short)(Math.sin(i*2*Math.PI*440/rate)*500));
        try(FileOutputStream output=new FileOutputStream(file)){output.write(data.array());}
        MediaController controller=null;
        try {
            JSONObject track=new JSONObject().put("id","background-fixture").put("uri",android.net.Uri.fromFile(file).toString()).put("title","Background test").put("artist","Playerium");
            String queue=new JSONObject().put("tracks",new JSONArray().put(track)).put("play",true).put("reset",true).toString();
            instrumentation.runOnMainSync(()->MediaNotificationService.submitQueue(context,queue));
            waitFor(true);
            controller=new MediaController.Builder(context,new SessionToken(context,new ComponentName(context,MediaNotificationService.class))).buildAsync().get(15,TimeUnit.SECONDS);
            final MediaController controls=controller;
            instrumentation.runOnMainSync(activity::finish);
            Thread.sleep(2000);long position=waitFor(true).getLong("position");
            if(Build.VERSION.SDK_INT>=23){NotificationManager notifications=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);assertTrue(notifications.getActiveNotifications().length>0);}
            instrumentation.runOnMainSync(controls::pause);waitFor(false);
            instrumentation.runOnMainSync(controls::play);waitFor(true);
            Thread.sleep(1500);assertTrue(waitFor(true).getLong("position")>position);
        }finally{
            if(controller!=null){final MediaController controls=controller;instrumentation.runOnMainSync(()->{controls.stop();controls.clearMediaItems();controls.release();});}
            context.stopService(new Intent(context,MediaNotificationService.class));
            file.delete();
        }
    }
}

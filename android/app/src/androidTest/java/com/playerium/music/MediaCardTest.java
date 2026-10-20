package com.playerium.music;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.Before;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
@androidx.test.filters.SdkSuppress(minSdkVersion=23)
public class MediaCardTest {
    @Before public void grantPlaybackPermissions() throws Exception {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        Context context=instrumentation.getTargetContext();
        if(Build.VERSION.SDK_INT>=33){
            instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),android.Manifest.permission.POST_NOTIFICATIONS);
            instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),android.Manifest.permission.READ_MEDIA_AUDIO);
            assertTrue("Media-card verification needs the normal granted notification permission",((NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled());
        }else instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),android.Manifest.permission.READ_EXTERNAL_STORAGE);
    }
    @Test public void reopeningTheActivityRestoresThePlayingTrackWithoutRestartingIt() throws Exception {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        Context context=instrumentation.getTargetContext();
        android.app.Activity first=instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        File file=fixture(context,40);
        android.app.Activity reopened=null;
        try {
            String queue=new JSONObject().put("tracks",new JSONArray().put(new JSONObject()
                .put("id","ui-restoration-fixture").put("uri",android.net.Uri.fromFile(file).toString())
                .put("title","Restored playing track").put("artist","Playerium verification")))
                .put("play",true).put("reset",true).toString();
            instrumentation.runOnMainSync(()->MediaNotificationService.submitQueue(context,queue));
            waitFor("ui-restoration-fixture",true,15000);foregroundCard(context);
            instrumentation.runOnMainSync(first::finish);
            instrumentation.runOnMainSync(()->context.startService(new Intent(context,MediaNotificationService.class).putExtra("command","seek").putExtra("value",7000d)));
            Thread.sleep(500);
            reopened=instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            final android.app.Activity target=reopened;
            long end=System.currentTimeMillis()+15000;boolean restored=false;
            do {
                java.util.concurrent.CountDownLatch done=new java.util.concurrent.CountDownLatch(1);
                java.util.concurrent.atomic.AtomicReference<String> result=new java.util.concurrent.atomic.AtomicReference<>();
                instrumentation.runOnMainSync(()->{
                    android.view.ViewGroup content=target.findViewById(android.R.id.content);
                    ((android.webkit.WebView)content.getChildAt(0)).evaluateJavascript(
                        "!!(window.playerApp && playerApp.player.currentTrack && document.getElementById('mobileMiniTitle').textContent === 'Restored playing track' && !document.getElementById('mobileMiniPlayer').classList.contains('hidden') && playerApp.player.getCurrentTime() >= 7)",
                        value->{result.set(value);done.countDown();});
                });
                assertTrue(done.await(5,TimeUnit.SECONDS));restored="true".equals(result.get());
                if(!restored)Thread.sleep(200);
            } while(!restored&&System.currentTimeMillis()<end);
            assertTrue("Reopened WebView must display the native playing track and current position",restored);
            assertSame("Closing an old Activity must not detach the replacement bridge",target,MainActivity.getInstance());
            JSONObject state=waitFor("ui-restoration-fixture",true,1000);assertTrue(state.optLong("position")>=7000);
        } finally {
            instrumentation.runOnMainSync(()->context.startService(new Intent(context,MediaNotificationService.class).putExtra("command","stop")));
            context.stopService(new Intent(context,MediaNotificationService.class));file.delete();
            if(reopened!=null){final android.app.Activity target=reopened;instrumentation.runOnMainSync(target::finish);}
            instrumentation.runOnMainSync(first::finish);
        }
    }
    @Test public void changedArtworkHasANewPrivateUriAndInvalidImagesCannotReplaceIt() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.net.Uri previous=null;
        for(int color:new int[]{Color.RED,Color.BLUE}){
            Bitmap bitmap=Bitmap.createBitmap(1024,1024,Bitmap.Config.ARGB_8888);bitmap.eraseColor(color);
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes);bitmap.recycle();
            android.net.Uri saved=PlaybackArtwork.save(context,"../cache-version-fixture",bytes.toByteArray());assertNotNull(saved);
            assertTrue(new File(saved.getPath()).getCanonicalPath().startsWith(context.getNoBackupFilesDir().getCanonicalPath()+File.separator));
            if(previous!=null)assertNotEquals(previous,saved);
            Bitmap decoded=android.graphics.BitmapFactory.decodeFile(saved.getPath());assertTrue(decoded.getWidth()<=512);decoded.recycle();previous=saved;
        }
        assertNull(PlaybackArtwork.save(context,"../cache-version-fixture",new byte[]{1,2,3}));
        assertEquals(previous,PlaybackArtwork.find(context,"../cache-version-fixture"));
    }
    private static void assertCover(Context context,MediaController controls,String title,int color)throws Exception{
        long deadline=System.currentTimeMillis()+10000;
        while(System.currentTimeMillis()<deadline){
            MediaMetadata metadata=controls.getMetadata();Bitmap bitmap=artwork(metadata);
            if(metadata!=null&&title.equals(metadata.getString(MediaMetadata.METADATA_KEY_TITLE))&&bitmap!=null){
                int actual=bitmap.getPixel(0,0);
                if(matchesColor(actual,color)){
                    NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
                    for(StatusBarNotification posted:manager.getActiveNotifications()){
                        Notification notification=posted.getNotification();
                        if(!title.equals(String.valueOf(notification.extras.getCharSequence(Notification.EXTRA_TITLE)))||notification.getLargeIcon()==null)continue;
                        android.graphics.drawable.Drawable icon=notification.getLargeIcon().loadDrawable(context);if(icon==null)continue;
                        Bitmap rendered=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888);icon.setBounds(0,0,32,32);icon.draw(new Canvas(rendered));
                        int postedColor=rendered.getPixel(16,16);rendered.recycle();if(matchesColor(postedColor,color))return;
                    }
                }
            }
            Thread.sleep(50);
        }
        throw new AssertionError("System artwork did not follow "+title);
    }
    private static boolean matchesColor(int actual,int expected){
        return Math.abs(Color.red(actual)-Color.red(expected))<12&&Math.abs(Color.green(actual)-Color.green(expected))<12&&Math.abs(Color.blue(actual)-Color.blue(expected))<12;
    }
    @Test public void shuffledNextAndCoverlessTransitionsFollowTheCurrentMediaItem()throws Exception{
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
        android.app.Activity activity=instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        File file=fixture(context,30);String prefix="cover-order-"+java.util.UUID.randomUUID();JSONArray tracks=new JSONArray();
        try{
            for(int i=0;i<3;i++){
                String id=prefix+i;
                if(i<2){
                    Bitmap image=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888);image.eraseColor(i==0?Color.RED:Color.BLUE);
                    java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();image.compress(Bitmap.CompressFormat.PNG,100,bytes);image.recycle();
                    assertNotNull(PlaybackArtwork.save(context,id,bytes.toByteArray()));
                }
                tracks.put(new JSONObject().put("id",id).put("uri",android.net.Uri.fromFile(file).toString()).put("title","Cover order "+i).put("artist","Fixture"));
            }
            String queue=new JSONObject().put("tracks",tracks).put("play",true).put("reset",true).put("shuffle",true).put("playbackOrder",new JSONArray("[0,2,1]")).toString();
            instrumentation.runOnMainSync(()->MediaNotificationService.submitQueue(context,queue));waitFor(prefix+0,true,15000);
            Notification card=foregroundCard(context);MediaController controls=new MediaController(context,(MediaSession.Token)card.extras.getParcelable(Notification.EXTRA_MEDIA_SESSION));
            assertCover(context,controls,"Cover order 0",Color.RED);
            JSONObject state=new JSONObject(MediaNotificationService.currentState());assertEquals("[0,2,1]",state.getJSONArray("playbackOrder").toString());
            controls.getTransportControls().skipToNext();waitFor(prefix+2,true,10000);
            assertCover(context,controls,"Cover order 2",Color.rgb(32,32,32));
            controls.getTransportControls().skipToNext();waitFor(prefix+1,true,10000);assertCover(context,controls,"Cover order 1",Color.BLUE);
            controls.getTransportControls().seekTo(0);Thread.sleep(200);
            controls.getTransportControls().skipToPrevious();waitFor(prefix+2,true,10000);assertCover(context,controls,"Cover order 2",Color.rgb(32,32,32));
            // A cover arriving after the coverless item started replaces its placeholder.
            Bitmap late=Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888);late.eraseColor(Color.GREEN);
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();late.compress(Bitmap.CompressFormat.PNG,100,bytes);late.recycle();
            assertNotNull(PlaybackArtwork.save(context,prefix+2,bytes.toByteArray()));MediaNotificationService.artworkChanged(prefix+2);
            assertCover(context,controls,"Cover order 2",Color.GREEN);
        }finally{
            context.stopService(new Intent(context,MediaNotificationService.class));file.delete();instrumentation.runOnMainSync(activity::finish);
        }
    }
    private static Bitmap artwork(MediaMetadata metadata){
        if(metadata==null)return null;
        Bitmap art=metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if(art==null)art=metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if(art==null)art=metadata.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        return art;
    }
    private static File fixture(Context context,int seconds) throws Exception {
        File directory=MusicEngine.managedDirectory(context);assertTrue(directory.exists()||directory.mkdirs());
        File file=new File(directory,"background-media-card.wav");int rate=8000,samples=rate*seconds;
        ByteBuffer b=ByteBuffer.allocate(44+samples*2).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes()).putInt(b.capacity()-8).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1)
            .putInt(rate).putInt(rate*2).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(samples*2);
        for(int i=0;i<samples;i++)b.putShort((short)(Math.sin(i*2*Math.PI*440/rate)*600));
        try(FileOutputStream out=new FileOutputStream(file)){out.write(b.array());}return file;
    }
    private static Notification foregroundCard(Context context) throws Exception {
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        long end=System.currentTimeMillis()+10000;
        do{
            for(StatusBarNotification active:manager.getActiveNotifications()){
                Notification n=active.getNotification();
                if(n.extras.getParcelable(Notification.EXTRA_MEDIA_SESSION)!=null&&(n.flags&Notification.FLAG_FOREGROUND_SERVICE)!=0)return n;
            }
            Thread.sleep(100);
        }while(System.currentTimeMillis()<end);
        throw new AssertionError("Native playback must publish a foreground media card before any external controller connects");
    }
    private static JSONObject waitFor(String id,boolean playing,long timeout) throws Exception {
        long end=System.currentTimeMillis()+timeout;
        do{JSONObject state=new JSONObject(MediaNotificationService.currentState());
            if(id.equals(state.optString("id"))&&state.optBoolean("playing")==playing)return state;
            Thread.sleep(100);
        }while(System.currentTimeMillis()<end);
        throw new AssertionError(MediaNotificationService.currentState());
    }
    private static void shell(android.app.Instrumentation instrumentation,String command) throws Exception {
        try(android.os.ParcelFileDescriptor stream=instrumentation.getUiAutomation().executeShellCommand(command)){
            try(java.io.InputStream in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(stream)){byte[] b=new byte[1024];while(in.read(b)!=-1){}}
        }
    }
    @Test public void nativeMediaCardAndAutomaticTransitionsSurviveClosedUiAndScreenOff() throws Exception {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
        android.app.Activity activity=instrumentation.startActivitySync(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        int seconds=Build.VERSION.SDK_INT==29?110:12;
        File file=fixture(context,seconds);JSONArray tracks=new JSONArray();
        for(int i=0;i<3;i++){
            Bitmap bitmap=Bitmap.createBitmap(256,256,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(bitmap);
            canvas.drawColor(new int[]{Color.rgb(25,110,80),Color.rgb(100,35,80),Color.rgb(30,70,130)}[i]);
            Paint paint=new Paint();paint.setColor(Color.WHITE);paint.setTextSize(100);canvas.drawText(Integer.toString(i+1),95,165,paint);
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes);bitmap.recycle();
            assertNotNull(PlaybackArtwork.save(context,"media-card-"+i,bytes.toByteArray()));
            tracks.put(new JSONObject().put("id","media-card-"+i).put("uri",android.net.Uri.fromFile(file).toString())
                .put("title","Background track "+(i+1)).put("artist","Playerium verification"));
        }
        MediaController controls=null;
        try{
            String queue=new JSONObject().put("tracks",tracks).put("play",true).put("reset",true).toString();
            instrumentation.runOnMainSync(()->MediaNotificationService.submitQueue(context,queue));waitFor("media-card-0",true,15000);
            // This is intentionally BEFORE constructing a controller: that connection used to hide the lifecycle bug.
            Notification card=foregroundCard(context);
            controls=new MediaController(context,(MediaSession.Token)card.extras.getParcelable(Notification.EXTRA_MEDIA_SESSION));
            long artEnd=System.currentTimeMillis()+10000;
            while(System.currentTimeMillis()<artEnd&&artwork(controls.getMetadata())==null)Thread.sleep(100);
            MediaMetadata metadata=controls.getMetadata();assertNotNull(metadata);
            assertEquals("Background track 1",metadata.getString(MediaMetadata.METADATA_KEY_TITLE));
            assertEquals("Playerium verification",metadata.getString(MediaMetadata.METADATA_KEY_ARTIST));
            Bitmap artwork=artwork(metadata);
            assertNotNull("System media metadata must contain an actual cover bitmap",artwork);
            assertTrue(metadata.getLong(MediaMetadata.METADATA_KEY_DURATION)>0);
            PlaybackState state=controls.getPlaybackState();assertNotNull(state);
            assertTrue((state.getActions()&PlaybackState.ACTION_SEEK_TO)!=0);assertTrue(state.getCustomActions().size()>=2);
            controls.getTransportControls().pause();waitFor("media-card-0",false,10000);
            controls.getTransportControls().play();waitFor("media-card-0",true,10000);
            controls.getTransportControls().sendCustomAction("playerium.SHUFFLE",android.os.Bundle.EMPTY);
            long toggleEnd=System.currentTimeMillis()+10000;
            while(!new JSONObject(MediaNotificationService.currentState()).optBoolean("shuffle")&&System.currentTimeMillis()<toggleEnd)Thread.sleep(100);
            assertTrue(new JSONObject(MediaNotificationService.currentState()).optBoolean("shuffle"));
            controls.getTransportControls().sendCustomAction("playerium.SHUFFLE",android.os.Bundle.EMPTY);
            Thread.sleep(300);
            controls.getTransportControls().seekTo(0);
            shell(instrumentation,"cmd statusbar expand-notifications");Thread.sleep(1000);
            // UTP uninstalls the app before Gradle returns; preserve evidence outside app storage.
            shell(instrumentation,"screencap -p /data/local/tmp/playerium-media-card.png");
            shell(instrumentation,"cmd statusbar collapse");
            instrumentation.runOnMainSync(activity::finish);
            shell(instrumentation,"input keyevent KEYCODE_SLEEP");
            controls=null;
            waitFor("media-card-1",true,TimeUnit.SECONDS.toMillis(seconds+20));foregroundCard(context);
            waitFor("media-card-2",true,TimeUnit.SECONDS.toMillis(seconds+20));foregroundCard(context);
            if(Build.VERSION.SDK_INT==29){
                long end=System.currentTimeMillis()+TimeUnit.SECONDS.toMillis(seconds+10);
                while(System.currentTimeMillis()<end){JSONObject current=new JSONObject(MediaNotificationService.currentState());
                    assertEquals("media-card-2",current.optString("id"));assertTrue("Music stopped while the screen was off",current.optBoolean("playing"));
                    if(current.optLong("position")>100000)break;Thread.sleep(1000);
                }
                assertTrue(new JSONObject(MediaNotificationService.currentState()).optLong("position")>100000);
            }
        }finally{
            shell(instrumentation,"input keyevent KEYCODE_WAKEUP");
            instrumentation.runOnMainSync(()->context.startService(new Intent(context,MediaNotificationService.class).putExtra("command","stop")));
            context.stopService(new Intent(context,MediaNotificationService.class));file.delete();
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}

package com.playerium.music;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.*;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class MusicRuntimeTest {
    @Test public void nativeToolsRunAndOwnedAudioCanBeSavedAndDeleted() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        MusicEngine engine=MusicEngine.get(context);
        Method run=MusicEngine.class.getDeclaredMethod("run",java.util.List.class,String.class,long.class);run.setAccessible(true);
        String version=(String)run.invoke(engine,Arrays.asList("--version"),"runtime-test",60000L);
        assertTrue(version.matches("\\d{4}\\.\\d{2}\\.\\d{2}.*"));
        File nativeDir=new File(context.getApplicationInfo().nativeLibraryDir);
        File runtime=new File(context.getNoBackupFilesDir(),"music-runtime-0.18.1-2026.08.19");
        File fixture=new File(context.getCacheDir(),"native-music-test.m4a");
        ProcessBuilder builder=new ProcessBuilder(new File(nativeDir,"libffmpeg.so").getAbsolutePath(),"-y","-f","lavfi","-i","sine=frequency=440:duration=1","-metadata","title=Test recording","-metadata","artist=Playerium","-c:a","aac",fixture.getAbsolutePath());
        builder.environment().put("LD_LIBRARY_PATH",new File(runtime,"python/usr/lib")+":"+new File(runtime,"ffmpeg/usr/lib"));
        builder.redirectErrorStream(true);Process process=builder.start();ByteArrayOutputStream log=new ByteArrayOutputStream();byte[] bytes=new byte[4096];int n;while((n=process.getInputStream().read(bytes))!=-1)log.write(bytes,0,n);
        assertTrue(process.waitFor(60,TimeUnit.SECONDS));assertEquals(new String(log.toByteArray(),StandardCharsets.UTF_8),0,process.exitValue());assertTrue(fixture.length()>1000);
        Method publish=MusicEngine.class.getDeclaredMethod("publish",File.class,File.class,JSONObject.class,String.class,String.class);publish.setAccessible(true);
        JSONObject metadata=new JSONObject().put("title","Test recording").put("artist","Playerium").put("album","Test album").put("duration",1);
        JSONObject record=(JSONObject)publish.invoke(engine,fixture,null,metadata,"","song_abcd1234");
        File owned=new File(android.net.Uri.parse(record.getString("uri")).getPath());assertTrue(owned.exists());
        android.media.MediaMetadataRetriever reader=new android.media.MediaMetadataRetriever();reader.setDataSource(owned.getAbsolutePath());assertEquals("Test recording",reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_TITLE));reader.release();
        Method delete=MusicEngine.class.getDeclaredMethod("deleteOwned",JSONObject.class);delete.setAccessible(true);delete.invoke(engine,record);assertFalse(owned.exists());fixture.delete();
    }
}

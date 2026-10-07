package com.playerium.music;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class MusicRuntimeTest {
    @Test public void muzendAcceptsOnlyPublicAudioFiles() throws Exception {
        Method validate=MusicEngine.class.getDeclaredMethod("source",String.class);validate.setAccessible(true);
        String audio="https://muzend.net/uploads/music/2026/08/Dorofeeva_747.mp3";
        assertEquals(audio,validate.invoke(null,audio));
        for(String url:new String[]{"https://muzend.net/song.html","https://muzend.net/uploads/music/a.mp3?url=https://localhost","https://muzend.net.evil.test/uploads/music/a.mp3"}) {
            try{validate.invoke(null,url);fail("Unexpected source accepted");}catch(java.lang.reflect.InvocationTargetException error){assertTrue(error.getCause() instanceof SecurityException);}
        }
    }
    @Test public void downloadErrorsDistinguishProtectionAndNetworkFailures() throws Exception {
        Method diagnostic=MusicEngine.class.getDeclaredMethod("downloadError",Exception.class);diagnostic.setAccessible(true);
        String protectedMessage=(String)diagnostic.invoke(null,new IOException("This video is DRM protected"));
        assertTrue(protectedMessage.contains("защищена"));
        assertEquals(protectedMessage,diagnostic.invoke(null,new IOException(protectedMessage)));
        assertTrue(((String)diagnostic.invoke(null,new IOException("Read timed out"))).contains("соединиться"));
    }
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
        File picture=new File(context.getCacheDir(),"test-cover.png");try(InputStream in=context.getAssets().open("assets/icon.png");OutputStream out=new FileOutputStream(picture)){while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}
        String audioUrl=android.net.Uri.fromFile(fixture).toString();
        JSONObject info=new JSONObject().put("id","fixture").put("title","Saved recording").put("artist","Playerium").put("album","Test album").put("meta_title","Saved recording").put("meta_artist","Playerium").put("duration",1).put("ext","m4a").put("url",audioUrl).put("extractor","generic").put("extractor_key","Generic")
            .put("formats",new JSONArray().put(new JSONObject().put("format_id","audio").put("url",audioUrl).put("ext","m4a").put("acodec","aac").put("protocol","file")))
            .put("thumbnails",new JSONArray().put(new JSONObject().put("id","cover").put("url",android.net.Uri.fromFile(picture))));
        File description=new File(context.getCacheDir(),"test-recording.json");try(OutputStream out=new FileOutputStream(description)){out.write(info.toString().getBytes(StandardCharsets.UTF_8));}
        String output=(String)run.invoke(engine,Arrays.asList("--load-info-json",description.getAbsolutePath(),"--enable-file-urls","-f","bestaudio[ext=m4a]/bestaudio/best","--no-playlist","--quiet","--no-progress","-x","--audio-format","m4a","--embed-metadata","--embed-thumbnail","--convert-thumbnails","jpg","--write-thumbnail","-o",new File(context.getCacheDir(),"processed-test.%(ext)s").getAbsolutePath(),"--print","after_move:filepath"),"pipeline-test",60000L);
        String[] lines=output.split("\\r?\\n");File processed=new File(lines[lines.length-1]);assertTrue(processed.length()>1000);
        Method publish=MusicEngine.class.getDeclaredMethod("publish",File.class,File.class,JSONObject.class,String.class,String.class);publish.setAccessible(true);
        JSONObject metadata=new JSONObject().put("title","Saved recording").put("artist","Playerium").put("album","Test album").put("duration",1);
        JSONObject record=(JSONObject)publish.invoke(engine,processed,null,metadata,"","song_abcd1234");
        File owned=new File(android.net.Uri.parse(record.getString("uri")).getPath());assertTrue(owned.exists());
        android.media.MediaMetadataRetriever reader=new android.media.MediaMetadataRetriever();reader.setDataSource(owned.getAbsolutePath());assertEquals("Saved recording",reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_TITLE));assertEquals("Test album",reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM));assertTrue(reader.getEmbeddedPicture().length>0);reader.release();
        Method delete=MusicEngine.class.getDeclaredMethod("deleteOwned",JSONObject.class);delete.setAccessible(true);delete.invoke(engine,record);assertFalse(owned.exists());fixture.delete();processed.delete();description.delete();picture.delete();
    }
}

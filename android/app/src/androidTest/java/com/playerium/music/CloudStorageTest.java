package com.playerium.music;

import android.content.Context;
import android.net.Uri;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.lang.reflect.Method;
import java.lang.reflect.InvocationTargetException;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CloudStorageTest {
    @Test public void queuedAudioRevisionIsPrivateImmutableAndUsesTheContentHash()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);File original=new File(MusicEngine.managedDirectory(context),"snapshot-source.mp3");original.getParentFile().mkdirs();File snapshot=null;
        String logical=String.format(java.util.Locale.ROOT,"%064x",1),content=OriginalNormalization.hash(new java.io.ByteArrayInputStream("song".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        try{
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(original)){out.write("song".getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            JSONObject operation=new JSONObject().put("id",java.util.UUID.randomUUID().toString()).put("key",logical).put("track",new JSONObject().put("ext",".mp3").put("audioKey",content));
            Method method=GoogleCloud.class.getDeclaredMethod("snapshot",JSONObject.class,java.io.InputStream.class);method.setAccessible(true);String uri=(String)method.invoke(cloud,operation,new java.io.FileInputStream(original));snapshot=new File(Uri.parse(uri).getPath());
            assertTrue(snapshot.getCanonicalPath().startsWith(context.getNoBackupFilesDir().getCanonicalPath()+File.separator));assertFalse(MainActivity.hasMusicPermission(context,Uri.parse(uri)));
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(original)){out.write("changed".getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            JSONObject info=(JSONObject)request("fingerprint",new JSONObject().put("source",uri));assertEquals(content,info.getString("key"));assertEquals(4,info.getInt("size"));assertFalse(logical.equals(info.getString("key")));
        }finally{original.delete();if(snapshot!=null)snapshot.delete();}
    }
    private Object request(String operation,JSONObject payload)throws Exception{Method method=GoogleCloud.class.getDeclaredMethod("request",String.class,JSONObject.class);method.setAccessible(true);try{return method.invoke(GoogleCloud.get(ApplicationProvider.getApplicationContext()),operation,payload);}catch(InvocationTargetException e){throw (Exception)e.getCause();}}
    @Test public void stagedMusicIsPrivateBoundedAndFingerprintMatchesAcrossPlatforms()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();JSONObject session=(JSONObject)request("stage",new JSONObject().put("ext",".mp3").put("size",4));
        try{request("stageChunk",new JSONObject().put("id",session.getString("id")).put("offset",1).put("base64","c29uZw=="));fail("Invalid offset accepted");}catch(java.io.IOException expected){}
        request("stageChunk",new JSONObject().put("id",session.getString("id")).put("offset",0).put("base64","c29uZw=="));JSONObject saved=(JSONObject)request("stageComplete",session);File file=new File(Uri.parse(saved.getString("source")).getPath());
        try{assertTrue(MainActivity.hasMusicPermission(context,Uri.fromFile(file)));assertTrue(new File(file.getParentFile(),".nomedia").isFile());JSONObject info=(JSONObject)request("fingerprint",new JSONObject().put("source",saved.getString("source")));assertEquals("63f75c890b05405e6e1f047072642b40949dab5912aa9c0ae6f2e654dff943dd",info.getString("key"));assertEquals(4,info.getInt("size"));assertEquals(".mp3",info.getString("ext"));}finally{assertTrue(file.delete());}
    }
    @Test public void disconnectedStatusNeverContainsTokensAndRejectsArbitraryFiles()throws Exception{
        JSONObject status=(JSONObject)request("status",new JSONObject());assertFalse(status.has("accessToken"));assertFalse(status.has("refreshToken"));assertTrue(status.getBoolean("canFlush"));assertEquals(Boolean.TRUE,request("flush",new JSONObject()));
        try{request("fingerprint",new JSONObject().put("source","file:///system/build.prop"));fail("Arbitrary file accepted");}catch(java.io.IOException expected){}
        try{request("removeLocal",new JSONObject().put("key","../outside"));fail("Traversal accepted");}catch(java.io.IOException expected){}
    }
    @Test public void bulkDownloadQueuePersistsBeyondThirtySongsWithoutCredentials()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();android.content.SharedPreferences prefs=context.getSharedPreferences("playerium_cloud",Context.MODE_PRIVATE);
        java.lang.reflect.Field field=GoogleCloud.class.getDeclaredField("prefs");field.setAccessible(true);prefs=(android.content.SharedPreferences)field.get(GoogleCloud.get(context));
        String previous=prefs.getString("account",null);boolean enabled=prefs.getBoolean("enabled",false);prefs.edit().putBoolean("enabled",true).putString("account","queue-test").commit();
        org.json.JSONArray entries=new org.json.JSONArray();for(int i=0;i<75;i++){String key=String.format(java.util.Locale.ROOT,"%064x",i);entries.put(new JSONObject().put("key",key).put("track",new JSONObject().put("audioId","audio_"+i).put("ext",".mp3").put("size",4).put("title","Song "+i).put("artist","Artist").put("album","Album")));}
        try{request("queueDownloads",new JSONObject().put("tracks",entries));assertEquals(75,GoogleCloud.get(context).pendingCount());}
        finally{prefs.edit().putBoolean("enabled",enabled).putString("account",previous).commit();androidx.work.WorkManager.getInstance(context).cancelUniqueWork("playerium-drive");androidx.work.WorkManager.getInstance(context).cancelUniqueWork("playerium-drive-retry");java.lang.reflect.Field jobs=GoogleCloud.class.getDeclaredField("jobs");jobs.setAccessible(true);File[] files=((File)jobs.get(GoogleCloud.get(context))).listFiles();if(files!=null)for(File file:files)if(file.getName().startsWith("download-"))file.delete();}
    }
}

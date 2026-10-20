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
    @Test public void foregroundFlushLeavesBackgroundDownloadsQueued()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);
        android.content.SharedPreferences prefs=cloud.prefs;String previous=prefs.getString("account",null);boolean enabled=prefs.getBoolean("enabled",false);
        java.lang.reflect.Field jobsField=GoogleCloud.class.getDeclaredField("jobs");jobsField.setAccessible(true);File jobs=(File)jobsField.get(cloud);jobs.mkdirs();
        String key=String.format(java.util.Locale.ROOT,"%064x",98765);File job=new File(jobs,"download-"+key+".json");
        GoogleCloud.Connections connections=cloud.connections;
        try{
            prefs.edit().putBoolean("enabled",true).putString("account","flush-download-test").commit();
            JSONObject data=new JSONObject().put("account","flush-download-test").put("download",new JSONObject().put("key",key).put("track",new JSONObject().put("audioId","unavailable")));
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(job)){out.write(data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            cloud.connections=url->{throw new AssertionError("Foreground flush attempted a queued download");};
            assertEquals(Boolean.TRUE,request("flush",new JSONObject()));assertTrue(job.isFile());assertEquals(1,cloud.pendingCount());
        }finally{cloud.connections=connections;job.delete();prefs.edit().putBoolean("enabled",enabled).putString("account",previous).commit();}
    }
    @Test public void alreadyDownloadedRecordingIsImportedWithoutNetworkAndRejectsChangedBytes()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);
        byte[] bytes="cached recording".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String key=OriginalNormalization.hash(new java.io.ByteArrayInputStream(bytes));
        File folder=new File(MusicEngine.managedDirectory(context),"Cloud");folder.mkdirs();new File(folder,".nomedia").createNewFile();
        File audio=new File(folder,key+".mp3"),marker=new File(audio.getPath()+".verified");GoogleCloud.Connections connections=cloud.connections;
        try{
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(audio)){out.write(bytes);}
            JSONObject track=new JSONObject().put("audioId","unavailable").put("size",bytes.length).put("ext",".mp3").put("title","Cached song").put("artist","Artist");
            cloud.connections=url->{throw new AssertionError("Cached recording required network");};
            JSONObject result=(JSONObject)request("download",new JSONObject().put("key",key).put("track",track));
            assertEquals(Uri.fromFile(audio).toString(),result.getString("uri"));assertEquals("Cached song",result.getJSONObject("metadata").getString("title"));
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(audio)){out.write("broken recording".getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            assertTrue(audio.setLastModified(audio.lastModified()+2000));assertNull(cloud.localCopy(key,track));
        }finally{cloud.connections=connections;audio.delete();marker.delete();}
    }

    @Test public void foregroundImportsReadyAudioBetweenBackgroundTransfers()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);
        android.content.SharedPreferences prefs=cloud.prefs;String previous=prefs.getString("account",null);boolean enabled=prefs.getBoolean("enabled",false);
        java.lang.reflect.Field token=GoogleCloud.class.getDeclaredField("token"),until=GoogleCloud.class.getDeclaredField("tokenUntil"),lockField=GoogleCloud.class.getDeclaredField("jobLock");
        token.setAccessible(true);until.setAccessible(true);lockField.setAccessible(true);Object savedToken=token.get(cloud);long savedUntil=until.getLong(cloud);
        java.util.concurrent.locks.ReentrantLock lock=(java.util.concurrent.locks.ReentrantLock)lockField.get(cloud);
        GoogleCloud.Connections connections=cloud.connections;
        File jobs=new File(context.getNoBackupFilesDir(),"cloud-jobs"),cache=new File(MusicEngine.managedDirectory(context),"Cloud");jobs.mkdirs();cache.mkdirs();new File(cache,".nomedia").createNewFile();
        String content=OriginalNormalization.hash(new java.io.ByteArrayInputStream("song".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        String readyKey=OriginalNormalization.hash(new java.io.ByteArrayInputStream("ready".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        JSONObject ready=new JSONObject().put("audioId","ready").put("size",5).put("ext",".mp3").put("title","Ready");
        File readyFile=new File(cache,readyKey+".mp3");
        java.util.List<File> cleanup=new java.util.ArrayList<>();cleanup.add(readyFile);cleanup.add(new File(readyFile.getPath()+".verified"));
        java.util.concurrent.CountDownLatch entered=new java.util.concurrent.CountDownLatch(1),firstRelease=new java.util.concurrent.CountDownLatch(1),secondRelease=new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger transfers=new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.FutureTask<Boolean> worker=new java.util.concurrent.FutureTask<>(()->cloud.runJobs());
        java.util.concurrent.FutureTask<JSONObject> foreground=new java.util.concurrent.FutureTask<>(()->cloud.download(readyKey,ready));
        Thread workerThread=new Thread(worker),foregroundThread=new Thread(foreground);
        try{
            prefs.edit().putBoolean("enabled",true).putString("account","fair-transfer-test").commit();token.set(cloud,"test-only");until.setLong(cloud,System.currentTimeMillis()+60000);
            try(java.io.FileOutputStream out=new java.io.FileOutputStream(readyFile)){out.write("ready".getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            for(int i=0;i<2;i++){
                String key=String.format(java.util.Locale.ROOT,"%064x",88001+i);
                File job=new File(jobs,"download-"+key+".json");cleanup.add(job);cleanup.add(new File(cache,key+".mp3"));cleanup.add(new File(cache,key+".mp3.verified"));
                JSONObject track=new JSONObject().put("audioId","audio_"+i).put("audioKey",content).put("size",4).put("ext",".mp3");
                JSONObject data=new JSONObject().put("account","fair-transfer-test").put("download",new JSONObject().put("key",key).put("track",track));
                try(java.io.FileOutputStream out=new java.io.FileOutputStream(job)){out.write(data.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
            }
            cloud.connections=address->new java.net.HttpURLConnection(new java.net.URL(address)){
                public void connect(){}public void disconnect(){}public boolean usingProxy(){return false;}
                public int getResponseCode()throws java.io.IOException{
                    if(!address.contains("alt=media")){int n=transfers.incrementAndGet();if(n==1)entered.countDown();
                        try{if(!(n==1?firstRelease:secondRelease).await(10,java.util.concurrent.TimeUnit.SECONDS))throw new java.io.IOException("Test transfer timed out");}catch(InterruptedException e){throw new java.io.IOException(e);}}
                    return 200;
                }
                public java.io.InputStream getInputStream(){
                    try{String body=address.contains("alt=media")?"song":new JSONObject().put("size",4).put("appProperties",new JSONObject().put("playeriumCloud","1").put("kind","audio").put("key","audio:"+content)).toString();
                        return new java.io.ByteArrayInputStream(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    }catch(Exception e){throw new AssertionError(e);}
                }
            };
            workerThread.start();assertTrue(entered.await(5,java.util.concurrent.TimeUnit.SECONDS));foregroundThread.start();
            long deadline=System.currentTimeMillis()+3000;while(!lock.hasQueuedThread(foregroundThread)&&System.currentTimeMillis()<deadline)Thread.sleep(10);
            assertTrue(lock.hasQueuedThread(foregroundThread));firstRelease.countDown();
            assertEquals(Uri.fromFile(readyFile).toString(),foreground.get(5,java.util.concurrent.TimeUnit.SECONDS).getString("uri"));
            secondRelease.countDown();assertTrue(worker.get(5,java.util.concurrent.TimeUnit.SECONDS));assertEquals(2,transfers.get());
        }finally{
            firstRelease.countDown();secondRelease.countDown();workerThread.join(12000);foregroundThread.join(12000);
            cloud.connections=connections;token.set(cloud,savedToken);until.setLong(cloud,savedUntil);prefs.edit().putBoolean("enabled",enabled).putString("account",previous).commit();
            for(File file:cleanup)file.delete();
        }
    }
    @Test public void firstDrivePullReadsEveryJournalEntryWithoutRedundantMetadataRequests()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);
        android.content.SharedPreferences prefs=cloud.prefs;String previous=prefs.getString("account",null);boolean enabled=prefs.getBoolean("enabled",false);
        java.lang.reflect.Field token=GoogleCloud.class.getDeclaredField("token"),until=GoogleCloud.class.getDeclaredField("tokenUntil");token.setAccessible(true);until.setAccessible(true);
        Object savedToken=token.get(cloud);long savedUntil=until.getLong(cloud);GoogleCloud.Connections connections=cloud.connections;
        java.util.concurrent.atomic.AtomicInteger reads=new java.util.concurrent.atomic.AtomicInteger();
        try{
            prefs.edit().putBoolean("enabled",true).putString("account","first-pull-test").commit();token.set(cloud,"test-only");until.setLong(cloud,System.currentTimeMillis()+60000);
            org.json.JSONArray first=new org.json.JSONArray(),second=new org.json.JSONArray();
            for(int i=0;i<1224;i++)(i<1000?first:second).put(new JSONObject().put("id","event_"+i).put("appProperties",new JSONObject().put("playeriumCloud","1").put("kind","event")));
            String listing=new JSONObject().put("files",first).put("nextPageToken","more").toString(),nextListing=new JSONObject().put("files",second).toString();
            cloud.connections=address->new java.net.HttpURLConnection(new java.net.URL(address)){
                public void connect(){}public void disconnect(){}public boolean usingProxy(){return false;}
                public int getResponseCode(){return 200;}
                public java.io.InputStream getInputStream(){
                    String body;
                    if(address.contains("changes/startPageToken"))body="{\"startPageToken\":\"after-snapshot\"}";
                    else if(address.contains("files?q="))body=address.contains("pageToken=more")?nextListing:listing;
                    else if(address.contains("?alt=media")){reads.incrementAndGet();String id=address.substring(address.lastIndexOf('/')+1,address.indexOf('?'));body="{\"id\":\""+id+"\"}";}
                    else throw new AssertionError("Unexpected or redundant Drive request: "+address);
                    return new java.io.ByteArrayInputStream(body.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
            };
            JSONObject result=(JSONObject)request("pull",new JSONObject());
            assertEquals("after-snapshot",result.getString("cursor"));assertEquals(1224,result.getJSONArray("events").length());assertEquals(1224,reads.get());
            java.util.Set<String> ids=new java.util.HashSet<>();for(int i=0;i<1224;i++)ids.add(result.getJSONArray("events").getJSONObject(i).getString("id"));assertEquals(1224,ids.size());
        }finally{cloud.connections=connections;token.set(cloud,savedToken);until.setLong(cloud,savedUntil);prefs.edit().putBoolean("enabled",enabled).putString("account",previous).commit();}
    }

}

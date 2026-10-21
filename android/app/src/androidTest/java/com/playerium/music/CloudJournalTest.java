package com.playerium.music;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.net.*;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CloudJournalTest {
    @Test public void stoppedBackgroundWorkCannotReadOrQueueAnotherAccount()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);
        String account=cloud.prefs.getString("account",null);boolean enabled=cloud.isConnected();GoogleCloud.Connections connections=cloud.connections;
        try{
            cloud.prefs.edit().putBoolean("enabled",true).putString("account","stopped-fixture").commit();
            cloud.connections=url->{throw new AssertionError("Cancelled work must not use a later account's network");};
            try{new CloudJournal(cloud,context,tracks->{throw new AssertionError("Cancelled work queued a download");}).refresh(()->true);fail("Cancelled refresh continued");}catch(InterruptedIOException expected){}
            assertTrue(cloud.runJobs(()->true));
        }finally{cloud.connections=connections;cloud.prefs.edit().putBoolean("enabled",enabled).putString("account",account).commit();}
    }
    private static final String KEY=String.format(Locale.ROOT,"%064x",987654321);
    private JSONObject op(String kind,String id,long clock)throws Exception{return new JSONObject().put("version",1).put("id",id).put("device","test").put("clock",clock).put("kind",kind).put("key",KEY);}
    private JSONObject track(String id,long clock)throws Exception{return op("track",id,clock).put("track",new JSONObject().put("title",id).put("artist","Artist").put("audioId","ready-file").put("ext",".mp3").put("size",4));}

    @Test public void incomingJournalHonorsConcurrentDeletionsRestoresAndLatestAudioRevision()throws Exception{
        JSONObject first=track("a",1),latest=track("b",5),deleted=op("delete","delete-a",2),restored=op("restore","restore",3).put("deletes",new JSONArray().put("delete-a"));
        List<JSONObject> events=Arrays.asList(first,latest,deleted,restored);
        for(int i=0;i<20;i++){
            Collections.shuffle(events,new Random(i));JSONArray journal=new JSONArray();for(JSONObject event:events)journal.put(event);
            assertEquals("b",CloudJournal.activeTracks(journal).get(KEY).getString("title"));
            journal.put(op("delete","concurrent-delete",2));assertTrue(CloudJournal.activeTracks(journal).isEmpty());
        }
    }
    @Test public void finalBackupSupersedesPeerPreviewRegardlessOfArrivalOrder()throws Exception{
        JSONObject completed=track("ready",4),preview=track("ready-preview",4).put("kind","track-preview");preview.getJSONObject("track").put("audioId","peer");
        for(JSONArray events:new JSONArray[]{new JSONArray().put(preview).put(completed),new JSONArray().put(completed).put(preview)})
            assertEquals("ready-file",CloudJournal.activeTracks(events).get(KEY).getString("audioId"));
    }

    @Test public void incomingJournalResumesWithoutAWebViewOrAnExistingTransferQueue()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);
        String account="7755"+System.nanoTime(),previous=cloud.prefs.getString("account",null);boolean enabled=cloud.isConnected();
        java.lang.reflect.Field field=RealtimeSync.class.getDeclaredField("current");field.setAccessible(true);Object current=field.get(cloud.realtime);
        GoogleCloud.Connections connections=cloud.connections;List<String> urls=new ArrayList<>();
        File ledger=new File(context.getNoBackupFilesDir(),"cloud-journal-v2/"+GoogleCloud.hex(java.security.MessageDigest.getInstance("SHA-256").digest(account.getBytes("UTF-8")))+".json");
        List<JSONArray> queued=new ArrayList<>();
        try{
            cloud.prefs.edit().putBoolean("enabled",true).putString("account",account).commit();
            field.set(cloud.realtime,new JSONObject().put("account",account).put("userId","test-user").put("accessToken","test-session").put("expiresAt",System.currentTimeMillis()+3600000));
            cloud.connections=url->{urls.add(url);return new HttpURLConnection(new URL(url)){
                public void disconnect(){} public boolean usingProxy(){return false;} public void connect(){}
                public int getResponseCode(){return 200;}
                public InputStream getInputStream()throws IOException{try{
                    boolean initial=url.toString().contains("revision=gt.0&");JSONArray rows=new JSONArray();
                    if(initial)rows.put(new JSONObject().put("revision",1).put("operation",track("Background song",1)));
                    return new ByteArrayInputStream(rows.toString().getBytes("UTF-8"));
                }catch(Exception e){throw new IOException(e);}}
            };};
            new CloudJournal(cloud,context,queued::add).refresh();assertTrue(ledger.isFile());
            new CloudJournal(cloud,context,queued::add).refresh();assertEquals(2,urls.size());assertTrue(urls.get(1).contains("revision=gt.1&"));
            assertEquals(2,queued.size());assertEquals(KEY,queued.get(0).getJSONObject(0).getString("key"));
        }finally{
            cloud.prefs.edit().putBoolean("enabled",enabled).putString("account",previous).commit();
            cloud.connections=connections;field.set(cloud.realtime,current);ledger.delete();new File(ledger.getPath()+".tmp").delete();
        }
    }
}

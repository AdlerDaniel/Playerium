package com.playerium.music;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;

/** Durable incoming state belongs to native work, never to the WebView lifetime. */
final class CloudJournal {
    private final GoogleCloud cloud;
    private final File root;
    interface Downloads {void queue(JSONArray tracks)throws Exception;}
    private final Downloads downloads;
    CloudJournal(GoogleCloud cloud,Context context){this(cloud,context,cloud::queueDownloads);}
    CloudJournal(GoogleCloud cloud,Context context,Downloads downloads){this.cloud=cloud;this.downloads=downloads;root=new File(context.getNoBackupFilesDir(),"cloud-journal-v2");}

    private File path(String account)throws Exception{
        return new File(root,GoogleCloud.hex(MessageDigest.getInstance("SHA-256").digest(account.getBytes("UTF-8")))+".json");
    }
    private void checkAccount(String account)throws IOException{
        if(!cloud.prefs.getBoolean("enabled",false)||!account.equals(cloud.prefs.getString("account","")))throw new IOException("Аккаунт изменился.");
    }
    private JSONObject load(File file)throws Exception{
        if(!file.exists())return new JSONObject().put("revision",0).put("events",new JSONArray());
        return new JSONObject(new String(GoogleCloud.read(new FileInputStream(file),64*1024*1024),"UTF-8"));
    }
    private void save(File file,JSONObject state)throws Exception{
        if(!root.isDirectory()&&!root.mkdirs()&&!root.isDirectory())throw new IOException("Не удалось сохранить медиатеку.");
        File temporary=new File(file.getPath()+".tmp");
        try(FileOutputStream out=new FileOutputStream(temporary)){out.write(state.toString().getBytes("UTF-8"));out.getFD().sync();}
        if(!temporary.renameTo(file))throw new IOException("Не удалось сохранить медиатеку.");
    }
    private void check(String account,GoogleCloud.Cancellation cancellation)throws IOException{
        if(cancellation.stopped())throw new InterruptedIOException("Синхронизация отменена.");checkAccount(account);
    }
    void refresh()throws Exception{refresh(()->false);}
    synchronized void refresh(GoogleCloud.Cancellation cancellation)throws Exception{
        long started=android.os.SystemClock.elapsedRealtime();
        String account=cloud.prefs.getString("account","");check(account,cancellation);
        File file=path(account);JSONObject state=load(file);JSONArray events=state.getJSONArray("events");
        Set<String> known=new HashSet<>();for(int i=0;i<events.length();i++)known.add(events.getJSONObject(i).getString("id"));
        long revision=state.getLong("revision");
        for(;;){
            check(account,cancellation);
            JSONObject page;
            try{page=cloud.realtime.changes(revision);}
            catch(Exception realtimeFailure){
                check(account,cancellation);JSONObject backup=cloud.pull(state.optString("driveCursor",""),cancellation);check(account,cancellation);
                JSONArray recovered=backup.getJSONArray("events");boolean added=false;
                for(int i=0;i<recovered.length();i++){JSONObject op=recovered.getJSONObject(i);if(known.add(op.getString("id"))){events.put(op);added=true;}}
                String cursor=backup.getString("cursor");boolean changed=!cursor.equals(state.optString("driveCursor",""))||added||!file.isFile();
                state.put("driveCursor",cursor);if(changed)save(file,state);break;
            }
            check(account,cancellation);
            JSONArray incoming=page.getJSONArray("events");
            for(int i=0;i<incoming.length();i++){JSONObject op=incoming.getJSONObject(i);if(known.add(op.getString("id")))events.put(op);}
            long next=page.getLong("revision");if(next<revision)throw new IOException("Некорректный журнал.");
            // Store received operations and their watermark in one replacement.
            state.put("revision",next);if(next!=revision||incoming.length()>0||!file.isFile())save(file,state);revision=next;
            if(!page.getBoolean("more"))break;
        }
        android.util.Log.i("PlayeriumSync","Incoming journal received in "+(android.os.SystemClock.elapsedRealtime()-started)+" ms");
        Map<String,JSONObject> active=activeTracks(events);Set<String> deleted=new HashSet<>();
        for(int i=0;i<events.length();i++){JSONObject op=events.getJSONObject(i);if("delete".equals(op.optString("kind"))&&!active.containsKey(op.optString("key")))deleted.add(op.optString("key"));}
        check(account,cancellation);cloud.reconcileDownloads(account,active,deleted);
        JSONArray pending=new JSONArray();
        for(Map.Entry<String,JSONObject> entry:active.entrySet()){
            check(account,cancellation);
            if(cloud.localCopy(entry.getKey(),entry.getValue())==null)pending.put(new JSONObject().put("key",entry.getKey()).put("track",entry.getValue()));
        }
        check(account,cancellation);if(pending.length()>0)downloads.queue(pending);
        android.util.Log.i("PlayeriumSync","Incoming file reconciliation completed in "+(android.os.SystemClock.elapsedRealtime()-started)+" ms");
    }
    boolean accepts(String account,String key,JSONObject requested)throws Exception{
        checkAccount(account);JSONObject state=load(path(account));JSONArray events=state.getJSONArray("events");
        boolean known=false;for(int i=0;i<events.length();i++)if(key.equals(events.getJSONObject(i).optString("key"))){known=true;break;}
        if(!known)return true; // Compatibility with an explicit download before native journal migration.
        JSONObject latest=activeTracks(events).get(key);if(latest==null)return false;
        return latest.optString("audioKey",key).equals(requested.optString("audioKey",key));
    }
    static Map<String,JSONObject> activeTracks(JSONArray events)throws Exception{
        Map<String,JSONObject> metadata=new HashMap<>();Map<String,Set<String>> deleted=new HashMap<>(),restored=new HashMap<>();
        for(int i=0;i<events.length();i++){
            JSONObject op=events.getJSONObject(i);String key=op.optString("key"),kind=op.optString("kind");
            if(op.optInt("version")!=1||!key.matches("[a-f0-9]{64}"))continue;
            if("track".equals(kind)||"track-preview".equals(kind)){
                JSONObject track=op.optJSONObject("track");if(track==null||"pending".equals(track.optString("audioId")))continue;
                JSONObject previous=metadata.get(key);
                if(previous==null||op.optLong("clock")>previous.optLong("clock")||op.optLong("clock")==previous.optLong("clock")&&(!kind.equals(previous.optString("kind"))?"track".equals(kind):op.getString("id").compareTo(previous.getString("id"))>0))metadata.put(key,op);
            }else if("delete".equals(kind))bucket(deleted,key).add(op.getString("id"));
            else if("restore".equals(kind)){
                JSONArray ids=op.optJSONArray("deletes");if(ids!=null)for(int j=0;j<ids.length();j++)bucket(restored,key).add(ids.getString(j));
            }
        }
        Map<String,JSONObject> result=new HashMap<>();
        for(Map.Entry<String,JSONObject> entry:metadata.entrySet()){
            Set<String> tombstones=new HashSet<>(bucket(deleted,entry.getKey()));tombstones.removeAll(bucket(restored,entry.getKey()));
            if(tombstones.isEmpty())result.put(entry.getKey(),entry.getValue().getJSONObject("track"));
        }
        return result;
    }
    private static Set<String> bucket(Map<String,Set<String>> values,String key){
        Set<String> value=values.get(key);if(value==null){value=new HashSet<>();values.put(key,value);}return value;
    }
}

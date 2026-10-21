package com.playerium.music;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.documentfile.provider.DocumentFile;
import androidx.work.*;
import org.json.JSONArray;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Persistent verification of the original recording after constant-gain processing. */
final class PreparedAudio {
    static final String PROFILE="constant-lufs7-tp1-original-v1";
    static SharedPreferences preferences(Context c){return c.getSharedPreferences("playerium_prepared_audio",Context.MODE_PRIVATE);}
    static File directory(Context c){File dir=new File(c.getNoBackupFilesDir(),"normalized-audio");dir.mkdirs();return dir;}
    static String key(Context c,Uri uri)throws Exception{
        if(!MainActivity.hasMusicPermission(c,uri)&&!GoogleCloud.privateSnapshot(c,uri))throw new SecurityException("Unauthorized URI");
        long size,modified;
        if("file".equals(uri.getScheme())){File f=new File(uri.getPath());if(!f.isFile())throw new java.io.FileNotFoundException("Missing recording");size=f.length();modified=f.lastModified();}
        else {DocumentFile f=DocumentFile.fromSingleUri(c,uri);if(f==null||!f.exists())throw new java.io.FileNotFoundException("Missing recording");size=f.length();modified=f.lastModified();}
        byte[] digest=MessageDigest.getInstance("SHA-256").digest((uri+"|"+size+"|"+modified+"|"+PROFILE).getBytes(StandardCharsets.UTF_8));
        StringBuilder result=new StringBuilder();for(byte b:digest)result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();
    }
    static Uri playable(Context c,Uri original){return original;}
    static org.json.JSONObject ready(Context c,Uri uri){
        try{String saved=preferences(c).getString("verified:"+uri,null);if(saved==null)return null;
            org.json.JSONObject record=new org.json.JSONObject(saved);
            return key(c,uri).equals(record.optString("stamp"))&&PROFILE.equals(record.getJSONObject("normalization").optString("profile"))?record:null;
        }catch(Exception ignored){return null;}
    }
    static void verified(Context c,Uri uri,org.json.JSONObject data)throws Exception{
        long size,modified;if("file".equals(uri.getScheme())){File file=new File(uri.getPath());size=file.length();modified=file.lastModified();}else{DocumentFile file=DocumentFile.fromSingleUri(c,uri);size=file.length();modified=file.lastModified();}
        data.put("uri",uri.toString()).put("stamp",key(c,uri)).put("size",size).put("lastModified",modified);
        MusicEngine.get(c).noteNormalized(uri,data);
        if(!preferences(c).edit().putString("verified:"+uri,data.toString()).remove("error:"+uri).commit())throw new java.io.IOException("Не удалось сохранить результат нормализации");
    }
    static void acceptCloudVersion(Context c,Uri uri,org.json.JSONObject track)throws Exception{
        org.json.JSONObject normalization=track.optJSONObject("normalization");
        if(normalization!=null&&PROFILE.equals(normalization.optString("profile"))){
            org.json.JSONObject result=new org.json.JSONObject().put("normalization",normalization).put("audioKey",track.getString("audioKey"));
            verified(c,uri,result);
        }
    }
    static void removeLegacyCopies(Context c){
        File dir=directory(c);File[] files=dir.listFiles();if(files==null)return;
        for(File file:files)if(file.getName().matches("[a-f0-9]{64}(?:\\.part)?\\.m4a"))file.delete();
    }
    static void enqueue(Context c,JSONArray uris)throws Exception{enqueue(c,uris,false);}
    static synchronized void enqueue(Context c,JSONArray uris,boolean retryNow)throws Exception{
        removeLegacyCopies(c);
        Set<String> pending=new HashSet<>(preferences(c).getStringSet("pending",Collections.emptySet()));
        Set<String> available=new HashSet<>();for(int i=0;i<uris.length();i++)available.add(uris.getString(i));pending.retainAll(available);
        for(int i=0;i<uris.length();i++){
            Uri uri=Uri.parse(uris.getString(i));if(!MainActivity.hasMusicPermission(c,uri))continue;
            if(ready(c,uri)==null)pending.add(uri.toString());
        }
        preferences(c).edit().putStringSet("pending",pending).apply();
        if(!pending.isEmpty())WorkManager.getInstance(c).enqueueUniqueWork("playerium-normalize-audio",retryNow?ExistingWorkPolicy.REPLACE:ExistingWorkPolicy.APPEND_OR_REPLACE,new OneTimeWorkRequest.Builder(NormalizationWorker.class).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,java.util.concurrent.TimeUnit.SECONDS).build());
    }
    static void recoverLater(Context c){
        if(OriginalNormalization.hasRecovery(c))WorkManager.getInstance(c).enqueueUniqueWork("playerium-normalize-audio",ExistingWorkPolicy.APPEND_OR_REPLACE,new OneTimeWorkRequest.Builder(NormalizationWorker.class).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,java.util.concurrent.TimeUnit.SECONDS).build());
    }
    static synchronized Set<String> pending(Context c){return new HashSet<>(preferences(c).getStringSet("pending",Collections.emptySet()));}
    static synchronized void complete(Context c,String uri){Set<String> p=pending(c);p.remove(uri);preferences(c).edit().putStringSet("pending",p).apply();}
    static synchronized void failed(Context c,String uri,String message){preferences(c).edit().putString("error:"+uri,message).apply();}
    static synchronized void succeeded(Context c,String uri){complete(c,uri);preferences(c).edit().remove("error:"+uri).putLong("updatedAt",System.currentTimeMillis()).apply();}
    static org.json.JSONObject status(Context c,JSONArray uris)throws Exception{
        int ready=0,failed=0,queued=0,peakLimited=0;Set<String> pending=pending(c);Set<String> unique=new HashSet<>();JSONArray records=new JSONArray();
        for(int i=0;i<uris.length();i++)unique.add(uris.getString(i));
        for(String value:unique){Uri uri=Uri.parse(value);org.json.JSONObject record=ready(c,uri);if(record!=null){ready++;records.put(record);if(record.getJSONObject("normalization").optBoolean("peakLimited"))peakLimited++;}else{if(pending.contains(value))queued++;if(preferences(c).contains("error:"+value)||!MainActivity.hasMusicPermission(c,uri))failed++;}}
        boolean active=false;
        try{for(WorkInfo work:WorkManager.getInstance(c).getWorkInfosForUniqueWork("playerium-normalize-audio").get(2,java.util.concurrent.TimeUnit.SECONDS))if(work.getState()==WorkInfo.State.RUNNING)active=true;}catch(Exception ignored){}
        return new org.json.JSONObject().put("targetLUFS",-7).put("writesOriginal",true).put("total",unique.size()).put("ready",ready).put("pending",queued).put("failed",failed).put("active",active).put("peakLimited",peakLimited).put("records",records).put("updatedAt",preferences(c).getLong("updatedAt",0));
    }
}

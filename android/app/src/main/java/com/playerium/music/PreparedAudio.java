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

/** Durable derived audio, never a destructive rewrite of the user's only recording. */
final class PreparedAudio {
    static final String PROFILE="fixed-lufs14-tp1-v1";
    static SharedPreferences preferences(Context c){return c.getSharedPreferences("playerium_prepared_audio",Context.MODE_PRIVATE);}
    static File directory(Context c){File dir=new File(c.getNoBackupFilesDir(),"normalized-audio");dir.mkdirs();return dir;}
    static String key(Context c,Uri uri)throws Exception{
        if(!MainActivity.hasMusicPermission(c,uri))throw new SecurityException("Unauthorized URI");
        long size,modified;
        if("file".equals(uri.getScheme())){File f=new File(uri.getPath());if(!f.isFile())throw new java.io.FileNotFoundException("Missing recording");size=f.length();modified=f.lastModified();}
        else {DocumentFile f=DocumentFile.fromSingleUri(c,uri);if(f==null||!f.exists())throw new java.io.FileNotFoundException("Missing recording");size=f.length();modified=f.lastModified();}
        byte[] digest=MessageDigest.getInstance("SHA-256").digest((uri+"|"+size+"|"+modified+"|"+PROFILE).getBytes(StandardCharsets.UTF_8));
        StringBuilder result=new StringBuilder();for(byte b:digest)result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();
    }
    static Uri playable(Context c,Uri original){
        try{File file=new File(directory(c),key(c,original)+".m4a");if(file.isFile()&&file.length()>32)return Uri.fromFile(file);}catch(Exception ignored){}
        return original;
    }
    static synchronized void enqueue(Context c,JSONArray uris)throws Exception{
        Set<String> pending=new HashSet<>(preferences(c).getStringSet("pending",Collections.emptySet()));
        for(int i=0;i<uris.length();i++){
            Uri uri=Uri.parse(uris.getString(i));if(!MainActivity.hasMusicPermission(c,uri))continue;
            if(playable(c,uri).equals(uri))pending.add(uri.toString());
        }
        preferences(c).edit().putStringSet("pending",pending).apply();
        if(!pending.isEmpty())WorkManager.getInstance(c).enqueueUniqueWork("playerium-normalize-audio",ExistingWorkPolicy.APPEND_OR_REPLACE,new OneTimeWorkRequest.Builder(NormalizationWorker.class).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,java.util.concurrent.TimeUnit.SECONDS).build());
    }
    static synchronized Set<String> pending(Context c){return new HashSet<>(preferences(c).getStringSet("pending",Collections.emptySet()));}
    static synchronized void complete(Context c,String uri){Set<String> p=pending(c);p.remove(uri);preferences(c).edit().putStringSet("pending",p).apply();}
    static synchronized void failed(Context c,String uri,String message){preferences(c).edit().putString("lastError",message).apply();}
}

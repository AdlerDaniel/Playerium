package com.playerium.music;

import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import androidx.documentfile.provider.DocumentFile;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.util.concurrent.ConcurrentHashMap;

/** Hash-to-authorized-source mapping. Remote requests never contain paths. */
final class PeerFiles {
    private final GoogleCloud cloud;private final Context context;
    private final ConcurrentHashMap<String,JSONObject> sources=new ConcurrentHashMap<>(),files=new ConcurrentHashMap<>();
    PeerFiles(GoogleCloud cloud,Context context){this.cloud=cloud;this.context=context;}
    private String owner(){return cloud.isConnected()?cloud.prefs.getString("account",""):"";}
    private long[] stat(Uri uri){
        if("file".equals(uri.getScheme())){File file=new File(uri.getPath());return new long[]{file.length(),file.lastModified()};}
        DocumentFile file=DocumentFile.fromSingleUri(context,uri);return file==null?new long[]{0,0}:new long[]{file.length(),file.lastModified()};
    }
    void remember(String source,String key)throws Exception{
        String account=owner();if(account.isEmpty()||!PeerFileCrypto.key(key))return;
        long[] stamp=stat(Uri.parse(source));if(!account.equals(owner()))return;
        if(sources.size()>10000)sources.clear();
        JSONObject record=new JSONObject().put("source",source).put("size",stamp[0]).put("modified",stamp[1]);sources.put(account+":"+key,record);files.put(account+":"+source,record);
    }
    void register(JSONArray listed)throws Exception{
        if(listed.length()>10000)throw new IOException("Invalid sources");
        String account=owner();
        for(int i=0;i<listed.length();i++){
            check(account);String uri=listed.getString(i);
            try{long[] stamp=stat(Uri.parse(uri));JSONObject old=files.get(account+":"+uri);
                if(old==null||old.optLong("size")!=stamp[0]||old.optLong("modified")!=stamp[1])cloud.fingerprint(uri);
            }catch(Exception unavailable){check(account);}
        }
    }
    JSONObject read(JSONObject request)throws Exception{
        String account=owner(),key=request.optString("key");long offset=request.optLong("offset",-1);
        if(account.isEmpty()||!PeerFileCrypto.key(key)||offset<0)return null;
        JSONObject record=sources.get(account+":"+key);if(record==null)return null;
        Uri uri=Uri.parse(record.getString("source"));long[] before=stat(uri);long size=record.getLong("size");
        if(before[0]!=size||before[1]!=record.getLong("modified")||offset>=size)return null;
        byte[] bytes=new byte[(int)Math.min(65536,size-offset)];
        try(InputStream input=cloud.source(uri.toString())){
            long skipped=0;while(skipped<offset){long n=input.skip(offset-skipped);if(n==0){if(input.read()<0)return null;n=1;}skipped+=n;}
            int total=0;while(total<bytes.length){int n=input.read(bytes,total,bytes.length-total);if(n<0)return null;total+=n;}
        }
        long[] after=stat(uri);if(!account.equals(owner())||after[0]!=before[0]||after[1]!=before[1])return null;
        return new JSONObject().put("key",key).put("offset",offset).put("size",size).put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP));
    }
    boolean receive(String key,long size,File partial,String account)throws Exception{
        long offset=partial.length();if(offset>=size){if(!partial.delete())throw new IOException("Не удалось перезапустить передачу.");offset=0;}
        try(FileOutputStream out=new FileOutputStream(partial,offset>0)){
            while(offset<size){
                check(account);JSONObject chunk=cloud.connect.live.readFile(key,offset);check(account);if(chunk==null)return false;
                byte[] bytes=Base64.decode(chunk.getString("base64"),Base64.DEFAULT);PeerFileCrypto.validate(chunk,bytes.length);
                if(!key.equals(chunk.getString("key"))||chunk.getLong("offset")!=offset||chunk.getLong("size")!=size)throw new IOException("Некорректная передача песни.");
                out.write(bytes);offset+=bytes.length;
            }
            out.getFD().sync();return true;
        }
    }
    void check(String account)throws IOException{if(account.isEmpty()||!account.equals(owner()))throw new IOException("Аккаунт синхронизации изменился.");}
}

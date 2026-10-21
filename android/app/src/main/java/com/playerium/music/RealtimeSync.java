package com.playerium.music;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.net.HttpURLConnection;

// Credentials stay in native memory. The background worker keeps a separate
// durable outbox, so a failed realtime service never loses the Drive backup.
final class RealtimeSync {
    private static final String URL="https://cjmdgrstuaxaimpgxsmv.supabase.co",KEY="sb_publishable_5CrRGQG0f-UJ1pOsDoKLNQ_qAHEhAua";
    private final GoogleCloud cloud;
    private final File root;
    private JSONObject current;
    RealtimeSync(GoogleCloud cloud,Context context){this.cloud=cloud;root=new File(context.getNoBackupFilesDir(),"realtime-outbox");}
    private JSONObject http(String route,String credential,Object body,boolean minimal)throws Exception{
        HttpURLConnection c=cloud.connections.open(URL+route);c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setRequestMethod("POST");c.setRequestProperty("apikey",KEY);c.setRequestProperty("Authorization","Bearer "+credential);c.setRequestProperty("Content-Type","application/json");if(minimal)c.setRequestProperty("Prefer","resolution=ignore-duplicates,return=minimal");
        try{c.setDoOutput(true);try(OutputStream output=c.getOutputStream()){output.write(body.toString().getBytes("UTF-8"));}int status=c.getResponseCode();if(status<200||status>=300){if(status==401)current=null;throw new IOException("Быстрая синхронизация временно недоступна.");}return minimal?new JSONObject():new JSONObject(new String(GoogleCloud.read(c.getInputStream(),262144),"UTF-8"));}finally{c.disconnect();}
    }
    synchronized JSONObject session()throws Exception{
        String account=cloud.prefs.getString("account","");if(account.isEmpty()||!cloud.prefs.getBoolean("enabled",false))throw new IOException("Подключите Google Диск.");
        if(current!=null&&account.equals(current.optString("account"))&&current.optLong("expiresAt")>System.currentTimeMillis()+60000)return current;
        JSONObject result=http("/functions/v1/playerium-session",cloud.token(),new JSONObject(),false);
        if(!account.equals(result.optString("account"))||!account.equals(cloud.prefs.getString("account",""))||!cloud.prefs.getBoolean("enabled",false)||result.optString("accessToken").isEmpty()||result.optString("userId").isEmpty())throw new IOException("Аккаунт синхронизации изменился.");current=result;return result;
    }
    void enqueue(JSONObject operation)throws Exception{
        if(!operation.optString("id").matches("[A-Za-z0-9_-]{1,160}"))throw new IOException("Некорректная запись синхронизации.");
        String account=cloud.prefs.getString("account","");if(!account.matches("[0-9]{1,100}"))return;
        File directory=new File(root,account);directory.mkdirs();File target=new File(directory,operation.getString("id")+".json"),temporary=new File(directory,target.getName()+".tmp");
        try(FileOutputStream out=new FileOutputStream(temporary)){out.write(operation.toString().getBytes("UTF-8"));out.getFD().sync();}if(!temporary.renameTo(target))throw new IOException("Не удалось сохранить очередь синхронизации.");
    }
    synchronized void drain()throws Exception{
        String account=cloud.prefs.getString("account","");if(!account.matches("[0-9]{1,100}"))return;
        File[] files=new File(root,account).listFiles();if(files==null||files.length==0)return;JSONObject session=session();
        for(int offset=0;offset<files.length;){JSONArray rows=new JSONArray();java.util.List<File> completed=new java.util.ArrayList<>();int bytes=0;
            while(offset<files.length&&rows.length()<100&&bytes<524288){File file=files[offset++];if(!file.getName().matches("[A-Za-z0-9_-]{1,160}\\.json"))continue;byte[] content=GoogleCloud.read(new FileInputStream(file),262144);bytes+=content.length;JSONObject operation=new JSONObject(new String(content,"UTF-8"));rows.put(new JSONObject().put("user_id",session.getString("userId")).put("op_id",operation.getString("id")).put("operation",operation));completed.add(file);}
            if(!account.equals(cloud.prefs.getString("account",""))||!cloud.prefs.getBoolean("enabled",false))return;
            if(rows.length()>0)http("/rest/v1/playerium_events?on_conflict=user_id,op_id",session.getString("accessToken"),rows,true);
            for(File file:completed)if(!file.delete())throw new IOException("Не удалось завершить очередь синхронизации.");
        }
    }
    int pending(){String account=cloud.prefs.getString("account","");if(!account.matches("[0-9]{1,100}"))return 0;File[] files=new File(root,account).listFiles((dir,name)->name.matches("[A-Za-z0-9_-]{1,160}\\.json"));return files==null?0:files.length;}
    JSONObject changes(long after)throws Exception{
        if(after<0)throw new IOException("Некорректная позиция журнала.");
        JSONObject session=session();String account=session.getString("account");
        HttpURLConnection c=cloud.connections.open(URL+"/rest/v1/playerium_events?select=revision,operation&user_id=eq."+session.getString("userId")+"&revision=gt."+after+"&order=revision.asc&limit=100");
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(15000);c.setRequestMethod("GET");
        c.setRequestProperty("apikey",KEY);c.setRequestProperty("Authorization","Bearer "+session.getString("accessToken"));
        try{
            int status=c.getResponseCode();if(status<200||status>=300){if(status==401)reset();throw new IOException("Не удалось получить изменения медиатеки.");}
            JSONArray rows=new JSONArray(new String(GoogleCloud.read(c.getInputStream(),32*1024*1024),"UTF-8")),events=new JSONArray();long revision=after;
            for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);long next=row.getLong("revision");if(next<=revision)throw new IOException("Некорректный порядок журнала.");revision=next;events.put(row.getJSONObject("operation"));}
            if(!account.equals(cloud.prefs.getString("account",""))||!cloud.prefs.getBoolean("enabled",false))throw new IOException("Аккаунт изменился.");
            return new JSONObject().put("events",events).put("revision",revision).put("more",rows.length()==100);
        }finally{c.disconnect();}
    }
    synchronized void reset(){current=null;}
    String registerPush(JSONObject session,String installation,String token)throws Exception{
        String account=session.getString("account");
        if(!cloud.isConnected()||!account.equals(cloud.prefs.getString("account","")))throw new IOException("Аккаунт изменился.");
        JSONObject result=http("/functions/v1/playerium-push",session.getString("accessToken"),
            new JSONObject().put("action","register").put("installation",installation).put("token",token),false);
        if(!session.getString("userId").equals(result.optString("userId")))throw new IOException("Не удалось зарегистрировать устройство.");
        return result.getString("userId");
    }
}

package com.playerium.music;

import android.accounts.Account;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
import androidx.documentfile.provider.DocumentFile;
import androidx.work.*;
import com.google.android.gms.auth.api.identity.*;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Tasks;
import org.json.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Drive credentials stay in Google Play services; music is transferred by native streams. */
final class GoogleCloud {
    static final int AUTH_REQUEST=9061;
    private static final String API="https://www.googleapis.com/drive/v3/";
    private static final String SCOPE="https://www.googleapis.com/auth/drive.file";
    private static volatile GoogleCloud singleton;
    private final Context context;
    final SharedPreferences prefs;
    private final ExecutorService executor=Executors.newSingleThreadExecutor(),connectExecutor=Executors.newSingleThreadExecutor(),liveExecutor=Executors.newFixedThreadPool(2);
    private final Object downloadLock=new Object(),jobLock=new Object();
    private final File jobs,cache;
    private String token,pendingLogin;
    private long tokenUntil;
    private final Map<String,JSONObject> stages=new HashMap<>();
    final GoogleConnect connect;
    final RealtimeSync realtime;
    interface Connections {HttpURLConnection open(String url)throws Exception;}
    Connections connections=url->(HttpURLConnection)new URL(url).openConnection();
    private final ThreadLocal<String> expectedAccount=new ThreadLocal<>();
    private GoogleCloud(Context ctx){context=ctx.getApplicationContext();prefs=context.getSharedPreferences("playerium_cloud",Context.MODE_PRIVATE);jobs=new File(context.getNoBackupFilesDir(),"cloud-jobs");cache=new File(MusicEngine.managedDirectory(context),"Cloud");connect=new GoogleConnect(this,context);realtime=new RealtimeSync(this,context);}
    static GoogleCloud get(Context ctx){if(singleton==null)synchronized(GoogleCloud.class){if(singleton==null)singleton=new GoogleCloud(ctx);}return singleton;}
    private AuthorizationRequest authorization(){AuthorizationRequest.Builder builder=AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(SCOPE)));String email=prefs.getString("email","");if(!email.isEmpty())builder.setAccount(new Account(email,"com.google"));return builder.build();}
    synchronized String token() throws Exception {
        String expected=expectedAccount.get();if(expected!=null&&!expected.equals(prefs.getString("account","")))throw new IOException("Аккаунт синхронизации изменился.");
        if(!prefs.getBoolean("enabled",false))throw new IOException("Подключите Google Диск в настройках.");
        if(token!=null&&tokenUntil>System.currentTimeMillis())return token;
        AuthorizationResult result=Tasks.await(Identity.getAuthorizationClient(context).authorize(authorization()),60,TimeUnit.SECONDS);
        if(!prefs.getBoolean("enabled",false)||(expected!=null&&!expected.equals(prefs.getString("account",""))))throw new IOException("Аккаунт синхронизации изменился.");
        if(result.hasResolution()||result.getAccessToken()==null)throw new IOException("Войдите в Google Диск повторно.");
        token=result.getAccessToken();tokenUntil=System.currentTimeMillis()+45*60*1000;return token;
    }
    private void connect(String requestId){MainActivity activity=MainActivity.getInstance();if(activity==null){reply(requestId,null,"Откройте приложение для входа в Google.");return;}activity.runOnUiThread(()->{
        if(pendingLogin!=null){reply(requestId,null,"Вход в Google уже выполняется.");return;}pendingLogin=requestId;
        Identity.getAuthorizationClient(activity).authorize(authorization()).addOnSuccessListener(result->{
            if(result.hasResolution()){try{activity.startIntentSenderForResult(result.getPendingIntent().getIntentSender(),AUTH_REQUEST,null,0,0,0);}catch(Exception e){finishLogin(null);}}
            else finishLogin(result);
        }).addOnFailureListener(error->finishLogin(null));
    });}
    void authorizationResult(Intent intent){try{finishLogin(intent==null?null:Identity.getAuthorizationClient(context).getAuthorizationResultFromIntent(intent));}catch(Exception e){finishLogin(null);}}
    private void finishLogin(AuthorizationResult result){String requestId=pendingLogin;pendingLogin=null;if(requestId==null)return;executor.execute(()->{try{if(result==null||result.getAccessToken()==null)throw new IOException("Не удалось войти в Google. Проверьте настройку Android-клиента по инструкции.");prefs.edit().putBoolean("enabled",false).remove("account").apply();synchronized(this){token=result.getAccessToken();tokenUntil=System.currentTimeMillis()+45*60*1000;}prefs.edit().putBoolean("enabled",true).apply();JSONObject about=json("about?fields=user(permissionId,emailAddress)");prefs.edit().putString("account",about.getJSONObject("user").getString("permissionId")).putString("email",about.getJSONObject("user").getString("emailAddress")).remove("error").apply();enqueue();reply(requestId,Boolean.TRUE,null);}catch(Exception e){prefs.edit().putBoolean("enabled",false).apply();reply(requestId,null,message(e));}});}
    private static String message(Exception e){return e instanceof IOException?e.getMessage():"Не удалось завершить синхронизацию. Проверьте подключение Google Диска.";}
    private static void reply(String id,Object data,String error){try{JSONObject response=new JSONObject().put("id",id);if(error!=null)response.put("error",error);else response.put("data",data==null?JSONObject.NULL:data);MainActivity activity=MainActivity.getInstance();if(activity!=null)activity.sendCloudResponse(response);}catch(Exception ignored){}}
    void request(String id,String operation,String payload){if("connect".equals(operation)){connect(id);return;}((operation.equals("connectLive")||operation.equals("connectSend")||operation.equals("connectAck")||operation.equals("connectInfo"))?liveExecutor:operation.startsWith("connect")?connectExecutor:executor).execute(()->{try{reply(id,request(operation,new JSONObject(payload)),null);}catch(Exception e){reply(id,null,message(e));}});}
    private Object request(String operation,JSONObject payload) throws Exception {if(operation.startsWith("connect"))return connect.request(operation,payload);switch(operation){
        case "realtimeSession":return realtime.session();
        case "stage":return stage(payload);
        case "stageChunk":return stageChunk(payload);
        case "stageComplete":JSONObject staged=stages.get(payload.getString("id"));if(staged==null||staged.getLong("offset")!=staged.getLong("size"))throw new IOException("Импорт песни ещё не завершён.");stages.remove(payload.getString("id"));return new JSONObject().put("source",Uri.fromFile(new File(staged.getString("path"))).toString());
        case "status":return new JSONObject().put("realtimeAvailable",true).put("connected",prefs.getBoolean("enabled",false)).put("configured",true).put("canFlush",true).put("account",prefs.getString("account","")).put("email",prefs.getString("email","")).put("error",prefs.getString("error","")).put("pending",pendingCount());
        case "disconnect":realtime.reset();prefs.edit().putBoolean("enabled",false).remove("email").remove("account").remove("error").apply();synchronized(this){token=null;}WorkManager.getInstance(context).cancelUniqueWork("playerium-drive");WorkManager.getInstance(context).cancelUniqueWork("playerium-drive-retry");return true;
        case "fingerprint":return fingerprint(payload.getString("source"));
        case "pull":return pull(payload.optString("cursor",""));
        case "publish":publish(payload);return new JSONObject().put("queued",true);
        case "flush":runJobs();return true;
        case "download":return download(payload.getString("key"),payload.getJSONObject("track"));
        case "queueDownloads":queueDownloads(payload.getJSONArray("tracks"));return true;
        case "cover":JSONObject cover=metadata(payload.getString("id"),"cover");if(cover.getLong("size")>4*1024*1024)throw new IOException("Обложка слишком большая.");return new JSONObject().put("base64",Base64.encodeToString(media(payload.getString("id"),4*1024*1024),Base64.NO_WRAP));
        case "removeLocal":return removeLocal(payload.getString("key"));
        default:throw new IOException("Неизвестная операция синхронизации.");
    }}
    private boolean removeLocal(String key)throws Exception{synchronized(downloadLock){return removeLocalFile(key);}}
    private boolean removeLocalFile(String key)throws Exception{
        requireHash(key);File queued=new File(jobs,"download-"+key+".json");if(queued.exists()&&!queued.delete())throw new IOException("Не удалось отменить загрузку.");
        File[] files=cache.listFiles();if(files!=null)for(File file:files)if(file.getName().startsWith(key+".")&&file.getName().matches(key+"\\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)(\\.part)?"))if(!file.delete())throw new IOException("Не удалось удалить локальную копию.");return true;
    }
    private static void requireHash(String key)throws IOException{if(!key.matches("[a-f0-9]{64}"))throw new IOException("Некорректная запись песни.");}
    private static void requireId(String id)throws IOException{if(!id.matches("[A-Za-z0-9_-]{1,160}"))throw new IOException("Некорректная облачная запись.");}
    private static String query(String value)throws Exception{return URLEncoder.encode(value,"UTF-8");}
    HttpURLConnection connection(String url,String method)throws Exception{if(!url.startsWith(API)&&!url.startsWith("https://www.googleapis.com/upload/drive/"))throw new IOException("Недопустимый адрес Google Диска.");HttpURLConnection c=connections.open(url);c.setInstanceFollowRedirects(false);c.setConnectTimeout(30000);c.setReadTimeout(60000);c.setRequestMethod(method);c.setRequestProperty("Authorization","Bearer "+token());return c;}
    void check(HttpURLConnection c)throws Exception{int status=c.getResponseCode();if(status==401){String expired;synchronized(this){expired=token;token=null;tokenUntil=0;}if(expired!=null)try{com.google.android.gms.auth.GoogleAuthUtil.clearToken(context,expired);}catch(Exception ignored){}throw new IOException("Войдите в Google Диск повторно.");}if(status<200||status>=300)throw new DriveException(status);}
    private static final class DriveException extends IOException{final int status;DriveException(int code){super(code==403?"Google Диск ограничил доступ или закончилась квота.":"Не удалось связаться с Google Диском.");status=code;}}
    static byte[] read(InputStream input,int limit)throws Exception{try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new IOException("Облачные данные слишком большие.");out.write(buffer,0,n);}return out.toByteArray();}}
    private JSONObject json(String route)throws Exception{HttpURLConnection c=connection(API+route,"GET");try{check(c);return new JSONObject(new String(read(c.getInputStream(),4*1024*1024),"UTF-8"));}finally{c.disconnect();}}
    private JSONObject post(String route,JSONObject value)throws Exception{HttpURLConnection c=connection(API+route,"POST");try{byte[] bytes=value.toString().getBytes("UTF-8");c.setRequestProperty("Content-Type","application/json");c.setDoOutput(true);c.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=c.getOutputStream()){out.write(bytes);}check(c);return new JSONObject(new String(read(c.getInputStream(),65536),"UTF-8"));}finally{c.disconnect();}}
    JSONArray list(String extra)throws Exception{JSONArray all=new JSONArray();String next="";do{String q="trashed = false and appProperties has { key='playeriumCloud' and value='1' }"+(extra.isEmpty()?"":" and "+extra);JSONObject page=json("files?q="+query(q)+"&fields="+query("nextPageToken,files(id,name,appProperties,mimeType,size)")+"&pageSize=1000"+(next.isEmpty()?"":"&pageToken="+query(next)));JSONArray files=page.optJSONArray("files");if(files!=null)for(int i=0;i<files.length();i++)all.put(files.getJSONObject(i));next=page.optString("nextPageToken","");}while(!next.isEmpty());return all;}
    JSONObject find(String key)throws Exception{if(!key.matches("[A-Za-z0-9_-]{1,160}|(?:audio|cover):[a-f0-9]{64}|(?:device|command):[A-Za-z0-9_-]{1,100}"))throw new IOException("Некорректный идентификатор.");JSONArray files=list("appProperties has { key='key' and value='"+key+"' }");return files.length()==0?null:files.getJSONObject(0);}
    String folder()throws Exception{JSONArray files=list("mimeType = 'application/vnd.google-apps.folder'");if(files.length()>0)return files.getJSONObject(0).getString("id");return post("files?fields=id",new JSONObject().put("name","Playerium").put("mimeType","application/vnd.google-apps.folder").put("appProperties",properties("folder","folder"))).getString("id");}
    private static JSONObject properties(String kind,String key)throws JSONException{return new JSONObject().put("playeriumCloud","1").put("kind",kind).put("key",key);}
    private JSONObject metadata(String id,String kind)throws Exception{requireId(id);JSONObject m=json("files/"+id+"?fields=id,appProperties,mimeType,size");JSONObject props=m.getJSONObject("appProperties");if(!"1".equals(props.optString("playeriumCloud"))||!kind.equals(props.optString("kind")))throw new IOException("Этот файл не принадлежит медиатеке Playerium.");return m;}
    byte[] media(String id,int limit)throws Exception{requireId(id);HttpURLConnection c=connection(API+"files/"+id+"?alt=media","GET");try{check(c);return read(c.getInputStream(),limit);}finally{c.disconnect();}}
    private JSONObject pull(String cursor)throws Exception{JSONArray files=new JSONArray(),events=new JSONArray();String next=cursor;
        if(cursor.isEmpty()||"null".equals(cursor)){next=json("changes/startPageToken").getString("startPageToken");files=list("appProperties has { key='kind' and value='event' }");}
        else {String page=cursor;do{JSONObject data;try{data=json("changes?pageToken="+query(page)+"&pageSize=1000&fields="+query("nextPageToken,newStartPageToken,changes(removed,file(id,appProperties))"));}catch(DriveException e){if(e.status==410)return pull("");throw e;}JSONArray changes=data.optJSONArray("changes");if(changes!=null)for(int i=0;i<changes.length();i++){JSONObject change=changes.getJSONObject(i),file=change.optJSONObject("file");if(!change.optBoolean("removed")&&file!=null&&file.optJSONObject("appProperties")!=null&&"1".equals(file.getJSONObject("appProperties").optString("playeriumCloud"))&&"event".equals(file.getJSONObject("appProperties").optString("kind")))files.put(file);}page=data.optString("nextPageToken","");next=data.optString("newStartPageToken",next);}while(!page.isEmpty());}
        java.util.concurrent.ExecutorService reads=java.util.concurrent.Executors.newFixedThreadPool(4);
        try{java.util.List<java.util.concurrent.Future<JSONObject>> futures=new java.util.ArrayList<>();final String account=prefs.getString("account","");
            for(int i=0;i<files.length();i++){final String id=files.getJSONObject(i).getString("id");futures.add(reads.submit(()->{expectedAccount.set(account);try{metadata(id,"event");return new JSONObject(new String(media(id,262144),"UTF-8"));}finally{expectedAccount.remove();}}));}
            for(java.util.concurrent.Future<JSONObject> future:futures)events.put(future.get());
        }finally{reads.shutdownNow();}return new JSONObject().put("cursor",next).put("events",events);
    }
    private InputStream source(String value)throws Exception{Uri uri=Uri.parse(value);if(!MainActivity.hasMusicPermission(context,uri))throw new IOException("Выберите папку музыки повторно, чтобы восстановить доступ.");InputStream input=context.getContentResolver().openInputStream(uri);if(input==null)throw new IOException("Не удалось прочитать песню.");return input;}
    static String hex(byte[] digest){StringBuilder result=new StringBuilder();for(byte b:digest)result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();}
    private JSONObject fingerprint(String value)throws Exception{Uri uri=Uri.parse(value);String name;if("file".equals(uri.getScheme()))name=new File(uri.getPath()).getName();else {DocumentFile file=DocumentFile.fromSingleUri(context,uri);name=file==null?null:file.getName();}String extension=name!=null&&name.lastIndexOf('.')>=0?name.substring(name.lastIndexOf('.')).toLowerCase(Locale.ROOT):"";if(!extension.matches("\\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)"))throw new IOException("Выберите аудиофайл.");MessageDigest hash=MessageDigest.getInstance("SHA-256");long size=0;try(InputStream in=source(value)){byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){size+=n;if(size>1073741824L)throw new IOException("Размер песни должен быть не больше 1 ГБ.");hash.update(buffer,0,n);}}if(size<1)throw new IOException("Аудиофайл пуст.");return new JSONObject().put("key",hex(hash.digest())).put("size",size).put("ext",extension);}
    private static void atomic(File file,JSONObject value)throws Exception{if(!file.getParentFile().isDirectory()&&!file.getParentFile().mkdirs())throw new IOException("Не удалось сохранить очередь.");File tmp=new File(file.getPath()+".tmp");try(FileOutputStream out=new FileOutputStream(tmp)){out.write(value.toString().getBytes("UTF-8"));out.getFD().sync();}if(!tmp.renameTo(file))throw new IOException("Не удалось сохранить очередь.");}
    private static JSONObject readJob(File file)throws Exception{return new JSONObject(new String(read(new FileInputStream(file),8*1024*1024),"UTF-8"));}
    private synchronized void queueDownloads(JSONArray tracks)throws Exception{
        if(!prefs.getBoolean("enabled",false))throw new IOException("Подключите Google Диск.");
        for(int i=0;i<tracks.length();i++){JSONObject entry=tracks.getJSONObject(i);String key=entry.getString("key");requireHash(key);JSONObject track=entry.getJSONObject("track");requireId(track.getString("audioId"));
            atomic(new File(jobs,"download-"+key+".json"),new JSONObject().put("account",prefs.getString("account","")).put("download",entry));}
        enqueue();
    }
    private synchronized void publish(JSONObject payload)throws Exception{if(!prefs.getBoolean("enabled",false))throw new IOException("Подключите Google Диск.");JSONObject op=payload.getJSONObject("operation");requireId(op.getString("id"));if(op.getInt("version")!=1)throw new IOException("Некорректное изменение.");File file=new File(jobs,op.getString("id")+".json");if(file.exists()){enqueue();return;}if("track".equals(op.getString("kind"))){JSONObject info=fingerprint(payload.getString("source"));if(!info.getString("key").equals(op.getString("key")))throw new IOException("Песня изменилась. Повторите синхронизацию.");}payload.put("account",prefs.getString("account",""));atomic(file,payload);enqueue();}
    private void enqueue(){Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();OneTimeWorkRequest work=new OneTimeWorkRequest.Builder(CloudWorker.class).setConstraints(constraints).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build();WorkManager manager=WorkManager.getInstance(context);manager.enqueueUniqueWork("playerium-drive",ExistingWorkPolicy.APPEND_OR_REPLACE,work);manager.enqueueUniquePeriodicWork("playerium-drive-retry",ExistingPeriodicWorkPolicy.KEEP,new PeriodicWorkRequest.Builder(CloudWorker.class,15,TimeUnit.MINUTES).setConstraints(constraints).build());}
    boolean hasPendingJobs(){if(!prefs.getBoolean("enabled",false))return false;return pendingCount()>0||realtime.pending()>0;}
    private JSONObject stage(JSONObject data)throws Exception{String extension=data.getString("ext");long size=data.getLong("size");if(!extension.matches("\\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)")||size<1||size>1073741824L||stages.size()>=4)throw new IOException("Некорректный размер песни.");if(!cache.isDirectory()&&!cache.mkdirs())throw new IOException("Не удалось сохранить песню.");new File(cache,".nomedia").createNewFile();String id=UUID.randomUUID().toString();File file=new File(cache,"staged-"+id+extension);if(!file.createNewFile())throw new IOException("Не удалось сохранить песню.");stages.put(id,new JSONObject().put("path",file.getPath()).put("size",size).put("offset",0));return new JSONObject().put("id",id);}
    private boolean stageChunk(JSONObject data)throws Exception{JSONObject staged=stages.get(data.getString("id"));String value=data.getString("base64");if(staged==null||data.getLong("offset")!=staged.getLong("offset")||value.length()>720000)throw new IOException("Некорректная передача песни.");byte[] bytes=Base64.decode(value,Base64.DEFAULT);if(bytes.length>524288||staged.getLong("offset")+bytes.length>staged.getLong("size"))throw new IOException("Некорректный размер песни.");try(FileOutputStream out=new FileOutputStream(staged.getString("path"),true)){out.write(bytes);}staged.put("offset",staged.getLong("offset")+bytes.length);return true;}
    private String upload(String key,String kind,byte[] bytes,String source,String mime,JSONObject job,File jobFile)throws Exception{
        JSONObject found=find(key);if(found!=null)return found.getString("id");long size=bytes==null?job.getJSONObject("operation").getJSONObject("track").getLong("size"):bytes.length;
        JSONObject sessions=job.optJSONObject("sessions");if(sessions==null){sessions=new JSONObject();job.put("sessions",sessions);}String url=sessions.optString(key,"");
        if(url.isEmpty()){HttpURLConnection c=connection("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id","POST");try{JSONObject op=job.getJSONObject("operation");JSONObject meta=new JSONObject().put("name",key.replace(':','-')+(kind.equals("audio")?op.getJSONObject("track").getString("ext"):kind.equals("event")?".json":".jpg")).put("mimeType",mime).put("parents",new JSONArray().put(folder())).put("appProperties",properties(kind,key));byte[] body=meta.toString().getBytes("UTF-8");c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("X-Upload-Content-Type",mime);c.setRequestProperty("X-Upload-Content-Length",String.valueOf(size));c.setDoOutput(true);c.setFixedLengthStreamingMode(body.length);try(OutputStream out=c.getOutputStream()){out.write(body);}check(c);url=c.getHeaderField("Location");if(url==null||!url.startsWith("https://www.googleapis.com/upload/drive/"))throw new IOException("Некорректная сессия загрузки.");sessions.put(key,url);atomic(jobFile,job);}finally{c.disconnect();}}
        long offset=0;HttpURLConnection probe=connection(url,"PUT");try{probe.setRequestProperty("Content-Range","bytes */"+size);probe.setDoOutput(true);probe.setFixedLengthStreamingMode(0);probe.getOutputStream().close();int status=probe.getResponseCode();if(status==200||status==201)return new JSONObject(new String(read(probe.getInputStream(),65536),"UTF-8")).getString("id");if(status==404||status==410){sessions.remove(key);atomic(jobFile,job);return upload(key,kind,bytes,source,mime,job,jobFile);}if(status!=308)throw new DriveException(status);String range=probe.getHeaderField("Range");if(range!=null)offset=Long.parseLong(range.substring(range.lastIndexOf('-')+1))+1;}finally{probe.disconnect();}
        try(InputStream input=bytes==null?source(source):new ByteArrayInputStream(bytes)){long skipped=0;while(skipped<offset){long n=input.skip(offset-skipped);if(n<1){if(input.read()<0)throw new IOException("Песня изменилась.");n=1;}skipped+=n;}byte[] buffer=new byte[4*1024*1024];while(offset<size){if(!prefs.getBoolean("enabled",false))throw new IOException("Синхронизация отключена.");int length=(int)Math.min(buffer.length,size-offset),total=0;while(total<length){int n=input.read(buffer,total,length-total);if(n<0)throw new IOException("Песня изменилась.");total+=n;}HttpURLConnection c=connection(url,"PUT");try{c.setRequestProperty("Content-Type",mime);c.setRequestProperty("Content-Range","bytes "+offset+"-"+(offset+length-1)+"/"+size);c.setDoOutput(true);c.setFixedLengthStreamingMode(length);try(OutputStream out=c.getOutputStream()){out.write(buffer,0,length);}int status=c.getResponseCode();if(status==200||status==201)return new JSONObject(new String(read(c.getInputStream(),65536),"UTF-8")).getString("id");if(status!=308)throw new DriveException(status);String range=c.getHeaderField("Range");long accepted=range==null?0:Long.parseLong(range.substring(range.lastIndexOf('-')+1))+1;if(accepted!=offset+length)throw new IOException("Загрузка продолжится с подтверждённой позиции.");offset=accepted;}finally{c.disconnect();}}}throw new IOException("Google не подтвердил сохранение файла.");
    }
    int pendingCount(){int count=0;File[] files=jobs.listFiles();if(files!=null)for(File file:files)if(file.getName().matches("[A-Za-z0-9_-]+\\.json"))try{if(prefs.getString("account","").equals(readJob(file).optString("account")))count++;}catch(Exception ignored){}return count;}
    boolean runJobs()throws Exception{synchronized(jobLock){return runJobsLocked();}}
    private boolean runJobsLocked()throws Exception{
        if(!prefs.getBoolean("enabled",false))return true;File[] files=jobs.listFiles();if(files==null)files=new File[0];Exception failure=null;
        for(File file:files){
            if(!prefs.getBoolean("enabled",false))return true;if(!file.getName().matches("[A-Za-z0-9_-]+\\.json"))continue;
            try{JSONObject job=readJob(file);if(!prefs.getString("account","").equals(job.optString("account")))continue;
                expectedAccount.set(job.getString("account"));
                if(job.has("download")){JSONObject entry=job.getJSONObject("download");download(entry.getString("key"),entry.getJSONObject("track"));if(!file.delete())throw new IOException("Не удалось завершить очередь.");continue;}
                JSONObject op=job.getJSONObject("operation");
                JSONObject existing=find(op.getString("id"));
                if(existing==null){
                    if("track".equals(op.getString("kind"))){
                        JSONObject info=fingerprint(job.getString("source"));if(!info.getString("key").equals(op.getString("key")))throw new IOException("Песня изменилась до завершения загрузки.");
                        JSONObject track=op.getJSONObject("track");track.put("audioId",upload("audio:"+op.getString("key"),"audio",null,job.getString("source"),"application/octet-stream",job,file));
                        JSONObject cover=job.optJSONObject("cover");if(cover!=null){byte[] bytes=Base64.decode(cover.getString("base64"),Base64.DEFAULT);String mime=cover.getString("mime");if(bytes.length>4*1024*1024||!mime.matches("image/(jpeg|png|webp)"))throw new IOException("Некорректная обложка.");String key=hex(MessageDigest.getInstance("SHA-256").digest(bytes));track.put("coverId",upload("cover:"+key,"cover",bytes,null,mime,job,file));track.put("coverMime",mime);}
                    }
                    upload(op.getString("id"),"event",op.toString().getBytes("UTF-8"),null,"application/json",job,file);
                }
                if(existing!=null)op=new JSONObject(new String(media(existing.getString("id"),262144),"UTF-8"));
                realtime.enqueue(op);
                if(!file.delete())throw new IOException("Не удалось завершить очередь.");
            }catch(Exception e){if(failure==null)failure=e;}finally{expectedAccount.remove();}
        }
        if(failure!=null)throw failure;try{realtime.drain();}catch(Exception ignored){/* Drive is complete; the realtime outbox is retried by the next worker/sync. */}prefs.edit().remove("error").apply();return true;
    }
    void recordFailure(Exception e){prefs.edit().putString("error",message(e)).apply();}
    JSONObject localCopy(String key,JSONObject track)throws Exception{
        requireHash(key);String ext=track.getString("ext");if(!ext.matches("\\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)"))throw new IOException("Некорректная песня.");File file=new File(cache,key+ext);if(!file.isFile()||file.length()!=track.getLong("size"))return null;
        File marker=new File(cache,key+ext+".verified");String stamp=file.length()+":"+file.lastModified();boolean verified=false;try{verified=new String(read(new FileInputStream(marker),100),"UTF-8").equals(stamp);}catch(Exception ignored){}
        if(!verified){if(!fingerprint(Uri.fromFile(file).toString()).getString("key").equals(key))return null;try(FileOutputStream out=new FileOutputStream(marker)){out.write(stamp.getBytes("UTF-8"));}}
        return new JSONObject().put("name",file.getName()).put("uri",Uri.fromFile(file).toString()).put("folderSource",Uri.fromFile(cache).toString()).put("folderName","Облачная медиатека").put("size",file.length()).put("lastModified",file.lastModified()).put("metadata",track);
    }
    JSONObject download(String key,JSONObject track)throws Exception{synchronized(downloadLock){return downloadFile(key,track);}}
    private JSONObject downloadFile(String key,JSONObject track)throws Exception{requireHash(key);String extension=track.getString("ext");long size=track.getLong("size");if(!extension.matches("\\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)")||size<1||size>1073741824L)throw new IOException("Некорректная песня.");JSONObject meta=metadata(track.getString("audioId"),"audio");if(!("audio:"+key).equals(meta.getJSONObject("appProperties").getString("key"))||meta.getLong("size")!=size)throw new IOException("Облачная песня не совпадает с записью.");if(!cache.isDirectory()&&!cache.mkdirs())throw new IOException("Не удалось создать папку музыки.");new File(cache,".nomedia").createNewFile();File target=new File(cache,key+extension),partial=new File(cache,target.getName()+".part");boolean complete=false;if(target.isFile())complete=fingerprint(Uri.fromFile(target).toString()).getString("key").equals(key);
        if(!complete){long offset=partial.length();if(offset>=size){if(!partial.delete())throw new IOException("Не удалось перезапустить загрузку.");offset=0;}HttpURLConnection c=connection(API+"files/"+track.getString("audioId")+"?alt=media","GET");try{if(offset>0)c.setRequestProperty("Range","bytes="+offset+"-");check(c);if(offset>0&&c.getResponseCode()!=206){if(!partial.delete())throw new IOException("Не удалось продолжить загрузку.");offset=0;}try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(partial,offset>0)){long total=offset;byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){total+=n;if(total>size)throw new IOException("Размер песни не совпадает.");out.write(buffer,0,n);}out.getFD().sync();if(total!=size)throw new IOException("Загрузка песни прервалась.");}}finally{c.disconnect();}MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(partial)){byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)digest.update(buffer,0,n);}if(!hex(digest.digest()).equals(key))throw new IOException("Песня загрузилась с ошибкой. Повторите синхронизацию.");if(!partial.renameTo(target))throw new IOException("Не удалось сохранить песню.");}
        JSONObject result=new JSONObject().put("name",target.getName()).put("uri",Uri.fromFile(target).toString()).put("folderSource",Uri.fromFile(cache).toString()).put("folderName","Облачная медиатека").put("size",size).put("lastModified",target.lastModified());JSONObject data=new JSONObject();for(String field:new String[]{"title","artist","album","duration","year","genre","trackNo","isrc"})if(track.has(field))data.put(field,track.get(field));result.put("metadata",data);if(track.has("coverId"))try{JSONObject m=metadata(track.getString("coverId"),"cover");if(m.getLong("size")<=4*1024*1024){result.put("coverBase64",Base64.encodeToString(media(track.getString("coverId"),4*1024*1024),Base64.NO_WRAP));result.put("coverMime",track.optString("coverMime","image/jpeg"));}}catch(Exception ignored){}return result;
    }
}

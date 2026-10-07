package com.playerium.music;

import android.content.Context;
import android.content.UriPermission;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.AtomicFile;
import android.util.Base64;
import androidx.documentfile.provider.DocumentFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;

/** Own process adapter for separate Python/yt-dlp/FFmpeg command-line tools. */
final class MusicEngine {
    private static MusicEngine instance;
    static synchronized MusicEngine get(Context context) {
        if(instance==null)instance=new MusicEngine(context.getApplicationContext());return instance;
    }
    private final Context context;
    private final ExecutorService workers=Executors.newFixedThreadPool(5);
    private final ExecutorService downloader=Executors.newSingleThreadExecutor();
    private final Map<String,Process> processes=new ConcurrentHashMap<>();
    private final Map<String,Future<?>> tasks=new ConcurrentHashMap<>();
    private final File runtime;
    private JSONObject records;
    private String musicClientVersion;
    private MusicEngine(Context context){this.context=context;runtime=new File(context.getNoBackupFilesDir(),"music-runtime-0.18.1-2026.08.19");}
    void cancel(String id){Process process=processes.remove(id);if(process!=null)process.destroy();Future<?> task=tasks.remove(id);if(task!=null)task.cancel(true);}
    void request(String id,String operation,String json) {
        if(!id.matches("[\\w-]{1,100}"))return;
        Future<?> task=(operation.equals("download")||operation.equals("delete")?downloader:workers).submit(()->{
            JSONObject result=new JSONObject();
            try {result.put("id",id).put("data",execute(operation,new JSONObject(json),id));}
            catch(Exception e){try{result.put("id",id).put("error",e instanceof SecurityException?e.getMessage():downloadError(e));}catch(Exception ignored){}}
            MainActivity current=MainActivity.getInstance();if(current!=null)current.sendMusicResponse(result);
            tasks.remove(id);
        });
        tasks.put(id,task);if(task.isDone())tasks.remove(id);
    }
    private static String downloadError(Exception error) {
        String message=error==null?"":String.valueOf(error.getMessage());
        if(message.startsWith("Не удалось")||message.startsWith("Полная версия")||message.startsWith("Полная запись")||message.startsWith("Аудиосервис")||message.startsWith("Недостаточно"))return message;
        String text=message.toLowerCase(Locale.ROOT);
        if(text.matches("(?s).*(no space|enospc).*$"))return "Недостаточно места для сохранения трека.";
        if(text.matches("(?s).*(drm|protected|premium|subscription|only.*preview).*$"))return "Полная запись защищена от скачивания. Другую доступную запись найти не удалось.";
        if(text.matches("(?s).*(403|429|451|geo.?restrict|sign in|captcha|blocked).*$"))return "Аудиосервис ограничил доступ к этой записи. Попробуйте другую сеть или VPN.";
        if(text.matches("(?s).*(timeout|timed out|network|connection|resolve|certificate|tunnel|ssl).*$"))return "Не удалось соединиться с аудиосервисом. Проверьте сеть и настройки VPN.";
        return "Полная версия этой записи недоступна для скачивания. Попробуйте позже.";
    }
    private String get(String url) throws Exception {
        return get(url,null);
    }
    private String get(String url,String body) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();
        connection.setConnectTimeout(15000);connection.setReadTimeout(20000);
        connection.setRequestProperty("User-Agent","Playerium/1.6.0 (https://github.com/AdlerDaniel/Playerium)");
        try {
            if(body!=null){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Origin","https://music.youtube.com");try(OutputStream out=connection.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
            try(InputStream in=connection.getInputStream()){return new String(read(in,4*1024*1024),StandardCharsets.UTF_8);}
        }finally{connection.disconnect();}
    }
    private static byte[] read(InputStream input,int limit) throws IOException {
        ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[65536];int n;
        while((n=input.read(buffer))!=-1){output.write(buffer,0,n);if(output.size()>limit)throw new IOException("Response too large");}return output.toByteArray();
    }
    private Object execute(String operation,JSONObject payload,String id) throws Exception {
        if(operation.equals("restore")){JSONArray files=new JSONArray();JSONObject saved; synchronized(this){saved=new JSONObject(records().toString());}Iterator<String> keys=saved.keys();while(keys.hasNext()) {JSONObject record=saved.getJSONObject(keys.next());if(exists(record))files.put(record);}return files;}
        if(operation.equals("describe")){JSONObject record=records().optJSONObject(payload.getString("downloadId"));if(record==null)throw new IOException("Track unavailable");return withCover(record);}
        if(operation.equals("delete")) {String key=payload.getString("downloadId");JSONObject record=records().optJSONObject(key);if(record!=null){deleteOwned(record);records().remove(key);saveRecords();}return true;}
        String query=payload.optString("query").trim();if(query.length()>200)query=query.substring(0,200);
        if(operation.equals("catalog")) {
            String q=URLEncoder.encode(query,"UTF-8"),url;
            switch(payload.getString("provider")) {
                case "itunes":url="https://itunes.apple.com/search?term="+q+"&entity=song&limit=35&country=US";break;
                case "itunesUA":url="https://itunes.apple.com/search?term="+q+"&entity=song&limit=35&country=UA";break;
                case "deezer":url="https://api.deezer.com/search?q="+q+"&limit=35";break;
                case "musicbrainz":url="https://musicbrainz.org/ws/2/recording/?query="+q+"&fmt=json&limit=20";break;
                case "audius":url="https://discoveryprovider.audius.co/v1/tracks/search?query="+q+"&limit=20&app_name=Playerium";break;
                case "bandcamp":url="https://bandcamp.com/search?q="+q+"&item_type=t";break;
                default:throw new SecurityException("Недопустимый запрос");
            }
            String text=get(url);return payload.getString("provider").equals("bandcamp")?text:new JSONObject(text);
        }
        if(operation.equals("search")) {
            if(payload.getString("provider").equals("youtubeMusic")) {
                try {
                    if(musicClientVersion==null) {
                        java.util.regex.Matcher matcher=java.util.regex.Pattern.compile("\"INNERTUBE_CLIENT_VERSION\"\\s*:\\s*\"([^\"]+)\"").matcher(get("https://music.youtube.com/"));
                        if(matcher.find())musicClientVersion=matcher.group(1);
                    }
                    if(musicClientVersion==null)throw new IOException("Не удалось получить результаты поиска.");
                    JSONObject client=new JSONObject().put("clientName","WEB_REMIX").put("clientVersion",musicClientVersion).put("hl","en");
                    JSONObject body=new JSONObject().put("context",new JSONObject().put("client",client)).put("query",query).put("params","EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D");
                    return new JSONObject(get("https://music.youtube.com/youtubei/v1/search?prettyPrint=false",body.toString()));
                }catch(Exception e){musicClientVersion=null;throw e;}
            }
            String url;
            switch(payload.getString("provider")) {
                case "youtubeMusic":url="https://music.youtube.com/search?q="+URLEncoder.encode(query,"UTF-8")+"#songs";break;
                case "youtubeAudio":url="ytsearch12:"+query+" official audio";break;
                case "soundcloud":url="scsearch12:"+query;break;
                default:throw new SecurityException("Недопустимый запрос");
            }
            return new JSONObject(run(Arrays.asList("--flat-playlist","--dump-single-json","--playlist-end","12","--ignore-errors","--skip-download","--",url),id,60000));
        }
        if(operation.equals("download"))return download(payload,id);
        throw new SecurityException("Недопустимая операция");
    }
    private synchronized void initialize() throws Exception {
        if(Build.VERSION.SDK_INT<24)throw new SecurityException("Сохранение новых песен доступно на Android 7 и новее");
        if(new File(runtime,"ready").exists())return;
        runtime.mkdirs();File nativeDir=new File(context.getApplicationInfo().nativeLibraryDir);
        unzip(new File(nativeDir,"libpython.zip.so"),new File(runtime,"python"));
        unzip(new File(nativeDir,"libffmpeg.zip.so"),new File(runtime,"ffmpeg"));
        try(InputStream in=context.getAssets().open("music-runtime/yt-dlp");OutputStream out=new FileOutputStream(new File(runtime,"yt-dlp"))){copy(in,out);}
        new File(runtime,"ready").createNewFile();
    }
    private static void unzip(File zip,File root) throws Exception {
        root.mkdirs();String prefix=root.getCanonicalPath()+File.separator;
        JSONObject links=new JSONObject();
        try(ZipInputStream input=new ZipInputStream(new FileInputStream(zip))) {
            ZipEntry entry;while((entry=input.getNextEntry())!=null){if(entry.getName().equals("playerium-links.json")){links=new JSONObject(new String(read(input,1024*1024),StandardCharsets.UTF_8));continue;}File target=new File(root,entry.getName());if(!target.getCanonicalPath().startsWith(prefix))throw new SecurityException("Invalid runtime archive");
                if(entry.isDirectory())target.mkdirs();else {target.getParentFile().mkdirs();try(OutputStream out=new FileOutputStream(target)){copy(input,out);}}}
        }
        Iterator<String> names=links.keys();while(names.hasNext()){
            String name=names.next(),destination=links.getString(name);File link=new File(root,name),target=new File(link.getParentFile(),destination);
            if(destination.startsWith("/")||!link.getCanonicalPath().startsWith(prefix)||!target.getCanonicalPath().startsWith(prefix))throw new SecurityException("Invalid runtime link");
            link.getParentFile().mkdirs();link.delete();android.system.Os.symlink(destination,link.getAbsolutePath());
        }
    }
    private static void copy(InputStream in,OutputStream out) throws IOException {byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}
    private String run(List<String> args,String id,long timeout) throws Exception {
        initialize();File nativeDir=new File(context.getApplicationInfo().nativeLibraryDir);
        List<String> command=new ArrayList<>();command.add(new File(nativeDir,"libpython.so").getAbsolutePath());command.add(new File(runtime,"yt-dlp").getAbsolutePath());
        command.addAll(Arrays.asList("--ignore-config","--no-warnings","--socket-timeout","15","--retries","1","--js-runtimes","quickjs:"+new File(nativeDir,"libqjs.so"),"--ffmpeg-location",new File(nativeDir,"libffmpeg.so").getAbsolutePath()));command.addAll(args);
        ProcessBuilder builder=new ProcessBuilder(command);
        Map<String,String> env=builder.environment();env.put("PYTHONHOME",new File(runtime,"python/usr").getAbsolutePath());
        env.put("LD_LIBRARY_PATH",new File(runtime,"python/usr/lib")+":"+new File(runtime,"ffmpeg/usr/lib"));
        env.put("SSL_CERT_FILE",new File(runtime,"python/usr/etc/tls/cert.pem").getAbsolutePath());env.put("TMPDIR",context.getCacheDir().getAbsolutePath());
        env.put("PATH",System.getenv("PATH")+":"+nativeDir);env.put("HOME",runtime.getAbsolutePath());
        Process process=builder.start();processes.put(id,process);
        FutureTask<byte[]> stdout=new FutureTask<>(()->read(process.getInputStream(),12*1024*1024));
        FutureTask<byte[]> stderr=new FutureTask<>(()->read(process.getErrorStream(),2*1024*1024));new Thread(stdout).start();new Thread(stderr).start();
        try {
            long deadline=System.currentTimeMillis()+timeout;
            while(true){try{process.exitValue();break;}catch(IllegalThreadStateException running){if(System.currentTimeMillis()>deadline){process.destroy();throw new IOException("Timed out");}Thread.sleep(100);}}
            String output=new String(stdout.get(5,TimeUnit.SECONDS),StandardCharsets.UTF_8).trim();String diagnostic=new String(stderr.get(5,TimeUnit.SECONDS),StandardCharsets.UTF_8);
            if(process.exitValue()!=0&&!(args.contains("--ignore-errors")&&!output.isEmpty()))throw new IOException("Recording unavailable: "+diagnostic.substring(0,Math.min(2000,diagnostic.length())));return output;
        }finally{processes.remove(id);process.destroy();}
    }
    private synchronized JSONObject records() throws Exception {
        if(records==null){File file=new File(context.getFilesDir(),"music-downloads.json");try(InputStream in=new FileInputStream(file)){records=new JSONObject(new String(read(in,4*1024*1024),StandardCharsets.UTF_8));}catch(Exception e){records=new JSONObject();}}return records;
    }
    private synchronized void saveRecords() throws Exception {
        AtomicFile file=new AtomicFile(new File(context.getFilesDir(),"music-downloads.json"));FileOutputStream out=file.startWrite();try{out.write(records.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(out);}catch(Exception e){file.failWrite(out);throw e;}
    }
    private boolean exists(JSONObject record) {
        Uri uri=Uri.parse(record.optString("uri"));if("file".equals(uri.getScheme()))return new File(uri.getPath()).isFile();
        DocumentFile file=DocumentFile.fromSingleUri(context,uri);return file!=null&&file.exists();
    }
    private static String norm(String value){return Normalizer.normalize(value,Normalizer.Form.NFKD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+"," ").trim();}
    private static String artist(String value){return norm(value.replaceAll("(?i)\\s*-\\s*Topic$","").split("(?i)\\s+(?:feat\\.?|ft\\.?|featuring|x)\\s+|\\s*[,&]\\s*")[0]);}
    private static boolean matches(JSONObject track,JSONObject info) {
        String title=info.optString("track",info.optString("title")),who=info.optString("artist",info.optString("uploader",info.optString("channel")));
        JSONArray credits=info.optJSONArray("artists");boolean credited=!info.optString("artist").isEmpty()||credits!=null&&credits.length()>0;
        if(info.optString("artist").isEmpty()&&credits!=null&&credits.length()>0){who=credits.optString(0);}
        if(title.matches(".*\\s[-–—]\\s.*")){String[] parts=title.split("\\s[-–—]\\s",2);if(!credited){who=parts[0];title=parts[1];}else if(artist(parts[0]).equals(artist(who)))title=parts[1];}
        String raw=info.optString("title").toLowerCase(Locale.ROOT);
        if(raw.matches(".*\\b(cover|karaoke|concert|remix|bootleg|mashup|flip|demo|nightcore|sped up|slowed|reaction|instrumental|music video|official video|bts)\\b.*")||raw.matches(".*([\\[(]\\s*live\\b|\\blive\\s+(at|from|in|on|version|performance|session)\\b|\\blive\\s*[\\])]|кавер|концерт|ремикс|караоке|наживо|кліп|клип).*"))return false;
        title=title.replaceAll("(?i)\\s*[\\[(]?(?:official\\s+(?:audio|lyric(?:s)?(?:\\s+video)?)|audio\\s+only|visuali[sz]er|lyric(?:s)?(?:\\s+video)?)[\\])]?\\s*"," ").trim();
        double duration=track.optDouble("duration",0),actual=info.optDouble("duration",0);
        return norm(title).equals(norm(track.optString("title")))&&artist(who).equals(artist(track.optString("artist")))&&(! (duration>0&&actual>0)||Math.abs(duration-actual)<=Math.max(8,duration*.04));
    }
    private static String source(String value) throws Exception {
        URL url=new URL(value);String h=url.getHost();
        if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||url.getPort()!=-1||!(h.equals("www.youtube.com")||h.equals("music.youtube.com")||h.equals("youtube.com")||h.equals("youtu.be")||h.equals("soundcloud.com")||h.endsWith(".bandcamp.com")||h.equals("audius.co")||h.equals("archive.org")))throw new SecurityException("Недопустимая запись");return value;
    }
    private JSONObject download(JSONObject payload,String requestId) throws Exception {
        JSONObject track=payload.getJSONObject("track");String key=track.getString("id");if(!key.matches("song_[0-9a-f]+"))throw new SecurityException("Недопустимая запись");
        JSONObject existing=records().optJSONObject(key);if(existing!=null&&exists(existing))return withCover(existing);
        File staging=new File(context.getCacheDir(),"song-"+UUID.randomUUID());staging.mkdirs();
        JSONObject committed=null;Exception lastError=null;
        try {
            JSONArray sources=track.getJSONArray("sources");
            for(int i=0;i<Math.min(8,sources.length());i++) {
                try {
                    clear(staging);staging.mkdirs();
                    JSONObject info=new JSONObject(run(Arrays.asList("--dump-single-json","--skip-download","-f","bestaudio[ext=m4a]/bestaudio/best","--",source(sources.getJSONObject(i).getString("url"))),requestId,60000));
                    if(!matches(track,info))continue;
                    for(String field:new String[]{"title","artist","album","genre","isrc"})if(!track.optString(field).isEmpty()){info.put(field,track.getString(field));info.put("meta_"+field,track.getString(field));}
                    if(track.has("artist"))info.put("artists",new JSONArray().put(track.getString("artist")));
                    info.put("track",info.getString("title"));if(!track.optString("year").isEmpty()){info.put("release_year",track.opt("year"));info.put("meta_date",track.optString("year"));info.put("release_date",track.optString("year")+"0101");}if(track.has("trackNo"))info.put("track_number",track.opt("trackNo"));
                    String picture=track.optString("pictureUrl");if(picture.matches("https://(?:[^/]+\\.)?(?:mzstatic\\.com|dzcdn\\.net|ytimg\\.com|ggpht\\.com|googleusercontent\\.com|bcbits\\.com|audius\\.co|sndcdn\\.com)/.*")){info.put("thumbnail",picture);info.put("thumbnails",new JSONArray().put(new JSONObject().put("url",picture).put("id","cover")));}
                    File meta=new File(staging,"recording.json");try(OutputStream out=new FileOutputStream(meta)){out.write(info.toString().getBytes(StandardCharsets.UTF_8));}
                    String audioFormat=Arrays.asList("wav","aac").contains(info.optString("ext"))?"m4a":"best";
                    List<String> downloadArgs=new ArrayList<>(Arrays.asList("--load-info-json",meta.getAbsolutePath(),"--no-playlist","--quiet","--no-progress","--max-filesize","256M","-f","bestaudio[ext=m4a]/bestaudio/best","-x","--audio-format",audioFormat,"--audio-quality","0","--embed-metadata","--embed-thumbnail","--convert-thumbnails","jpg","--write-thumbnail","-o",new File(staging,"audio.%(ext)s").getAbsolutePath(),"--print","after_move:filepath"));
                    String result;
                    try{result=run(downloadArgs,requestId,600000);}catch(Exception e){
                        if(!String.valueOf(e.getMessage()).toLowerCase(Locale.ROOT).matches("(?s).*(thumbnail|image|cover|convert.*jpg).*"))throw e;
                        downloadArgs.removeAll(Arrays.asList("--embed-thumbnail","--convert-thumbnails","jpg","--write-thumbnail"));
                        result=run(downloadArgs,requestId,600000);
                    }
                    String[] lines=result.split("\\r?\\n");File audio=new File(lines[lines.length-1]);if(!audio.getCanonicalPath().startsWith(staging.getCanonicalPath()+File.separator)||!audio.getName().matches("audio\\.(m4a|mp3|opus|ogg|flac|aac|wav)"))throw new IOException("Invalid audio");
                    JSONObject metadata=new JSONObject();for(String field:new String[]{"title","artist","album","genre","isrc","duration"})metadata.put(field,info.opt(field));metadata.put("year",info.opt("release_year"));metadata.put("trackNo",info.opt("track_number"));
                    File cover=null;for(File file:staging.listFiles())if(file.getName().endsWith(".jpg")){cover=file;break;}
                    committed=publish(audio,cover,metadata,payload.optString("folderSource"),key);
                    synchronized(this){records().put(key,committed);saveRecords();}return withCover(committed);
                }catch(SecurityException e){throw e;}catch(Exception e){if(committed!=null)throw e;lastError=e;}
            }
            throw new IOException(downloadError(lastError));
        }catch(Exception e){if(committed!=null)deleteOwned(committed);throw e;}
        finally{clear(staging);}
    }
    private JSONObject publish(File audio,File cover,JSONObject metadata,String destination,String key) throws Exception {
        String name=(metadata.optString("artist")+" - "+metadata.optString("title")).replaceAll("[<>:\"/\\\\|?*\\x00-\\x1f]","");if(name.length()>120)name=name.substring(0,120);
        String extension=audio.getName().substring(audio.getName().lastIndexOf('.'));name+=" ["+key.substring(5)+"]"+extension;
        JSONObject result=new JSONObject().put("downloadId",key).put("name",name).put("size",audio.length()).put("lastModified",System.currentTimeMillis()).put("metadata",metadata);
        if(destination.startsWith("content:")) {
            Uri tree=Uri.parse(destination);boolean write=false;for(UriPermission p:context.getContentResolver().getPersistedUriPermissions())if(p.getUri().equals(tree)&&p.isWritePermission())write=true;
            if(!write)throw new SecurityException("Выберите папку музыки ещё раз, чтобы разрешить сохранение треков.");
            DocumentFile root=DocumentFile.fromTreeUri(context,tree);if(root==null||!root.canWrite())throw new SecurityException("Нет доступа к папке музыки");
            if(root.findFile(name)!=null)throw new IOException("File already exists");
            String mime=extension.equals(".m4a")?"audio/mp4":extension.equals(".opus")||extension.equals(".ogg")?"audio/ogg":extension.equals(".flac")?"audio/flac":extension.equals(".wav")?"audio/wav":extension.equals(".aac")?"audio/aac":"audio/mpeg";
            DocumentFile file=root.createFile(mime,name);if(file==null)throw new IOException("Cannot create track");
            DocumentFile sidecar=null,image=null;
            try {
                try(InputStream in=new FileInputStream(audio);OutputStream out=context.getContentResolver().openOutputStream(file.getUri())){copy(in,out);}
                sidecar=root.createFile("application/json",name+".playerium.json");if(sidecar==null)throw new IOException();
                try(OutputStream out=context.getContentResolver().openOutputStream(sidecar.getUri())){out.write(metadata.toString().getBytes(StandardCharsets.UTF_8));}
                if(cover!=null){image=root.createFile("image/jpeg",name+".jpg");if(image==null)throw new IOException();try(InputStream in=new FileInputStream(cover);OutputStream out=context.getContentResolver().openOutputStream(image.getUri())){copy(in,out);}}
                result.put("uri",file.getUri()).put("sidecar",sidecar.getUri()).put("cover",image==null?"":image.getUri()).put("folderSource",destination).put("folderName",root.getName());
            }catch(Exception e){file.delete();if(sidecar!=null)sidecar.delete();if(image!=null)image.delete();throw e;}
        }else {
            File root=managedDirectory(context);root.mkdirs();File target=new File(root,name);if(target.exists())throw new IOException("File already exists");
            try {
                try(InputStream in=new FileInputStream(audio);OutputStream out=new FileOutputStream(target)){copy(in,out);}
                File sidecar=new File(root,name+".playerium.json");try(OutputStream out=new FileOutputStream(sidecar)){out.write(metadata.toString().getBytes(StandardCharsets.UTF_8));}
                File image=new File(root,name+".jpg");if(cover!=null)try(InputStream in=new FileInputStream(cover);OutputStream out=new FileOutputStream(image)){copy(in,out);}
                result.put("uri",Uri.fromFile(target)).put("sidecar",Uri.fromFile(sidecar)).put("cover",cover==null?"":Uri.fromFile(image)).put("folderSource","playerium-music").put("folderName","Playerium");
            }catch(Exception e){target.delete();new File(root,name+".playerium.json").delete();new File(root,name+".jpg").delete();throw e;}
        }
        return result;
    }
    static File managedDirectory(Context context){File parent=context.getExternalFilesDir(Environment.DIRECTORY_MUSIC);return new File(parent==null?context.getFilesDir():parent,"Playerium");}
    private JSONObject withCover(JSONObject record) throws Exception {
        JSONObject copy=new JSONObject(record.toString());String value=record.optString("cover");
        if(!value.isEmpty())try {
            Uri uri=Uri.parse(value);
            if("file".equals(uri.getScheme())&&!new File(uri.getPath()).getCanonicalPath().startsWith(managedDirectory(context).getCanonicalPath()+File.separator))throw new SecurityException("Invalid cover");
            try(InputStream in=context.getContentResolver().openInputStream(uri)){copy.getJSONObject("metadata").put("pictureBase64",Base64.encodeToString(read(in,4*1024*1024),Base64.NO_WRAP));}
        }catch(IOException ignored){}
        return copy;
    }
    private void deleteOwned(JSONObject record) throws Exception {
        for(String field:new String[]{"uri","sidecar","cover"}) {
            String value=record.optString(field);if(value.isEmpty())continue;Uri uri=Uri.parse(value);
            if("file".equals(uri.getScheme())){File file=new File(uri.getPath());if(!file.getCanonicalPath().startsWith(managedDirectory(context).getCanonicalPath()+File.separator))throw new SecurityException("Недопустимый файл");if(file.exists()&&!file.delete())throw new IOException("Cannot delete track");}
            else {DocumentFile file=DocumentFile.fromSingleUri(context,uri);if(file!=null&&file.exists()&&!file.delete())throw new IOException("Cannot delete track");}
        }
    }
    private static void clear(File root){File[] files=root.listFiles();if(files!=null)for(File f:files){if(f.isDirectory())clear(f);else f.delete();}root.delete();}
}

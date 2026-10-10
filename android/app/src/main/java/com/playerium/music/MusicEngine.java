package com.playerium.music;

import android.content.Context;
import android.content.UriPermission;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.media.MediaScannerConnection;
import android.media.MediaMetadataRetriever;
import android.provider.DocumentsContract;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
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
    private static final String FULL_AUDIO="bestaudio[format_id!*=preview][ext=m4a]/bestaudio[format_id!*=preview]/best[format_id!*=preview]";
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
        Future<?> task=(operation.equals("download")||operation.equals("delete")||operation.equals("restore")?downloader:workers).submit(()->{
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
        if(operation.equals("restore")){JSONArray files=new JSONArray();JSONObject saved; synchronized(this){saved=new JSONObject(records().toString());}Iterator<String> keys=saved.keys();while(keys.hasNext()) {String key=keys.next();JSONObject record=saved.getJSONObject(key);if(exists(record)){try{record=protectDownloaded(record,key);}catch(IOException|SecurityException error){android.util.Log.w("Playerium","Could not hide downloaded media yet",error);}files.put(record);}}return files;}
        if(operation.equals("describe")){JSONObject record=records().optJSONObject(payload.getString("downloadId"));if(record==null)throw new IOException("Track unavailable");return withCover(record);}
        if(operation.equals("delete")) {String key=payload.getString("downloadId");JSONObject record=records().optJSONObject(key);if(record!=null){if(record.optJSONObject("legacyMedia")!=null){deleteOwned(record.getJSONObject("legacyMedia"));refreshGallery(record.getJSONObject("legacyMedia"));}deleteOwned(record);records().remove(key);saveRecords();}return true;}
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
                case "muzend":url="https://muzend.net/index.php?do=search&subaction=search&story="+q;break;
                case "musify":url="https://musify.club/en/search?SearchText="+q;break;
                case "miyzvuk":url="https://miyzvuk.net/index.php?do=search&subaction=search&story="+q;break;
                case "topmusicua":url="https://topmusicua.com/index.php?do=search&subaction=search&story="+q;break;
                default:throw new SecurityException("Недопустимый запрос");
            }
            String text=get(url);return Arrays.asList("bandcamp","muzend","musify","topmusicua","miyzvuk").contains(payload.getString("provider"))?text:new JSONObject(text);
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
    private static String artist(String value){String key=norm(value.replaceAll("(?i)\\s*-\\s*Topic$","").split("(?i)\\s+(?:feat\\.?|ft\\.?|featuring|x)\\s+|\\s*[,&]\\s*")[0]);switch(key){case "лилу45":case "лілу45":case "lilu45":return "lely45";case "виталии козловскии":case "віталіи козловськии":return "vitaliy kozlovskiy";case "діти інженерів":return "dity inzheneriv";case "саша чемеров":return "sasha chemerov";default:return key;}}
    private static final java.util.regex.Pattern FEATURED=java.util.regex.Pattern.compile("(?i)\\s*[\\[(]\\s*(?:feat\\.?|ft\\.?|featuring)\\s+([^\\])]+)[\\])]");
    private static String recordingTitle(String title,String who){String key=norm(title);return artist(who).equals("the pinballs")&&key.equals("blues of shichiten battou")?norm("七転八倒のブルース"):key;}
    private static String credits(String title,String who){
        StringBuilder names=new StringBuilder(who);java.util.regex.Matcher featured=FEATURED.matcher(title);while(featured.find())names.append(",").append(featured.group(1));
        java.util.Set<String> keys=new java.util.TreeSet<>();for(String name:names.toString().split("(?i)\\s+(?:feat\\.?|ft\\.?|featuring|x)\\s+|\\s*[,&]\\s*")){String key=artist(name);if(!key.isEmpty())keys.add(key);}return String.join("|",keys);
    }
    private static boolean matches(JSONObject track,JSONObject info) {
        String title=info.optString("track",info.optString("title")),who=info.optString("artist",info.optString("uploader",info.optString("channel")));
        JSONArray credits=info.optJSONArray("artists");boolean credited=!info.optString("artist").isEmpty()||credits!=null&&credits.length()>0;
        if(info.optString("artist").isEmpty()&&credits!=null&&credits.length()>0){StringBuilder names=new StringBuilder();for(int i=0;i<credits.length();i++){if(i>0)names.append(", ");names.append(credits.optString(i));}who=names.toString();}
        if(title.matches(".*\\s[-–—]\\s.*")){String[] parts=title.split("\\s[-–—]\\s",2);if(!credited){who=parts[0];title=parts[1];}else if(artist(parts[0]).equals(artist(who)))title=parts[1];}
        String raw=info.optString("title").toLowerCase(Locale.ROOT);
        java.util.regex.Matcher variant=java.util.regex.Pattern.compile("\\b(?:cover|karaoke|concert|remix|bootleg|mashup|flip|demo|nightcore|sped up|slowed|reaction|instrumental|music video|official video|bts|live)\\b|кавер|концерт|ремикс|караоке|наживо|кліп|клип").matcher(raw);
        while(variant.find())if(!norm(track.optString("title")).contains(norm(variant.group())))return false;
        title=title.replaceAll("(?i)\\s*[\\[(]?(?:official\\s+(?:audio|lyric(?:s)?(?:\\s+video)?)|audio\\s+only|visuali[sz]er|lyric(?:s)?(?:\\s+video)?)[\\])]?\\s*"," ").trim();
        double duration=track.optDouble("duration",0),actual=info.optDouble("duration",0);
        String requested=track.optString("title"),requestedArtist=track.optString("artist"),keys=credits(title,who);boolean sameCredits=!keys.isEmpty()&&keys.equals(credits(requested,requestedArtist));
        String baseTitle=norm(FEATURED.matcher(title).replaceAll(""));
        String requestedBase=norm(FEATURED.matcher(requested).replaceAll(""));
        boolean sameTitle=recordingTitle(title,who).equals(recordingTitle(requested,requestedArtist))||(sameCredits&&baseTitle.equals(requestedBase));
        return sameTitle&&(artist(who).equals(artist(requestedArtist))||sameCredits)&&(! (duration>0&&actual>0)||Math.abs(duration-actual)<=Math.max(8,duration*.04));
    }
    private static String source(String value) throws Exception {
        URL url=new URL(value);String h=url.getHost().toLowerCase(Locale.ROOT);
        if(h.equals("hit.music2019.su")&&url.getProtocol().equals("https")&&url.getUserInfo()==null&&url.getPort()==-1&&url.getQuery()==null&&url.getRef()==null&&url.getPath().matches("/track/\\d+"))return value;
        if(!url.getProtocol().equals("https")||url.getUserInfo()!=null||url.getPort()!=-1||!(h.equals("www.youtube.com")||h.equals("music.youtube.com")||h.equals("youtube.com")||h.equals("youtu.be")||h.equals("soundcloud.com")||h.endsWith(".bandcamp.com")||h.equals("audius.co")||h.equals("archive.org")||(h.equals("muzend.net")&&url.getPath().matches("(?i)/uploads/music/[^?#]+\\.mp3")&&url.getQuery()==null)||(h.equals("musify.club")&&url.getPath().matches("(?i)/track/pl/\\d+/[^/?#]+\\.mp3")&&url.getQuery()==null&&url.getRef()==null)||(h.equals("miyzvuk.net")&&url.getPath().matches("(?i)/uploads/public_files/[^?#]+\\.mp3")&&url.getQuery()==null&&url.getRef()==null)||(h.equals("topmusicua.com")&&url.getPath().matches("(?i)/uploads/files/[^?#]+\\.mp3")&&url.getQuery()==null&&url.getRef()==null)))throw new SecurityException("Недопустимая запись");return value;
    }
    private JSONObject hitMusicInfo(String page) throws Exception {
        String text=get(page);java.util.regex.Matcher title=java.util.regex.Pattern.compile("(?i)<meta\\s+property=\"og:title\"\\s+content=\"([^\"]+)\"").matcher(text),audio=java.util.regex.Pattern.compile("(?i)\\bmp3source=\"([^\"]+)\"").matcher(text);
        if(!title.find()||!audio.find())throw new IOException("Не удалось получить полную запись.");
        String label=android.text.Html.fromHtml(title.group(1)).toString().replaceAll("(?i)\\s+-\\s+Скачать.*$","");String[] parts=label.split("\\s[-–—]\\s",2);
        String value=android.text.Html.fromHtml(audio.group(1)).toString();URL url=new URL(value);
        if(parts.length!=2||!url.getProtocol().equals("https")||!url.getHost().equals("cdn.music2019.su")||url.getUserInfo()!=null||url.getPort()!=-1||url.getRef()!=null||!url.getPath().matches("/{1,2}")||url.getQuery()==null||!url.getQuery().matches("h=[\\w-]{32,1024}(?:\\\\{2})?"))throw new SecurityException("Недопустимая запись");
        return new JSONObject().put("id",new URL(page).getPath().substring(7)).put("title",parts[1]).put("artist",parts[0]).put("url",value).put("ext","mp3").put("extractor","generic").put("webpage_url",page);
    }
    private JSONObject download(JSONObject payload,String requestId) throws Exception {
        JSONObject track=payload.getJSONObject("track");String key=track.getString("id");if(!key.matches("song_[0-9a-f]+"))throw new SecurityException("Недопустимая запись");
        JSONObject existing=records().optJSONObject(key);if(existing!=null&&exists(existing))return withCover(protectDownloaded(existing,key));
        File staging=new File(context.getCacheDir(),"song-"+UUID.randomUUID());staging.mkdirs();
        JSONObject committed=null;Exception lastError=null;
        try {
            JSONArray sources=track.getJSONArray("sources");
            for(int i=0;i<Math.min(8,sources.length());i++) {
                try {
                    clear(staging);staging.mkdirs();
                    JSONObject candidate=sources.getJSONObject(i);String audioUrl=source(candidate.getString("url"));
                    JSONObject info;
                    String directHost=candidate.optString("provider").equals("muzend")?"muzend.net":candidate.optString("provider").equals("musify")?"musify.club":candidate.optString("provider").equals("topmusicua")?"topmusicua.com":candidate.optString("provider").equals("miyzvuk")?"miyzvuk.net":null;
                    if(candidate.optString("provider").equals("hitmusic")){info=hitMusicInfo(audioUrl);audioUrl=info.getString("url");directHost="cdn.music2019.su";}
                    else if(directHost!=null) {
                        if(!new URL(audioUrl).getHost().equals(directHost))throw new SecurityException("Недопустимая запись");
                        info=new JSONObject().put("id",new File(new URL(audioUrl).getPath()).getName()).put("title",candidate.getString("title")).put("artist",candidate.getString("artist")).put("duration",candidate.optDouble("duration",0)).put("url",audioUrl).put("ext","mp3").put("extractor","generic").put("webpage_url",audioUrl);
                    }else info=new JSONObject(run(Arrays.asList("--dump-single-json","--skip-download","-f",FULL_AUDIO,"--",audioUrl),requestId,60000));
                    if(!matches(track,info))continue;
                    if(Arrays.asList("musify","miyzvuk","hitmusic").contains(candidate.optString("provider"))) {
                        HttpURLConnection connection=(HttpURLConnection)new URL(audioUrl).openConnection();connection.setConnectTimeout(15000);connection.setReadTimeout(30000);
                        File input=new File(staging,"source.mp3");
                        try {
                            if(connection.getResponseCode()!=200||!String.valueOf(connection.getContentType()).startsWith("audio/")||!connection.getURL().getProtocol().equals("https"))throw new IOException("Не удалось получить полную запись.");
                            try(InputStream in=connection.getInputStream();OutputStream out=new FileOutputStream(input)){byte[] buffer=new byte[65536];long size=0;int n;while((n=in.read(buffer))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();size+=n;if(size>256L*1024*1024)throw new IOException("Invalid audio");out.write(buffer,0,n);}}
                        }finally{connection.disconnect();}
                        byte[] header=new byte[12];try(InputStream in=new FileInputStream(input)){if(in.read(header)==12&&new String(header,4,4,StandardCharsets.US_ASCII).equals("ftyp"))info.put("ext","m4a");}
                        info.put("url",input.toURI().toString());
                    }
                    for(String field:new String[]{"title","artist","album","genre","isrc"})if(!track.optString(field).isEmpty()){info.put(field,track.getString(field));info.put("meta_"+field,track.getString(field));}
                    if(track.has("artist"))info.put("artists",new JSONArray().put(track.getString("artist")));
                    info.put("track",info.getString("title"));if(!track.optString("year").isEmpty()){info.put("release_year",track.opt("year"));info.put("meta_date",track.optString("year"));info.put("release_date",track.optString("year")+"0101");}if(track.has("trackNo"))info.put("track_number",track.opt("trackNo"));
                    String picture=track.optString("pictureUrl");if(picture.matches("https://(?:[^/]+\\.)?(?:mzstatic\\.com|dzcdn\\.net|ytimg\\.com|ggpht\\.com|googleusercontent\\.com|bcbits\\.com|audius\\.co|sndcdn\\.com)/.*")){info.put("thumbnail",picture);info.put("thumbnails",new JSONArray().put(new JSONObject().put("url",picture).put("id","cover")));}
                    File meta=new File(staging,"recording.json");try(OutputStream out=new FileOutputStream(meta)){out.write(info.toString().getBytes(StandardCharsets.UTF_8));}
                    String audioFormat=Arrays.asList("wav","aac").contains(info.optString("ext"))?"m4a":"best";
                    List<String> downloadArgs=new ArrayList<>(Arrays.asList("--load-info-json",meta.getAbsolutePath(),"--no-playlist","--quiet","--no-progress","--max-filesize","256M","-f",FULL_AUDIO,"-x","--audio-format",audioFormat,"--audio-quality","0","--embed-metadata","--embed-thumbnail","--convert-thumbnails","jpg","--write-thumbnail","-o",new File(staging,"audio.%(ext)s").getAbsolutePath(),"--print","after_move:filepath"));
                    if(directHost!=null)downloadArgs.add(0,"--force-generic-extractor");
                    if(Arrays.asList("musify","miyzvuk","hitmusic").contains(candidate.optString("provider")))downloadArgs.add(0,"--enable-file-urls");
                    String result;
                    try{result=run(downloadArgs,requestId,600000);}catch(Exception e){
                        if(!String.valueOf(e.getMessage()).toLowerCase(Locale.ROOT).matches("(?s).*(thumbnail|image|cover|convert.*jpg).*"))throw e;
                        downloadArgs.removeAll(Arrays.asList("--embed-thumbnail","--convert-thumbnails","jpg","--write-thumbnail"));
                        result=run(downloadArgs,requestId,600000);
                    }
                    String[] lines=result.split("\\r?\\n");File audio=new File(lines[lines.length-1]);if(!audio.getCanonicalPath().startsWith(staging.getCanonicalPath()+File.separator)||!audio.getName().matches("audio\\.(m4a|mp3|opus|ogg|flac|aac|wav)"))throw new IOException("Invalid audio");
                    MediaMetadataRetriever decoded=new MediaMetadataRetriever();double actual;
                    try{decoded.setDataSource(audio.getAbsolutePath());actual=Double.parseDouble(decoded.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION))/1000.;}finally{decoded.release();}
                    double expected=track.optDouble("duration",candidate.optDouble("duration",0));
                    if(!(actual>0)||(expected>0&&Math.abs(expected-actual)>Math.max(8,expected*.04)))throw new IOException("Полная запись не совпадает с выбранной версией.");
                    info.put("duration",actual);
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
            DocumentFile selected=DocumentFile.fromTreeUri(context,tree);if(selected==null||!selected.canWrite())throw new SecurityException("Нет доступа к папке музыки");
            DocumentFile root=hiddenDownloadDirectory(selected);
            if(root.findFile(name)!=null)throw new IOException("File already exists");
            String mime=extension.equals(".m4a")?"audio/mp4":extension.equals(".opus")||extension.equals(".ogg")?"audio/ogg":extension.equals(".flac")?"audio/flac":extension.equals(".wav")?"audio/wav":extension.equals(".aac")?"audio/aac":"audio/mpeg";
            DocumentFile file=root.createFile(mime,name);if(file==null)throw new IOException("Cannot create track");
            DocumentFile sidecar=null,image=null;
            try {
                try(InputStream in=new FileInputStream(audio);OutputStream out=context.getContentResolver().openOutputStream(file.getUri())){copy(in,out);}
                sidecar=root.createFile("application/json",name+".playerium.json");if(sidecar==null)throw new IOException();
                try(OutputStream out=context.getContentResolver().openOutputStream(sidecar.getUri())){out.write(metadata.toString().getBytes(StandardCharsets.UTF_8));}
                if(cover!=null){image=root.createFile("image/jpeg",name+".jpg");if(image==null)throw new IOException();try(InputStream in=new FileInputStream(cover);OutputStream out=context.getContentResolver().openOutputStream(image.getUri())){copy(in,out);}}
                result.put("uri",file.getUri()).put("sidecar",sidecar.getUri()).put("cover",image==null?"":image.getUri()).put("folderSource",destination).put("folderName",selected.getName());
            }catch(Exception e){file.delete();if(sidecar!=null)sidecar.delete();if(image!=null)image.delete();throw e;}
        }else {
            File root=managedDirectory(context);hideDirectory(root);File target=new File(root,name);if(target.exists())throw new IOException("File already exists");
            try {
                try(InputStream in=new FileInputStream(audio);OutputStream out=new FileOutputStream(target)){copy(in,out);}
                File sidecar=new File(root,name+".playerium.json");try(OutputStream out=new FileOutputStream(sidecar)){out.write(metadata.toString().getBytes(StandardCharsets.UTF_8));}
                File image=new File(root,name+".jpg");if(cover!=null)try(InputStream in=new FileInputStream(cover);OutputStream out=new FileOutputStream(image)){copy(in,out);}
                result.put("uri",Uri.fromFile(target)).put("sidecar",Uri.fromFile(sidecar)).put("cover",cover==null?"":Uri.fromFile(image)).put("folderSource","playerium-music").put("folderName","Playerium");
            }catch(Exception e){target.delete();new File(root,name+".playerium.json").delete();new File(root,name+".jpg").delete();throw e;}
        }
        return result.put("galleryHidden",true);
    }
    // Exclude only Playerium's downloads, not unrelated media in the selected tree.
    static DocumentFile hiddenDownloadDirectory(DocumentFile selected) throws IOException {
        DocumentFile root=selected.findFile("Playerium Downloads");
        if(root==null)root=selected.createDirectory("Playerium Downloads");
        if(root==null||!root.isDirectory()||!root.canWrite())throw new IOException("Не удалось создать папку для скачанных треков.");
        DocumentFile marker=root.findFile(".nomedia");
        if(marker==null)marker=root.createFile("application/octet-stream",".nomedia");
        if(marker!=null&&!".nomedia".equals(marker.getName()))marker.renameTo(".nomedia");
        if(marker==null||!marker.isFile()||!".nomedia".equals(marker.getName()))throw new IOException("Не удалось скрыть папку музыки из галереи.");
        return root;
    }
    static void hideDirectory(File root) throws IOException {
        if(!root.isDirectory()&&!root.mkdirs())throw new IOException("Не удалось создать папку музыки.");
        File marker=new File(root,".nomedia");
        if(!marker.isFile()&&!marker.createNewFile())throw new IOException("Не удалось скрыть папку музыки из галереи.");
    }
    private JSONObject protectDownloaded(JSONObject old,String key) throws Exception {
        if(old.optBoolean("galleryHidden")) {
            if("file".equals(Uri.parse(old.getString("uri")).getScheme()))hideDirectory(managedDirectory(context));
            else {
                DocumentFile selected=DocumentFile.fromTreeUri(context,Uri.parse(old.getString("folderSource")));
                if(selected!=null&&selected.canWrite())hiddenDownloadDirectory(selected);
            }
            retryLegacyCleanup(old,key);
            return old;
        }
        if(!key.matches("song_[0-9a-f]+"))throw new SecurityException("Недопустимая запись");
        if("file".equals(Uri.parse(old.getString("uri")).getScheme())) {
            hideDirectory(managedDirectory(context));
            old.put("galleryHidden",true);synchronized(this){records().put(key,old);saveRecords();}
            refreshGallery(old);return old;
        }
        File staging=new File(context.getCacheDir(),"hide-song-"+UUID.randomUUID());staging.mkdirs();
        JSONObject moved=null;boolean saved=false;
        try {
            String name=old.getString("name"),extension=name.substring(name.lastIndexOf('.'));
            if(!extension.matches("(?i)\\.(m4a|mp3|opus|ogg|flac|aac|wav)"))throw new IOException("Invalid audio");
            File audio=new File(staging,"audio"+extension),cover=null;
            copyOwnedTo(old.getString("uri"),audio);
            if(audio.length()==0||(old.optLong("size",0)>0&&audio.length()!=old.getLong("size")))throw new IOException("Не удалось полностью перенести скачанный трек.");
            if(!old.optString("cover").isEmpty()){cover=new File(staging,"audio.jpg");copyOwnedTo(old.getString("cover"),cover);}
            moved=publish(audio,cover,old.getJSONObject("metadata"),old.getString("folderSource"),key);
            // Commit the new location before deleting any existing file.
            moved.put("previousUri",old.getString("uri")).put("legacyMedia",old);
            synchronized(this){records().put(key,moved);try{saveRecords();saved=true;}catch(Exception error){records().put(key,old);throw error;}}
            retryLegacyCleanup(moved,key);return moved;
        }finally{try{if(moved!=null&&!saved)deleteOwned(moved);}finally{clear(staging);}}
    }
    private void copyOwnedTo(String value,File target) throws IOException {
        Uri uri=Uri.parse(value);
        if(!MainActivity.hasMusicPermission(context,uri))throw new SecurityException("Выберите папку музыки ещё раз, чтобы разрешить сохранение треков.");
        try(InputStream in=context.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(target)){
            if(in==null)throw new IOException("Cannot read downloaded file");copy(in,out);
        }
    }
    private void retryLegacyCleanup(JSONObject record,String key) throws Exception {
        JSONObject legacy=record.optJSONObject("legacyMedia");if(legacy==null)return;
        try{deleteOwned(legacy);refreshGallery(legacy);record.remove("legacyMedia");synchronized(this){records().put(key,record);saveRecords();}}
        catch(IOException|SecurityException error){android.util.Log.w("Playerium","Will retry old media cleanup",error);}
    }
    private void refreshGallery(JSONObject record) {
        List<String> paths=new ArrayList<>();
        for(String field:new String[]{"uri","cover"})try {
            Uri uri=Uri.parse(record.optString(field));
            if("file".equals(uri.getScheme()))paths.add(uri.getPath());
            else if("com.android.externalstorage.documents".equals(uri.getAuthority())) {
                String document=DocumentsContract.getDocumentId(uri);
                String[] parts=document.split(":",2);File root=null;
                if(parts.length==2&&parts[0].equals("primary"))root=Environment.getExternalStorageDirectory();
                else if(parts.length==2&&Build.VERSION.SDK_INT>=30) {
                    StorageManager storage=context.getSystemService(StorageManager.class);
                    if(storage!=null)for(StorageVolume volume:storage.getStorageVolumes())if(parts[0].equalsIgnoreCase(volume.getUuid())){root=volume.getDirectory();break;}
                }
                if(root!=null){File file=new File(root,parts[1]);if(file.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))paths.add(file.getCanonicalPath());}
            }
        }catch(Exception ignored){}
        if(!paths.isEmpty())MediaScannerConnection.scanFile(context,paths.toArray(new String[0]),null,null);
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

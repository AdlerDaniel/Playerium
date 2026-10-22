package com.playerium.music;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.AtomicFile;
import androidx.documentfile.provider.DocumentFile;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** One constant multiplier, verified before a transactional replacement of the original. */
final class OriginalNormalization {
    static final double TARGET=-18, CEILING=-1;
    private static final java.util.concurrent.ConcurrentHashMap<String,Object> locks=new java.util.concurrent.ConcurrentHashMap<>();
    private static Object lock(Uri uri){Object added=new Object(),existing=locks.putIfAbsent(uri.toString(),added);return existing==null?added:existing;}
    private static final Map<String,Integer> readers=new java.util.concurrent.ConcurrentHashMap<>();
    static final class Busy extends IOException {Busy(){super("Обработка продолжится после переключения песни");}}
    interface Command { String run(List<String> arguments)throws Exception; }
    static void opened(Uri uri){synchronized(lock(uri)){String key=uri.toString();readers.put(key,(readers.containsKey(key)?readers.get(key):0)+1);}}
    static void closed(Uri uri){synchronized(lock(uri)){String key=uri.toString();int count=(readers.containsKey(key)?readers.get(key):0)-1;if(count<=0)readers.remove(key);else readers.put(key,count);}}
    private static boolean finite(double n){return !Double.isNaN(n)&&!Double.isInfinite(n);}
    static double gain(double integrated,double peak){double requested=TARGET-integrated,headroom=CEILING-peak;return Math.min(requested,headroom);}
    static String hash(InputStream source)throws Exception{
        try(InputStream in=source){MessageDigest digest=MessageDigest.getInstance("SHA-256");byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1)digest.update(bytes,0,n);
            StringBuilder out=new StringBuilder();for(byte b:digest.digest())out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    }
    static String hash(Context c,Uri uri)throws Exception{if(!MainActivity.hasMusicPermission(c,uri)&&!GoogleCloud.privateSnapshot(c,uri))throw new SecurityException("Unauthorized URI");return hash(c.getContentResolver().openInputStream(uri));}
    private static void copy(InputStream in,OutputStream out)throws Exception{byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
    private static JSONObject stats(String log)throws Exception{
        java.util.regex.Matcher match=java.util.regex.Pattern.compile("\\{\\s*\"input_i\"[\\s\\S]*?\\}").matcher(log);JSONObject result=null;
        while(match.find())result=new JSONObject(match.group());if(result==null)throw new IOException("Не удалось измерить громкость песни");return result;
    }
    private static double number(JSONObject stats,String field)throws Exception{return Double.parseDouble(stats.getString(field).replace("inf","Infinity"));}
    private static JSONObject measure(Command command,File input)throws Exception{
        return stats(command.run(Arrays.asList("-xerror","-i",input.getAbsolutePath(),"-map","0:a:0","-vn","-af","loudnorm=I=-18:TP=-1:LRA=50:print_format=json","-f","null","-")));
    }
    private static String extension(Context c,Uri uri)throws Exception{
        String name="file".equals(uri.getScheme())?new File(uri.getPath()).getName():DocumentFile.fromSingleUri(c,uri).getName();
        String ext=name==null?"":name.substring(name.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);
        if(!Arrays.asList("mp3","m4a","aac","flac","wav","ogg","opus","wma").contains(ext))throw new IOException("Не поддерживается перезапись этого аудиоформата");return ext;
    }
    private static List<String> encoder(String ext){
        switch(ext){
            case "mp3":return Arrays.asList("-c:a","libmp3lame","-q:a","0","-id3v2_version","3");
            case "flac":return Arrays.asList("-c:a","flac","-compression_level","5");
            case "wav":return Arrays.asList("-c:a","pcm_s24le");
            case "ogg":return Arrays.asList("-c:a","libvorbis","-q:a","8");
            case "opus":return Arrays.asList("-c:a","libopus","-b:a","256k");
            case "wma":return Arrays.asList("-c:a","wmav2","-b:a","192k");
            default:return Arrays.asList("-c:a","aac","-b:a","320k");
        }
    }
    private static void atomicJson(File file,JSONObject data)throws Exception{
        AtomicFile atomic=new AtomicFile(file);FileOutputStream out=null;
        try{out=atomic.startWrite();out.write(data.toString().getBytes(StandardCharsets.UTF_8));atomic.finishWrite(out);}catch(Exception error){if(out!=null)atomic.failWrite(out);throw error;}
    }
    private static JSONObject read(File file)throws Exception{
        try(InputStream in=new FileInputStream(file);ByteArrayOutputStream out=new ByteArrayOutputStream()){copy(in,out);return new JSONObject(out.toString("UTF-8"));}
    }
    private static File jobs(Context c){File dir=new File(c.getNoBackupFilesDir(),"normalization-transactions");dir.mkdirs();return dir;}
    private static File journal(Context c,Uri uri)throws Exception{return new File(jobs(c),hash(new ByteArrayInputStream(uri.toString().getBytes(StandardCharsets.UTF_8)))+".json");}
    private static void writeOriginal(Context c,Uri uri,File output)throws Exception{
        if(readers.containsKey(uri.toString()))throw new Busy();
        if("file".equals(uri.getScheme())){
            File original=new File(uri.getPath()),stage=File.createTempFile(".playerium-normalize-",".tmp",original.getParentFile());
            try{try(InputStream in=new FileInputStream(output);FileOutputStream out=new FileOutputStream(stage)){copy(in,out);out.getFD().sync();}android.system.Os.rename(stage.getPath(),original.getPath());}
            finally{stage.delete();}
        }else{
            if(readers.containsKey(uri.toString()))throw new Busy();
            try(ParcelFileDescriptor descriptor=c.getContentResolver().openFileDescriptor(uri,"rwt")){
                if(descriptor==null)throw new IOException("Нет доступа к записи в папку музыки");
                try(InputStream in=new FileInputStream(output);FileOutputStream out=new FileOutputStream(descriptor.getFileDescriptor())){copy(in,out);out.flush();try{out.getFD().sync();}catch(SyncFailedException ignored){/* Some document providers commit when closed. */}}
            }
        }
    }
    static void recover(Context c,Uri uri)throws Exception{
        synchronized(lock(uri)){
        File journal=journal(c,uri);if(!journal.isFile())return;JSONObject job=read(journal);
        File backup=privateFile(c,job.getString("backup")),output=privateFile(c,job.getString("output"));
                    String current=hash(c,uri);
            if(current.equals(job.getString("after"))){PreparedAudio.verified(c,uri,job.getJSONObject("result"));}
            else if(!current.equals(job.getString("before"))){
                if(!"writing".equals(job.optString("phase")))throw new IOException("Песня изменилась во время обработки");
                writeOriginal(c,uri,backup);if(!hash(c,uri).equals(job.getString("before")))throw new IOException("Не удалось восстановить исходный файл; резервная копия сохранена");
            }
            journal.delete();backup.delete();output.delete();
        }
    }
    static boolean hasRecovery(Context c){File[] files=jobs(c).listFiles((dir,name)->name.matches("[a-f0-9]{64}\\.json"));return files!=null&&files.length>0;}
    static boolean recoverAll(Context c){
        File[] files=jobs(c).listFiles((dir,name)->name.matches("[a-f0-9]{64}\\.json"));boolean complete=true;
        if(files!=null)for(File file:files)try{
            if(!file.exists())continue;Uri uri=Uri.parse(read(file).getString("uri"));
            if(!file.equals(journal(c,uri)))throw new SecurityException("Invalid recovery URI");recover(c,uri);
        }catch(Exception error){complete=false;}
        return complete;
    }
    private static File privateFile(Context c,String path)throws Exception{
        File f=new File(path);if(!f.getCanonicalPath().startsWith(jobs(c).getCanonicalPath()+File.separator))throw new SecurityException("Invalid normalization transaction");return f;
    }
    static Uri prepare(Context c,Uri uri,Command command)throws Exception{
        if(!MainActivity.hasMusicPermission(c,uri)&&!GoogleCloud.privateSnapshot(c,uri))throw new SecurityException("Нет доступа к песне");
        recover(c,uri);if(PreparedAudio.ready(c,uri)!=null)return uri;
        synchronized(lock(uri)){if(readers.containsKey(uri.toString()))throw new Busy();}
        if(!"file".equals(uri.getScheme())&&!DocumentFile.fromSingleUri(c,uri).canWrite())throw new SecurityException("Выберите папку музыки ещё раз и разрешите запись");
        String beforeStamp=PreparedAudio.key(c,uri),ext=extension(c,uri);
        File input=File.createTempFile("source-",".audio",jobs(c)),output=File.createTempFile("output-","."+ext,jobs(c)),journal=journal(c,uri);
        boolean transaction=false;
        try{
            try(InputStream in=c.getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(input)){if(in==null)throw new IOException("Песня недоступна");copy(in,out);out.getFD().sync();}
            if(jobs(c).getUsableSpace()<input.length()+32L*1024*1024)throw new IOException("Недостаточно места для обработки песни");
            String beforeHash=hash(new FileInputStream(input));JSONObject measured=measure(command,input);double integrated=number(measured,"input_i"),peak=number(measured,"input_tp");
            double correction=finite(integrated)&&finite(peak)?gain(integrated,peak):0;JSONObject actual=measured;
            boolean changed=Math.abs(correction)>=.05;
            if(!changed)correction=0;
            if(changed){
                boolean verified=false;
                for(int attempt=0;attempt<3;attempt++){
                    List<String> args=new ArrayList<>(Arrays.asList("-xerror","-i",input.getAbsolutePath(),"-map","0:a:0","-map_metadata","0"));
                    if(Arrays.asList("mp3","m4a","flac").contains(ext))args.addAll(Arrays.asList("-map","0:v?","-c:v","copy"));else args.add("-vn");
                    // Analysis uses loudnorm only as a meter. Audio uses ONE constant
                    // double-precision gain, without a limiter, compressor or AGC.
                    args.addAll(Arrays.asList("-af","volume="+String.format(Locale.ROOT,"%.9f",correction)+"dB:precision=double"));args.addAll(encoder(ext));
                    if(ext.equals("m4a"))args.addAll(Arrays.asList("-movflags","+faststart"));args.add(output.getAbsolutePath());command.run(args);
                    actual=measure(command,output);double outputPeak=number(actual,"input_tp"),outputI=number(actual,"input_i");
                    if(!finite(outputPeak)||!finite(outputI)||Math.abs(outputI-(integrated+correction))>1)throw new IOException("Не удалось подтвердить постоянную поправку громкости");
                    if(outputPeak<=CEILING+.1){verified=true;break;}
                    // Codec reconstruction can overshoot. Re-encode FROM THE ORIGINAL
                    // with a smaller constant gain instead of limiting individual peaks.
                    correction-=outputPeak-CEILING+.15;
                }
                if(!verified||output.length()<=32)throw new IOException("Не удалось подтвердить безопасную громкость результата");
            }
            File resultFile=changed?output:input;String afterHash=hash(new FileInputStream(resultFile));
            JSONObject details=new JSONObject().put("profile",PreparedAudio.PROFILE).put("targetLUFS",TARGET).put("gainDb",correction)
                .put("integrated",finite(integrated)?number(actual,"input_i"):JSONObject.NULL).put("truePeak",finite(peak)?number(actual,"input_tp"):JSONObject.NULL)
                .put("peakLimited",finite(integrated)&&correction<TARGET-integrated-.15);
            JSONObject result=new JSONObject().put("audioKey",afterHash).put("normalization",details);
            // Pending cloud uploads must keep the bytes they were created for.
            GoogleCloud.get(c).freezeNormalizationJobs(uri,input);
            synchronized(lock(uri)){
                if(!beforeStamp.equals(PreparedAudio.key(c,uri))||!beforeHash.equals(hash(c,uri)))throw new IOException("Песня изменилась во время обработки");
                if(changed){
                    if(readers.containsKey(uri.toString()))throw new Busy();
                    JSONObject job=new JSONObject().put("uri",uri.toString()).put("backup",input.getPath()).put("output",output.getPath()).put("before",beforeHash).put("after",afterHash).put("result",result).put("phase","writing");
                    atomicJson(journal,job);transaction=true;
                    try{writeOriginal(c,uri,output);if(!afterHash.equals(hash(c,uri)))throw new IOException("Проверка сохранённого файла не пройдена");}
                    catch(Exception error){try{writeOriginal(c,uri,input);if(beforeHash.equals(hash(c,uri))){journal.delete();transaction=false;}}catch(Exception restore){error.addSuppressed(restore);}throw error;}
                }
                PreparedAudio.verified(c,uri,result);journal.delete();transaction=false;
            }
            return uri;
        }finally{if(!transaction){input.delete();output.delete();}}
    }

    static void installCloudVersion(Context c,Uri uri,File source,String expected,JSONObject metadata,String expectedBefore)throws Exception{
        if(!MainActivity.hasMusicPermission(c,uri))throw new SecurityException("Нет доступа к песне");recover(c,uri);
        if(!expected.equals(hash(new FileInputStream(source))))throw new IOException("Облачный файл не прошёл проверку");
        File backup=File.createTempFile("cloud-before-",".audio",jobs(c)),output=File.createTempFile("cloud-after-",".audio",jobs(c)),journal=journal(c,uri);boolean transaction=false;
        try{
            try(InputStream in=c.getContentResolver().openInputStream(uri);FileOutputStream out=new FileOutputStream(backup)){copy(in,out);out.getFD().sync();}
            try(InputStream in=new FileInputStream(source);FileOutputStream out=new FileOutputStream(output)){copy(in,out);out.getFD().sync();}
            String before=hash(new FileInputStream(backup));
            if(!expectedBefore.isEmpty()&&!before.equals(expectedBefore)&&!before.equals(expected))throw new IOException("Локальная песня изменилась во время синхронизации");
            JSONObject result=new JSONObject().put("audioKey",expected).put("normalization",metadata.optJSONObject("normalization")==null?new JSONObject():metadata.getJSONObject("normalization"));
            GoogleCloud.get(c).freezeNormalizationJobs(uri,backup);
            synchronized(lock(uri)){
                if(!before.equals(hash(c,uri)))throw new IOException("Локальная песня изменилась во время синхронизации");
                if(readers.containsKey(uri.toString()))throw new Busy();
                atomicJson(journal,new JSONObject().put("uri",uri.toString()).put("backup",backup.getPath()).put("output",output.getPath()).put("before",before).put("after",expected).put("result",result).put("phase","writing"));transaction=true;
                try{writeOriginal(c,uri,output);if(!expected.equals(hash(c,uri)))throw new IOException("Не удалось проверить заменённый файл");}
                catch(Exception error){try{writeOriginal(c,uri,backup);if(before.equals(hash(c,uri))){journal.delete();transaction=false;}}catch(Exception restore){error.addSuppressed(restore);}throw error;}
                PreparedAudio.verified(c,uri,result);journal.delete();transaction=false;
            }
        }finally{if(!transaction){backup.delete();output.delete();}}
    }
}

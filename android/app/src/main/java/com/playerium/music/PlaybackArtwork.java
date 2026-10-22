package com.playerium.music;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

/** Private, bounded artwork cache usable after the WebView and its blob URLs are gone. */
final class PlaybackArtwork {
    private static final java.util.concurrent.ThreadPoolExecutor writer=new java.util.concurrent.ThreadPoolExecutor(1,1,30,java.util.concurrent.TimeUnit.SECONDS,new java.util.concurrent.ArrayBlockingQueue<>(8),new java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy());
    // Always give Media3 an image, including while the current cover is loading.
    // Its 1.3.x notification provider otherwise leaves an old image callback pending.
    private static final class Placeholder {
        static final byte[] PNG=create();
        private static byte[] create(){
            Bitmap bitmap=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(android.graphics.Color.rgb(32,32,32));
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            try{bitmap.compress(Bitmap.CompressFormat.PNG,100,out);return out.toByteArray();}finally{bitmap.recycle();}
        }
    }
    static androidx.media3.common.MediaMetadata.Builder metadata(Context context,String id,androidx.media3.common.MediaMetadata.Builder builder,boolean loadCached){
        // System UI cannot read file:// URIs in our private no-backup directory.
        // The service loads cached image bytes off the playback thread instead.
        return builder.setArtworkUri(null).setArtworkData(Placeholder.PNG,androidx.media3.common.MediaMetadata.PICTURE_TYPE_FRONT_COVER);
    }
    static byte[] read(Context context,String id,Uri expected){
        if(expected==null||!expected.equals(find(context,id)))return null;
        File photo=new File(expected.getPath());long size=photo.length();if(size<1||size>4*1024*1024)return null;
        try(java.io.FileInputStream input=new java.io.FileInputStream(photo);ByteArrayOutputStream output=new ByteArrayOutputStream()){
            byte[] chunk=new byte[8192];int read,total=0;
            while((read=input.read(chunk))!=-1){total+=read;if(total>4*1024*1024)return null;output.write(chunk,0,read);}
            return output.toByteArray();
        }catch(Exception ignored){return null;}
    }
    static void storeAsync(Context context,String id,String encoded){
        if(id==null||encoded==null||id.isEmpty()||id.length()>512||encoded.length()>6*1024*1024)return;
        Context app=context.getApplicationContext();
        writer.execute(()->{try{if(saveBase64(app,id,encoded)!=null)MediaNotificationService.artworkChanged(id);}catch(Exception ignored){}});
    }
    private static File file(Context context,String id) throws Exception {
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(id.getBytes(StandardCharsets.UTF_8));
        StringBuilder name=new StringBuilder();for(byte b:hash)name.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        return new File(new File(context.getNoBackupFilesDir(),"playback-artwork"),name+".jpg");
    }
    static Uri find(Context context,String id) {
        try{
            File base=file(context,id);String name=context.getSharedPreferences("playback_artwork",Context.MODE_PRIVATE).getString(base.getName(),"");
            if(!name.matches("[a-f0-9]{64}-[a-f0-9]{64}\\.jpg"))return null;
            File photo=new File(base.getParentFile(),name);return photo.isFile()?Uri.fromFile(photo):null;
        }catch(Exception ignored){return null;}
    }
    static Uri saveBase64(Context context,String id,String encoded) throws Exception {
        if(id.isEmpty()||id.length()>512||encoded.length()>6*1024*1024)throw new IllegalArgumentException("Invalid artwork");
        return save(context,id,Base64.decode(encoded,Base64.DEFAULT));
    }
    static synchronized Uri save(Context context,String id,byte[] bytes) throws Exception {
        if(bytes==null||bytes.length==0||bytes.length>4*1024*1024)return null;
        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
        if(bounds.outWidth<=0||bounds.outHeight<=0||bounds.outWidth>20000||bounds.outHeight>20000)return null;
        BitmapFactory.Options options=new BitmapFactory.Options();options.inSampleSize=1;
        while(Math.max(bounds.outWidth,bounds.outHeight)/options.inSampleSize>512)options.inSampleSize*=2;
        Bitmap image=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);if(image==null)return null;
        ByteArrayOutputStream output=new ByteArrayOutputStream();
        try{image.compress(Bitmap.CompressFormat.JPEG,85,output);}finally{image.recycle();}
        File base=file(context,id),directory=base.getParentFile();
        byte[] jpeg=output.toByteArray(),hash=MessageDigest.getInstance("SHA-256").digest(jpeg);StringBuilder digest=new StringBuilder();
        for(byte b:hash)digest.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        File target=new File(directory,base.getName().replace(".jpg","")+"-"+digest+".jpg");
        if(!directory.exists()&&!directory.mkdirs())throw new java.io.IOException("Artwork cache unavailable");
        File temporary=new File(directory,target.getName()+".tmp");
        try(FileOutputStream out=new FileOutputStream(temporary)){out.write(jpeg);}
        if(!temporary.renameTo(target)){temporary.delete();throw new java.io.IOException("Artwork cache unavailable");}
        target.setLastModified(System.currentTimeMillis());
        android.content.SharedPreferences preferences=context.getSharedPreferences("playback_artwork",Context.MODE_PRIVATE);
        String old=preferences.getString(base.getName(),"");preferences.edit().putString(base.getName(),target.getName()).apply();
        if(!old.equals(target.getName())&&old.matches("[a-f0-9]{64}-[a-f0-9]{64}\\.jpg"))new File(directory,old).delete();
        File[] cached=directory.listFiles((dir,name)->name.endsWith(".jpg"));
        if(cached!=null&&cached.length>256){
            Arrays.sort(cached,(a,b)->Long.compare(a.lastModified(),b.lastModified()));
            for(int i=0;i<cached.length-256;i++)if(!cached[i].equals(target))cached[i].delete();
        }
        return Uri.fromFile(target);
    }
    static Uri embedded(Context context,String id,Uri audio) {
        Uri cached=find(context,id);if(cached!=null)return cached;
        if(!MainActivity.hasMusicPermission(context,audio))return null;
        try{Uri saved=save(context,id,MusicEngine.get(context).savedArtwork(audio));if(saved!=null)return saved;}catch(Exception ignored){}
        MediaMetadataRetriever reader=new MediaMetadataRetriever();
        try{reader.setDataSource(context,audio);return save(context,id,reader.getEmbeddedPicture());}
        catch(Exception ignored){return null;}
        finally{try{reader.release();}catch(Exception ignored){}}
    }
}

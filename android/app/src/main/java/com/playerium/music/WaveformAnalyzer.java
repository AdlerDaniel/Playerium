package com.playerium.music;
import android.content.Context;
import android.net.Uri;
import androidx.documentfile.provider.DocumentFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.*;

/** Real PCM peaks; analysis and cache live outside the media/gallery folders. */
final class WaveformAnalyzer {
 static synchronized JSONObject analyze(Context context,Uri uri,File runtime) throws Exception {
  if(!MainActivity.hasMusicPermission(context,uri))throw new SecurityException("Unauthorized URI");
  DocumentFile document=DocumentFile.fromSingleUri(context,uri);long size=document==null?0:document.length(),modified=document==null?0:document.lastModified();if("file".equals(uri.getScheme())){File f=new File(uri.getPath());size=f.length();modified=f.lastModified();}
  String key=GoogleCloud.hex(MessageDigest.getInstance("SHA-256").digest((uri+"|"+size+"|"+modified+"|wave-v1").getBytes(StandardCharsets.UTF_8)));
  File folder=new File(context.getCacheDir(),"waveforms");folder.mkdirs();File cached=new File(folder,key+".json");if(cached.isFile()){try(InputStream in=new FileInputStream(cached)){return new JSONObject(new String(read(in,16384),StandardCharsets.UTF_8));}}
  File input=File.createTempFile("waveform-",".audio",context.getCacheDir());
  try{try(InputStream in=context.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(input)){if(in==null)throw new IOException("Audio unavailable");byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted())throw new IOException("Cancelled");out.write(b,0,n);}}
   ProcessBuilder builder=new ProcessBuilder(new File(context.getApplicationInfo().nativeLibraryDir,"libffmpeg.so").getAbsolutePath(),"-v","error","-nostdin","-i",input.getAbsolutePath(),"-vn","-ac","1","-ar","8000","-f","s16le","pipe:1");builder.environment().put("LD_LIBRARY_PATH",new File(runtime,"python/usr/lib")+":"+new File(runtime,"ffmpeg/usr/lib"));Process process=builder.start();Thread errors=new Thread(()->{try(InputStream in=process.getErrorStream()){byte[] bytes=new byte[4096];while(in.read(bytes)!=-1){}}catch(IOException ignored){}},"Playerium waveform diagnostics");errors.setDaemon(true);errors.start();
   FutureTask<byte[]> output=new FutureTask<>(()->read(process.getInputStream(),16*1024*1024));new Thread(output,"Playerium waveform output").start();
   try{long deadline=System.currentTimeMillis()+90000;while(true){try{process.exitValue();break;}catch(IllegalThreadStateException running){if(output.isDone()){output.get();}if(System.currentTimeMillis()>deadline||Thread.currentThread().isInterrupted())throw new IOException("Waveform timed out");Thread.sleep(50);}}if(process.exitValue()!=0)throw new IOException("Waveform unavailable");byte[] pcm=output.get(5,TimeUnit.SECONDS);if(pcm.length<2)throw new IOException("Empty audio");ByteBuffer samples=ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN);int count=pcm.length/2;JSONArray peaks=new JSONArray();for(int i=0;i<192;i++){double peak=0;for(int n=i*count/192;n<(i+1)*count/192;n++)peak=Math.max(peak,Math.abs((int)samples.getShort(n*2))/32768.);peaks.put(peak);}JSONObject result=new JSONObject().put("peaks",peaks);try(OutputStream out=new FileOutputStream(cached)){out.write(result.toString().getBytes(StandardCharsets.UTF_8));}return result;}finally{process.destroy();output.cancel(true);}
  }finally{input.delete();}
 }
 private static byte[] read(InputStream in,int limit)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>limit)throw new IOException("Audio too long");}return out.toByteArray();}
}

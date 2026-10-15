package com.playerium.music;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.io.File;
import java.io.FileOutputStream;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public class LoudnessTest {
 private File tone(android.content.Context context,String name,int amplitude)throws Exception{
  File root=MusicEngine.managedDirectory(context);root.mkdirs();File file=new File(root,name);int rate=8000,samples=rate*5;
  ByteBuffer data=ByteBuffer.allocate(44+samples*2).order(ByteOrder.LITTLE_ENDIAN);
  data.put("RIFF".getBytes()).putInt(data.capacity()-8).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(rate).putInt(rate*2).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(samples*2);
  for(int i=0;i<samples;i++)data.putShort((short)(Math.sin(i*2*Math.PI*440/rate)*amplitude));try(FileOutputStream out=new FileOutputStream(file)){out.write(data.array());}return file;
 }
 @Test public void nativeFullRecordingMeasurementsNormalizeDifferentLevels()throws Exception{
  android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File quiet=tone(context,"normalization-quiet.wav",1000),loud=tone(context,"normalization-loud.wav",12000);
  try{
   double q=MusicEngine.get(context).analyzeLoudness(android.net.Uri.fromFile(quiet)).getDouble("gain"),l=MusicEngine.get(context).analyzeLoudness(android.net.Uri.fromFile(loud)).getDouble("gain");
   assertTrue(Math.abs(20*Math.log10(1000*q/(12000*l)))<3);
   assertEquals(q,MusicEngine.get(context).analyzeLoudness(android.net.Uri.fromFile(quiet)).getDouble("gain"),.00001);
    java.lang.reflect.Field field=MusicEngine.class.getDeclaredField("knownLoudness");field.setAccessible(true);((java.util.Map)field.get(MusicEngine.get(context))).clear();
    assertEquals(q,MusicEngine.get(context).knownLoudness(android.net.Uri.fromFile(quiet)),.00001);
  }finally{quiet.delete();loud.delete();}
 }
 @Test public void nativeWaveformUsesActualSignalAndSilenceAndCachesIt()throws Exception{
  android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File file=tone(context,"waveform-real.wav",8000);
  try{try(java.io.RandomAccessFile audio=new java.io.RandomAccessFile(file,"rw")){audio.seek(40044);audio.write(new byte[40000]);}
   org.json.JSONObject result=MusicEngine.get(context).analyzeWaveform(android.net.Uri.fromFile(file));org.json.JSONArray peaks=result.getJSONArray("peaks");assertEquals(192,peaks.length());assertTrue(peaks.getDouble(30)>.2);for(int i=110;i<192;i++)assertTrue(peaks.getDouble(i)<.001);assertEquals(result.toString(),MusicEngine.get(context).analyzeWaveform(android.net.Uri.fromFile(file)).toString());assertEquals(80044,file.length());
   try{MusicEngine.get(context).analyzeWaveform(android.net.Uri.parse("file:///data/local/tmp/private.wav"));fail("Unauthorized audio must be rejected");}catch(SecurityException expected){}
  }finally{file.delete();}
 }
 @Test public void cachedPlaylistLoudnessDoesNotWaitForTheAnalysisMonitorAndInvalidatesChangedFiles()throws Exception{
  android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();File file=tone(context,"cached-selection.wav",1200);MusicEngine engine=MusicEngine.get(context);
  java.util.concurrent.CountDownLatch entered=new java.util.concurrent.CountDownLatch(1),release=new java.util.concurrent.CountDownLatch(1);Thread worker=null;
  try{double gain=engine.analyzeLoudness(android.net.Uri.fromFile(file)).getDouble("gain");worker=new Thread(()->{synchronized(engine){entered.countDown();try{release.await(5,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException ignored){}}});worker.start();assertTrue(entered.await(2,java.util.concurrent.TimeUnit.SECONDS));
   long started=android.os.SystemClock.elapsedRealtime();assertEquals(gain,engine.cachedLoudness(android.net.Uri.fromFile(file)).getDouble("gain"),.00001);assertEquals(gain,engine.analyzeLoudness(android.net.Uri.fromFile(file)).getDouble("gain"),.00001);assertTrue("Cached selection waited for unrelated analysis",android.os.SystemClock.elapsedRealtime()-started<1000);
   try(java.io.RandomAccessFile changed=new java.io.RandomAccessFile(file,"rw")){changed.seek(changed.length());changed.writeByte(0);}assertNull(engine.cachedLoudness(android.net.Uri.fromFile(file)));
   try{engine.cachedLoudness(android.net.Uri.parse("file:///system/build.prop"));fail("Unauthorized cache lookup accepted");}catch(SecurityException expected){}
  }finally{release.countDown();if(worker!=null)worker.join(2000);file.delete();}
 }
 @Test public void pcmGainKeepsChannelBalanceAndCannotOverflow()throws Exception{

  NormalizationProcessor processor=new NormalizationProcessor();processor.configure(new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_16BIT));processor.flush();processor.startTrack(2);
  ByteBuffer input=ByteBuffer.allocateDirect(8).order(ByteOrder.LITTLE_ENDIAN);input.putShort((short)1000).putShort((short)-1000).putShort((short)30000).putShort((short)-30000).flip();processor.queueInput(input);ByteBuffer out=processor.getOutput().order(ByteOrder.LITTLE_ENDIAN);
  assertEquals(2000,out.getShort());assertEquals(-2000,out.getShort());assertEquals(32767,out.getShort());assertEquals(-32767,out.getShort());
 }
  @Test public void backgroundLibraryPreparationProcessesEveryQueuedRecording()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();File a=tone(c,"migration-a.wav",1500),b=tone(c,"migration-b.wav",6000);java.util.List<File> outputs=new java.util.ArrayList<>();
   try{
    org.json.JSONArray uris=new org.json.JSONArray().put(android.net.Uri.fromFile(a).toString()).put(android.net.Uri.fromFile(b).toString());PreparedAudio.enqueue(c,uris);
    long deadline=System.currentTimeMillis()+90000;
    while(System.currentTimeMillis()<deadline&&(!PreparedAudio.pending(c).isEmpty()))Thread.sleep(200);
    for(File input:new File[]{a,b}){android.net.Uri original=android.net.Uri.fromFile(input),ready=PreparedAudio.playable(c,original);assertFalse("Background migration left a recording unprepared",ready.equals(original));outputs.add(new File(ready.getPath()));}
    org.json.JSONObject status=PreparedAudio.status(c,uris);assertEquals(2,status.getInt("total"));assertEquals(2,status.getInt("ready"));assertEquals(0,status.getInt("pending"));assertEquals(0,status.getInt("failed"));
   }finally{a.delete();b.delete();for(File output:outputs)output.delete();}
  }
  @Test public void preparedFilesHaveEqualFixedLoudnessWithoutRewritingOrAnalyzingOnOpen()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();MusicEngine engine=MusicEngine.get(c);
   File quiet=tone(c,"prepared-quiet.wav",1000),loud=tone(c,"prepared-loud.wav",12000);java.util.List<File> outputs=new java.util.ArrayList<>();
   try{
    double[] levels=new double[2];int i=0;
    for(File input:new File[]{quiet,loud}){
     byte[] before=java.nio.file.Files.readAllBytes(input.toPath());android.net.Uri original=android.net.Uri.fromFile(input),ready=engine.prepareAudio(original);File file=new File(ready.getPath());outputs.add(file);
     assertFalse(original.equals(ready));assertArrayEquals(before,java.nio.file.Files.readAllBytes(input.toPath()));
     // Inspect the real encoded derivative through an approved fixture copy.
     File inspection=new File(MusicEngine.managedDirectory(c),"prepared-inspection-"+(i)+".m4a");
     try{java.nio.file.Files.copy(file.toPath(),inspection.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);org.json.JSONObject measurement=engine.analyzeLoudness(android.net.Uri.fromFile(inspection));levels[i++]=measurement.getDouble("integrated");assertEquals(-14,levels[i-1],1);assertTrue(measurement.getDouble("peak")<=-.5);}finally{inspection.delete();}
     long start=android.os.SystemClock.elapsedRealtime();assertEquals(ready,PreparedAudio.playable(c,original));assertTrue(android.os.SystemClock.elapsedRealtime()-start<500);
     try(java.io.RandomAccessFile changed=new java.io.RandomAccessFile(input,"rw")){changed.seek(changed.length());changed.writeByte(0);}assertEquals(original,PreparedAudio.playable(c,original));
    }
    assertEquals(levels[0],levels[1],.5);
   }finally{quiet.delete();loud.delete();for(File f:outputs)f.delete();}
  }
}

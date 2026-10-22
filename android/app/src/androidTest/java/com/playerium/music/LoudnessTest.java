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
    for(File input:new File[]{a,b}){android.net.Uri original=android.net.Uri.fromFile(input);assertEquals(original,PreparedAudio.playable(c,original));assertNotNull("Background migration left a recording unprepared",PreparedAudio.ready(c,original));}
    org.json.JSONObject status=PreparedAudio.status(c,uris);assertEquals(2,status.getInt("total"));assertEquals(2,status.getInt("ready"));assertEquals(0,status.getInt("pending"));assertEquals(0,status.getInt("failed"));
   }finally{a.delete();b.delete();for(File output:outputs)output.delete();}
  }
  @Test public void repeatedCloudVerificationDoesNotRewriteTheDownloadManifest()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();MusicEngine engine=MusicEngine.get(c);
   File file=tone(c,"cloud-verification-cache.wav",1000),manifest=new File(c.getFilesDir(),"music-downloads.json");android.net.Uri uri=android.net.Uri.fromFile(file);
   java.lang.reflect.Method records=MusicEngine.class.getDeclaredMethod("records"),save=MusicEngine.class.getDeclaredMethod("saveRecords");records.setAccessible(true);save.setAccessible(true);
   org.json.JSONObject all=(org.json.JSONObject)records.invoke(engine);String id="cloud-verification-cache-fixture";
   try{
    all.put(id,new org.json.JSONObject().put("uri",uri.toString()).put("metadata",new org.json.JSONObject()));
    String hash=OriginalNormalization.hash(new java.io.FileInputStream(file));org.json.JSONObject track=new org.json.JSONObject().put("audioKey",hash).put("normalization",new org.json.JSONObject().put("profile",PreparedAudio.PROFILE).put("targetLUFS",-7));
    PreparedAudio.acceptCloudVersion(c,uri,track);assertTrue(manifest.isFile());long modified=manifest.lastModified();
    Thread.sleep(30);
    for(int i=0;i<5;i++)PreparedAudio.acceptCloudVersion(c,uri,track);
    assertEquals("Unchanged cloud revisions must not rewrite every download record",modified,manifest.lastModified());
    assertEquals(hash,PreparedAudio.ready(c,uri).getString("audioKey"));
    // Replacing the bytes invalidates the cached stamp even at the same URI.
    try(java.io.FileOutputStream out=new java.io.FileOutputStream(file,true)){out.write(0);}
    assertNull(PreparedAudio.ready(c,uri));
   }finally{all.remove(id);save.invoke(engine);PreparedAudio.preferences(c).edit().remove("verified:"+uri).commit();file.delete();}
  }
  @Test public void originalFilesUseVerifiedConstantGainAndKeepTheirUriWithoutPlaybackAnalysis()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();MusicEngine engine=MusicEngine.get(c);
   File quiet=tone(c,"prepared-quiet.wav",1000),loud=tone(c,"prepared-loud.wav",12000);java.util.List<File> outputs=new java.util.ArrayList<>();
   try{
    double[] levels=new double[2];int i=0;
    for(File input:new File[]{quiet,loud}){
     byte[] before=java.nio.file.Files.readAllBytes(input.toPath());android.net.Uri original=android.net.Uri.fromFile(input),ready=engine.prepareAudio(original);File file=new File(ready.getPath());outputs.add(file);
     assertEquals(original,ready);assertFalse(java.util.Arrays.equals(before,java.nio.file.Files.readAllBytes(input.toPath())));
     org.json.JSONObject measurement=engine.analyzeLoudness(original);levels[i++]=measurement.getDouble("integrated");assertEquals(-18,levels[i-1],.5);assertTrue(measurement.getDouble("peak")<=-.5);
     assertNotNull(PreparedAudio.ready(c,original));byte[] normalized=java.nio.file.Files.readAllBytes(input.toPath());long modified=input.lastModified();
     long start=android.os.SystemClock.elapsedRealtime();assertEquals(ready,engine.prepareAudio(original));assertEquals(ready,PreparedAudio.playable(c,original));assertTrue(android.os.SystemClock.elapsedRealtime()-start<500);
     assertEquals(modified,input.lastModified());assertArrayEquals(normalized,java.nio.file.Files.readAllBytes(input.toPath()));
     try(java.io.RandomAccessFile changed=new java.io.RandomAccessFile(input,"rw")){changed.seek(changed.length());changed.writeByte(0);}assertNull(PreparedAudio.ready(c,original));
    }
    assertEquals(levels[0],levels[1],.5);
   }finally{quiet.delete();loud.delete();for(File f:outputs)f.delete();}
  }
  @Test public void constantGainPreservesQuietAndLoudSectionsAndNeverUsesDynamicCompression()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();MusicEngine engine=MusicEngine.get(c);File file=tone(c,"constant-sections.wav",500);
   try{
    try(java.io.RandomAccessFile out=new java.io.RandomAccessFile(file,"rw")){out.seek(40044);for(int i=20000;i<40000;i++){short value=(short)(Math.sin(i*2*Math.PI*440/8000)*4000);out.write(value&255);out.write((value>>8)&255);}}
    android.net.Uri uri=android.net.Uri.fromFile(file);org.json.JSONArray before=engine.analyzeWaveform(uri).getJSONArray("peaks");double ratio=before.getDouble(30)/before.getDouble(150);
    engine.prepareAudio(uri);org.json.JSONArray after=engine.analyzeWaveform(uri).getJSONArray("peaks");assertEquals(ratio,after.getDouble(30)/after.getDouble(150),.004);
    assertEquals(8,after.getDouble(150)/after.getDouble(30),.2);
    assertEquals(-18,engine.analyzeLoudness(uri).getDouble("integrated"),.5);
    assertEquals(9,OriginalNormalization.gain(-20,-10),.0001);assertEquals(0,OriginalNormalization.gain(-20,-.2),.0001);assertEquals(-2,OriginalNormalization.gain(-5,-2),.0001);
   }finally{file.delete();}
  }
  @Test public void mp3ReplacementPreservesTagsArtworkAndDuration()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();MusicEngine engine=MusicEngine.get(c);File source=tone(c,"tagged-source.wav",1000),mp3=new File(source.getParentFile(),"tagged-original.mp3"),cover=new File(source.getParentFile(),"tagged-cover.png");
   android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(32,32,android.graphics.Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.BLUE);
   try{
    try(FileOutputStream out=new FileOutputStream(cover)){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
    engine.normalizationProcess(java.util.Arrays.asList("-i",source.getPath(),"-i",cover.getPath(),"-map","0:a","-map","1:v","-c:a","libmp3lame","-q:a","0","-c:v","copy","-id3v2_version","3","-metadata","title=Original title","-metadata","artist=Original artist","-metadata","album=Original collection",mp3.getPath()));
    android.media.MediaMetadataRetriever before=new android.media.MediaMetadataRetriever();before.setDataSource(mp3.getPath());long duration=Long.parseLong(before.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));byte[] artwork=before.getEmbeddedPicture();before.release();assertNotNull(artwork);
    android.net.Uri uri=android.net.Uri.fromFile(mp3);assertEquals(uri,engine.prepareAudio(uri));
    android.media.MediaMetadataRetriever after=new android.media.MediaMetadataRetriever();after.setDataSource(mp3.getPath());
    try{assertEquals("Original title",after.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_TITLE));assertEquals("Original artist",after.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ARTIST));assertEquals("Original collection",after.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM));assertArrayEquals(artwork,after.getEmbeddedPicture());assertTrue(Math.abs(duration-Long.parseLong(after.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)))<150);}finally{after.release();}
    assertNotNull(PreparedAudio.ready(c,uri));assertEquals(-18,engine.analyzeLoudness(uri).getDouble("integrated"),.6);
   }finally{bitmap.recycle();source.delete();mp3.delete();cover.delete();}
  }
  @Test public void failedEncodingLeavesTheOriginalBytesUntouched()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();File file=tone(c,"failed-replacement.wav",1000);byte[] before=java.nio.file.Files.readAllBytes(file.toPath());
   try{
    try{OriginalNormalization.prepare(c,android.net.Uri.fromFile(file),args->{if(args.contains("-af")&&args.get(args.indexOf("-af")+1).startsWith("volume="))throw new java.io.IOException("Injected encoder failure");return "{\"input_i\":\"-30\",\"input_tp\":\"-20\",\"input_lra\":\"2\",\"input_thresh\":\"-40\",\"target_offset\":\"0\"}";});fail("Encoding failure was swallowed");}catch(java.io.IOException expected){assertTrue(expected.getMessage().contains("Injected"));}
    assertArrayEquals(before,java.nio.file.Files.readAllBytes(file.toPath()));assertNull(PreparedAudio.ready(c,android.net.Uri.fromFile(file)));
   }finally{file.delete();}
  }
  @Test public void legacyQuietCopiesCannotOverrideTheOriginalPlaybackSource()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();File file=tone(c,"legacy-source.wav",1000);android.net.Uri uri=android.net.Uri.fromFile(file);File legacy=new File(PreparedAudio.directory(c),PreparedAudio.key(c,uri)+".m4a");
   try{
    try(FileOutputStream out=new FileOutputStream(legacy)){out.write(new byte[100]);}
    assertEquals(uri,PreparedAudio.playable(c,uri));OriginalAudioDataSource source=new OriginalAudioDataSource(c,new androidx.media3.datasource.DefaultDataSource.Factory(c).createDataSource());
    try{source.open(new androidx.media3.datasource.DataSpec.Builder().setUri(uri).build());byte[] header=new byte[4];assertEquals(4,source.read(header,0,4));assertArrayEquals("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII),header);}finally{source.close();}
    PreparedAudio.removeLegacyCopies(c);assertFalse(legacy.exists());
   }finally{file.delete();legacy.delete();}
  }
  @Test public void interruptedReplacementRestoresTheOriginalFromItsTransactionJournal()throws Exception{
   android.content.Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();File file=tone(c,"recovery-original.wav",1000);android.net.Uri uri=android.net.Uri.fromFile(file);byte[] before=java.nio.file.Files.readAllBytes(file.toPath());
   File dir=new File(c.getNoBackupFilesDir(),"normalization-transactions");dir.mkdirs();File backup=File.createTempFile("test-before-",".audio",dir),output=File.createTempFile("test-after-",".audio",dir);
   java.lang.reflect.Method journalMethod=OriginalNormalization.class.getDeclaredMethod("journal",android.content.Context.class,android.net.Uri.class);journalMethod.setAccessible(true);File journal=(File)journalMethod.invoke(null,c,uri);
   try{
    try(FileOutputStream out=new FileOutputStream(backup)){out.write(before);}try(FileOutputStream out=new FileOutputStream(output)){out.write(before);out.write(1);}
    org.json.JSONObject job=new org.json.JSONObject().put("uri",uri.toString()).put("backup",backup.getPath()).put("output",output.getPath()).put("before",OriginalNormalization.hash(new java.io.ByteArrayInputStream(before))).put("after",OriginalNormalization.hash(new java.io.FileInputStream(output))).put("phase","writing").put("result",new org.json.JSONObject());
    try(FileOutputStream out=new FileOutputStream(journal)){out.write(job.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
    try(FileOutputStream out=new FileOutputStream(file)){out.write(new byte[]{1,2,3});}
    assertTrue(OriginalNormalization.recoverAll(c));assertArrayEquals(before,java.nio.file.Files.readAllBytes(file.toPath()));assertFalse(journal.exists());assertFalse(backup.exists());assertFalse(output.exists());
   }finally{file.delete();backup.delete();output.delete();journal.delete();}
  }
}

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
  }finally{quiet.delete();loud.delete();}
 }
 @Test public void pcmGainKeepsChannelBalanceAndCannotOverflow()throws Exception{
  NormalizationProcessor processor=new NormalizationProcessor();processor.configure(new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_16BIT));processor.flush();processor.startTrack(2);
  ByteBuffer input=ByteBuffer.allocateDirect(8).order(ByteOrder.LITTLE_ENDIAN);input.putShort((short)1000).putShort((short)-1000).putShort((short)30000).putShort((short)-30000).flip();processor.queueInput(input);ByteBuffer out=processor.getOutput().order(ByteOrder.LITTLE_ENDIAN);
  assertEquals(2000,out.getShort());assertEquals(-2000,out.getShort());assertEquals(32767,out.getShort());assertEquals(-32767,out.getShort());
 }
}

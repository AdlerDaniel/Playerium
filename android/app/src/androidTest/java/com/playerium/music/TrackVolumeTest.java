package com.playerium.music;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import java.nio.*;
import org.junit.Test;
import static org.junit.Assert.*;

@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public class TrackVolumeTest {
 private short[] process(TrackVolumeProcessor p,short... values){
  ByteBuffer input=ByteBuffer.allocateDirect(values.length*2).order(ByteOrder.nativeOrder());for(short value:values)input.putShort(value);input.flip();p.queueInput(input);assertFalse(input.hasRemaining());
  ByteBuffer output=p.getOutput().order(ByteOrder.nativeOrder());short[] result=new short[output.remaining()/2];for(int i=0;i<result.length;i++)result[i]=output.getShort();return result;
 }
 @Test public void manualGainSupportsUnityMuteAttenuationBoostAndLiveChanges()throws Exception{
  TrackVolumeProcessor p=new TrackVolumeProcessor();p.configure(new AudioProcessor.AudioFormat(48000,2,C.ENCODING_PCM_16BIT));p.flush();assertTrue(p.isActive());
  p.queueInput(AudioProcessor.EMPTY_BUFFER);assertFalse(p.getOutput().hasRemaining());
  short[] original={-32768,-10000,0,10000,32767};assertArrayEquals(original,process(p,original));
  p.setGain(.5);assertArrayEquals(new short[]{-16384,-5000,0,5000,16384},process(p,original));
  p.setGain(2);assertArrayEquals(new short[]{-32768,-20000,0,20000,32767},process(p,original));
  p.setGain(0);assertArrayEquals(new short[5],process(p,original));
  p.queueInput(AudioProcessor.EMPTY_BUFFER);assertFalse(p.getOutput().hasRemaining());
  p.setGain(1);p.flush();assertArrayEquals(original,process(p,original));
  assertEquals(1f,TrackVolumeProcessor.bounded(Double.NaN),0);assertEquals(1f,TrackVolumeProcessor.bounded(Double.POSITIVE_INFINITY),0);assertEquals(2f,TrackVolumeProcessor.bounded(4),0);assertEquals(0f,TrackVolumeProcessor.bounded(-1),0);
 }
}

package com.playerium.music;

import androidx.media3.common.C;
import androidx.media3.common.audio.BaseAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Manual per-track gain. No measurement, file writing or automatic adjustment. */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class TrackVolumeProcessor extends BaseAudioProcessor {
    private volatile float gain=1f;
    static float bounded(double value){return Double.isNaN(value)||Double.isInfinite(value)?1f:(float)Math.max(0,Math.min(2,value));}
    void setGain(double value){gain=bounded(value);}
    float gain(){return gain;}
    @Override protected AudioFormat onConfigure(AudioFormat format)throws UnhandledAudioFormatException{
        if(format.encoding!=C.ENCODING_PCM_16BIT)throw new UnhandledAudioFormatException(format);
        return format;
    }
    @Override public void queueInput(ByteBuffer input){
        ByteBuffer output=replaceOutputBuffer(input.remaining());input.order(ByteOrder.nativeOrder());final float multiplier=gain;
        if(multiplier==1f)output.put(input);
        else while(input.remaining()>=2){int sample=Math.round(input.getShort()*multiplier);output.putShort((short)Math.max(Short.MIN_VALUE,Math.min(Short.MAX_VALUE,sample)));}
        output.flip();
    }
}

package com.playerium.music;

import androidx.media3.common.C;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.audio.AudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Applies one measured gain per recording; volume and song dynamics remain independent. */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class NormalizationProcessor extends BaseAudioProcessor {
    private volatile double target=1;
    private double current=1;
    private volatile boolean resetGain;
    void setGain(double gain){target=Double.isNaN(gain)||Double.isInfinite(gain)?1:Math.max(.0316,Math.min(8,gain));}
    void startTrack(double gain){setGain(gain);resetGain=true;}
    @Override protected AudioProcessor.AudioFormat onConfigure(AudioProcessor.AudioFormat format) throws AudioProcessor.UnhandledAudioFormatException {
        if(format.encoding!=C.ENCODING_PCM_16BIT)throw new AudioProcessor.UnhandledAudioFormatException(format);
        return format;
    }
    @Override public void queueInput(ByteBuffer input){
        if(resetGain){current=target;resetGain=false;}
        ByteBuffer output=replaceOutputBuffer(input.remaining()).order(ByteOrder.LITTLE_ENDIAN);input.order(ByteOrder.LITTLE_ENDIAN);
        double step=1./Math.max(1,inputAudioFormat.sampleRate*.05),gain=target;
        int channels=Math.max(1,inputAudioFormat.channelCount);
        while(input.remaining()>=channels*2){current+=(gain-current)*step;for(int channel=0;channel<channels;channel++)output.putShort((short)Math.max(-32767,Math.min(32767,Math.round(input.getShort()*current))));}
        output.flip();
    }
}

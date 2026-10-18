package com.playerium.music;

import android.net.Uri;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;
import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Playback always opens the original URI; tracks SAF readers during a safe replacement. */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class OriginalAudioDataSource implements DataSource {
    private final DataSource delegate;
    private final android.content.Context context;
    private Uri original;
    OriginalAudioDataSource(android.content.Context context,DataSource delegate){this.context=context;this.delegate=delegate;}
    @Override public long open(DataSpec spec)throws IOException{
        if(!MainActivity.hasMusicPermission(context,spec.uri))throw new SecurityException("Unauthorized URI");
        original=spec.uri;OriginalNormalization.opened(original);
        try{return delegate.open(spec);}catch(IOException|RuntimeException error){OriginalNormalization.closed(original);original=null;throw error;}
    }
    @Override public int read(byte[] buffer,int offset,int length)throws IOException{return delegate.read(buffer,offset,length);}
    @Override public Uri getUri(){return delegate.getUri();}
    @Override public Map<String,List<String>> getResponseHeaders(){return delegate.getResponseHeaders();}
    @Override public void addTransferListener(TransferListener listener){delegate.addTransferListener(listener);}
    @Override public void close()throws IOException{try{delegate.close();}finally{if(original!=null){OriginalNormalization.closed(original);original=null;}}}
}

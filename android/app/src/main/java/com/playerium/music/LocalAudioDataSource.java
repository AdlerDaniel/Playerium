package com.playerium.music;

import android.content.Context;
import android.net.Uri;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;
import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Opens local music without modifying the recording. */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class LocalAudioDataSource implements DataSource {
    private final Context context;
    private final DataSource delegate;
    LocalAudioDataSource(Context context, DataSource delegate){this.context=context;this.delegate=delegate;}
    @Override public long open(DataSpec spec)throws IOException{
        if(!MainActivity.hasMusicPermission(context,spec.uri))throw new SecurityException("Unauthorized URI");
        return delegate.open(spec);
    }
    @Override public int read(byte[] buffer,int offset,int length)throws IOException{return delegate.read(buffer,offset,length);}
    @Override public Uri getUri(){return delegate.getUri();}
    @Override public Map<String,List<String>> getResponseHeaders(){return delegate.getResponseHeaders();}
    @Override public void addTransferListener(TransferListener listener){delegate.addTransferListener(listener);}
    @Override public void close()throws IOException{delegate.close();}
}

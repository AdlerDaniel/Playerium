package com.playerium.music;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NormalizationDocumentTest {
    private final Uri provider=Uri.parse("content://com.playerium.music.test-documents");
    private byte[] tone(){int samples=32000;ByteBuffer b=ByteBuffer.allocate(44+samples*2).order(ByteOrder.LITTLE_ENDIAN);b.put("RIFF".getBytes()).putInt(b.capacity()-8).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(8000).putInt(16000).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(samples*2);for(int i=0;i<samples;i++)b.putShort((short)(Math.sin(i*2*Math.PI*440/8000)*1000));return b.array();}
    private Uri create(Context c,boolean readOnly){Bundle extras=new Bundle();extras.putByteArray("bytes",tone());extras.putString("package",c.getPackageName());extras.putBoolean("readOnly",readOnly);Bundle result=c.getContentResolver().call(provider,"create",null,extras);Uri uri=Uri.parse(result.getString("uri"));c.getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION|(readOnly?0:Intent.FLAG_GRANT_WRITE_URI_PERMISSION));assertTrue(MainActivity.hasMusicPermission(c,uri));return uri;}
    private byte[] read(Context c,Uri uri)throws Exception{try(InputStream in=c.getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}}
    private void close(Context c,Uri uri){c.getContentResolver().call(provider,"delete",uri.toString(),null);try{c.getContentResolver().releasePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);}catch(SecurityException ignored){}}
    @Test public void writableDocumentIsReplacedInPlaceAndReadOnlyDocumentsRemainUntouched()throws Exception{
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();Uri writable=create(c,false),readOnly=create(c,true);
        try{
            byte[] before=read(c,writable);assertEquals(writable,MusicEngine.get(c).prepareAudio(writable));assertFalse(java.util.Arrays.equals(before,read(c,writable)));assertNotNull(PreparedAudio.ready(c,writable));assertEquals(writable,PreparedAudio.playable(c,writable));
            byte[] protectedBytes=read(c,readOnly);try{MusicEngine.get(c).prepareAudio(readOnly);fail("Read-only source accepted for replacement");}catch(SecurityException expected){}assertArrayEquals(protectedBytes,read(c,readOnly));assertNull(PreparedAudio.ready(c,readOnly));
        }finally{close(c,writable);close(c,readOnly);}
    }
    @Test public void failedDocumentWriteRetainsARecoverableOriginal()throws Exception{
        Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();Uri uri=create(c,false);byte[] before=read(c,uri);
        Bundle failure=new Bundle();failure.putBoolean("enabled",true);c.getContentResolver().call(provider,"failWrites",uri.toString(),failure);
        try{
            try{MusicEngine.get(c).prepareAudio(uri);fail("Broken document writer accepted");}catch(IOException expected){}
            failure.putBoolean("enabled",false);c.getContentResolver().call(provider,"failWrites",uri.toString(),failure);OriginalNormalization.recover(c,uri);
            assertArrayEquals(before,read(c,uri));assertNull(PreparedAudio.ready(c,uri));
            assertEquals(uri,MusicEngine.get(c).prepareAudio(uri));assertNotNull(PreparedAudio.ready(c,uri));
        }finally{failure.putBoolean("enabled",false);c.getContentResolver().call(provider,"failWrites",uri.toString(),failure);close(c,uri);}
    }
}

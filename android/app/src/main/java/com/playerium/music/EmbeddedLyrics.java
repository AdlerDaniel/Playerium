package com.playerium.music;

import android.content.Context;
import android.net.Uri;
import androidx.media3.common.Metadata;
import androidx.media3.extractor.metadata.id3.BinaryFrame;
import androidx.media3.extractor.metadata.id3.Id3Decoder;
import androidx.media3.extractor.metadata.id3.TextInformationFrame;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.Arrays;
import org.json.JSONObject;

/** Bounded ID3 read; artwork frames are skipped by the decoder. */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class EmbeddedLyrics {
 static void read(Context context,Uri uri,JSONObject result){
  try(InputStream in=context.getContentResolver().openInputStream(uri)){
   if(in==null)return;byte[] header=new byte[10];if(!readFully(in,header,0,10)||header[0]!='I'||header[1]!='D'||header[2]!='3')return;
   int size=10+((header[6]&127)<<21)+((header[7]&127)<<14)+((header[8]&127)<<7)+(header[9]&127);if(size<10||size>8*1024*1024)return;
   byte[] bytes=Arrays.copyOf(header,size);if(!readFully(in,bytes,10,size-10))return;
   Id3Decoder decoder=new Id3Decoder((version,a,b,c,d)->(a=='U'&&b=='S'&&c=='L'&&d=='T')||(a=='T'&&b=='X'&&c=='X'&&d=='X'));
   Metadata metadata=decoder.decode(bytes,size);if(metadata==null)return;
   for(int i=0;i<metadata.length();i++){
    Metadata.Entry entry=metadata.get(i);
    if(entry instanceof BinaryFrame&&"USLT".equals(((BinaryFrame)entry).id)){
     byte[] data=((BinaryFrame)entry).data;if(data.length<5)continue;int encoding=data[0],step=encoding==1||encoding==2?2:1,at=4;
     while(at+step<=data.length&&!(data[at]==0&&(step==1||data[at+1]==0)))at+=step;at+=step;if(at>=data.length)continue;
     String charset=encoding==1?"UTF-16":encoding==2?"UTF-16BE":encoding==3?"UTF-8":"ISO-8859-1";String text=new String(data,at,data.length-at,Charset.forName(charset)).replace("\u0000","");result.put("embeddedLyrics",text.substring(0,Math.min(text.length(),100000)));
    }else if(entry instanceof TextInformationFrame){TextInformationFrame frame=(TextInformationFrame)entry;if("lyrics_lrc".equalsIgnoreCase(frame.description)&&!frame.values.isEmpty()){String value=frame.values.get(0);result.put("embeddedSyncedLyrics",value.substring(0,Math.min(100000,value.length())));}}
   }
  }catch(Exception ignored){}
 }
 private static boolean readFully(InputStream in,byte[] bytes,int offset,int size)throws java.io.IOException{while(size>0){int n=in.read(bytes,offset,size);if(n<0)return false;if(n==0){int value=in.read();if(value<0)return false;bytes[offset++]=(byte)value;size--;}else{offset+=n;size-=n;}}return true;}
}

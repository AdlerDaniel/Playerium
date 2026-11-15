package com.playerium.music;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Writes a standard USLT frame while streaming the original MP3 audio unchanged. */
final class Mp3Tags {
 private static int sync(byte[] b,int at){return((b[at]&127)<<21)|((b[at+1]&127)<<14)|((b[at+2]&127)<<7)|(b[at+3]&127);}
 private static byte[] sync(int n){return new byte[]{(byte)((n>>21)&127),(byte)((n>>14)&127),(byte)((n>>7)&127),(byte)(n&127)};}
 static void lyrics(File audio,String plain)throws IOException{
  if(plain==null||plain.trim().isEmpty())return;plain=plain.replace("\u0000","");plain=plain.substring(0,Math.min(100000,plain.length()));
  File temporary=new File(audio.getParentFile(),".lyrics-"+UUID.randomUUID()+".tmp");
  try(FileInputStream in=new FileInputStream(audio)){
   byte[] header=new byte[10];int count=in.read(header),version=3;ByteArrayOutputStream frames=new ByteArrayOutputStream();
   if(count==10&&header[0]=='I'&&header[1]=='D'&&header[2]=='3'){
    version=header[3];if((version!=3&&version!=4)||header[5]!=0)throw new IOException("Unsupported ID3 layout");int size=sync(header,6);if(size>8*1024*1024)throw new IOException("ID3 tag too large");byte[] tags=new byte[size];new DataInputStream(in).readFully(tags);
    for(int at=0;at+10<=size;){String id=new String(tags,at,4,StandardCharsets.US_ASCII);if(!id.matches("[A-Z0-9]{4}"))break;int length=version==4?sync(tags,at+4):((tags[at+4]&255)<<24)|((tags[at+5]&255)<<16)|((tags[at+6]&255)<<8)|(tags[at+7]&255);if(length<0||at+10L+length>size)throw new IOException("Invalid ID3 frame");if(!id.equals("USLT"))frames.write(tags,at,10+length);at+=10+length;}
   }else in.getChannel().position(0);
   ByteArrayOutputStream text=new ByteArrayOutputStream();text.write(new byte[]{1,'u','n','d',(byte)255,(byte)254,0,0,(byte)255,(byte)254});text.write(plain.getBytes(StandardCharsets.UTF_16LE));text.write(new byte[]{0,0});byte[] content=text.toByteArray();
   frames.write(new byte[]{'U','S','L','T'});if(version==4)frames.write(sync(content.length));else new DataOutputStream(frames).writeInt(content.length);frames.write(new byte[]{0,0});frames.write(content);
   try(FileOutputStream out=new FileOutputStream(temporary)){
    out.write(new byte[]{'I','D','3',(byte)version,0,0});out.write(sync(frames.size()));frames.writeTo(out);byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
   }
  }catch(IOException|RuntimeException error){temporary.delete();throw error;}
  if(!temporary.renameTo(audio)){temporary.delete();throw new IOException("Could not save embedded lyrics");}
 }
}

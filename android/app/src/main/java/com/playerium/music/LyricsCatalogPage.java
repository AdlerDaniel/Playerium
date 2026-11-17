package com.playerium.music;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

/** Reads only public lyric catalog pages through the anonymous Reader endpoint. */
final class LyricsCatalogPage {
 static String pageURL(JSONObject payload)throws Exception{
  String provider=payload.optString("provider"),origin;
  if(provider.equals("pisni"))origin="https://pisni.in.ua";else if(provider.equals("tekst"))origin="https://tekst-pisni.com";else throw new SecurityException("Недопустимый источник текста");
  if(payload.has("path")){
   String path=payload.getString("path"),pattern=provider.equals("pisni")?"/[a-z0-9][a-z0-9-]{0,99}/[a-z0-9][a-z0-9-]{0,199}/?":"/[a-z0-9][a-z0-9-]{0,239}/";
   if(!path.matches(pattern))throw new SecurityException("Недопустимая страница текста");return origin+path;
  }
  String query=payload.optString("query").trim();if(query.isEmpty()||query.length()>200)throw new SecurityException("Недопустимый поиск текста");
  return origin+(provider.equals("pisni")?"/search?q=":"/?s=")+URLEncoder.encode(query,"UTF-8");
 }
 private static boolean samePage(String actual,String expected)throws Exception{
  URL a=new URL(actual),b=new URL(expected);
  return a.getProtocol().equals("https")&&a.getHost().equals(b.getHost())&&a.getUserInfo()==null&&a.getPort()==-1&&a.getPath().replaceAll("/$","").equals(b.getPath().replaceAll("/$",""))&&URLDecoder.decode(a.getQuery()==null?"":a.getQuery(),"UTF-8").equals(URLDecoder.decode(b.getQuery()==null?"":b.getQuery(),"UTF-8"));
 }
 static JSONObject fetch(JSONObject payload)throws Exception{
  String url=pageURL(payload);HttpURLConnection c=(HttpURLConnection)new URL("https://r.jina.ai/"+url).openConnection();
  c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setRequestProperty("Accept","application/json");c.setRequestProperty("X-Respond-With","html");
  try{
   int status=c.getResponseCode();if(status!=200)return new JSONObject().put("status",status).put("retryAfter",c.getHeaderField("Retry-After")).put("html","").put("url",url);
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=c.getInputStream()){byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1){if(Thread.currentThread().isInterrupted())throw new IOException("Cancelled");if(bytes.size()+n>1024*1024)throw new IOException("Lyrics response too large");bytes.write(buffer,0,n);}}
   JSONObject result=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)),data=result.getJSONObject("data");
   if(result.optInt("code")!=200||!samePage(data.getString("url"),url)||!samePage(data.optString("finalUrl",data.getString("url")),url))throw new IOException("Different lyrics page");
   status=data.optInt("httpStatus",200);return new JSONObject().put("status",status).put("html",status==200?data.optString("html"):"").put("url",url);
  }finally{c.disconnect();}
 }
}

package com.playerium.music;
import android.content.Context;
import org.json.*;
import java.net.HttpURLConnection;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

final class GoogleConnect {
 final GoogleCloud cloud;final android.content.SharedPreferences prefs;final LocalConnect live;final ConcurrentHashMap<String,String> ids=new ConcurrentHashMap<>();
 GoogleConnect(GoogleCloud cloud,Context context){this.cloud=cloud;prefs=context.getSharedPreferences("playerium_connect",Context.MODE_PRIVATE);live=new LocalConnect(()->cloud.prefs.getBoolean("enabled",false)?account():null,this::wasAcknowledged);}
 static void identifier(String value)throws IOException{if(value==null||!value.matches("[A-Za-z0-9_-]{1,100}"))throw new IOException("Некорректное устройство.");}
 String account(){return cloud.prefs.getString("account","");}
 String ack(String device){return prefs.getString(account()+":ack:"+device,"");}
 boolean wasAcknowledged(String device,String command){if(command.equals(ack(device)))return true;try{JSONArray history=new JSONArray(prefs.getString(account()+":history:"+device,"[]"));for(int i=0;i<history.length();i++)if(command.equals(history.optString(i)))return true;}catch(Exception ignored){}return false;}
 void acknowledge(String device,String command)throws Exception{identifier(device);identifier(command);JSONArray history=new JSONArray(prefs.getString(account()+":history:"+device,"[]"));JSONArray updated=new JSONArray();for(int i=Math.max(0,history.length()-63);i<history.length();i++)if(!command.equals(history.optString(i)))updated.put(history.get(i));updated.put(command);prefs.edit().putString(account()+":ack:"+device,command).putString(account()+":history:"+device,updated.toString()).commit();live.acknowledge(device,command);}
 JSONObject read(String kind,String device)throws Exception{identifier(device);String key=kind+":"+device,cache=account()+":"+key,id=ids.get(cache);if(id==null){JSONObject found=cloud.find(key);if(found==null)return null;id=found.getString("id");ids.put(cache,id);}try{return new JSONObject(new String(cloud.media(id,262144),StandardCharsets.UTF_8));}catch(Exception e){ids.remove(cache);throw e;}}
 synchronized boolean write(String kind,String device,JSONObject data)throws Exception{
  identifier(device);if(!kind.equals("device")&&!kind.equals("command"))throw new IOException("Некорректное сообщение.");cloud.token();String account=account(),key=kind+":"+device,cache=account+":"+key,id=ids.get(cache);byte[] bytes=data.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>262144)throw new IOException("Очередь слишком большая.");
  if(id==null){JSONObject found=cloud.find(key);if(found!=null)id=found.getString("id");}
  HttpURLConnection connection;byte[] body;
  if(id!=null){connection=cloud.connection("https://www.googleapis.com/upload/drive/v3/files/"+id+"?uploadType=media&fields=id","POST");connection.setRequestProperty("X-HTTP-Method-Override","PATCH");connection.setRequestProperty("Content-Type","application/json");body=bytes;}
  else{String boundary="playerium_"+UUID.randomUUID();JSONObject meta=new JSONObject().put("name",key+".json").put("mimeType","application/json").put("parents",new JSONArray().put(cloud.folder())).put("appProperties",new JSONObject().put("playeriumCloud","1").put("kind",kind).put("key",key));body=("--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+meta+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+data+"\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8);connection=cloud.connection("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id","POST");connection.setRequestProperty("Content-Type","multipart/related; boundary="+boundary);}
  connection.setConnectTimeout(10000);connection.setReadTimeout(15000);
  try{connection.setDoOutput(true);connection.setFixedLengthStreamingMode(body.length);try(OutputStream out=connection.getOutputStream()){out.write(body);}if(connection.getResponseCode()==404&&id!=null){ids.remove(cache);throw new IOException("Устройство обновляется. Повторите попытку.");}cloud.check(connection);JSONObject result=new JSONObject(new String(GoogleCloud.read(connection.getInputStream(),65536),StandardCharsets.UTF_8));if(!account.equals(account())||!cloud.prefs.getBoolean("enabled",false))throw new IOException("Аккаунт изменился.");ids.put(cache,result.getString("id"));return true;}finally{connection.disconnect();}
 }
 JSONObject command(String device)throws Exception{JSONObject command=read("command",device);if(command==null)return null;long age=System.currentTimeMillis()-command.optLong("issuedAt");if(!device.equals(command.optString("target"))||wasAcknowledged(device,command.optString("id"))||age>90000||age< -30000)return null;identifier(command.optString("id"));return command;}
 Object request(String operation,JSONObject data)throws Exception{
  String device=data.optString("id");
  if(operation.equals("connectInfo")){JSONObject info=new JSONObject().put("name",android.os.Build.MODEL).put("type","phone").put("realtime",true);if(cloud.prefs.getBoolean("enabled",false)&&!device.isEmpty()){identifier(device);JSONObject local=new JSONObject(info.toString()).put("id",device).put("state",new JSONObject().put("playing",false));prefs.edit().putString("local",local.toString()).putString("localAccount",account()).apply();live.start();live.publish(local);}return info;}
  if(operation.equals("connectLive")){identifier(device);live.start();live.publish(new JSONObject(data.toString()).put("ack",ack(device)));return live.scan(device);}
  if(operation.equals("connectAck")){acknowledge(device,data.getString("commandId"));return true;}
  if(operation.equals("connectSend")){JSONObject cmd=data.getJSONObject("command");identifier(device);identifier(cmd.getString("id"));if(!device.equals(cmd.optString("target")))throw new IOException("Некорректное устройство.");if(live.send(cmd))return new JSONObject().put("live",true);}
  cloud.token();
  if(operation.equals("connectPublish")){identifier(device);prefs.edit().putString("local",data.toString()).putString("localAccount",account()).apply();live.start();live.publish(new JSONObject(data.toString()).put("ack",ack(device)));return write("device",device,new JSONObject(data.toString()).put("lan",live.descriptor()).put("seenAt",System.currentTimeMillis()).put("ack",ack(device)));}
  if(operation.equals("connectSend")){JSONObject cmd=data.getJSONObject("command");identifier(cmd.getString("id"));if(!device.equals(cmd.optString("target")))throw new IOException("Некорректное устройство.");return write("command",device,cmd);}
  if(operation.equals("connectAck")){acknowledge(device,data.getString("commandId"));return true;}
  if(operation.equals("connectScan")){identifier(device);JSONArray files=cloud.list("appProperties has { key='kind' and value='device' }"),devices=new JSONArray();for(int i=0;i<Math.min(20,files.length());i++)try{JSONObject peer=new JSONObject(new String(cloud.media(files.getJSONObject(i).getString("id"),262144),StandardCharsets.UTF_8));live.learn(peer);peer.remove("lan");devices.put(peer);}catch(Exception ignored){}return new JSONObject().put("devices",devices).put("command",command(device));}
  throw new IOException("Неизвестная команда устройства.");
 }
 JSONObject local(){try{if(!account().equals(prefs.getString("localAccount","")))return null;return new JSONObject(prefs.getString("local","{}"));}catch(Exception e){return null;}}
}

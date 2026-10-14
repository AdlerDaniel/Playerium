package com.playerium.music;
import android.content.*;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ConnectTest {
 @Test public void nativeDeviceStateUpdatesCommandsAndAcknowledgementsRemainScopedAndPersistent()throws Exception{
  Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);GoogleCloud.Connections original=cloud.connections;boolean enabled=cloud.prefs.getBoolean("enabled",false);String account=cloud.prefs.getString("account",null);
  java.lang.reflect.Field token=GoogleCloud.class.getDeclaredField("token"),until=GoogleCloud.class.getDeclaredField("tokenUntil");token.setAccessible(true);until.setAccessible(true);Object oldToken=token.get(cloud);long oldUntil=until.getLong(cloud);
  FakeDrive drive=new FakeDrive();cloud.connections=drive::open;cloud.prefs.edit().putBoolean("enabled",true).putString("account","connect-fixture-"+java.util.UUID.randomUUID()).commit();token.set(cloud,"fixture-token");until.setLong(cloud,System.currentTimeMillis()+60000);
  try{GoogleConnect connect=cloud.connect;
   connect.request("connectPublish",new JSONObject().put("id","fixture_pc").put("name","ПК").put("state",new JSONObject().put("playing",true).put("position",63)));
   connect.request("connectPublish",new JSONObject().put("id","fixture_phone").put("name","Телефон").put("state",new JSONObject().put("playing",false)));
   JSONObject command=new JSONObject().put("id","command_first").put("target","fixture_phone").put("issuedAt",System.currentTimeMillis()).put("action","pause");connect.request("connectSend",new JSONObject().put("id","fixture_phone").put("command",command));
   JSONObject scan=(JSONObject)connect.request("connectScan",new JSONObject().put("id","fixture_phone"));assertEquals(2,scan.getJSONArray("devices").length());assertEquals("command_first",scan.getJSONObject("command").getString("id"));
   connect.request("connectAck",new JSONObject().put("id","fixture_phone").put("commandId","command_first"));assertNull(connect.command("fixture_phone"));
   connect.request("connectPublish",new JSONObject().put("id","fixture_phone").put("state",new JSONObject().put("playing",true).put("position",80)));assertEquals(4,drive.files.size());
   JSONObject remote=connect.read("device","fixture_phone");assertEquals(80,remote.getJSONObject("state").getInt("position"));assertEquals("command_first",remote.getString("ack"));
   command.put("id","expired").put("issuedAt",System.currentTimeMillis()-100000);connect.request("connectSend",new JSONObject().put("id","fixture_phone").put("command",command));assertNull(connect.command("fixture_phone"));
  }finally{cloud.prefs.edit().putBoolean("enabled",enabled).putString("account",account).commit();token.set(cloud,oldToken);until.setLong(cloud,oldUntil);cloud.connections=original;}
 }
 @Test public void cachedTransferAvoidsNetworkAndRejectsChangedBytes()throws Exception{
  Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);String key="63f75c890b05405e6e1f047072642b40949dab5912aa9c0ae6f2e654dff943dd";File root=new File(MusicEngine.managedDirectory(context),"Cloud");root.mkdirs();File audio=new File(root,key+".mp3"),marker=new File(root,key+".mp3.verified");
  try{try(FileOutputStream out=new FileOutputStream(audio)){out.write("song".getBytes());}JSONObject track=new JSONObject().put("ext",".mp3").put("size",4);assertNotNull(cloud.localCopy(key,track));assertTrue(marker.exists());try(FileOutputStream out=new FileOutputStream(audio)){out.write("evil".getBytes());}audio.setLastModified(System.currentTimeMillis()+1000);assertNull(cloud.localCopy(key,track));}finally{audio.delete();marker.delete();}
 }
 static final class FakeDrive {
  final ConcurrentHashMap<String,JSONObject> files=new ConcurrentHashMap<>();final ConcurrentHashMap<String,JSONObject> bodies=new ConcurrentHashMap<>();int serial;
  HttpURLConnection open(String address)throws Exception{return new HttpURLConnection(new URL(address)){
   final ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] response;int code=200;
   public void connect(){}public void disconnect(){}public boolean usingProxy(){return false;}public OutputStream getOutputStream(){return output;}
   void respond()throws IOException{if(response!=null)return;try{String path=url.getPath(),query=URLDecoder.decode(url.getQuery()==null?"":url.getQuery(),"UTF-8"),id=path.substring(path.lastIndexOf('/')+1);JSONObject result;
    if(path.startsWith("/upload/")){String text=new String(output.toByteArray(),StandardCharsets.UTF_8);if("PATCH".equals(getRequestProperty("X-HTTP-Method-Override"))){bodies.put(id,new JSONObject(text));result=new JSONObject().put("id",id);}else{int a=text.indexOf("\r\n\r\n")+4,b=text.indexOf("\r\n--",a),c=text.indexOf("\r\n\r\n",b)+4,d=text.lastIndexOf("\r\n--");JSONObject meta=new JSONObject(text.substring(a,b));id="file_"+(++serial);meta.put("id",id);files.put(id,meta);bodies.put(id,new JSONObject(text.substring(c,d)));result=new JSONObject().put("id",id);}}
    else if(query.contains("alt=media"))result=bodies.get(id);
    else if(getRequestMethod().equals("POST")){result=new JSONObject(new String(output.toByteArray(),StandardCharsets.UTF_8));id="file_"+(++serial);result.put("id",id);files.put(id,result);bodies.put(id,new JSONObject());}
    else{JSONArray rows=new JSONArray();for(JSONObject file:files.values()){JSONObject props=file.getJSONObject("appProperties");String key=props.optString("key"),kind=props.optString("kind");if(query.contains("key='key'")&&!query.contains("value='"+key+"'"))continue;if(query.contains("key='kind'")&&!query.contains("value='"+kind+"'"))continue;if(query.contains("mimeType = 'application/vnd.google-apps.folder'")&&!file.optString("mimeType").equals("application/vnd.google-apps.folder"))continue;rows.put(file);}result=new JSONObject().put("files",rows);}
    response=(result==null?"{}":result.toString()).getBytes(StandardCharsets.UTF_8);
   }catch(Exception e){throw new IOException(e);}}
   public int getResponseCode()throws IOException{respond();return code;}public InputStream getInputStream()throws IOException{respond();return new ByteArrayInputStream(response);}
  };}
 }
}

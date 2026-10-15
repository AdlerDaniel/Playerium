package com.playerium.music;

import android.content.*;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.net.*;
import java.lang.reflect.Field;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class RealtimeSyncTest {
    private static final String ACCOUNT="999999999999999990001",OTHER="999999999999999990002";
    @Test public void nativeRealtimeOutboxSurvivesFailureBatchesAndNeverCrossesAccounts()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);SharedPreferences prefs=cloud.prefs;String original=prefs.getString("account",null);boolean enabled=prefs.getBoolean("enabled",false);GoogleCloud.Connections connections=cloud.connections;
        Field token=GoogleCloud.class.getDeclaredField("token"),until=GoogleCloud.class.getDeclaredField("tokenUntil");token.setAccessible(true);until.setAccessible(true);Object savedToken=token.get(cloud);long savedUntil=until.getLong(cloud);RealtimeSync realtime=new RealtimeSync(cloud,context);int[] sessions={0},batches={0};boolean[] fail={true};
        try{
            prefs.edit().putString("account",ACCOUNT).putBoolean("enabled",true).commit();token.set(cloud,"google-native-secret");until.setLong(cloud,System.currentTimeMillis()+3600000);
            cloud.connections=url->new HttpURLConnection(new URL(url)){
                ByteArrayOutputStream output=new ByteArrayOutputStream();
                public void connect(){}public void disconnect(){}public boolean usingProxy(){return false;}public OutputStream getOutputStream(){return output;}
                public int getResponseCode(){if(url.toString().contains("/functions/")){sessions[0]++;assertEquals("Bearer google-native-secret",getRequestProperty("Authorization"));return 200;}batches[0]++;assertEquals("Bearer supabase-native-session",getRequestProperty("Authorization"));try{assertEquals(4,new JSONArray(output.toString("UTF-8")).length());}catch(Exception e){throw new AssertionError(e);}return fail[0]?503:201;}
                public InputStream getInputStream(){try{return new ByteArrayInputStream(new JSONObject().put("account",ACCOUNT).put("userId","18d898ed-8494-4edf-88fe-212acda78010").put("accessToken","supabase-native-session").put("expiresAt",System.currentTimeMillis()+3600000).toString().getBytes("UTF-8"));}catch(Exception e){throw new AssertionError(e);}}
            };
            for(int i=0;i<4;i++)realtime.enqueue(new JSONObject().put("id","native-realtime-test-"+i).put("kind","playlist").put("name","Test"));assertEquals(4,realtime.pending());
            try{realtime.enqueue(new JSONObject().put("id","../outside"));fail("Traversal accepted");}catch(IOException expected){}
            prefs.edit().putString("account",OTHER).commit();assertEquals(0,realtime.pending());realtime.drain();assertEquals(0,sessions[0]);
            prefs.edit().putString("account",ACCOUNT).commit();try{realtime.drain();fail("Failed response discarded the queue");}catch(IOException expected){}assertEquals(4,realtime.pending());
            File dir=new File(context.getNoBackupFilesDir(),"realtime-outbox/"+ACCOUNT);for(File file:dir.listFiles())assertFalse(new String(GoogleCloud.read(new FileInputStream(file),262144),"UTF-8").contains("secret"));
            fail[0]=false;realtime.drain();assertEquals(0,realtime.pending());assertEquals(1,sessions[0]);assertEquals(2,batches[0]);
        }finally{cloud.connections=connections;realtime.reset();token.set(cloud,savedToken);until.setLong(cloud,savedUntil);prefs.edit().putString("account",original).putBoolean("enabled",enabled).commit();File dir=new File(context.getNoBackupFilesDir(),"realtime-outbox/"+ACCOUNT);File[] files=dir.listFiles();if(files!=null)for(File file:files)file.delete();dir.delete();}
    }
}

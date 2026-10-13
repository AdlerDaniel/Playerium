package com.playerium.music;

import android.content.Context;
import android.net.Uri;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.lang.reflect.Method;
import java.lang.reflect.InvocationTargetException;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class CloudStorageTest {
    private Object request(String operation,JSONObject payload)throws Exception{Method method=GoogleCloud.class.getDeclaredMethod("request",String.class,JSONObject.class);method.setAccessible(true);try{return method.invoke(GoogleCloud.get(ApplicationProvider.getApplicationContext()),operation,payload);}catch(InvocationTargetException e){throw (Exception)e.getCause();}}
    @Test public void stagedMusicIsPrivateBoundedAndFingerprintMatchesAcrossPlatforms()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();JSONObject session=(JSONObject)request("stage",new JSONObject().put("ext",".mp3").put("size",4));
        try{request("stageChunk",new JSONObject().put("id",session.getString("id")).put("offset",1).put("base64","c29uZw=="));fail("Invalid offset accepted");}catch(java.io.IOException expected){}
        request("stageChunk",new JSONObject().put("id",session.getString("id")).put("offset",0).put("base64","c29uZw=="));JSONObject saved=(JSONObject)request("stageComplete",session);File file=new File(Uri.parse(saved.getString("source")).getPath());
        try{assertTrue(MainActivity.hasMusicPermission(context,Uri.fromFile(file)));assertTrue(new File(file.getParentFile(),".nomedia").isFile());JSONObject info=(JSONObject)request("fingerprint",new JSONObject().put("source",saved.getString("source")));assertEquals("63f75c890b05405e6e1f047072642b40949dab5912aa9c0ae6f2e654dff943dd",info.getString("key"));assertEquals(4,info.getInt("size"));assertEquals(".mp3",info.getString("ext"));}finally{assertTrue(file.delete());}
    }
    @Test public void disconnectedStatusNeverContainsTokensAndRejectsArbitraryFiles()throws Exception{
        JSONObject status=(JSONObject)request("status",new JSONObject());assertFalse(status.has("accessToken"));assertFalse(status.has("refreshToken"));
        try{request("fingerprint",new JSONObject().put("source","file:///system/build.prop"));fail("Arbitrary file accepted");}catch(java.io.IOException expected){}
        try{request("removeLocal",new JSONObject().put("key","../outside"));fail("Traversal accepted");}catch(java.io.IOException expected){}
    }
}

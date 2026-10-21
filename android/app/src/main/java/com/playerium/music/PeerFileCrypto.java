package com.playerium.music;

import android.util.Base64;
import org.json.JSONObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class PeerFileCrypto {
    static boolean key(String value){return value!=null&&value.matches("[a-f0-9]{64}");}
    static Cipher cipher(int mode,String secret,String session,JSONObject chunk,byte[] nonce)throws Exception{
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        byte[] key=MessageDigest.getInstance("SHA-256").digest(("playerium-file-v1|"+secret).getBytes(StandardCharsets.UTF_8));
        cipher.init(mode,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,nonce));
        cipher.updateAAD(("playerium-file-v1|"+session+"|"+chunk.getString("key")+"|"+chunk.getLong("offset")+"|"+chunk.getLong("size")).getBytes(StandardCharsets.UTF_8));
        return cipher;
    }
    static JSONObject seal(String secret,String session,JSONObject chunk)throws Exception{
        byte[] bytes=Base64.decode(chunk.getString("base64"),Base64.DEFAULT),nonce=new byte[12];new SecureRandom().nextBytes(nonce);
        validate(chunk,bytes.length);byte[] encrypted=cipher(Cipher.ENCRYPT_MODE,secret,session,chunk,nonce).doFinal(bytes);
        return new JSONObject().put("key",chunk.getString("key")).put("offset",chunk.getLong("offset")).put("size",chunk.getLong("size"))
            .put("nonce",Base64.encodeToString(nonce,Base64.NO_WRAP)).put("data",Base64.encodeToString(encrypted,Base64.NO_WRAP));
    }
    static JSONObject open(String secret,String session,JSONObject chunk,JSONObject requested)throws Exception{
        if(chunk==null||!chunk.optString("key").equals(requested.optString("key"))||chunk.optLong("offset",-1)!=requested.optLong("offset",-2))return null;
        byte[] nonce=Base64.decode(chunk.getString("nonce"),Base64.DEFAULT),encrypted=Base64.decode(chunk.getString("data"),Base64.DEFAULT);
        if(nonce.length!=12||encrypted.length<16||encrypted.length>65552)throw new IOException("Invalid encrypted chunk");
        byte[] bytes=cipher(Cipher.DECRYPT_MODE,secret,session,chunk,nonce).doFinal(encrypted);validate(chunk,bytes.length);
        return new JSONObject().put("key",chunk.getString("key")).put("offset",chunk.getLong("offset")).put("size",chunk.getLong("size"))
            .put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP));
    }
    static void validate(JSONObject chunk,int length)throws Exception{
        long offset=chunk.getLong("offset"),size=chunk.getLong("size");
        if(!key(chunk.getString("key"))||offset<0||size<1||size>1073741824L||length<1||length>65536||offset+length>size)throw new IOException("Invalid file chunk");
    }
}

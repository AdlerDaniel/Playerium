package com.playerium.music;
import android.content.Intent;
import android.webkit.WebChromeClient;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class WebFileChooserTest {
 private WebChromeClient.FileChooserParams params(String[] types,int mode){return new WebChromeClient.FileChooserParams(){public int getMode(){return mode;}public String[] getAcceptTypes(){return types;}public boolean isCaptureEnabled(){return false;}public CharSequence getTitle(){return null;}public String getFilenameHint(){return null;}public Intent createIntent(){return new Intent();}};}
 @Test public void customPlaylistImagePickerHonorsMimeTypesAndAudioImportStaysNative(){
  WebChromeClient.FileChooserParams image=params(new String[]{"image/png,image/jpeg,image/webp"},WebChromeClient.FileChooserParams.MODE_OPEN);assertTrue(WebFileChooser.images(image));Intent photo=WebFileChooser.intent(image);assertEquals("image/*",photo.getType());assertArrayEquals(new String[]{"image/png","image/jpeg","image/webp"},photo.getStringArrayExtra(Intent.EXTRA_MIME_TYPES));assertFalse(photo.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,true));assertEquals(0,photo.getFlags()&Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
  WebChromeClient.FileChooserParams audio=params(new String[]{"audio/*"},WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);assertFalse(WebFileChooser.images(audio));Intent music=WebFileChooser.intent(audio);assertEquals("audio/*",music.getType());assertTrue(music.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false));assertNotEquals(0,music.getFlags()&Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
 }
}

package com.playerium.music;
import android.content.Intent;
import android.webkit.WebChromeClient;
import java.util.LinkedHashSet;
import java.util.Locale;

/** Images return to the web file input; large audio stays on the native import path. */
final class WebFileChooser {
 static boolean images(WebChromeClient.FileChooserParams params){if(params==null||params.getAcceptTypes()==null)return false;for(String value:params.getAcceptTypes())if(value!=null)for(String type:value.split(","))if(type.trim().toLowerCase(Locale.ROOT).startsWith("image/"))return true;return false;}
 static Intent intent(WebChromeClient.FileChooserParams params){boolean image=images(params);Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType(image?"image/*":"audio/*");intent.addCategory(Intent.CATEGORY_OPENABLE);intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,!image||params.getMode()==WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);if(!image)intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
  if(image){LinkedHashSet<String> types=new LinkedHashSet<>();for(String value:params.getAcceptTypes())if(value!=null)for(String type:value.split(",")){String mime=type.trim().toLowerCase(Locale.ROOT);if(mime.matches("image/[a-z0-9.+*_-]+"))types.add(mime);}if(!types.isEmpty())intent.putExtra(Intent.EXTRA_MIME_TYPES,types.toArray(new String[0]));}return intent;
 }
}

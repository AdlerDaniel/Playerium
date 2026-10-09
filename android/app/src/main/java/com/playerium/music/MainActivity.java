package com.playerium.music;

import android.Manifest;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.media.MediaMetadataRetriever;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.content.UriPermission;
import androidx.webkit.WebViewAssetLoader;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.documentfile.provider.DocumentFile;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static MainActivity instance;
    private WebView webView;
    private ValueCallback<Uri[]> uploadMessage;
    private final static int FILECHOOSER_RESULTCODE = 1001;
    private final static int FOLDER_PICKER_RESULTCODE = 1002;
    private final static int PERMISSION_REQUEST_CODE = 2001;

    private final java.util.Map<String, JSONObject> metadataCache = new java.util.LinkedHashMap<>(128, 0.75f, true);

    private AppUpdater updater;
    private boolean foreground;

    public static MainActivity getInstance() {
        return instance;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        updater = new AppUpdater(this);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Add JavaScript Interface for Android Media Session, Folder Picker, and Updater
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Never load remote pages into a WebView with a native bridge.
                if (url != null) {
                    try { if (isWebUrl(url)) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                    catch (Exception ignored) {}
                }
                return true;
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(intent, FILECHOOSER_RESULTCODE);
                } catch (Exception e) {
                    uploadMessage = null;
                    return false;
                }
                return true;
            }
        });

        boolean migrated = getSharedPreferences("playerium", MODE_PRIVATE).getBoolean("secure_origin_migrated", false);
        webView.loadUrl(migrated ? "https://appassets.androidplatform.net/assets/index.html" : "file:///android_asset/migration.html");

        checkAndRequestPermissions();
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        MediaNotificationService.resumeIfSaved(this);
        if (updater != null) updater.onResume();
        if(webView!=null)webView.evaluateJavascript("window.onNativePlayerState && window.onNativePlayerState("+MediaNotificationService.currentState()+");",null);
        if (webView != null) webView.evaluateJavascript("window.playerApp && window.playerApp.library && window.playerApp.library.db && window.playerApp.library.initFolderWatchers();", null);
    }

    private void checkAndRequestPermissions() {
        List<String> permissionsNeeded = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.POST_NOTIFICATIONS);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.READ_MEDIA_AUDIO);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!permissionsNeeded.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissionsNeeded.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    public void sendPlayerState(final JSONObject state) {
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript("window.onNativePlayerState && window.onNativePlayerState(" + state + ");", null);
        });
    }

    static boolean hasMusicPermission(Context context, Uri uri) {
        if("file".equals(uri.getScheme())) {
            try {java.io.File file=new java.io.File(uri.getPath());return file.isFile()&&file.getCanonicalPath().startsWith(MusicEngine.managedDirectory(context).getCanonicalPath()+java.io.File.separator);}
            catch(Exception e){return false;}
        }
        if (!"content".equals(uri.getScheme())) return false;
        for (UriPermission permission : context.getContentResolver().getPersistedUriPermissions()) {
            if (!permission.isReadPermission()) continue;
            if (uri.equals(permission.getUri())) return true;
            try {
                if (android.provider.DocumentsContract.getTreeDocumentId(uri).equals(android.provider.DocumentsContract.getTreeDocumentId(permission.getUri()))
                    && uri.getAuthority().equals(permission.getUri().getAuthority())) {
                    String treeId = android.provider.DocumentsContract.getTreeDocumentId(uri);
                    if (!android.provider.DocumentsContract.isDocumentUri(context, uri)) return true;
                    String documentId = android.provider.DocumentsContract.getDocumentId(uri);
                    if (documentId.equals(treeId) || documentId.startsWith(treeId + "/")) return true;
                    if (Build.VERSION.SDK_INT >= 29 && android.provider.DocumentsContract.isChildDocument(context.getContentResolver(),
                        android.provider.DocumentsContract.buildDocumentUriUsingTree(permission.getUri(), treeId), uri)) return true;
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    private static boolean isWebUrl(String value) {
        Uri uri = Uri.parse(value);
        return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && uri.getHost() != null;
    }

    public class AndroidBridge {
        @JavascriptInterface public void saveLegacyLibrary(final String data) {
            runOnUiThread(() -> {
                if (webView == null || !"file:///android_asset/migration.html".equals(webView.getUrl())) return;
                if (!getSharedPreferences("playerium", MODE_PRIVATE).contains("legacy_library"))
                    getSharedPreferences("playerium", MODE_PRIVATE).edit().putString("legacy_library", data).apply();
                webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
            });
        }
        @JavascriptInterface public String getLegacyLibrary() {
            return getSharedPreferences("playerium", MODE_PRIVATE).getString("legacy_library", "");
        }
        @JavascriptInterface public void completeLegacyMigration() {
            getSharedPreferences("playerium", MODE_PRIVATE).edit().putBoolean("secure_origin_migrated", true).remove("legacy_library").apply();
        }

        @JavascriptInterface public void setPlaybackQueue(final String queue) {
            runOnUiThread(() -> {
                MediaNotificationService.submitQueue(MainActivity.this, queue);
            });
        }
        @JavascriptInterface public void playbackCommand(final String command, final double value) {
            runOnUiThread(() -> startService(new Intent(MainActivity.this, MediaNotificationService.class)
                .putExtra("command", command).putExtra("value", value)));
        }
        @JavascriptInterface public void setEqualizer(final String settings) {
            runOnUiThread(() -> startService(new Intent(MainActivity.this, MediaNotificationService.class).putExtra("equalizer", settings)));
        }
        @JavascriptInterface public void clearSelectedFiles() { getSharedPreferences("playerium", MODE_PRIVATE).edit().remove("selected_music_files").apply(); }
        @JavascriptInterface public String getPlaybackState() { return MediaNotificationService.currentState(); }
        @JavascriptInterface public void musicRequest(String id,String operation,String payload) { MusicEngine.get(MainActivity.this).request(id,operation,payload); }
        @JavascriptInterface public void cancelMusic(String id) { MusicEngine.get(MainActivity.this).cancel(id); }

        @JavascriptInterface
        public void openFolderPicker() {
            runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            try {
                startActivityForResult(intent, FOLDER_PICKER_RESULTCODE);
            } catch (Exception e) {
                e.printStackTrace();
            }
            });
        }

        @JavascriptInterface
        public void rescanFolder(final String folderUriStr) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if("playerium-music".equals(folderUriStr)){runOnUiThread(()->{if(webView!=null)webView.evaluateJavascript("window.playerApp && window.playerApp.music && window.playerApp.music.restore();",null);});return;}
                        if ("android-files".equals(folderUriStr)) { scanSelectedFiles(false); return; }
                        Uri treeUri = Uri.parse(folderUriStr);
                        if (!hasMusicPermission(MainActivity.this, treeUri)) throw new SecurityException("Unauthorized folder");
                        scanFolderAndSend(treeUri, false);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            }).start();
        }

        @JavascriptInterface public void installUpdate(final String info) { updater.install(info); }
        @JavascriptInterface public String getUpdateStatus() { return updater.status(); }

        @JavascriptInterface
        public void openExternalUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (!isWebUrl(url)) return;
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(browserIntent);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            });
        }
    }

    public boolean isForeground() { return foreground; }
    public void resumeUpdateMonitor() { runOnUiThread(() -> { if (updater != null) updater.onResume(); }); }
    @Override protected void onPause() { foreground = false; super.onPause(); }
    void sendMusicResponse(JSONObject response) {
        runOnUiThread(()->{if(webView!=null)webView.evaluateJavascript("window.onMusicResponse && window.onMusicResponse("+response+");",null);});
    }

    public void sendUpdateState(final JSONObject state) {
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript("window.playerApp && window.playerApp.onUpdateState && window.playerApp.onUpdateState(" + state + ");", null);
        });
    }

    private synchronized void scanFolderAndSend(Uri treeUri, boolean isInitial) {
        DocumentFile rootDir = DocumentFile.fromTreeUri(this, treeUri);
        if (rootDir == null || !rootDir.isDirectory()) return;

        String folderName = rootDir.getName();
        if (folderName == null || folderName.isEmpty()) {
            folderName = "Музыкальная папка";
        }

        List<DocumentFile> audioFiles = new ArrayList<>();
        findAudioFilesRecursively(rootDir, audioFiles);

        sendNativeFiles(folderName, treeUri.toString(), audioFiles, isInitial);
    }

    private synchronized void scanSelectedFiles(boolean isInitial) {
        List<DocumentFile> files = new ArrayList<>();
        for (String value : getSharedPreferences("playerium", MODE_PRIVATE).getStringSet("selected_music_files", java.util.Collections.emptySet())) {
            Uri uri = Uri.parse(value);
            if (!hasMusicPermission(this, uri)) continue;
            DocumentFile file = DocumentFile.fromSingleUri(this, uri);
            if (file != null && file.exists()) files.add(file);
        }
        sendNativeFiles("Мои треки", "android-files", files, isInitial);
    }

    private void sendNativeFiles(String folderName, String folderSource, List<DocumentFile> audioFiles, boolean isInitial) {
        try {
            JSONObject folderObj = new JSONObject();
            folderObj.put("folderUri", folderSource);
            folderObj.put("folderName", folderName);
            folderObj.put("isInitial", isInitial);

            JSONArray filesArray = new JSONArray();
            for (DocumentFile df : audioFiles) {
                JSONObject fileObj = new JSONObject();
                fileObj.put("name", df.getName());
                fileObj.put("uri", df.getUri().toString());
                fileObj.put("size", df.length());
                fileObj.put("lastModified", df.lastModified());
                fileObj.put("relativePath", android.provider.DocumentsContract.getDocumentId(df.getUri()));
                String cacheKey = df.getUri().toString() + ":" + df.length() + ":" + df.lastModified();
                JSONObject metadata = metadataCache.get(cacheKey);
                if (metadata == null) { metadata = readMetadata(df); metadataCache.put(cacheKey, metadata);
                    if (metadataCache.size() > 128) metadataCache.remove(metadataCache.keySet().iterator().next());
                }
                fileObj.put("metadata", metadata);
                filesArray.put(fileObj);
            }

            folderObj.put("files", filesArray);

            final String script = "window.playerApp && window.playerApp.onFolderImported && window.playerApp.onFolderImported(" + folderObj.toString() + ");";
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (webView != null) webView.evaluateJavascript(script, null);
                }
            });
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private JSONObject readMetadata(DocumentFile file) {
        JSONObject data = new JSONObject();
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(this, file.getUri());
            data.put("title", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE));
            data.put("artist", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST));
            data.put("album", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM));
            data.put("year", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR));
            data.put("trackNo", retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER));
            String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            data.put("duration", duration == null ? 0 : Long.parseLong(duration) / 1000.0);
            byte[] art = retriever.getEmbeddedPicture();
            if (art != null && art.length <= 8 * 1024 * 1024) {
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(art, 0, art.length, bounds);
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
                while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 512) options.inSampleSize *= 2;
                Bitmap image = BitmapFactory.decodeByteArray(art, 0, art.length, options);
                if (image != null) {
                    ByteArrayOutputStream output = new ByteArrayOutputStream(); image.compress(Bitmap.CompressFormat.JPEG, 80, output); image.recycle();
                    data.put("pictureBase64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                }
            }
        } catch (Exception ignored) {}
        finally { try { retriever.release(); } catch (Exception ignored) {} }
        return data;
    }

    private void findAudioFilesRecursively(DocumentFile dir, List<DocumentFile> results) {
        DocumentFile[] files = dir.listFiles();
        if (files == null) return;
        for (DocumentFile file : files) {
            if (file.isDirectory()) {
                findAudioFilesRecursively(file, results);
            } else if (file.isFile()) {
                String name = file.getName();
                if (name != null) {
                    String lower = name.toLowerCase(java.util.Locale.ROOT);
                    if (lower.endsWith(".mp3") || lower.endsWith(".flac") || lower.endsWith(".wav") ||
                        lower.endsWith(".ogg") || lower.endsWith(".m4a") || lower.endsWith(".aac") || lower.endsWith(".opus")) {
                        results.add(file);
                    }
                }
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILECHOOSER_RESULTCODE) {
            if (uploadMessage == null) return;
            // Import persistent native URIs; no full audio files cross the WebView bridge.
            uploadMessage.onReceiveValue(null);
            uploadMessage = null;
            if (resultCode == RESULT_OK && data != null) {
                java.util.Set<String> saved = new java.util.HashSet<>(getSharedPreferences("playerium", MODE_PRIVATE)
                    .getStringSet("selected_music_files", java.util.Collections.emptySet()));
                List<Uri> selected = new ArrayList<>();
                if (data.getData() != null) selected.add(data.getData());
                if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) selected.add(data.getClipData().getItemAt(i).getUri());
                for (Uri uri : selected) {
                    try { getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); saved.add(uri.toString()); }
                    catch (Exception e) { Toast.makeText(this, "Не удалось сохранить доступ. Выберите папку с музыкой.", Toast.LENGTH_LONG).show(); }
                }
                getSharedPreferences("playerium", MODE_PRIVATE).edit().putStringSet("selected_music_files", saved).apply();
                new Thread(() -> scanSelectedFiles(true)).start();
            }
        } else if (requestCode == FOLDER_PICKER_RESULTCODE && resultCode == RESULT_OK && data != null) {
            final Uri treeUri = data.getData();
            if (treeUri != null) {
                try {
                    getContentResolver().takePersistableUriPermission(
                        treeUri,
                        (data.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0
                            ? Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                            : Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                } catch (Exception e) {
                    e.printStackTrace();
                }

                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        scanFolderAndSend(treeUri, true);
                    }
                }).start();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("(function(){const ui=window.playerApp&&window.playerApp.ui;return !!(ui&&ui.handleBack());})()", result -> {
            if ("true".equals(result)) return;
            if (webView != null && webView.canGoBack()) webView.goBack();
            else MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        if (updater != null) updater.detach();
        instance = null;
        if (webView != null) { webView.removeJavascriptInterface("AndroidBridge"); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}

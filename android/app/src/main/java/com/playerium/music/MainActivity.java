package com.playerium.music;

import android.Manifest;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
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

    private final BroadcastReceiver onDownloadCompleteReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (id != -1) {
                try {
                    DownloadManager downloadManager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (downloadManager != null) {
                        Uri downloadUri = downloadManager.getUriForDownloadedFile(id);
                        if (downloadUri != null) {
                            Intent installIntent = new Intent(Intent.ACTION_VIEW);
                            installIntent.setDataAndType(downloadUri, "application/vnd.android.package-archive");
                            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(installIntent);
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    };

    public static MainActivity getInstance() {
        return instance;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Add JavaScript Interface for Android Media Session, Folder Picker, and Updater
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && !url.startsWith("file:///android_asset/")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
                return false;
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

        // Register receiver for downloaded APK auto-installation prompt
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(onDownloadCompleteReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(onDownloadCompleteReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILECHOOSER_RESULTCODE);
                } catch (Exception e) {
                    uploadMessage = null;
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");

        checkAndRequestPermissions();
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

    public void sendMediaCommand(final String command) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView == null) return;
                if ("playPause".equals(command)) {
                    webView.evaluateJavascript("window.playerApp && window.playerApp.player && window.playerApp.player.togglePlay();", null);
                } else if ("next".equals(command)) {
                    webView.evaluateJavascript("window.playerApp && window.playerApp.player && window.playerApp.player.next();", null);
                } else if ("prev".equals(command)) {
                    webView.evaluateJavascript("window.playerApp && window.playerApp.player && window.playerApp.player.prev();", null);
                }
            }
        });
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void updatePlaybackState(String title, String artist, String album, boolean isPlaying, String artworkBase64) {
            Intent serviceIntent = new Intent(MainActivity.this, MediaNotificationService.class);
            serviceIntent.setAction(MediaNotificationService.ACTION_UPDATE_STATE);
            serviceIntent.putExtra(MediaNotificationService.EXTRA_TITLE, title);
            serviceIntent.putExtra(MediaNotificationService.EXTRA_ARTIST, artist);
            serviceIntent.putExtra(MediaNotificationService.EXTRA_ALBUM, album);
            serviceIntent.putExtra(MediaNotificationService.EXTRA_IS_PLAYING, isPlaying);
            serviceIntent.putExtra(MediaNotificationService.EXTRA_ARTWORK_BASE64, artworkBase64);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isPlaying) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        }

        @JavascriptInterface
        public void openFolderPicker() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            try {
                startActivityForResult(intent, FOLDER_PICKER_RESULTCODE);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void rescanFolder(final String folderUriStr) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Uri treeUri = Uri.parse(folderUriStr);
                        scanFolderAndSend(treeUri, false);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            }).start();
        }

        @JavascriptInterface
        public String readFileAsBase64(String fileUriStr) {
            try {
                Uri fileUri = Uri.parse(fileUriStr);
                InputStream is = getContentResolver().openInputStream(fileUri);
                if (is == null) return null;
                ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int len;
                while ((len = is.read(buffer)) != -1) {
                    byteBuffer.write(buffer, 0, len);
                }
                is.close();
                return Base64.encodeToString(byteBuffer.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) {
                e.printStackTrace();
                return null;
            }
        }

        @JavascriptInterface
        public void downloadUpdate(final String url, final String fileName) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String name = (fileName != null && !fileName.isEmpty()) ? fileName : "Playerium-update.apk";
                        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                        request.setTitle("Playerium " + name);
                        request.setDescription("Загрузка обновления Playerium...");
                        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                        request.setMimeType("application/vnd.android.package-archive");

                        DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                        if (manager != null) {
                            manager.enqueue(request);
                            Toast.makeText(MainActivity.this, "Загрузка началась! Проверьте шторку уведомлений.", Toast.LENGTH_LONG).show();
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                        try {
                            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(browserIntent);
                            Toast.makeText(MainActivity.this, "Открытие загрузки в браузере...", Toast.LENGTH_SHORT).show();
                        } catch (Exception ex) {
                            ex.printStackTrace();
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void openExternalUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
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

    private void scanFolderAndSend(Uri treeUri, boolean isInitial) {
        DocumentFile rootDir = DocumentFile.fromTreeUri(this, treeUri);
        if (rootDir == null || !rootDir.isDirectory()) return;

        String folderName = rootDir.getName();
        if (folderName == null || folderName.isEmpty()) {
            folderName = "Музыкальная папка";
        }

        List<DocumentFile> audioFiles = new ArrayList<>();
        findAudioFilesRecursively(rootDir, audioFiles);

        try {
            JSONObject folderObj = new JSONObject();
            folderObj.put("folderUri", treeUri.toString());
            folderObj.put("folderName", folderName);
            folderObj.put("isInitial", isInitial);

            JSONArray filesArray = new JSONArray();
            for (DocumentFile df : audioFiles) {
                JSONObject fileObj = new JSONObject();
                fileObj.put("name", df.getName());
                fileObj.put("uri", df.getUri().toString());
                fileObj.put("size", df.length());
                fileObj.put("lastModified", df.lastModified());
                filesArray.put(fileObj);
            }
            folderObj.put("files", filesArray);

            final String script = "window.playerApp && window.playerApp.onFolderImported && window.playerApp.onFolderImported(" + folderObj.toString() + ");";
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript(script, null);
                }
            });
        } catch (Exception e) {
            e.printStackTrace();
        }
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
                    String lower = name.toLowerCase();
                    if (lower.endsWith(".mp3") || lower.endsWith(".flac") || lower.endsWith(".wav") ||
                        lower.endsWith(".ogg") || lower.endsWith(".m4a") || lower.endsWith(".aac")) {
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
            uploadMessage.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            uploadMessage = null;
        } else if (requestCode == FOLDER_PICKER_RESULTCODE && resultCode == RESULT_OK && data != null) {
            final Uri treeUri = data.getData();
            if (treeUri != null) {
                try {
                    getContentResolver().takePersistableUriPermission(
                        treeUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
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
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(onDownloadCompleteReceiver);
        } catch (Exception ignored) {}
        instance = null;
        super.onDestroy();
    }
}

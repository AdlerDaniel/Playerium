package com.playerium.music;

import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Downloads survive Activity recreation; verified self-updates use PackageInstaller. */
final class AppUpdater {
    private final MainActivity activity;
    private final SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AtomicBoolean busy = new AtomicBoolean();
    private boolean detached;
    private final Runnable monitor = new Runnable() {
        @Override public void run() {
            if (detached) return;
            long id = prefs.getLong("download", -1);
            if (id <= 0) return;
            DownloadManager dm = (DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE);
            try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
                if (c == null || !c.moveToFirst()) { fail("Загрузка обновления недоступна"); return; }
                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    if (busy.compareAndSet(false, true)) new Thread(() -> verifyAndInstall(id)).start();
                    return;
                }
                if (status == DownloadManager.STATUS_FAILED) { fail("Не удалось скачать обновление. Попробуйте снова."); return; }
                long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                long bytes = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                state("downloading", total > 0 ? (int)(bytes * 100 / total) : 0, "");
            } catch (Exception e) { fail("Не удалось проверить загрузку обновления"); return; }
            handler.postDelayed(this, 500);
        }
    };

    AppUpdater(MainActivity activity) {
        this.activity = activity;
        prefs = activity.getSharedPreferences("playerium_update", Context.MODE_PRIVATE);
    }
    String status() { return prefs.getString("state", "{}"); }
    void detach() { detached = true; handler.removeCallbacksAndMessages(null); }
    void onResume() {
        String confirmation = prefs.getString("confirmation", "");
        if (!confirmation.isEmpty()) {
            prefs.edit().remove("confirmation").apply();
            try { activity.startActivity(Intent.parseUri(confirmation, 0)); }
            catch (Exception e) { fail("Не удалось открыть подтверждение установки"); }
            return;
        }
        if (prefs.getBoolean("permission_pending", false)) {
            if (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls()) {
                prefs.edit().remove("permission_pending").remove("permission_opened").apply();
                if (busy.compareAndSet(false, true)) new Thread(() -> commitInstall()).start();
            } else if (prefs.getBoolean("permission_opened", false)) fail("Разрешите установку обновлений для Playerium и попробуйте снова.");
            else requestPermission();
        } else if (prefs.getLong("download", -1) > 0 && !busy.get()) {
            handler.removeCallbacks(monitor); handler.post(monitor);
        }
    }

    void install(String info) {
        if (!busy.compareAndSet(false, true)) return;
        if (prefs.getLong("download", -1) > 0) { busy.set(false); return; }
        new Thread(() -> {
            try {
                JSONObject request = new JSONObject(info);
                String version = request.getString("latestVersion");
                if (!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+") || !"AdlerDaniel/Playerium".equals(request.optString("repo", "AdlerDaniel/Playerium"))) throw new Exception();
                state("downloading", 0, "");
                HttpsURLConnection connection = (HttpsURLConnection)new URL("https://api.github.com/repos/AdlerDaniel/Playerium/releases/tags/v" + version).openConnection();
                connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                JSONObject release;
                try (InputStream input = connection.getInputStream(); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int n;
                    while ((n = input.read(buffer)) != -1) { output.write(buffer, 0, n); if (output.size() > 2 * 1024 * 1024) throw new Exception(); }
                    release = new JSONObject(output.toString("UTF-8"));
                } finally { connection.disconnect(); }
                if (release.optBoolean("draft") || release.optBoolean("prerelease") || !release.getString("tag_name").equals("v" + version)) throw new Exception();
                JSONArray assets = release.getJSONArray("assets"); JSONObject apk = null;
                for (int i = 0; i < assets.length(); i++) if (assets.getJSONObject(i).getString("name").endsWith(".apk")) { apk = assets.getJSONObject(i); break; }
                if (apk == null || !apk.optString("digest").matches("sha256:[a-fA-F0-9]{64}")) throw new Exception();
                String url = apk.getString("browser_download_url");
                if (!url.startsWith("https://github.com/AdlerDaniel/Playerium/releases/download/v" + version + "/")) throw new Exception();
                DownloadManager dm = (DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE);
                String name = "Playerium-" + version + "-" + System.currentTimeMillis() + ".apk";
                DownloadManager.Request download = new DownloadManager.Request(Uri.parse(url))
                    .setTitle("Обновление Playerium").setMimeType("application/vnd.android.package-archive")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, name);
                long id = dm.enqueue(download);
                prefs.edit().putLong("download", id).putString("digest", apk.getString("digest").substring(7)).apply();
                busy.set(false);
                MainActivity current = MainActivity.getInstance();
                if (current != null) current.resumeUpdateMonitor();
            } catch (Exception e) { fail("Не удалось скачать обновление. Проверьте подключение и попробуйте снова."); }
        }).start();
    }

    private File apkFile() { return new File(activity.getCacheDir(), "Playerium-update.apk"); }
    private void verifyAndInstall(long id) {
        try {
            state("verifying", 100, "");
            DownloadManager dm = (DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE);
            Uri uri = dm.getUriForDownloadedFile(id); if (uri == null) throw new Exception();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = activity.getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(apkFile())) {
                byte[] buffer = new byte[65536]; int n; long size = 0;
                while ((n = input.read(buffer)) != -1) {
                    size += n; if (size > 256 * 1024 * 1024) throw new Exception();
                    digest.update(buffer, 0, n); out.write(buffer, 0, n);
                }
            }
            StringBuilder actual = new StringBuilder(); for (byte b : digest.digest()) actual.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            if (!actual.toString().equalsIgnoreCase(prefs.getString("digest", ""))) throw new Exception();
            validateApk();
            prefs.edit().remove("download").apply(); dm.remove(id);
            if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                prefs.edit().putBoolean("permission_pending", true).apply(); busy.set(false);
                state("permission", 100, "Разрешите установку обновлений для Playerium");
                MainActivity current = MainActivity.getInstance();
                if (current != null) current.resumeUpdateMonitor();
            } else commitInstall();
        } catch (Exception e) { fail("Файл обновления не прошёл проверку. Попробуйте снова."); }
    }

    private void requestPermission() {
        if (detached || !activity.isForeground()) return;
        prefs.edit().putBoolean("permission_opened", true).apply();
        try { activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))); }
        catch (Exception e) { fail("Не удалось открыть разрешение на установку"); }
    }

    private void validateApk() throws Exception {
        PackageManager pm = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo installed = pm.getPackageInfo(activity.getPackageName(), flags);
        PackageInfo apk = pm.getPackageArchiveInfo(apkFile().getAbsolutePath(), flags);
        if (apk == null || !installed.packageName.equals(apk.packageName)) throw new Exception();
        long oldVersion = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        long newVersion = Build.VERSION.SDK_INT >= 28 ? apk.getLongVersionCode() : apk.versionCode;
        if (newVersion <= oldVersion) throw new Exception();
        Signature[] oldSignatures = Build.VERSION.SDK_INT >= 28 ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        Signature[] newSignatures = Build.VERSION.SDK_INT >= 28 ? apk.signingInfo.getApkContentsSigners() : apk.signatures;
        if (oldSignatures == null || !Arrays.equals(oldSignatures, newSignatures)) throw new Exception();
    }

    private void commitInstall() {
        int sessionId = -1;
        try {
            validateApk(); state("installing", 100, "");
            PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(activity.getPackageName()); params.setSize(apkFile().length());
            if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            sessionId = installer.createSession(params);
            try (PackageInstaller.Session session = installer.openSession(sessionId)) {
                try (InputStream input = new java.io.FileInputStream(apkFile()); OutputStream out = session.openWrite("base.apk", 0, apkFile().length())) {
                    byte[] buffer = new byte[65536]; int n; while ((n = input.read(buffer)) != -1) out.write(buffer, 0, n);
                    session.fsync(out);
                }
                Intent result = new Intent(activity, UpdateInstallReceiver.class);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent callback = PendingIntent.getBroadcast(activity, sessionId, result, flags);
                session.commit(callback.getIntentSender());
            }
            busy.set(false);
        } catch (Exception e) {
            if (sessionId >= 0) try { activity.getPackageManager().getPackageInstaller().abandonSession(sessionId); } catch (Exception ignored) {}
            fail("Не удалось установить обновление. Попробуйте снова.");
        }
    }

    private void state(String state, int percent, String message) {
        try {
            JSONObject data = new JSONObject().put("state", state).put("percent", percent).put("message", message);
            prefs.edit().putString("state", data.toString()).apply();
            MainActivity current = MainActivity.getInstance();
            if (current != null) current.sendUpdateState(data);
        } catch (Exception ignored) {}
    }
    private void fail(String message) {
        long id = prefs.getLong("download", -1);
        if (id > 0) ((DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
        prefs.edit().remove("download").remove("permission_pending").remove("permission_opened").apply();busy.set(false);state("failed", 0, message);
    }
}

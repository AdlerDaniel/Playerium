package com.playerium.music;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

public class UpdateInstallReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        MainActivity activity = MainActivity.getInstance();
        String state, message = "";
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            state = "permission"; message = "Подтвердите установку обновления";
            Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmation != null) {
                if (activity != null && activity.isForeground()) {
                    try { activity.startActivity(confirmation); }
                    catch (Exception e) { state = "failed"; message = "Не удалось открыть подтверждение установки"; }
                }
                else {
                    context.getSharedPreferences("playerium_update",Context.MODE_PRIVATE).edit().putString("confirmation",confirmation.toUri(0)).apply();
                    confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    NotificationManager manager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel("updates", "Обновления", NotificationManager.IMPORTANCE_DEFAULT));
                    PendingIntent action = PendingIntent.getActivity(context, 3, confirmation, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    try { manager.notify(3,new NotificationCompat.Builder(context,"updates").setSmallIcon(android.R.drawable.stat_sys_download_done)
                        .setContentTitle("Обновление Playerium").setContentText(message).setContentIntent(action).setAutoCancel(true).build()); }
                    catch (SecurityException ignored) {}
                }
            }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            state = "complete";
            new java.io.File(context.getCacheDir(),"Playerium-update.apk").delete();
        } else { state = "failed"; message = "Обновление не установлено. Попробуйте снова."; }
        if (!"permission".equals(state)) context.getSharedPreferences("playerium_update",Context.MODE_PRIVATE).edit().remove("confirmation").apply();
        try {
            JSONObject data = new JSONObject().put("state", state).put("message", message);
            context.getSharedPreferences("playerium_update",Context.MODE_PRIVATE).edit().putString("state",data.toString()).apply();
            if (activity != null) activity.sendUpdateState(data);
        } catch (Exception ignored) {}
    }
}

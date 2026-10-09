package com.playerium.music;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/** The old process is killed by PackageInstaller; the replacement receives this broadcast. */
public class UpdateRestartReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        if(!Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))return;
        android.content.SharedPreferences prefs=context.getSharedPreferences("playerium_update",Context.MODE_PRIVATE);
        if(!prefs.getBoolean("restart_after_update",false))return;
        prefs.edit().remove("restart_after_update").remove("install_session").remove("confirmation")
            .putString("state","{\"state\":\"complete\"}").commit();
        Intent launch=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        // Recent Android versions may block background activity launches. Keep a visible fallback.
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("updates","Обновления",NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent action=PendingIntent.getActivity(context,4,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        try{manager.notify(4,new NotificationCompat.Builder(context,"updates").setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Playerium обновлён").setContentText("Открыть приложение").setContentIntent(action).setAutoCancel(true).build());}catch(SecurityException ignored){}
        try{context.startActivity(launch);}catch(Exception ignored){}
    }
}

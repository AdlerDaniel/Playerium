package com.playerium.music;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;

public final class CloudWorker extends Worker {
    public CloudWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
    @NonNull @Override public ForegroundInfo getForegroundInfo(){
        Context context=getApplicationContext();NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("playerium_cloud","Синхронизация музыки",NotificationManager.IMPORTANCE_LOW));
        android.app.Notification notification=new NotificationCompat.Builder(context,"playerium_cloud").setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle(context.getString(R.string.app_name)).setContentText("Синхронизация музыки").setProgress(0,0,true).setOngoing(true).setSilent(true).build();
        return Build.VERSION.SDK_INT>=29?new ForegroundInfo(7402,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC):new ForegroundInfo(7402,notification);
    }
    @NonNull @Override public Result doWork(){GoogleCloud cloud=GoogleCloud.get(getApplicationContext());try{
        if(!cloud.isConnected())return Result.success();
        cloud.connect.restoreFilePeers();
        Context context=getApplicationContext();NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("playerium_cloud","Синхронизация музыки",NotificationManager.IMPORTANCE_LOW));
        android.app.Notification notification=new NotificationCompat.Builder(context,"playerium_cloud").setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle(context.getString(R.string.app_name)).setContentText("Синхронизация музыки · осталось: "+cloud.pendingCount()).setProgress(0,0,true).setOngoing(true).setSilent(true).build();
        ForegroundInfo info=Build.VERSION.SDK_INT>=29?new ForegroundInfo(7402,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC):new ForegroundInfo(7402,notification);
        setForegroundAsync(info).get();Exception incomingFailure=null;try{cloud.refreshIncoming();}catch(Exception e){incomingFailure=e;}cloud.runJobs();if(incomingFailure!=null)throw incomingFailure;return cloud.hasPendingJobs()?Result.retry():Result.success();
    }catch(Exception e){cloud.recordFailure(e);return Result.retry();}}
}

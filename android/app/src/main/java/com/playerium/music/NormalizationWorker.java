package com.playerium.music;

import android.app.*;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;

/** Survives a closed WebView; progress is visible while existing songs are prepared. */
public final class NormalizationWorker extends Worker {
    public NormalizationWorker(@NonNull Context context,@NonNull WorkerParameters parameters){super(context,parameters);}
    private void progress(int total,int completed)throws Exception{
        Context c=getApplicationContext();NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("playerium_normalization","Громкость музыки",NotificationManager.IMPORTANCE_LOW));
        Notification n=new NotificationCompat.Builder(c,"playerium_normalization").setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("Выравнивание громкости музыки").setContentText("Подготовлено: "+completed+" из "+total).setProgress(total,completed,false).setOngoing(true).setSilent(true).build();
        setForegroundAsync(Build.VERSION.SDK_INT>=29?new ForegroundInfo(7403,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC):new ForegroundInfo(7403,n)).get();
    }
    @NonNull @Override public Result doWork(){
        Context c=getApplicationContext();java.util.Set<String> pending=PreparedAudio.pending(c);if(pending.isEmpty())return Result.success();
        int completed=0,total=pending.size();long started=android.os.SystemClock.elapsedRealtime();boolean retry=false;
        try{
            progress(total,completed);
            for(String value:pending){
                if(isStopped()||android.os.SystemClock.elapsedRealtime()-started>360000)return Result.retry();
                Uri uri=Uri.parse(value);
                try{MusicEngine.get(c).prepareAudio(uri);PreparedAudio.complete(c,value);}
                catch(java.io.FileNotFoundException error){PreparedAudio.failed(c,value,"Missing recording");PreparedAudio.complete(c,value);}
                catch(SecurityException error){PreparedAudio.failed(c,value,"Нет доступа к файлу");PreparedAudio.complete(c,value);}
                catch(Exception error){retry=true;PreparedAudio.failed(c,value,String.valueOf(error.getMessage()));}
                progress(total,++completed);
            }
            return retry?Result.retry():Result.success();
        }catch(Exception error){return Result.retry();}
    }
}

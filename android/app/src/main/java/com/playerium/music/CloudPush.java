package com.playerium.music;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import java.io.*;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

final class CloudPush {
    private static final String SENDER="919635824329";
    static void schedule(Context context) {
        GoogleCloud cloud=GoogleCloud.get(context);if(!cloud.isConnected())return;
        OneTimeWorkRequest work=new OneTimeWorkRequest.Builder(Registration.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build();
        // APPEND preserves token rotation arriving while a registration is in flight.
        WorkManager.getInstance(context).enqueueUniqueWork("playerium-push-register",ExistingWorkPolicy.APPEND_OR_REPLACE,work);
    }
    static boolean accepts(GoogleCloud cloud,String sender,Map<String,String> data) {
        return cloud.isConnected()&&SENDER.equals(sender)&&"playerium-library".equals(data.get("type"))
            &&SENDER.equals(data.get("sender"))&&data.get("userId")!=null
            &&data.get("userId").equals(cloud.prefs.getString("pushUser",""))
            &&cloud.prefs.getString("account","").equals(cloud.prefs.getString("pushAccount",""));
    }
    private static synchronized String installation(Context context)throws Exception {
        File file=new File(context.getNoBackupFilesDir(),"push-installation");
        if(file.isFile())try(FileInputStream input=new FileInputStream(file)){
            String value=new String(GoogleCloud.read(input,128),"UTF-8");UUID.fromString(value);return value;
        }
        String value=UUID.randomUUID().toString();File temp=new File(file.getPath()+".tmp");
        try(FileOutputStream output=new FileOutputStream(temp)){output.write(value.getBytes("UTF-8"));output.getFD().sync();}
        if(!temp.renameTo(file))throw new IOException("Не удалось зарегистрировать устройство.");return value;
    }
    public static final class Registration extends Worker {
        public Registration(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
        @NonNull @Override public Result doWork(){
            Context context=getApplicationContext();GoogleCloud cloud=GoogleCloud.get(context);
            if(!cloud.isConnected())return Result.success();String account=cloud.prefs.getString("account","");
            try{
                String token=Tasks.await(FirebaseMessaging.getInstance().getToken(),30,TimeUnit.SECONDS);
                JSONObject session=cloud.realtime.session();
                if(!account.equals(session.getString("account"))||!cloud.isConnected())return Result.retry();
                String user=cloud.realtime.registerPush(session,installation(context),token);
                if(!cloud.isConnected()||!account.equals(cloud.prefs.getString("account","")))return Result.retry();
                cloud.prefs.edit().putString("pushAccount",account).putString("pushUser",user).apply();
                android.util.Log.i("PlayeriumSync","Push registration ready");
                // The registration catch-up push can arrive before this local mapping is saved.
                cloud.enqueuePush(false);return Result.success();
            }catch(Exception unavailable){return cloud.isConnected()?Result.retry():Result.success();}
        }
    }
}

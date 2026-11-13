package com.playerium.music;

import android.content.Context;
import androidx.work.WorkManager;

/** Upgrade cleanup only: never schedules work or opens a music file. */
final class RetiredFeatures {
    static void disable(Context context){
        context.getSharedPreferences("playerium_cloud",Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("playerium_loudness",Context.MODE_PRIVATE).edit().clear().apply();
        context.getSharedPreferences("playerium_prepared_audio",Context.MODE_PRIVATE).edit().clear().apply();
        WorkManager manager=WorkManager.getInstance(context);
        for(String name:new String[]{"playerium-push-register","playerium-drive-push","playerium-library-push","playerium-live-files","playerium-drive","playerium-drive-retry","playerium-normalize-audio"})
            manager.cancelUniqueWork(name);
    }
}

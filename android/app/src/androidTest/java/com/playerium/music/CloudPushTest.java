package com.playerium.music;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.util.HashMap;
import java.util.Map;
import static org.junit.Assert.*;

public class CloudPushTest {
    @Test public void wakeupRequiresCurrentAccountAndMatchingFirebaseSender(){
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        GoogleCloud cloud=GoogleCloud.get(context);
        boolean enabled=cloud.prefs.getBoolean("enabled",false);
        String account=cloud.prefs.getString("account",""),pushAccount=cloud.prefs.getString("pushAccount",""),user=cloud.prefs.getString("pushUser","");
        try{
            cloud.prefs.edit().putBoolean("enabled",true).putString("account","123").putString("pushAccount","123").putString("pushUser","user-a").commit();
            Map<String,String> data=new HashMap<>();data.put("type","playerium-library");data.put("sender","919635824329");data.put("userId","user-a");
            assertTrue(CloudPush.accepts(cloud,"919635824329",data));
            assertFalse(CloudPush.accepts(cloud,"other-project",data));
            data.put("userId","user-b");assertFalse(CloudPush.accepts(cloud,"919635824329",data));
            data.put("userId","user-a");cloud.prefs.edit().putString("account","456").commit();
            assertFalse(CloudPush.accepts(cloud,"919635824329",data));
            cloud.prefs.edit().putString("account","123").putBoolean("enabled",false).commit();
            assertFalse(CloudPush.accepts(cloud,"919635824329",data));
        }finally{cloud.prefs.edit().putBoolean("enabled",enabled).putString("account",account).putString("pushAccount",pushAccount).putString("pushUser",user).commit();}
    }
}

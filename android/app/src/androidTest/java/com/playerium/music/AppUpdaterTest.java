package com.playerium.music;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AppUpdaterTest {
    @Test public void updateFromSettingsRecoversWhenSavedDownloadIsGone() throws Exception {
        Instrumentation ins = InstrumentationRegistry.getInstrumentation();
        Context context = ins.getTargetContext();
        SharedPreferences prefs = context.getSharedPreferences("playerium_update", Context.MODE_PRIVATE);
        MainActivity activity = (MainActivity) ins.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            Field field = MainActivity.class.getDeclaredField("webView");
            field.setAccessible(true);
            WebView web = (WebView) field.get(activity);
            awaitJs(ins, web, "!!(window.playerApp && window.playerApp.ui.showUpdateModal && window.playerApp.library.db)");
            prefs.edit().putLong("download", Long.MAX_VALUE)
                .putString("state", "{\"state\":\"downloading\",\"percent\":27}").commit();
            js(ins, web, "document.getElementById('btnOpenSettings').click();"
                + "window.playerApp.ui.showUpdateModal({latestVersion:'9.0.0',releaseNotes:'- Test update'});");
            awaitJs(ins, web, "document.getElementById('modalUpdateAvailable').classList.contains('active')");
            awaitJs(ins, web, "(() => { const b=document.getElementById('btnDownloadUpdate');"
                + "const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint("
                + "r.left+r.width/2,r.top+r.height/2)); })()");
            JSONArray point = new JSONArray(js(ins, web, "(() => {"
                + "const r=document.getElementById('btnDownloadUpdate').getBoundingClientRect();"
                + "return [(r.left+r.width/2)*devicePixelRatio,(r.top+r.height/2)*devicePixelRatio];})()"));
            tap(ins, web, (float) point.getDouble(0), (float) point.getDouble(1));
            awaitJs(ins, web, "!document.getElementById('btnDownloadUpdate').disabled && "
                + "document.getElementById('updateStatusText').textContent.includes('Загрузка обновления недоступна')");
            assertFalse(prefs.contains("download"));
        } finally {
            ins.runOnMainSync(activity::finish);
            prefs.edit().clear().commit();
        }
    }

    private static void tap(Instrumentation ins, WebView web, float x, float y) {
        ins.runOnMainSync(() -> {
            long down = SystemClock.uptimeMillis();
            for (int action : new int[] { MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP }) {
                MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
                event.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
                try { assertTrue(web.dispatchTouchEvent(event)); }
                finally { event.recycle(); }
            }
        });
    }

    private static void awaitJs(Instrumentation ins, WebView web, String expression) throws Exception {
        long until = SystemClock.uptimeMillis() + 15000;
        do {
            if ("true".equals(js(ins, web, expression))) return;
            Thread.sleep(100);
        } while (SystemClock.uptimeMillis() < until);
        fail("WebView state not reached: " + expression);
    }

    private static String js(Instrumentation ins, WebView web, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch evaluated = new CountDownLatch(1);
        ins.runOnMainSync(() -> web.evaluateJavascript(script, value -> {
            result.set(value);
            evaluated.countDown();
        }));
        assertTrue(evaluated.await(5, TimeUnit.SECONDS));
        return result.get();
    }
}

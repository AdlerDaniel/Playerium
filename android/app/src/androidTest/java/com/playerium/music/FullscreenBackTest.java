package com.playerium.music;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class FullscreenBackTest {
    @Test public void systemBackClosesLyricsBeforeTheSongScreen() throws Exception {
        Instrumentation ins = InstrumentationRegistry.getInstrumentation();
        MainActivity activity = (MainActivity) ins.startActivitySync(new Intent(ins.getTargetContext(),
            MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            Field field = MainActivity.class.getDeclaredField("webView");
            field.setAccessible(true);
            WebView web = (WebView) field.get(activity);
            await(ins, web, "!!(window.playerApp && window.playerApp.ui.experience)");
            js(ins, web, "document.getElementById('mobileFullscreenPlayer').classList.add('active');"
                + "document.getElementById('btnMobileCinema').click();");
            await(ins, web, "!!document.querySelector('.lyrics-player')");
            back(ins);
            await(ins, web, "!document.querySelector('.lyrics-player') && document"
                + ".getElementById('mobileFullscreenPlayer').classList.contains('active')");
            back(ins);
            await(ins, web, "!document.getElementById('mobileFullscreenPlayer').classList.contains('active')");
        } finally { ins.runOnMainSync(activity::finish); }
    }

    private static void back(Instrumentation ins) throws Exception {
        try (ParcelFileDescriptor fd = ins.getUiAutomation().executeShellCommand("input keyevent 4");
             ParcelFileDescriptor.AutoCloseInputStream result = new ParcelFileDescriptor.AutoCloseInputStream(fd)) {
            while (result.read() != -1) { /* Wait for the shell command to finish. */ }
        }
    }

    private static void await(Instrumentation ins, WebView web, String expression) throws Exception {
        long until = SystemClock.uptimeMillis() + 15000;
        do {
            if ("true".equals(js(ins, web, expression))) return;
            Thread.sleep(100);
        } while (SystemClock.uptimeMillis() < until);
        fail("WebView state not reached: " + expression);
    }

    private static String js(Instrumentation ins, WebView web, String script) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        ins.runOnMainSync(() -> web.evaluateJavascript(script, result -> { value.set(result); done.countDown(); }));
        assertTrue(done.await(5, TimeUnit.SECONDS));
        return value.get();
    }
}

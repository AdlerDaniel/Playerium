package com.playerium.music;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
@SdkSuppress(minSdkVersion = 26)
public class LauncherIconTest {
    private Bitmap render(Drawable drawable) {
        Bitmap image = Bitmap.createBitmap(108,108,Bitmap.Config.ARGB_8888);
        drawable.setBounds(0,0,108,108);
        drawable.draw(new Canvas(image));
        return image;
    }

    @Test public void launcherForegroundIsTransparentAndFitsTheCircularSafeZone() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        Drawable appIcon=context.getPackageManager().getApplicationIcon(context.getPackageName());
        assertTrue("Launcher must receive native adaptive layers",appIcon instanceof AdaptiveIconDrawable);
        Bitmap mark=render(((AdaptiveIconDrawable)appIcon).getForeground());
        try {
            int visible=0;
            for(int y=0;y<108;y++)for(int x=0;x<108;x++)if(Color.alpha(mark.getPixel(x,y))>8){
                visible++;
                double dx=x+0.5-54,dy=y+0.5-54;
                assertTrue("The launcher mask must not clip the headphones at "+x+","+y,dx*dx+dy*dy<=33*33);
            }
            assertTrue("Foreground must contain the mark, not an opaque square",visible>700&&visible<2500);
            assertEquals("Clear space inside the headphones",0,Color.alpha(mark.getPixel(54,60)));
            assertTrue("Top bridge of Cyrillic П",Color.alpha(mark.getPixel(54,29))>240);
            assertTrue("Left headphone cushion",Color.alpha(mark.getPixel(36,72))>240);
            assertTrue("Right headphone cushion",Color.alpha(mark.getPixel(72,72))>240);
            assertEquals("No raster tile in the foreground",0,Color.alpha(mark.getPixel(0,0)));
        } finally { mark.recycle(); }
        assertTrue(context.getDrawable(R.mipmap.ic_launcher_round) instanceof AdaptiveIconDrawable);
    }

    @Test public void themedLauncherIconRetainsItsShapeWithDifferentSystemTints() {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        AdaptiveIconDrawable appIcon=(AdaptiveIconDrawable)context.getDrawable(R.mipmap.ic_launcher);
        Drawable monochrome;
        if(Build.VERSION.SDK_INT>=33){
            monochrome=appIcon.getMonochrome();
            assertNotNull("Android 13+ launchers must receive the monochrome layer",monochrome);
            assertNotNull(((AdaptiveIconDrawable)context.getDrawable(R.mipmap.ic_launcher_round)).getMonochrome());
        }else monochrome=context.getDrawable(R.drawable.ic_launcher_monochrome);
        Bitmap original=render(appIcon.getForeground());
        try {
            for(int color:new int[]{Color.rgb(67,92,50),Color.rgb(102,62,124),Color.rgb(239,209,162)}){
                Drawable tinted=monochrome.getConstantState().newDrawable(context.getResources()).mutate();
                tinted.setTint(color);
                Bitmap themed=render(tinted);
                try {
                    for(int y=0;y<108;y++)for(int x=0;x<108;x++){
                        int pixel=themed.getPixel(x,y);
                        assertEquals("System tint must preserve the alpha silhouette",Color.alpha(original.getPixel(x,y)),Color.alpha(pixel));
                        if(Color.alpha(pixel)==255)assertEquals("The system owns the accent color",color,pixel);
                    }
                } finally { themed.recycle(); }
            }
        } finally { original.recycle(); }
    }
}

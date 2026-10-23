const {test,expect}=require('@playwright/test');

test('Android native playback opens settings repeatedly without restoring a saved equalizer',async({page})=>{
 await page.setViewportSize({width:393,height:852});
 await page.route('https://api.github.com/**',r=>r.fulfill({status:200,json:{tag_name:'v1.7.50'}}));
 await page.addInitScript(()=>{window.equalizerCalls=[];window.AndroidBridge={setPlaybackQueue:()=>{},setEqualizer:settings=>window.equalizerCalls.push(settings)};});
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.experience);
 await page.evaluate(()=>{const a=window.playerApp;a.player.initWebAudio();a.ui.navigateTo({type:'settings'});});
 await expect(page.locator('.settings-container h1')).toHaveText('Настройки');
 await expect(page.locator('.eq-slider-vertical,#settingsEqToggle,#settingsEqPreset')).toHaveCount(0);
 await expect(page.locator('[data-normalization-check]')).toBeVisible();
 await page.evaluate(()=>{window.playerApp.ui.navigateTo({type:'home'});window.playerApp.ui.navigateTo({type:'settings'});});
 await expect(page.locator('.settings-container h1')).toBeVisible();
 expect(await page.evaluate(()=>window.equalizerCalls)).toEqual([]);
 await expect(page.getByText('Не удалось открыть страницу',{exact:false})).toHaveCount(0);
});

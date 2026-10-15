const {test,expect}=require('@playwright/test');

test('Android settings open after native audio initialization and retain equalizer controls on reentry',async({page})=>{
 await page.setViewportSize({width:393,height:852});
 await page.addInitScript(()=>{localStorage.setItem('playerium_auto_update_check','false');window.equalizerCalls=[];window.AndroidBridge={setEqualizer:settings=>window.equalizerCalls.push(JSON.parse(settings))};});
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.experience);
 await page.evaluate(()=>{const a=window.playerApp;a.player.initWebAudio();a.ui.navigateTo({type:'settings'});});
 await expect(page.locator('.settings-container h1')).toHaveText('Настройки');
 await expect(page.locator('.eq-slider-vertical')).toHaveCount(10);
 await expect(page.locator('[data-normalization-check]')).toBeVisible();
 await page.locator('#settingsEqPreset').selectOption('rock');
 expect(await page.evaluate(()=>window.equalizerCalls.at(-1).gains)).toEqual([4,3,2,0,-1,1,3,4,4,4]);
 await page.locator('.switch').filter({has:page.locator('#settingsEqToggle')}).click();
 expect(await page.evaluate(()=>window.equalizerCalls.at(-1).enabled)).toBe(false);
 await page.evaluate(()=>{window.playerApp.ui.navigateTo({type:'home'});window.playerApp.ui.navigateTo({type:'settings'});});
 await expect(page.locator('#settingsEqPreset')).toHaveValue('rock');
 await expect(page.locator('#settingsEqToggle')).not.toBeChecked();
 await expect(page.locator('.eq-slider-vertical')).toHaveCount(10);
 await expect(page.getByText('Не удалось открыть страницу',{exact:false})).toHaveCount(0);
});

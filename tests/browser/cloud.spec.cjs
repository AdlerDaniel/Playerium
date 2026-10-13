const {test,expect}=require('@playwright/test');
for(const mobile of [false,true])test(`cloud settings connection progress, errors and recovery (${mobile?'phone':'desktop'})`,async({page},info)=>{
 if(mobile)await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{localStorage.setItem('playerium_auto_update_check','false');window.cloudConnected=false;window.electronAPI={cloudRequest:async name=>{if(name==='status')return {connected:window.cloudConnected,email:'test@example.invalid',account:'test',configured:true};if(name==='connect'){await new Promise(resolve=>setTimeout(resolve,500));window.cloudConnected=true;return true;}if(name==='disconnect'){window.cloudConnected=false;return true;}if(name==='pull')return {cursor:'1',events:[]};return true;}};});
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings'}));
 await page.locator('[data-connect]').click();await expect(page.locator('[data-cloud-status]')).toContainText('Синхронизация');await expect(page.locator('[data-connect]')).toBeDisabled();
 await expect(page.locator('[data-cloud-status]')).toContainText('test@example.invalid');await expect(page.locator('[data-sync]')).toBeVisible();await expect(page.locator('[data-connect]')).toBeHidden();
 await page.locator('[data-setup] summary').click();await page.locator('[data-sync]').click();await expect(page.locator('[data-setup]')).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('cloud-settings.png')});
 await page.evaluate(()=>{window.electronAPI.cloudRequest=async()=>{throw Error('Соединение прервано');};});await page.locator('[data-sync]').click();await expect(page.locator('[data-cloud-status]')).toHaveText('Соединение прервано');await expect(page.locator('[data-sync]')).toBeEnabled();
});
test('an unresponsive cloud transport does not delay native playing-track restoration',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>{localStorage.setItem('playerium_auto_update_check','false');window.AndroidBridge={cloudRequest:()=>{},getPlaybackState:()=>JSON.stringify({queue:['playing'],tracks:[{uri:'content://song',title:'Still playing',artist:'Artist'}],index:0,id:'playing',playing:true,position:47000,duration:180000})};});
 await page.goto('/');await expect(page.locator('#mobileMiniTitle')).toHaveText('Still playing');await expect(page.locator('#mobileMiniPlayer')).toBeVisible();await expect(page.locator('#currentTimeLabel')).toHaveText('0:47');
});

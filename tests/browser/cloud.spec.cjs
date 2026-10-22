const {test,expect}=require('@playwright/test');
for(const mobile of [false,true])test(`cloud settings connection progress, errors and recovery (${mobile?'phone':'desktop'})`,async({page},info)=>{
 if(mobile)await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{localStorage.setItem('playerium_auto_update_check','false');window.cloudConnected=false;window.electronAPI={cloudRequest:async name=>{if(name==='status')return {connected:window.cloudConnected,email:'test@example.invalid',account:'test',configured:true};if(name==='connect'){await new Promise(resolve=>setTimeout(resolve,500));window.cloudConnected=true;return true;}if(name==='disconnect'){window.cloudConnected=false;return true;}if(name==='pull')return {cursor:'1',events:[]};return true;}};});
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.history.length);await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings'}));
 await page.locator('[data-connect]').click();await expect(page.locator('[data-connect]')).toBeDisabled();await expect(page.locator('[data-connect]')).toHaveAttribute('aria-busy','true');
 await expect(page.locator('[data-account-email]')).toHaveText('test@example.invalid');await expect(page.locator('[data-connect]')).toBeHidden();await expect(page.locator('[data-disconnect]')).toBeVisible();
 await expect(page.locator('[data-sync],[data-setup],[data-cloud-status],[data-trash]')).toHaveCount(0);
 await expect(page.getByRole('navigation',{name:'Разделы настроек'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('account-settings.png')});
 await page.evaluate(()=>{window.playerApp.cloud.busy=true;window.playerApp.cloud.error='Background transfer failed';window.playerApp.cloud.changed();});
 await expect(page.locator('[data-disconnect]')).toBeEnabled();await expect(page.locator('[data-account-error]')).toBeHidden();
 await page.evaluate(()=>{window.playerApp.cloud.status.authRequired=true;window.playerApp.cloud.changed();});
 await expect(page.locator('[data-connect]')).toHaveText('Войти повторно');await expect(page.locator('[data-account-error]')).toContainText('Google отклонил');
 await page.locator('[data-connect]').click();await expect(page.locator('[data-connect]')).toBeHidden();await expect(page.locator('[data-account-error]')).toBeHidden();
 await page.locator('[data-disconnect]').click();await expect(page.locator('[data-connect]')).toBeVisible();
 await page.evaluate(()=>{window.electronAPI.cloudRequest=async name=>{if(name==='connect')throw Error('Не удалось войти в Google');return {connected:false};};});
 await page.locator('[data-connect]').click();await expect(page.locator('[data-account-error]')).toHaveText('Не удалось войти в Google');await expect(page.locator('[data-connect]')).toBeEnabled();
});
test('an unresponsive cloud transport does not delay native playing-track restoration',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>{localStorage.setItem('playerium_auto_update_check','false');window.AndroidBridge={cloudRequest:()=>{},getPlaybackState:()=>JSON.stringify({queue:['playing'],tracks:[{uri:'content://song',title:'Still playing',artist:'Artist'}],index:0,id:'playing',playing:true,position:47000,duration:180000})};});
 await page.goto('/');await expect(page.locator('#mobileMiniTitle')).toHaveText('Still playing');await expect(page.locator('#mobileMiniPlayer')).toBeVisible();await expect(page.locator('#currentTimeLabel')).toHaveText('0:47');
});

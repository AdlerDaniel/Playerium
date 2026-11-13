const {test,expect}=require('@playwright/test');
for(const mobile of [false,true])test(`local app has no device or normalization services (${mobile?'Android layout':'desktop'})`,async({page})=>{
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});
 await page.route('https://aihorde.net/**',route=>route.fulfill({status:503,body:'{}'}));
 await page.addInitScript(()=>{
  localStorage.setItem('playerium_cloud_device','legacy');localStorage.setItem('playerium_connect_target','phone');
  window.retiredCalls=[];const retired=(...args)=>{window.retiredCalls.push(args);throw Error('Removed service was called');};
  window.electronAPI={cloudRequest:retired,prepareAudio:retired,audioPreparationStatus:retired,getLoudness:retired,getCachedLoudness:retired};
 });
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.albumArt);
 await page.evaluate(()=>window.playerApp.ui.openSettings());
 await expect(page.getByRole('dialog',{name:'Настройки',exact:true})).toBeVisible();
 await expect(page.locator('[data-avatar-upload]')).toBeVisible();
 await expect(page.locator('.normalization-settings,.cloud-settings,[data-connect],.playback-device-button')).toHaveCount(0);
 await expect(page.locator('.settings-overlay')).not.toContainText(/Google|нормализац|синхронизац/i);
 await page.locator('.settings-close').click();await page.evaluate(()=>window.playerApp.ui.experience.openCinema());
 await expect(page.locator('.cinema-controls button')).toHaveCount(3);
 await page.waitForTimeout(1800);
 const result=await page.evaluate(()=>({calls:window.retiredCalls,cloud:!!window.playerApp.cloud,connect:!!window.playerApp.connect,preparation:!!window.playerApp.audioPreparation,device:localStorage.getItem('playerium_cloud_device'),target:localStorage.getItem('playerium_connect_target')}));
 expect(result).toEqual({calls:[],cloud:false,connect:false,preparation:false,device:null,target:null});
 expect(requests.filter(url=>/supabase|googleapis.com\/drive|desktop-cloud|cloud-sync|loudness-worker|connect-controller|realtime-sync/.test(url))).toEqual([]);expect(errors).toEqual([]);
});

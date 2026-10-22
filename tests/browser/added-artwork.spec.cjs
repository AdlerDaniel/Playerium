const {test,expect}=require('@playwright/test');
async function setup(page,mobile){
 if(mobile)await page.setViewportSize({width:390,height:844});
 await page.route('https://aihorde.net/**',route=>route.fulfill({status:503,json:{}}));
 await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.albumArt);
 return page.evaluate(async()=>{const a=window.playerApp;a.albumArt.stop();const t={id:'added-art-fixture',title:'Sunrise',artist:'Artist',duration:180};a.library.tracks.set(t.id,t);await a.library.putInStore('tracks',t);const c=document.createElement('canvas');c.width=c.height=128;c.getContext('2d').fillRect(0,0,128,128);a.ui.navigateTo({type:'allTracks',title:'Добавленные'});return c.toDataURL('image/webp').split(',')[1];});
}
for(const mobile of [false,true])test(`added collection generates, replaces and restores its cover (${mobile?'phone':'desktop'})`,async({page},info)=>{
 const image=await setup(page,mobile),replacement=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,128,128);return c.toDataURL('image/webp').split(',')[1];});let posts=0,done=false;
 await page.unroute('https://aihorde.net/**');await page.route('https://aihorde.net/**',async route=>{const r=route.request();if(r.method()==='POST'){expect(r.postDataJSON().prompt).toContain('Sunrise');posts++;return route.fulfill({json:{id:'added-job-'+posts}});}return route.fulfill({json:r.url().includes('/check/')?{done}:{generations:[{img:posts===1?image:replacement,censored:false}]}});});
 await page.evaluate(()=>window.playerApp.albumArt.step());
 const cover=page.locator('.view-header-cover');await expect(cover).toHaveAttribute('aria-busy','true');await expect(cover).toHaveAttribute('aria-disabled','true');
 await cover.click({force:true});expect(posts).toBe(1);
 done=true;await page.evaluate(()=>window.playerApp.albumArt.step());await expect(cover.locator('img')).toBeVisible();await expect(cover).toHaveAttribute('aria-busy','false');
 const first=await page.evaluate(()=>window.playerApp.library.addedArtwork.coverUrl);
 done=false;await cover.press('Enter');await expect(cover).toHaveAttribute('aria-busy','true');await expect(cover.locator('img')).toBeVisible();await expect.poll(()=>posts).toBe(2);
 await page.screenshot({path:info.outputPath('generating.png')});
 await page.reload();await page.waitForFunction(()=>window.playerApp?.albumArt);await page.evaluate(()=>{const a=window.playerApp;a.albumArt.stop();a.ui.navigateTo({type:'allTracks',title:'Добавленные'});});
 await expect(cover).toHaveAttribute('aria-busy','true');done=true;await page.evaluate(()=>window.playerApp.albumArt.step());
 await expect(cover).toHaveAttribute('aria-busy','false');expect(posts).toBe(2);
 expect(await page.evaluate(()=>window.playerApp.library.addedArtwork.coverUrl)).not.toBe(first);
 await page.screenshot({path:info.outputPath('ready.png')});
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'home',title:'Главная'}));await expect(page.locator('.home-quick-card').filter({hasText:'Добавленные'}).locator('img')).toBeVisible();
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'library',title:'Моя медиатека'}));await expect(page.locator('.mobile-lib-row').filter({hasText:'Добавленные'}).locator('img')).toBeVisible();
});
test('failed replacement clears busy state, keeps previous cover and permits retry',async({page})=>{
 await setup(page,false);
 await page.evaluate(async()=>{const a=window.playerApp,art=a.library.addedArtwork;const c=document.createElement('canvas');c.width=c.height=128;art.coverType='generated';art.coverUrl=c.toDataURL('image/jpeg');const {persistCollectionArtwork}=await import('/js/visual-art.js');await persistCollectionArtwork(a.library,art);a.ui.refreshCurrentView();});
 const cover=page.locator('.view-header-cover');await expect(cover.locator('img')).toBeVisible();await cover.click();await expect(cover).toHaveAttribute('aria-busy','false');await expect(cover.locator('img')).toBeVisible();await expect(page.locator('.toast-container')).toContainText('Не удалось создать обложку');
 let count=0;await page.unroute('https://aihorde.net/**');await page.route('https://aihorde.net/**',route=>{count++;return route.fulfill({json:{id:'retry-job'}});});await cover.click();await expect(cover).toHaveAttribute('aria-busy','true');await expect.poll(()=>count).toBe(1);
});

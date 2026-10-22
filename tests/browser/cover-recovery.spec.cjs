const {test,expect}=require('@playwright/test');
async function setup(page){
 await page.route('https://aihorde.net/**',r=>r.fulfill({status:503,json:{}}));await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));await page.goto('/');await page.waitForFunction(()=>window.playerApp?.albumArt);
 return page.evaluate(async()=>{const a=window.playerApp;a.albumArt.stop();const t={id:'recovery',title:'Recover me',artist:'Fixture',duration:200};a.library.tracks.set(t.id,t);await a.library.putInStore('tracks',t);const c=document.createElement('canvas');c.width=c.height=128;c.getContext('2d').fillRect(0,0,128,128);return c.toDataURL('image/webp').split(',')[1];});
}
async function save(page,patch){await page.evaluate(async patch=>{const a=window.playerApp;await a.library.putInStore('settings',{key:'album-generation:__added-artwork',job:'existing-job',started:Date.now(),regenerate:true,...patch});},patch);}
async function step(page){await page.evaluate(()=>window.playerApp.albumArt.step());}
test('legacy postponed completed job is retrieved immediately and survives reload',async({page})=>{
 const image=await setup(page);await save(page,{retryAt:Date.now()+1800000});let posts=0;
 await page.unroute('https://aihorde.net/**');await page.route('https://aihorde.net/**',r=>{if(r.request().method()==='POST')posts++;return r.fulfill({json:r.request().url().includes('/check/')?{done:true}:{generations:[{img:image,censored:false}]}});});
 await step(page);expect(posts).toBe(0);expect(await page.evaluate(()=>window.playerApp.library.addedArtwork.coverUrl)).toMatch(/^data:image\/jpeg/);
 await page.reload();await page.waitForFunction(()=>window.playerApp?.albumArt);expect(await page.evaluate(()=>window.playerApp.library.addedArtwork.coverUrl)).toMatch(/^data:image\/jpeg/);
});
test('status outage preserves existing job and retries it without a duplicate submission',async({page})=>{
 const image=await setup(page);await save(page,{});let failing=true,posts=0;
 await page.unroute('https://aihorde.net/**');await page.route('https://aihorde.net/**',r=>{if(r.request().method()==='POST')posts++;if(r.request().url().includes('/check/'))return r.fulfill({json:{done:true}});return r.fulfill(failing?{status:503,json:{}}:{json:{generations:[{img:image}]}});});
 await step(page);const saved=await page.evaluate(()=>window.playerApp.library.getFromStore('settings','album-generation:__added-artwork'));expect(saved.job).toBe('existing-job');expect(saved.retryAt-Date.now()).toBeLessThan(16000);
 failing=false;await save(page,{failures:1,retryAt:0});await step(page);expect(posts).toBe(0);expect(await page.evaluate(()=>window.playerApp.library.addedArtwork.coverUrl)).toMatch(/^data:image\/jpeg/);
});
test('expired job is replaced automatically rather than retained indefinitely',async({page})=>{
 await setup(page);await save(page,{});let posts=0;
 await page.unroute('https://aihorde.net/**');await page.route('https://aihorde.net/**',r=>{if(r.request().method()==='POST'){posts++;return r.fulfill({json:{id:'replacement-job'}});}return r.fulfill({status:404,json:{}});});
 await step(page);expect((await page.evaluate(()=>window.playerApp.library.getFromStore('settings','album-generation:__added-artwork'))).job).toBeUndefined();
 await page.evaluate(async()=>{const a=window.playerApp,s=await a.library.getFromStore('settings','album-generation:__added-artwork');s.retryAt=0;await a.library.putInStore('settings',s);});await step(page);expect(posts).toBe(1);
});
test('download URL response is decoded, cached, and never sent application credentials',async({page})=>{
 const image=await setup(page);await save(page,{});
 await page.route('https://a223539ccf6caa2d76459c9727d276e6.r2.cloudflarestorage.com/horde-transient/art.webp',r=>{expect(r.request().headers().apikey).toBeUndefined();return r.fulfill({contentType:'image/webp',body:Buffer.from(image,'base64'),headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.unroute('https://aihorde.net/**');await page.route('https://aihorde.net/**',r=>r.fulfill({json:r.request().url().includes('/check/')?{done:true}:{generations:[{img:'https://a223539ccf6caa2d76459c9727d276e6.r2.cloudflarestorage.com/horde-transient/art.webp'}]}}));await step(page);
 expect(await page.evaluate(()=>window.playerApp.library.addedArtwork.coverUrl)).toMatch(/^data:image\/jpeg/);
});
test('custom artwork stays until an explicit generation request replaces it',async({page})=>{
 const image=await setup(page);let posts=0;
 await page.evaluate(()=>{const a=window.playerApp;a.library.addedArtwork.coverType='custom';a.library.addedArtwork.coverUrl=a.library.getTracks()[0].pictureUrl||'data:image/jpeg;base64,fixture';});
 await page.unroute('https://aihorde.net/**');await page.route('https://aihorde.net/**',r=>{if(r.request().method()==='POST'){posts++;return r.fulfill({json:{id:'explicit-cover'}});}return r.fulfill({json:r.request().url().includes('/check/')?{done:true}:{generations:[{img:image}]}});});
 await step(page);expect(posts).toBe(0);
 await page.evaluate(()=>{const a=window.playerApp;return a.albumArt.regenerate(a.library.addedArtwork);});expect(posts).toBe(1);await step(page);
 expect(await page.evaluate(()=>window.playerApp.library.addedArtwork.coverType)).toBe('generated');
});

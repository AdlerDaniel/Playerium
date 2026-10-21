const {test,expect}=require('@playwright/test');
test('Android assets restore playback with the APIs available in an older WebView',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{
  Promise.allSettled=undefined;Array.prototype.at=undefined;Element.prototype.replaceChildren=undefined;DocumentFragment.prototype.replaceChildren=undefined;
  Blob.prototype.arrayBuffer=undefined;Blob.prototype.text=undefined;AbortSignal.timeout=undefined;
  Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true,writable:true});
  localStorage.setItem('playerium_auto_update_check','false');
  window.AndroidBridge={getPlaybackState:()=>JSON.stringify({queue:['native-old'],tracks:[{uri:'content://song',title:'Restored playing track',artist:'Artist'}],index:0,id:'native-old',playing:true,position:7000,duration:40000})};
 });
 await page.goto('/android/app/src/main/assets/index.html');
 await expect(page.locator('#mobileMiniTitle')).toHaveText('Restored playing track');await expect(page.locator('#mobileMiniPlayer')).toBeVisible();
 const restored=await page.evaluate(async()=>({uuid:crypto.randomUUID(),last:[1,2].at(-1),settled:(await Promise.allSettled([Promise.resolve(1),Promise.reject('fixture')])).map(x=>x.status),bytes:Array.from(new Uint8Array(await new Blob([new Uint8Array([1,2])]).arrayBuffer()))}));
 expect(restored.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);expect(restored.last).toBe(2);expect(restored.settled).toEqual(['fulfilled','rejected']);expect(restored.bytes).toEqual([1,2]);
});
test('mobile home and search have continuous themed surfaces and aligned history in every palette',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await boot(page);
 await page.evaluate(()=>{
  localStorage.setItem('playerium_search_history',JSON.stringify(['Anna asti','Nirvana','Kler','Дорофеева']));
  const a=window.playerApp;for(let i=0;i<4;i++)a.library.tracks.set('fixture'+i,{id:'fixture'+i,title:['Повело','Ночью на кухне','Топит','Сонце Сідає'][i],artist:['ANNA ASTI','ANNA ASTI','ANNA ASTI','Океан Ельзи'][i],duration:180,dateAdded:Date.now()-i});a.ui.refreshCurrentView();
 });
 for(const id of ['light-brown','dark-brown','burgundy','green','blue','yellow']){
  await page.evaluate(async id=>{(await import('/js/themes.js')).applyTheme(id);window.playerApp.ui.navigateTo({type:'home'});},id);
  const home=await page.evaluate(()=>({child:getComputedStyle(document.querySelector('.home-dashboard')).backgroundImage,parent:getComputedStyle(document.querySelector('.main-view-container')).backgroundImage,top:getComputedStyle(document.querySelector('.topbar')).backgroundColor}));
  expect(home.child).toBe('none');await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.querySelector('.main-view-container')).backgroundImage.includes(getComputedStyle(document.querySelector('.topbar')).backgroundColor))).toBe(true);
  await page.screenshot({path:info.outputPath(id+'-home.png')});
  await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'search'}));
  const xs=await page.locator('.search-recent-query .history-art').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().left));expect(new Set(xs).size).toBe(1);expect(xs[0]).toBeLessThan(40);
  await page.locator('.mobile-search-input').focus();
  expect(await page.locator('.mobile-search-input').evaluate(n=>getComputedStyle(n).outlineStyle)).toBe('none');
  const title=await page.locator('.mobile-search-title').boundingBox();expect(title.y).toBeGreaterThanOrEqual(24);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(id+'-search.png')});
 }
});
test('mobile player restores native playback on reload and return without sending a play command',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{
  localStorage.setItem('playerium_auto_update_check','false');window.nativeWrites=[];
  window.nativeSnapshot={queue:['native-a'],tracks:[{uri:'content://music/a',title:'Playing song',artist:'Artist'}],index:0,id:'native-a',playing:true,position:67000,duration:180000};
  window.AndroidBridge={getPlaybackState:()=>JSON.stringify(window.nativeSnapshot),setPlaybackQueue:data=>window.nativeWrites.push(data)};
 });
 await page.goto('/');await expect(page.locator('#mobileMiniPlayer')).toBeVisible();await expect(page.locator('#mobileMiniTitle')).toHaveText('Playing song');await expect(page.locator('#mobileMiniPauseIcon')).toBeVisible();
 await page.reload();await expect(page.locator('#mobileMiniTitle')).toHaveText('Playing song');
 await page.evaluate(()=>{document.getElementById('mobileMiniPlayer').classList.add('hidden');window.nativeSnapshot.position=94000;window.dispatchEvent(new Event('pageshow'));});
 await expect(page.locator('#mobileMiniPlayer')).toBeVisible();await expect(page.locator('#currentTimeLabel')).toHaveText('1:34');
 expect(await page.evaluate(()=>window.nativeWrites)).toEqual([]);
});
async function boot(page){await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.history.length);}
async function within(page,selector){await expect.poll(async()=>{const b=await page.locator(selector).boundingBox(),v=page.viewportSize();return !!b&&b.x>=7&&b.y>=7&&b.x+b.width<=v.width-7&&b.y+b.height<=v.height-7;}).toBe(true);}
test('desktop tooltips flip at top, clamp at sides, show on keyboard focus and dismiss',async({page})=>{
 await page.setViewportSize({width:1000,height:700});await boot(page);
 await page.locator('#btnOpenSettings').hover();await expect(page.locator('.app-tooltip')).toBeVisible();await within(page,'.app-tooltip');
 const button=await page.locator('#btnOpenSettings').boundingBox(),tip=await page.locator('.app-tooltip').boundingBox();expect(tip.y).toBeGreaterThan(button.y+button.height);
 await page.mouse.move(500,400);await expect(page.locator('.app-tooltip')).toBeHidden();
 await page.locator('#btnShuffle').focus();await page.keyboard.press('Tab');await expect(page.locator('.app-tooltip')).toBeVisible();await within(page,'.app-tooltip');await page.keyboard.press('Escape');await expect(page.locator('.app-tooltip')).toBeHidden();
});
test('desktop long context menus, nested credits and forms stay inside a short resized window',async({page})=>{
 await page.setViewportSize({width:1000,height:360});await boot(page);
 await page.evaluate(async()=>{const a=window.playerApp;for(let i=0;i<25;i++)await a.library.createPlaylist('ОченьДлинноеНазваниеБезПробелов'.repeat(8)+i);a.ui.showTrackContextMenu(995,355,{id:'fixture',title:'Название'.repeat(100),artist:'Исполнитель'.repeat(100),album:'Альбом'.repeat(100),sources:[]});});
 await within(page,'#appContextMenu');await page.locator('#ctxAddToPlaylist').click();await within(page,'.playlist-picker');
 expect(await page.locator('.playlist-picker-list').evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
 await page.setViewportSize({width:800,height:320});await within(page,'.playlist-picker');
 await page.keyboard.press('Escape');await page.evaluate(()=>window.playerApp.ui.showTrackContextMenu(795,315,{id:'fixture',title:'Название'.repeat(100),artist:'Исполнитель'.repeat(100),sources:[]}));await page.locator('#ctxCredits').click();await within(page,'#appContextMenu');
 expect(await page.locator('#appContextMenu').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(page.locator('#appContextMenu')).toBeHidden();
  await page.evaluate(()=>{window.playerApp.ui.showCreatePlaylistModal();});await expect(page.locator('.form-dialog')).toBeVisible();await within(page,'.form-dialog .modal-card');await page.getByLabel('Название',{exact:true}).fill('Текст'.repeat(100));await expect(page.locator('.form-dialog').getByRole('button',{name:'Сохранить',exact:true})).toBeInViewport();await page.keyboard.press('Escape');
});
for(const mobile of [false,true])test(`six complete themes cover surfaces, retain contrast and persist (${mobile?'phone':'desktop'})`,async({page},info)=>{
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1280,height:800});await boot(page);await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings',title:'Настройки'}));await expect(page.locator('.theme-choice')).toHaveCount(6);
 const backgrounds=[];
 for(const id of ['light-brown','dark-brown','burgundy','green','blue','yellow']){
  await page.locator(`[data-theme-id="${id}"]`).click();await expect(page.locator('html')).toHaveAttribute('data-theme',id);await expect(page.locator(`[data-theme-id="${id}"]`)).toHaveAttribute('aria-pressed','true');
  const colors=await page.evaluate(()=>{const r=getComputedStyle(document.documentElement),lum=hex=>{const rgb=hex.trim().slice(1).match(/.{2}/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;},contrast=(a,b)=>{const x=lum(r.getPropertyValue(a)),y=lum(r.getPropertyValue(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};return {background:getComputedStyle(document.querySelector('.main-view-container')).backgroundColor,primary:contrast('--sp-text-primary','--sp-dark-900'),secondary:contrast('--sp-text-secondary','--sp-dark-900'),button:contrast('--sp-on-accent','--sp-green')};});
  backgrounds.push(colors.background);expect(colors.primary).toBeGreaterThanOrEqual(4.5);expect(colors.secondary).toBeGreaterThanOrEqual(4.5);expect(colors.button).toBeGreaterThanOrEqual(4.5);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(id+'.png')});
 }
 expect(new Set(backgrounds).size).toBe(6);await page.reload();await page.waitForFunction(()=>window.playerApp?.ui.history.length);await expect(page.locator('html')).toHaveAttribute('data-theme','yellow');await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings',title:'Настройки'}));await expect(page.locator('[data-theme-id="yellow"]')).toHaveAttribute('aria-pressed','true');
});

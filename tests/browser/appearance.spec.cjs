const {test,expect}=require('@playwright/test');
async function boot(page){await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);}
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
 await within(page,'#appContextMenu');await page.locator('#ctxAddToPlaylist').click();await within(page,'#appContextMenu');
 expect(await page.locator('#appContextMenu').evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
 await page.setViewportSize({width:800,height:320});await within(page,'#appContextMenu');
 await page.locator('#trackMenuBack').click();await page.locator('#ctxCredits').click();await within(page,'#appContextMenu');
 expect(await page.locator('#appContextMenu').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(page.locator('#appContextMenu')).toBeHidden();
  await page.evaluate(()=>{window.playerApp.ui.showCreatePlaylistModal();});await expect(page.locator('.form-dialog')).toBeVisible();await within(page,'.form-dialog .modal-card');await page.getByLabel('Название',{exact:true}).fill('Текст'.repeat(100));await expect(page.getByRole('button',{name:'Сохранить',exact:true})).toBeInViewport();await page.keyboard.press('Escape');
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
 expect(new Set(backgrounds).size).toBe(6);await page.reload();await page.waitForFunction(()=>window.playerApp?.library.db);await expect(page.locator('html')).toHaveAttribute('data-theme','yellow');await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings',title:'Настройки'}));await expect(page.locator('[data-theme-id="yellow"]')).toHaveAttribute('aria-pressed','true');
});

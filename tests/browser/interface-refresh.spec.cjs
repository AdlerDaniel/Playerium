const {test,expect}=require('@playwright/test');
async function ready(page,size){
 if(size)await page.setViewportSize(size);
 await page.route('https://aihorde.net/**',r=>r.fulfill({status:503,json:{}}));
 await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.interfaceRefresh);
 await page.evaluate(async()=>{
  const a=window.playerApp;a.albumArt.stop();const artists=['Tycho','Bonobo','Ólafur Arnalds','Nils Frahm'];
  for(let i=0;i<12;i++){
   const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,256,256);g.addColorStop(0,`hsl(${i*37+12} 55% 65%)`);g.addColorStop(1,`hsl(${i*37+60} 45% 22%)`);x.fillStyle=g;x.fillRect(0,0,256,256);x.fillStyle='#ffffff33';x.beginPath();x.arc(100,120,75,0,Math.PI*2);x.fill();
   const t={id:'refresh-'+i,title:['A Walk','Kerala','Near Light','Says'][i%4]+(i>3?' · Live':''),artist:artists[i%4],duration:180+i*7,dateAdded:Date.now()-i*1000,pictureUrl:c.toDataURL('image/jpeg'),liked:i===0};a.library.tracks.set(t.id,t);await a.library.putInStore('tracks',t);
  }
  for(const name of ['Вечерний город','Фокус','Без спешки']){const p=await a.library.createPlaylist(name);p.trackIds=a.library.getTracks().slice(0,4).map(t=>t.id);await a.library.putInStore('playlists',p);}
  const art=a.library.addedArtwork;art.coverType='generated';art.coverUrl=a.library.getTracks()[0].pictureUrl;
  a.ui.navigateTo({type:'home',title:'Главная'});a.ui.refreshCurrentView();
 });
}
for(const width of [800,1024,1280,1440])test(`desktop controls have separate clickable bounds at ${width}`,async({page},info)=>{
 await ready(page,{width,height:900});await expect(page.locator('.home-feature')).toBeVisible();
 const metrics=await page.evaluate(()=>{
  const nodes=[...document.querySelectorAll('.player-right>button,#btnVolumeIcon,#volumeSliderContainer')].filter(n=>n.getBoundingClientRect().width);
  const boxes=nodes.map(n=>{const r=n.getBoundingClientRect();return {id:n.id,x:r.x,y:r.y,w:r.width,h:r.height,hit:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  return {boxes,overflow:document.documentElement.scrollWidth>innerWidth,footer:document.querySelector('.bottom-player').getBoundingClientRect().toJSON()};
 });
 expect(metrics.overflow).toBe(false);
 for(const b of metrics.boxes){expect(b.w,b.id).toBeGreaterThanOrEqual(40);expect(b.hit,b.id).toBe(true);expect(b.x+b.w).toBeLessThanOrEqual(width);}
 for(let i=0;i<metrics.boxes.length;i++)for(let j=i+1;j<metrics.boxes.length;j++){const a=metrics.boxes[i],b=metrics.boxes[j];expect(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),a.id+' / '+b.id).toBeLessThanOrEqual(0);}
 await page.screenshot({path:info.outputPath('home-desktop.png')});
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));await expect(page.locator('.track-row')).toHaveCount(12);await page.screenshot({path:info.outputPath('collection-desktop.png')});
});
for(const size of [{width:320,height:640},{width:390,height:844},{width:740,height:360}])test(`mobile collection and grouped menu fit ${size.width}`,async({page},info)=>{
 await ready(page,size);await page.screenshot({path:info.outputPath('home-mobile.png')});
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
 await page.evaluate(async()=>{const a=window.playerApp,{collectionMenu}=await import('/js/collection-menu.js');collectionMenu(a.ui,{tracks:a.library.getTracks()});});
 const panel=page.locator('.collection-sheet .surface-panel');await expect(panel).toBeVisible();
 const m=await panel.evaluate(p=>{const r=p.getBoundingClientRect();return {w:r.width,h:r.height,scroll:p.scrollHeight,client:p.clientHeight,align:getComputedStyle(p).textAlign};});
 expect(m.w).toBeLessThanOrEqual(size.width);expect(m.h).toBeLessThanOrEqual(size.height*.85+1);expect(m.align).toBe('left');
 await panel.getByRole('button',{name:'Загрузить свою обложку',exact:true}).scrollIntoViewIfNeeded();await expect(panel.getByRole('button',{name:'Загрузить свою обложку',exact:true})).toBeInViewport();await page.screenshot({path:info.outputPath('menu-mobile.png')});
 await page.keyboard.press('Escape');await page.evaluate(()=>{void window.playerApp.ui.showCreatePlaylistModal();});
 const dialog=page.getByRole('dialog',{name:'Создать плейлист'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Сохранить'})).toBeInViewport();
});
test('reduced motion removes decorative transitions',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await ready(page,{width:1280,height:800});
 expect(await page.locator('.home-feature-art').evaluate(n=>getComputedStyle(n).transitionDuration)).toBe('0s');
});

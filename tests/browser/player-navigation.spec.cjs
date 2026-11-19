const {test,expect}=require('@playwright/test');

async function prepare(page,mobile){
 await page.setViewportSize(mobile?{width:320,height:640}:{width:1280,height:800});
 await page.route('https://api.github.com/**',r=>r.fulfill({status:503}));
 await page.route('https://aihorde.net/**',r=>r.fulfill({status:503}));
 await page.goto('/');
 await page.waitForFunction(()=>window.playerApp?.albumArt);
 await page.evaluate(()=>{
  const a=window.playerApp;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#b23d7a';ctx.fillRect(0,0,64,64);
  for(const [i,title] of ['Alpha','Zulu','Beta'].entries()){
   const track={id:'fixture-'+i,title,artist:'Artist',duration:30,dateAdded:i+1,pictureUrl:canvas.toDataURL()};
   a.library.tracks.set(track.id,track);
  }
  a.ui.refreshCurrentView();
 });
}

test('mobile home, album layout, manual collage, and two-way track sorting',async({page})=>{
 await prepare(page,true);
 await expect(page.locator('#mobileNavBar button span')).toHaveText(['Главная','Поиск','Создать']);
 await expect(page.locator('.home-dashboard')).toHaveCount(0);
 await page.locator('.mobile-lib-name').filter({hasText:/^Добавленные$/}).click();
 await expect(page.locator('.mobile-album-heading h1')).toHaveText('Добавленные');
 const album=page.locator('.mobile-album-header');
 await expect(album.locator('.mobile-album-stats')).toContainText('3 треков');
 const boxes=await album.evaluate(el=>['.mobile-album-heading','.view-header-cover','.collection-more','.mobile-album-stats','.mobile-album-playback'].map(s=>el.querySelector(s).getBoundingClientRect().toJSON()));
 expect(boxes[0].bottom).toBeLessThan(boxes[1].top);
 expect(boxes[2].right).toBeLessThanOrEqual(boxes[3].left);
 expect(boxes[3].right).toBeLessThanOrEqual(boxes[4].left);
 expect(Math.abs(boxes[1].x+boxes[1].width/2-boxes[3].x-boxes[3].width/2)).toBeLessThan(1);
 const tracks=page.locator('.track-name'),sort=page.locator('.mobile-album-tools');
 await expect(tracks).toHaveText(['Beta','Zulu','Alpha']);
 await sort.locator('.sort-direction').click();await expect(tracks).toHaveText(['Alpha','Zulu','Beta']);
 await sort.locator('.collection-sort').click();await page.getByText('По названию трека',{exact:true}).click();
 await expect(tracks).toHaveText(['Alpha','Beta','Zulu']);
 await sort.locator('.sort-direction').click();await expect(tracks).toHaveText(['Zulu','Beta','Alpha']);
 await album.locator('.collection-more').click();
 await expect(page.locator('.surface-panel').getByText(/^(Воспроизвести|Добавить в очередь)$/)).toHaveCount(0);
 await page.getByText('Обложка: коллаж',{exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>{
  const a=window.playerApp,s=await a.library.getFromStore('settings','added-artwork');return s?.value?.coverType;
 })).toBe('mosaic');
 await album.locator('.view-header-cover').click();
 await expect.poll(()=>page.evaluate(()=>window.playerApp.library.addedArtwork.generating)).toBe(false);
 await album.locator('.mobile-album-back').click();await expect(page.locator('.mobile-library-view')).toBeVisible();
});

for(const mobile of [false,true])test(`queue pointer drag commits the new order (${mobile?'phone':'desktop'})`,async({page})=>{
 await prepare(page,mobile);
 await page.evaluate(()=>{const a=window.playerApp,p=a.player;p.queue=a.library.getTracks();p.originalQueue=p.queue.slice();p.queueIndex=0;p.currentTrack=p.queue[0];a.ui.syncPlayerDisplay();a.ui.openRightPanel('queue');});
 const rows=page.locator('#rightPanelContent .queue-list .queue-item');
 const handle=await rows.first().locator('.queue-drag').boundingBox(), other=await rows.last().boundingBox();
 const x=handle.x+handle.width/2,y=handle.y+handle.height/2;
 await page.mouse.move(x,y);await page.mouse.down();
 await page.mouse.move(x,other.y+other.height-4,{steps:8});
 await expect(rows.locator('.queue-item-title')).toHaveText(['Beta','Zulu']);
 await expect(page.locator('.drop-target,.queue-select,#btnClearQueueBtn')).toHaveCount(0);
 await page.mouse.up();await expect(rows.locator('.queue-item-title')).toHaveText(['Beta','Zulu']);
 expect(await page.evaluate(()=>window.playerApp.player.queue.map(t=>t.title))).toEqual(['Alpha','Beta','Zulu']);
 expect(await page.evaluate(()=>window.playerApp.player.currentTrack.title)).toBe('Alpha');
});

test('mobile artwork card is between lyrics and queue; back restores the song',async({page})=>{
 await prepare(page,true);
 await page.evaluate(()=>{const a=window.playerApp,p=a.player;p.queue=a.library.getTracks();p.queueIndex=0;p.currentTrack=p.queue[0];a.ui.syncPlayerDisplay();});
 await page.locator('#mobileMiniPlayer').click();
 const card=page.locator('.mobile-next-slot .next-song-card');
 await expect(card).toContainText('Zulu');
 await expect(card.locator('.next-song-backdrop img')).toBeVisible();
 const control=await page.locator('.mobile-fs-utils').evaluate(el=>[...el.children].map(n=>n.getBoundingClientRect().toJSON()));
 expect(control[0].right).toBeLessThan(control[1].left);
 expect(control[1].right).toBeLessThan(control[2].left);
 await page.locator('#btnMobileCinema').click();await expect(page.locator('.lyrics-player')).toBeVisible();
 expect(await page.evaluate(()=>window.playerApp.ui.handleBack())).toBe(true);
 await expect(page.locator('.lyrics-player')).toHaveCount(0);
 await expect(page.locator('#mobileFullscreenPlayer')).toHaveClass(/active/);
 await expect(page.locator('#btnMobileCinema')).toBeFocused();
});

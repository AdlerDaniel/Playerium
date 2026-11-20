const {test,expect}=require('@playwright/test');

async function prepare(page,mobile){
 await page.setViewportSize(mobile?{width:320,height:640}:{width:1280,height:800});
 await page.route('https://api.github.com/**',r=>r.fulfill({status:503}));
 await page.route('https://aihorde.net/**',r=>r.fulfill({status:503}));
 await page.goto('/');
 await page.waitForFunction(()=>window.playerApp?.albumArt);
 await page.evaluate(()=>{
  const a=window.playerApp;a.albumArt.stop();
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
 await expect(page.locator('#mobileNavBar > button')).toHaveText(['Главная','Поиск','Создать','Профиль']);
 await expect(page.locator('.home-dashboard,.mobile-library-pills')).toHaveCount(0);
 await expect(page.locator('#mainTopbar')).toBeHidden();
 await page.locator('#btnMobileProfile').click();await expect(page.getByRole('dialog',{name:'Настройки'})).toBeVisible();
 await page.locator('.settings-close').click();
 const positions=await page.locator('.mobile-library-actions').evaluate(el=>[...el.children].slice(0,2).map(n=>n.getBoundingClientRect().left));
 expect(positions[0]).toBeLessThan(positions[1]);
 await expect(page.locator('.mobile-library-actions .sort-direction')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await page.locator('.mobile-lib-name').filter({hasText:/^Добавленные$/}).click();
 await expect(page.locator('.mobile-album-heading h1')).toHaveText('Добавленные');
 const album=page.locator('.mobile-album-header');
 await expect(page.locator('.content-history')).toBeHidden();
 await expect(page.getByRole('button',{name:'Назад',exact:true})).toHaveCount(1);
 await expect(album.locator('.view-header-cover')).toBeVisible();
 await expect(album.locator('.mobile-album-stats')).toContainText('3 треков');
 const boxes=await album.evaluate(el=>['.mobile-album-heading','.view-header-cover','.mobile-album-tools','.mobile-album-stats','.mobile-album-playback','.collection-more','.view-title','.mobile-album-back'].map(s=>el.querySelector(s).getBoundingClientRect().toJSON()));
 expect(boxes[0].bottom).toBeLessThan(boxes[1].top);
 expect(boxes[5].left).toBeGreaterThanOrEqual(boxes[6].right);
 expect(Math.abs((boxes[0].left+boxes[0].right-boxes[6].left-boxes[6].right)/2)).toBeLessThan(1);
 expect(boxes[7].right).toBeLessThanOrEqual(boxes[6].left);
 const middle=box=>box.top+box.height/2;
 expect(Math.abs(middle(boxes[7])-middle(boxes[6]))).toBeLessThan(1);
 expect(Math.abs(middle(boxes[5])-middle(boxes[6]))).toBeLessThan(1);
 const colors=await album.locator('.mobile-album-heading button,.mobile-album-controls button').evaluateAll(buttons=>buttons.map(button=>getComputedStyle(button).color));
 expect(colors.length).toBe(6);expect(new Set(colors).size).toBe(1);
 expect(boxes[2].right).toBeLessThanOrEqual(boxes[3].left);
 expect(boxes[3].right).toBeLessThanOrEqual(boxes[4].left);
 expect(Math.abs(boxes[1].x+boxes[1].width/2-boxes[3].x-boxes[3].width/2)).toBeLessThan(1);
 const tracks=page.locator('.track-name'),sort=page.locator('.mobile-album-tools');
 await expect(tracks).toHaveText(['Beta','Zulu','Alpha']);
 await sort.locator('.sort-direction').click();await expect(tracks).toHaveText(['Alpha','Zulu','Beta']);
 await sort.locator('.collection-sort').click();await page.getByText('По названию трека',{exact:true}).click();
 await expect(tracks).toHaveText(['Alpha','Beta','Zulu']);
 await expect(sort.locator('.collection-sort')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await sort.locator('.sort-direction').click();await expect(tracks).toHaveText(['Zulu','Beta','Alpha']);
 await album.locator('.collection-more').click();
 await expect(page.locator('.surface-panel').getByText(/^(Воспроизвести|Добавить в очередь)$/)).toHaveCount(0);
 await page.getByText('Обложка: коллаж',{exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>{
  const a=window.playerApp,s=await a.library.getFromStore('settings','added-artwork');return s?.value?.coverType;
 })).toBe('mosaic');
 await album.locator('.view-header-cover').click();
 await expect.poll(()=>page.evaluate(()=>window.playerApp.library.addedArtwork.generating)).toBe(false);
 await album.getByRole('button',{name:'Назад'}).click();await expect(page.locator('.mobile-library-view')).toBeVisible();
});

for(const mobile of [false,true])test(`queue pointer drag commits the new order (${mobile?'phone':'desktop'})`,async({page})=>{
 await prepare(page,mobile);
 await page.evaluate(()=>{const a=window.playerApp,p=a.player;p.queue=a.library.getTracks();p.originalQueue=p.queue.slice();p.queueIndex=0;p.currentTrack=p.queue[0];a.ui.syncPlayerDisplay();a.ui.openRightPanel('queue');});
 const rows=page.locator('#rightPanelContent .queue-list .queue-item');
 const align=await rows.first().locator('.queue-item-info').evaluate(n=>[getComputedStyle(n).textAlign,[...n.children].every(c=>Math.abs(c.getBoundingClientRect().x-n.getBoundingClientRect().x)<1)]);
 expect(align).toEqual(['left',true]);
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


for(const mobile of [false,true])test(`repeat and shuffle use a brighter accent without a background (${mobile?'phone':'desktop'})`,async({page})=>{
 await prepare(page,mobile);
 const values=await page.evaluate(async mobile=>{
  const {THEMES,applyTheme}=await import('/js/themes.js'),p=window.playerApp.player;
  const buttons=(mobile?['btnMobileFsShuffle','btnMobileFsRepeat']:['btnShuffle','btnRepeat']).map(id=>document.getElementById(id));
  for(const b of buttons)b.style.transition='none';
  const mode=b=>{const css=getComputedStyle(b);return {color:css.color,bg:css.backgroundColor};};
  const luminance=color=>color.match(/\d+/g).slice(0,3).reduce((value,c,i)=>{c=Number(c)/255;return value+[.2126,.7152,.0722][i]*(c<=.04045?c/12.92:((c+.055)/1.055)**2.4);},0);
  return THEMES.map(theme=>{
   applyTheme(theme.id,false);
   p.onShuffleChange(false);p.onRepeatChange('off');
   const off=buttons.map(mode);
   p.onShuffleChange(true);p.onRepeatChange('one');
   const on=buttons.map(mode);
   return {id:theme.id,transparent:[...on,...off].every(b=>b.bg==='rgba(0, 0, 0, 0)'),brighter:on.every((b,i)=>(luminance(b.color)+.05)/(luminance(off[i].color)+.05)>=1.25)};
  });
 },mobile);
 expect(values).toHaveLength(20);expect(values.filter(v=>!v.transparent||!v.brighter)).toEqual([]);
});

test('mobile playlist begins with one back button and uses the theme accent for menu and playback glyphs',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await prepare(page,true);
 await page.evaluate(async()=>{
  const {library,ui}=window.playerApp;
  await library.createPlaylist('Мой альбом');
  ui.refreshCurrentView();
 });
 const row=page.locator('.mobile-lib-row').filter({hasText:'Мой альбом'});
 const menu=row.getByRole('button',{name:'Действия: Мой альбом'});
 await expect(menu).toBeVisible();
 const expected=await menu.evaluate(async button=>{
  const {THEMES,applyTheme}=await import('/js/themes.js');
  const probe=document.createElement('span');document.body.append(probe);
  const circle=button.querySelector('circle');
  const colors=THEMES.map(theme=>{applyTheme(theme.id,false);probe.style.color=theme.tokens.accent;return [getComputedStyle(circle).fill,getComputedStyle(probe).color];});
  probe.remove();
  return colors;
 });
 expect(expected).toHaveLength(20);
 for(const [fill,accent] of expected)expect(fill).toBe(accent);
 await row.locator('.mobile-lib-name').click();
 await expect(page.locator('.content-history')).toBeHidden();
 await expect(page.getByRole('button',{name:'Назад',exact:true})).toHaveCount(1);
 await expect(page.locator('.mobile-album-heading h1')).toHaveText('Мой альбом');
 const header=page.locator('.mobile-album-header');
 const positions=await header.evaluate(el=>{
  const rect=selector=>el.querySelector(selector).getBoundingClientRect();
  return {top:rect('.mobile-album-heading').top,viewport:document.getElementById('mainScrollContainer').getBoundingClientRect().top,play:rect('.mobile-album-play').left,shuffle:rect('.collection-shuffle').right,playTop:rect('.mobile-album-play').top,coverBottom:rect('.view-header-cover').bottom};
 });
 expect(Math.abs(positions.top-positions.viewport)).toBeLessThan(1);
 expect(positions.play).toBeGreaterThanOrEqual(positions.shuffle);
 expect(positions.playTop).toBeGreaterThan(positions.coverBottom);
 const fills=await header.evaluate(async el=>{
  const {THEMES,applyTheme}=await import('/js/themes.js');
  const [circle,play]=[el.querySelector('.collection-more circle'),el.querySelector('.mobile-album-play path')];
  const probe=document.createElement('span');document.body.append(probe);
  const colors=THEMES.map(theme=>{applyTheme(theme.id,false);probe.style.color=theme.tokens.accent;return [getComputedStyle(circle).fill,getComputedStyle(play).fill,getComputedStyle(probe).color];});
  probe.remove();
  return colors;
 });
 for(const [more,play,accent] of fills)expect([more,play]).toEqual([accent,accent]);
});

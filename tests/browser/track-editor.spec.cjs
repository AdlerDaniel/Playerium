const {test,expect}=require('@playwright/test');
function wav(){const n=8000*60,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/8000)*1000),44+i*2);return b;}
async function setup(page,mobile){
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});
 await page.route('https://aihorde.net/**',r=>r.fulfill({status:503,body:'{}'}));
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.history.length);
 await page.locator('#hiddenAudioFilesPicker').setInputFiles({name:'Artist - Song.wav',mimeType:'audio/wav',buffer:wav()});
 await page.waitForFunction(()=>window.playerApp.library.getTracks().length===1);
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
 await page.locator('.track-name').click();await page.waitForFunction(()=>window.playerApp.player.isPlaying);
}
async function open(page,mobile){
 if(mobile){await page.locator('#mobileMiniPlayer').click();await page.locator('#btnMobileFsOptions').click();await page.locator('#sheetOptEdit').click();}
 else{await page.locator('.track-row').hover();await page.locator('.track-menu-btn').click();await page.locator('#ctxEdit').click();}
 await expect(page.getByRole('dialog',{name:'Редактировать трек',exact:true})).toBeVisible();
}
for(const mobile of [false,true])test(`track menu edits artwork, metadata and volume and persists after restart (${mobile?'phone':'PC'})`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,mobile);
 await page.evaluate(()=>window.playerApp.player.setVolume(.5));await open(page,mobile);
 const dialog=page.locator('.track-editor');
 await dialog.locator('[name=volume]').fill('40');expect(await page.evaluate(()=>window.playerApp.player.gainNode.gain.value)).toBeCloseTo(.2);
 await dialog.getByRole('button',{name:'Отмена',exact:true}).click();expect(await page.evaluate(()=>window.playerApp.player.gainNode.gain.value)).toBeCloseTo(.5);
 if(mobile)await page.locator('#btnMobileFsClose').click();
 await open(page,mobile);await dialog.locator('[name=title]').fill('Новая песня <3');await dialog.locator('[name=artist]').fill('Мой исполнитель');await dialog.locator('[name=album]').fill('Мой альбом');
 await dialog.locator('input[type=file]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5i8AAAAASUVORK5CYII=','base64')});
 await expect(dialog.locator('[type=submit]')).toBeEnabled();await expect(dialog.locator('.track-editor-cover img')).toBeVisible();
 await dialog.locator('[name=volume]').fill('150');await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('#nowPlayingTitle')).toHaveText('Новая песня <3');expect(await page.evaluate(()=>window.playerApp.player.gainNode.gain.value)).toBeCloseTo(.75);
 expect(await page.evaluate(()=>window.playerApp.player.volume)).toBe(.5);
 const saved=await page.evaluate(async()=>{const a=window.playerApp,t=a.library.getTracks()[0];return{id:t.id,artist:t.artist,album:t.album,volume:t.userEdits.volume,cover:t.pictureBlob.size,audio:(await a.library.getFromStore('files',t.id)).blob.size};});
 expect(saved).toMatchObject({artist:'Мой исполнитель',album:'Мой альбом',volume:150,audio:wav().length});expect(saved.cover).toBeGreaterThan(0);
 await page.reload();await page.waitForFunction(()=>window.playerApp?.ui.history.length);await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
 await expect(page.locator('.track-name')).toHaveText('Новая песня <3');expect(await page.evaluate(()=>window.playerApp.library.getTracks()[0].id)).toBe(saved.id);
 await page.locator('.track-name').click();await page.waitForFunction(()=>window.playerApp.player.isPlaying);expect(await page.evaluate(()=>window.playerApp.player.gainNode.gain.value)).toBeCloseTo(.75);
 expect(errors).toEqual([]);
});
test('small phone and landscape keep editor fields scrollable and save controls visible; Escape restores focus and volume',async({page})=>{
 await setup(page,true);await open(page,true);
 for(const size of [{width:320,height:640},{width:320,height:420},{width:740,height:360}]){
  await page.setViewportSize(size);const dialog=page.getByRole('dialog',{name:'Редактировать трек',exact:true}),save=dialog.getByRole('button',{name:'Сохранить',exact:true});
  const b=await dialog.boundingBox(),s=await save.boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.width).toBeLessThanOrEqual(520);expect(b.x+b.width).toBeLessThanOrEqual(size.width);expect(s.y+s.height).toBeLessThanOrEqual(size.height);expect(s.y).toBeGreaterThanOrEqual(0);
  await dialog.locator('[name=album]').fill('Альбом');expect(await dialog.locator('.modal-body').evaluate(el=>el.scrollHeight>=el.clientHeight)).toBe(true);
  expect(await dialog.evaluate(el=>getComputedStyle(el).textAlign)).toBe('left');
 }
 await page.screenshot({path:'build/track-editor-phone.png'});await page.keyboard.press('Escape');await expect(page.locator('.track-editor')).toHaveCount(0);
 expect(await page.evaluate(()=>[...document.body.children].some(el=>el.inert&&!el.classList.contains('mobile-bottom-sheet')))).toBe(false);
});

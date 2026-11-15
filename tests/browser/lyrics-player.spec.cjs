const {test,expect}=require('@playwright/test');
function wav(){const n=8000*60,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);return b;}
async function setup(page,mobile){
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1920,height:1080});
 await page.route(/https:\/\/(lrclib\.net|api\.lrcmux\.dev|api\.lyrics\.ovh)\//,route=>{const url=new URL(route.request().url()),name=url.searchParams.get('track_name')||'First',record={trackName:name,artistName:'Artist',duration:60,plainLyrics:'Первая тестовая строка\nВторая тестовая строка\nТретья тестовая строка',syncedLyrics:'[00:00.00]Первая тестовая строка\n[00:12.00]Вторая тестовая строка\n[00:25.00]Третья тестовая строка'};return route.fulfill({json:url.pathname==='/api/search'?[record]:record});});
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.albumArt);
 await page.locator('#hiddenAudioFilesPicker').setInputFiles(['First','Second'].map(name=>({name:'Artist - '+name+'.wav',mimeType:'audio/wav',buffer:wav()})));
 await page.waitForFunction(()=>window.playerApp.library.getTracks().length===2);
 await page.evaluate(async()=>{const a=window.playerApp,list=['First','Second'].map(title=>a.library.getTracks().find(t=>t.title===title)),cover=await(await fetch('/assets/icon.png')).blob();for(const t of list){t.pictureBlob=cover;t.pictureUrl=a.library.coverURL(t.id,cover);}await a.player.playTrack(list[0],0,list);});await page.waitForFunction(()=>window.playerApp.player.isPlaying);
 await page.evaluate(()=>window.playerApp.ui.experience.openCinema());await expect(page.locator('.lyric-line')).toHaveCount(3);
}
for(const mobile of [false,true])test(`immersive lyrics follow audio, seek on click, retain queue and reopen offline (${mobile?'phone':'PC'})`,async({page,context})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,mobile);
 await page.evaluate(()=>window.playerApp.player.seekToTime(12.5));await expect(page.locator('.lyric-line.current')).toHaveText('Вторая тестовая строка');
 const lyrics=page.locator('.lyrics-player');const b=await lyrics.boundingBox();expect(b.width).toBe(mobile?390:1920);
 if(mobile)await page.getByRole('tab',{name:'Очередь',exact:true}).click();
 await expect(page.locator('.lyrics-queue-row')).toHaveCount(2);await page.locator('.lyrics-queue-row:not(.playing)').click();await expect(page.locator('.cinema-meta h1')).toHaveText('Second');
 if(mobile)await page.getByRole('tab',{name:'Текст',exact:true}).click();
 await expect(page.locator('.lyric-line')).toHaveCount(3);await page.screenshot({path:mobile?'build/lyrics-phone.png':'build/lyrics-desktop.png'});
 await page.keyboard.press('Escape');await expect(lyrics).toHaveCount(0);await context.setOffline(true);
 await page.evaluate(()=>window.playerApp.ui.experience.openCinema());await expect(page.locator('.lyric-line')).toHaveCount(3);await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>document.getElementById('app').inert)).toBe(false);expect(errors).toEqual([]);
});
test('phone tabs and playback controls remain reachable at small and landscape sizes',async({page})=>{
 await setup(page,true);
 for(const size of [{width:320,height:480},{width:740,height:360}]){await page.setViewportSize(size);await page.getByRole('tab',{name:'Очередь',exact:true}).click();await expect(page.locator('.lyrics-queue-row')).toHaveCount(2);const play=await page.locator('.cinema-play').boundingBox();expect(play.y+play.height).toBeLessThanOrEqual(size.height);expect(play.x).toBeGreaterThanOrEqual(0);expect(play.width).toBeGreaterThanOrEqual(44);await page.getByRole('tab',{name:'Текст',exact:true}).click();expect(await page.locator('.lyrics-layout').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);}
});
test('desktop controls fit the cover column at narrow and regular window widths',async({page})=>{
 await setup(page,false);
 for(const width of [900,1100,1101,1280,1920]){
  await page.setViewportSize({width,height:820});
  const boxes=await page.locator('.cinema-controls').evaluate(host=>{const r=host.getBoundingClientRect();return [...host.children].map(button=>{const b=button.getBoundingClientRect();return {fits:b.left>=r.left-1&&b.right<=r.right+1,width:b.width};});});
  expect(boxes).toHaveLength(5);expect(boxes.every(button=>button.fits&&button.width>=36)).toBe(true);
 }
});

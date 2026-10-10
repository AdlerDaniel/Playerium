const { test, expect } = require('@playwright/test');
function wav(seconds = 3) {
  const rate = 8000, samples = rate * seconds, data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(rate,24); data.writeUInt32LE(rate * 2,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
  data.write('data',36); data.writeUInt32LE(samples * 2,40);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / rate) * 1000),44 + i * 2);
  return data;
}
for (const mobile of [false,true]) test(`shuffle keeps playback position and lyrics controls are absent (${mobile?'mobile':'desktop'})`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(mobile)await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles([
    {name:'Nirvana - Smells Like Teen Spirit - Smells Like Teen Spirit.wav',mimeType:'audio/wav',buffer:wav(60)},
    {name:'Artist - Another Song.wav',mimeType:'audio/wav',buffer:wav(60)}
  ]);
  await page.waitForFunction(()=>window.playerApp.library.getTracks().length===2);
  await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
  await page.locator('.track-name').filter({hasText:'Smells Like Teen Spirit'}).click();
  await page.waitForFunction(()=>window.playerApp.player.isPlaying);
  await expect(page.locator('#nowPlayingTitle')).toHaveText('Smells Like Teen Spirit');
  if(mobile)await page.locator('#mobileMiniPlayer').click();
  await page.evaluate(()=>{
    const p=window.playerApp.player;window.testSource=p.audio.src;window.testLoads=0;
    p.audio.addEventListener('loadstart',()=>window.testLoads++);p.seekToTime(15);
  });
  await page.waitForFunction(()=>window.playerApp.player.getCurrentTime()>=15);
  const button=page.locator(mobile?'#btnMobileFsShuffle':'#btnShuffle');
  await button.click();
  await page.waitForFunction(()=>window.playerApp.player.isShuffle);
  expect(await page.evaluate(()=>window.playerApp.player.getCurrentTime())).toBeGreaterThanOrEqual(15);
  expect(await page.evaluate(()=>window.playerApp.player.audio.src===window.testSource&&window.testLoads===0&&window.playerApp.player.isPlaying)).toBe(true);
  await button.click();await page.waitForFunction(()=>!window.playerApp.player.isShuffle);
  await page.evaluate(()=>window.playerApp.player.pause());
  await button.click();
  expect(await page.evaluate(()=>window.playerApp.player.audio.src===window.testSource&&window.testLoads===0&&!window.playerApp.player.isPlaying&&window.playerApp.player.getCurrentTime()>=15)).toBe(true);
  await expect(page.locator('#btnToggleLyrics,#mobileFsLyricsCard,#sheetOptLyrics')).toHaveCount(0);
  await page.keyboard.press('k');
  if(mobile){
    await page.locator('#btnMobileFsOptions').click();
    await expect(page.locator('.mobile-bottom-sheet')).toBeVisible();
    await expect(page.getByText('Показать текст песни',{exact:true})).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
test('import, playback and restart preserve files, likes and covers and ignore LRC', async ({page}) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('playerium_auto_update_check','false'));
  await page.goto('/'); await page.waitForFunction(() => window.playerApp?.library.db);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles([
    {name:'Artist - Song.wav',mimeType:'audio/wav',buffer:wav()},
    {name:'Artist - Song.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]hello\n[00:01.00]world')}
  ]);
  await page.evaluate(() => window.playerApp.ui.navigateTo({type:'allTracks',title:'Все треки'}));
  await expect(page.locator('.track-name').first()).toHaveText('Song');
  const id = await page.evaluate(async () => {
    const lib=window.playerApp.library, t=lib.getTracks()[0];
    await lib.toggleLike(t.id);
    t.pictureBlob = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5i8AAAAASUVORK5CYII='),c=>c.charCodeAt(0))],{type:'image/png'});
    t.pictureUrl=lib.coverURL(t.id,t.pictureBlob);await lib.putInStore('tracks',t);
    return t.id;
  });
  await page.locator('.track-row').first().dblclick();
  await page.waitForFunction(() => window.playerApp.player.isPlaying);
  await page.reload(); await page.waitForFunction(() => window.playerApp?.library.db);
  await page.evaluate(() => window.playerApp.ui.navigateTo({type:'allTracks',title:'Все треки'}));
  expect(await page.evaluate(id => window.playerApp.library.getTrackById(id).liked,id)).toBe(true);
  expect(await page.evaluate(id => window.playerApp.library.getTrackById(id).lyrics,id)).toBeUndefined();
  await page.locator('.track-row').first().dblclick();
  await page.waitForFunction(() => window.playerApp.player.isPlaying);
  await expect(page.locator('.track-mini-thumb img').first()).toBeVisible();
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await expect(page.getByText('10-полосный эквалайзер',{exact:true})).toBeVisible();
  await expect(page.locator('#settingsEqToggle')).toBeChecked();
  expect(errors).toEqual([]);
});
test('5000 tracks render a bounded list and scrolling reaches the end', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('playerium_auto_update_check','false'));
  await page.goto('/');await page.waitForFunction(() => window.playerApp?.library.db);
  await page.evaluate(() => {
    for(let i=0;i<5000;i++) window.playerApp.library.tracks.set(`track-${i}`,{id:`track-${i}`,title:`Track ${String(i).padStart(4,'0')}`,artist:'Artist',album:'Album',duration:42,dateAdded:i});
    window.playerApp.ui.navigateTo({type:'allTracks',title:'Все треки'});
  });
  await expect(page.locator('.virtual-track-body')).toBeVisible();
  expect(await page.locator('.track-row').count()).toBeLessThan(60);
  await page.locator('.main-view').evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(page.locator('.track-name').last()).toHaveText('Track 0000');
  expect(await page.locator('.track-row').count()).toBeLessThan(60);
  expect(errors).toEqual([]);
});
test('mobile controls open player, queue and equalizer after import',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles({name:'Artist - Song.wav',mimeType:'audio/wav',buffer:wav()});
  await page.evaluate(() => window.playerApp.ui.navigateTo({type:'allTracks',title:'Все треки'}));
  await expect(page.locator('.track-name').first()).toHaveText('Song');
  await page.locator('.track-row').first().click();
  await page.waitForFunction(()=>window.playerApp.player.isPlaying);
  await page.locator('#mobileMiniTitle').click();
  await expect(page.locator('#mobileFullscreenPlayer')).toHaveClass(/active/);
  await page.locator('#btnMobileFsQueue').click();
  await expect(page.locator('#rightPanelContent')).toBeVisible();
  await expect(page.locator('#rightPanelContent')).toContainText('Сейчас играет');
  await page.locator('#btnCloseRightPanel').click();
  await page.locator('#mobileMiniTitle').click();
  await page.locator('#btnMobileFsEq').click();
  await expect(page.getByText('10-полосный эквалайзер',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
test('home shelves, library filters and navigation expose the imported collection',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles({name:'Artist - Song.wav',mimeType:'audio/wav',buffer:wav()});
  await expect(page.locator('.shelf-title').first()).toHaveText('Song');
  await page.locator('.home-quick-card').filter({hasText:'Добавленные'}).click();
  await expect(page.locator('.track-name')).toHaveText('Song');
  await page.locator('#btnNavBack').click();
  await expect(page.locator('.home-dashboard')).toBeVisible();
  await page.locator('#librarySearchInput').fill('not present');
  await expect(page.locator('.sidebar-item:visible')).toHaveCount(0);
  await page.locator('#librarySearchInput').fill('Artist');
  await expect(page.locator('.sidebar-item:visible')).toHaveCount(0);
  await page.locator('#librarySearchInput').fill('Добавленные');
  await expect(page.locator('.sidebar-item:visible')).toHaveCount(1);
  await expect(page.locator('.home-filters').getByRole('button',{name:'Альбомы',exact:true})).toHaveCount(0);
  await page.locator('.home-filters').getByRole('button',{name:'Исполнители',exact:true}).click();
  await expect(page.locator('.shelf-heading h2')).toHaveText('Ваши исполнители');
  await page.locator('#mainSearchInput').fill('Song');
  await expect(page.locator('.track-name')).toHaveText('Song');
  await page.locator('#btnNavBack').click();
  await expect(page.locator('.home-dashboard')).toBeVisible();
  await page.locator('#btnGlobalHome').click();
  await expect(page.locator('#mainSearchInput')).toHaveValue('');
  expect(errors).toEqual([]);
});
for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} row text plays, actions stay separate, collection resumes`, async ({page},testInfo) => {
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    if (mobile) await page.setViewportSize({width:390,height:844});
    await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
    await page.goto('/'); await page.waitForFunction(()=>window.playerApp?.library.db);
    await page.locator('#hiddenAudioFilesPicker').setInputFiles([
      {name:'Artist - First.wav',mimeType:'audio/wav',buffer:wav(60)},
      {name:'Other - Second.wav',mimeType:'audio/wav',buffer:wav(60)}
    ]);
    await expect(page.locator('.home-shelf').first().locator('.shelf-title')).toHaveCount(2);
    const id=await page.evaluate(async()=>{
      const app=window.playerApp, pl=await app.library.createPlaylist('Test playlist');
      for(const t of app.library.getTracks()) await app.library.addTrackToPlaylist(pl.id,t.id);
      app.ui.navigateTo({type:'playlist',id:pl.id,title:pl.name});return pl.id;
    });
    const row=page.locator('.track-row').first();
    await row.locator('.track-artist').click();
    await page.waitForFunction(()=>window.playerApp.player.isPlaying);
    await expect(page.locator('.view-title')).toHaveText('Test playlist');
    await expect(page.locator('#btnHeroPlay')).toHaveAttribute('aria-label','Пауза');
    await page.screenshot({path:testInfo.outputPath('playlist-playing.png')});
    await page.locator('#btnHeroPlay').click();
    await page.waitForFunction(()=>!window.playerApp.player.isPlaying);
    await expect(page.locator('#btnHeroPlay')).toHaveAttribute('aria-label','Воспроизвести');
    const track=await page.evaluate(()=>window.playerApp.player.currentTrack.id);
    await page.locator('#btnHeroPlay').click();
    await page.waitForFunction(()=>window.playerApp.player.isPlaying);
    expect(await page.evaluate(()=>window.playerApp.player.currentTrack.id)).toBe(track);
    if (mobile) await page.locator('#mobileMiniLike').click();
    else await row.locator('.track-like-btn').click();
    expect(await page.evaluate(()=>window.playerApp.player.currentTrack.id)).toBe(track);
    await page.evaluate(()=>window.playerApp.player.pause());
    await page.waitForFunction(()=>!window.playerApp.player.isPlaying);
    await page.locator('.track-row').last().locator('.track-name').click();
    await page.waitForFunction(old=>window.playerApp.player.isPlaying&&window.playerApp.player.currentTrack.id!==old,track);
    expect(await page.evaluate(()=>window.playerApp.player.playbackContext.id)).toBe(id);
    await page.evaluate(()=>window.playerApp.player.stop());
    await expect(page.locator('#btnHeroPlay')).toHaveAttribute('aria-label','Воспроизвести');
    await expect(page.locator('.track-row.playing')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('imports go to Added without polluting the default library; explicit filters remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles({name:'Artist - Song.wav',mimeType:'audio/wav',buffer:wav()});
  await page.locator('#mobileNavLibrary').click();
  await expect(page.locator('.mobile-lib-name')).toHaveText(['Добавленные','Любимые треки']);
  await page.locator('.mobile-lib-pill[data-filter="artists"]').click();
  await expect(page.locator('.mobile-lib-name')).toHaveText('Artist');
  await page.locator('.mobile-lib-pill[data-filter="all"]').click();
  await page.locator('.mobile-lib-row').filter({hasText:'Добавленные'}).click();
  await expect(page.locator('.track-name')).toHaveText('Song');
});

test('scrollbars stay hidden even during scrolling while content remains scrollable',async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  const filters=page.locator('#mainTopbar .home-filters');
  expect(await filters.evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');
  expect(await filters.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar').display)).toBe('none');
  await filters.evaluate(el=>el.scrollLeft=100);
  expect(await filters.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  expect(await filters.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar').display)).toBe('none');
  await page.locator('#mobileNavLibrary').click();
  expect(await page.locator('.mobile-library-pills').evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');
});

test('seek preview survives time updates and dragging commits once; volume supports keyboard',async({page})=>{
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles({name:'Artist - Song.wav',mimeType:'audio/wav',buffer:wav()});
  await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
  await page.locator('.track-name').click();await page.waitForFunction(()=>window.playerApp.player.isPlaying);
  await page.evaluate(()=>{
    window.seekCalls=[];
    window.playerApp.player.seek=p=>window.seekCalls.push(p);
  });
  const slider=page.locator('#progressSliderContainer'), box=await slider.boundingBox();
  await page.mouse.move(box.x+box.width*.25,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.75,box.y+box.height/2);
  await page.evaluate(()=>window.playerApp.player.onTimeUpdate(.1,1));
  expect(await slider.getAttribute('aria-valuenow')).toBe('75');
  await page.mouse.up();
  const calls=await page.evaluate(()=>window.seekCalls);expect(calls).toHaveLength(1);expect(calls[0]).toBeCloseTo(75,0);
  const volume=page.locator('#volumeSliderContainer');await volume.focus();await volume.press('Home');
  expect(await page.evaluate(()=>window.playerApp.player.volume)).toBe(0);
  await volume.press('ArrowRight');expect(await page.evaluate(()=>window.playerApp.player.volume)).toBeCloseTo(.05);
  await page.locator('#btnVolumeIcon').click();await page.locator('#btnVolumeIcon').click();
  expect(await page.evaluate(()=>window.playerApp.player.volume)).toBeCloseTo(.05);
});

test('saved volume, shuffle and repeat are reflected at startup',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('sp_audio_prefs',JSON.stringify({volume:.25,isShuffle:true,repeatMode:'one'})));
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await expect(page.locator('#volumeSliderContainer')).toHaveAttribute('aria-valuenow','25');
  await expect(page.locator('#btnShuffle')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#btnRepeat')).toHaveAttribute('data-repeat','one');
});
test('changing track keeps an open queue visible and queue rows work with keyboard',async({page})=>{
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles([
    {name:'Artist - First.wav',mimeType:'audio/wav',buffer:wav(60)},
    {name:'Artist - Second.wav',mimeType:'audio/wav',buffer:wav(60)}
  ]);
  await expect(page.locator('.home-shelf').first().locator('.shelf-title')).toHaveCount(2);
  await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
  await page.locator('.track-name').first().click();await page.waitForFunction(()=>window.playerApp.player.isPlaying);
  await page.locator('#btnToggleQueue').click();
  await page.locator('.queue-item:not(.current)').focus();
  await page.locator('.queue-item:not(.current)').press('Enter');
  await expect(page.locator('#rightPanelContent')).toContainText('Следующие в очереди');
  await expect(page.locator('.queue-item:not(.current)')).toHaveCount(0);
  await page.evaluate(()=>window.playerApp.player.pause());
  await page.locator('.queue-item.current').click();await page.waitForFunction(()=>window.playerApp.player.isPlaying);
});

test('refresh and back navigation preserve scroll position in large collections',async({page})=>{
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await page.evaluate(()=>{
    for(let i=0;i<200;i++)window.playerApp.library.tracks.set(`t${i}`,{id:`t${i}`,title:`Song ${i}`,artist:'Artist',duration:42,dateAdded:i});
    window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'});
  });
  const scroll=page.locator('#mainScrollContainer');await scroll.evaluate(el=>el.scrollTop=1500);
  await page.evaluate(()=>window.playerApp.ui.refreshCurrentView());
  expect(await scroll.evaluate(el=>el.scrollTop)).toBe(1500);
  await page.getByRole('button',{name:'Настройки',exact:true}).click();
  await page.locator('#btnNavBack').click();
  expect(await scroll.evaluate(el=>el.scrollTop)).toBe(1500);
});
test('mobile home filters remain visible and search keeps focus while typing',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  await expect(page.locator('#mainTopbar .home-filters')).toBeVisible();
  const box=await page.locator('#mainTopbar .home-filters').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThan(80);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles({name:'Artist - Song.wav',mimeType:'audio/wav',buffer:wav()});
  await page.locator('#mobileNavSearch').click();
  await page.locator('.mobile-search-input').pressSequentially('Song');
  await expect(page.locator('.mobile-search-input')).toBeFocused();
  await expect(page.locator('.mobile-search-input')).toHaveValue('Song');
  await expect(page.locator('.track-name')).toHaveText('Song');
  await page.locator('#mobileNavHome').click();
  await page.setViewportSize({width:1280,height:800});
  await expect(page.locator('#mainTopbar .home-filters')).toHaveCount(0);
  await expect(page.locator('.home-dashboard .home-filters')).toBeVisible();
  expect(errors).toEqual([]);
});

const { test, expect } = require('@playwright/test');
function wav() {
  const rate = 8000, samples = rate * 3, data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(rate,24); data.writeUInt32LE(rate * 2,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
  data.write('data',36); data.writeUInt32LE(samples * 2,40);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / rate) * 1000),44 + i * 2);
  return data;
}
test('import, playback and restart preserve files, lyrics, likes and covers', async ({page}) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('playerium_auto_update_check','false'));
  await page.goto('/'); await page.waitForFunction(() => window.playerApp?.library.db);
  await page.locator('#hiddenAudioFilesPicker').setInputFiles([
    {name:'Artist - Song.wav',mimeType:'audio/wav',buffer:wav()},
    {name:'Artist - Song.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:00.00]hello\n[00:01.00]world')}
  ]);
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
  expect(await page.evaluate(id => window.playerApp.library.getTrackById(id).liked,id)).toBe(true);
  expect(await page.evaluate(id => window.playerApp.library.getTrackById(id).lyrics,id)).toContain('hello');
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

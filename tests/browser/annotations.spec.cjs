const {test,expect}=require('@playwright/test');
// Self-contained artwork fixture: also works in a clean CI checkout.
const image="iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAK0lEQVR4nO3NQQkAAAgEMKMYzUgX2RQ+hMH+q86cKoFAIBAIBAKBQJAnwQKOnEA92xGPMwAAAABJRU5ErkJggg==";

test('row hover shows a sized play icon and seek tooltip stays compact inside the viewport',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.history.length);
  await page.evaluate(()=>{
    const track={id:'hover-song',title:'Song',artist:'Artist',duration:180,dateAdded:1};
    window.playerApp.library.tracks.set(track.id,track);
    window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'});
    window.playerApp.player.currentTrack=track;
  });
  const row=page.locator('.track-row').first();await row.hover();
  const icon=row.locator('.track-row-play svg');await expect(icon).toBeVisible();
  const iconBox=await icon.boundingBox();expect(iconBox.width).toBe(16);expect(iconBox.height).toBe(16);
  expect(await row.locator('.track-number').evaluate(el=>getComputedStyle(el).display)).toBe('none');
  const slider=page.locator('#progressSliderContainer');await slider.hover();
  const tooltip=page.locator('.time-hover-tooltip');await expect(tooltip).toBeVisible();
  const box=await tooltip.boundingBox(),viewport=page.viewportSize();
  expect(box.height).toBeLessThanOrEqual(40);expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
  await expect(page.locator('.track-table-header')).not.toContainText('Альбом');
});

test('verified official artwork is saved locally and survives restart; unrelated images are rejected',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.history.length);
  const result=await page.evaluate(async base64=>{
    const {installCoverRepair}=await import('/js/cover-repair.js');
    const lib=window.playerApp.library,track={id:'verified-art',title:'Song',artist:'Artist',duration:180,dateAdded:1};
    lib.tracks.set(track.id,track);await lib.putInStore('tracks',track);
    const calls=[],music={available:true,library:lib,ui:window.playerApp.ui,request:async(op,p)=>{
      calls.push({op,...p});
      if(op==='artwork')return {base64,type:'image/png'};
      return {tracks:[{...track,artist:'Other',official:true,pictureUrl:'https://is1-ssl.mzstatic.com/wrong.jpg'},
        {...track,official:true,pictureUrl:'https://is1-ssl.mzstatic.com/correct.png'}]};
    }};
    installCoverRepair(music,(_,data)=>data.tracks);
    const repaired=await music.repairCover(track),stored=await lib.getFromStore('tracks',track.id);
    return {repaired,calls,blobSize:stored.pictureBlob.size,source:stored.pictureSource,hasAlbum:'album' in stored};
  },image);
  expect(result.repaired).toBe(true);expect(result.blobSize).toBeGreaterThan(0);expect(result.hasAlbum).toBe(false);
  expect(result.calls.filter(c=>c.op==='artwork').map(c=>c.url)).toEqual(['https://is1-ssl.mzstatic.com/correct.png']);
  expect(result.source.artist).toBe('Artist');
  const retry=await page.evaluate(async()=>{
    const {installCoverRepair}=await import('/js/cover-repair.js');
    const lib=window.playerApp.library,track={id:'retry-art',title:'Retry',artist:'Artist',duration:180};lib.tracks.set(track.id,track);
    const music={available:true,library:lib,ui:window.playerApp.ui,request:async op=>{
      if(op==='artwork')throw Error('Temporary connection failure');
      return {tracks:[{...track,official:true,pictureUrl:'https://is1-ssl.mzstatic.com/retry.png'}]};
    }};
    installCoverRepair(music,(_,data)=>data.tracks);await music.repairCover(track);lib.tracks.delete(track.id);
    return {blocked:!!track.coverCheckedAt,cover:!!track.pictureBlob};
  });
  expect(retry).toEqual({blocked:false,cover:false});
  await page.reload();await page.waitForFunction(()=>window.playerApp?.ui.history.length);
  await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
  await expect.poll(()=>page.locator('.track-mini-thumb img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
});

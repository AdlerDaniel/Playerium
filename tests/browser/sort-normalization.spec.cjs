const {test,expect}=require('@playwright/test');
async function ready(page){await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.experience);}
for(const type of ['playlist','allTracks'])test(`column headings toggle both directions and playback follows sorted rows (${type})`,async({page})=>{
 await ready(page);await page.evaluate(async type=>{const a=window.playerApp;for(const [id,title,dateAdded,duration] of [['a','Alpha',200,300],['b','Bravo',100,100],['c','Charlie',300,200]]){const track={id,title,dateAdded,duration,artist:'Fixture',liked:true};a.library.tracks.set(id,track);await a.library.putInStore('tracks',track);}const list=await a.library.createPlaylist('Sortable');list.trackIds=['a','b','c'];a.player.playTrack=(track,index,queue)=>{window.selectedRow={id:track.id,index,queue:queue?.map(t=>t.id)};};a.ui.navigateTo({type,id:list.id,title:'Sortable'});},type);
 const order=()=>page.locator('.track-row').evaluateAll(rows=>rows.map(r=>r.dataset.trackId));
 await page.locator('[data-track-sort="title"]').click();expect(await order()).toEqual(['a','b','c']);await expect(page.locator('[data-sort-column="title"]')).toHaveAttribute('aria-sort','ascending');
 await page.locator('[data-track-sort="title"]').press('Enter');expect(await order()).toEqual(['c','b','a']);await expect(page.locator('[data-sort-column="title"]')).toHaveAttribute('aria-sort','descending');
 await page.locator('[data-track-sort="dateAdded"]').click();expect(await order()).toEqual(['c','a','b']);await page.locator('[data-track-sort="dateAdded"]').click();expect(await order()).toEqual(['b','a','c']);
 await page.locator('[data-track-sort="duration"]').click();expect(await order()).toEqual(['b','c','a']);await page.locator('[data-track-sort="duration"]').click();expect(await order()).toEqual(['a','c','b']);
 await page.locator('.track-row[data-track-id="c"] .track-name').click();expect(await page.evaluate(()=>window.selectedRow)).toEqual({id:'c',index:1,queue:['a','c','b']});
});
test('normalization settings report completion, missing files and manual preparation without blocking navigation',async({page})=>{
 await page.addInitScript(()=>{window.preparationStatus={total:2,ready:1,pending:0,failed:0,active:false};window.preparationCalls=[];window.electronAPI={audioPreparationStatus:async()=>window.preparationStatus,prepareAudio:file=>new Promise(resolve=>{window.preparationCalls.push(file);window.finishNormalization=()=>{window.preparationStatus={total:2,ready:2,pending:0,failed:0,active:false};resolve(true);};})};});
 await ready(page);await page.waitForFunction(()=>window.playerApp.audioPreparation.state.checked);await page.evaluate(async()=>{const a=window.playerApp;const track={id:'local',filePath:'C:/Music/Fixture.mp3',title:'Fixture'};a.library.tracks.set(track.id,track);a.ui.navigateTo({type:'settings'});});
 await expect(page.locator('[data-normalization-count]')).toContainText('Готово 1 из 2');await expect(page.locator('[data-normalization-status]')).toContainText('без нормализации');
 await page.locator('[data-normalization-run]').click();await expect.poll(()=>page.evaluate(()=>window.preparationCalls.length)).toBeGreaterThan(0);await expect(page.locator('[data-normalization-run]')).toBeDisabled();
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks'}));await expect(page.locator('.view-title')).toContainText('Добавленные');await page.evaluate(()=>window.finishNormalization());
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings'}));await expect(page.locator('[data-normalization-status]')).toContainText('Все скачанные треки готовы');await expect(page.locator('progress[data-normalization-progress]')).toHaveJSProperty('value',2);
 await page.evaluate(()=>window.preparationStatus={total:2,ready:1,pending:1,failed:1,active:false});await page.locator('[data-normalization-check]').click();await expect(page.locator('[data-normalization-count]')).toContainText('Ошибок: 1');await expect(page.locator('[data-normalization-status]')).toContainText('не удалось');
});
test('normalization controls stay inside narrow and landscape screens',async({page})=>{
 await ready(page);
 for(const size of [{width:375,height:812},{width:812,height:375}]){
  await page.setViewportSize(size);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings'}));
  const section=page.locator('.normalization-settings');await expect(section).toBeVisible();
  const rect=await section.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(16);expect(rect.x+rect.width).toBeLessThanOrEqual(size.width-16);
  for(const button of await section.locator('button').all()){const r=await button.boundingBox();expect(r.x+r.width).toBeLessThanOrEqual(size.width-16);}
  await section.screenshot({path:`build/normalization-settings-${size.width}.png`});
 }
});

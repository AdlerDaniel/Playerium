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

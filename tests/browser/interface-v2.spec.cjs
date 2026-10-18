const {test,expect}=require('@playwright/test');
async function setup(page,mobile=false){
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});
 await page.addInitScript(()=>localStorage.setItem('playerium_auto_update_check','false'));
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.ui.interfaceV2);
 await page.evaluate(async()=>{const a=window.playerApp;for(let i=0;i<6;i++){const track={id:'v2-'+i,title:['Signal','Second','Third','Fourth','Fifth','Sixth'][i],artist:i===2?'Artist feat. Guest':'Artist',duration:180+i,dateAdded:i,nativeUri:'content://music/'+i};a.library.tracks.set(track.id,track);await a.library.putInStore('tracks',track);}const p=await a.library.createPlaylist('First list');p.trackIds=['v2-0','v2-1','v2-2'];await a.library.putInStore('playlists',p);const second=await a.library.createPlaylist('Second list');window.v2Playlist=p.id;window.v2Second=second.id;a.ui.navigateTo({type:'playlist',id:p.id,title:p.name});});
}
for(const mobile of [false,true])test(`multi-playlist picker retains membership across search and creates inline (${mobile?'phone':'PC'})`,async({page})=>{
 await setup(page,mobile);
 await page.evaluate(async()=>{const {openPlaylistPicker}=await import('/js/playlist-actions.js');openPlaylistPicker(window.playerApp.ui,[window.playerApp.library.getTrackById('v2-0')]);});
 const picker=page.locator('.playlist-picker');await expect(picker.getByRole('checkbox',{name:'First list',exact:true})).toBeChecked();
 await picker.getByRole('checkbox',{name:'Second list',exact:true}).check();await picker.getByLabel('Найти плейлист',{exact:true}).fill('First');await picker.getByRole('checkbox',{name:'First list',exact:true}).uncheck();await picker.getByLabel('Найти плейлист',{exact:true}).fill('');
 await expect(picker.getByRole('checkbox',{name:'Second list',exact:true})).toBeChecked();
 await picker.getByLabel('Название нового плейлиста').fill('Created here');await picker.getByRole('button',{name:'Создать плейлист',exact:true}).click();await expect(picker.getByRole('checkbox',{name:'Created here',exact:true})).toBeChecked();await picker.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(picker).toHaveCount(0);
 expect(await page.evaluate(()=>{const a=window.playerApp;return {first:a.library.getPlaylistById(window.v2Playlist).trackIds,second:a.library.getPlaylistById(window.v2Second).trackIds,created:a.library.getPlaylists().find(p=>p.name==='Created here').trackIds};})).toEqual({first:['v2-1','v2-2'],second:['v2-0'],created:['v2-0']});
});
test('Ctrl and Shift select without playback, playlist removal can be undone alongside another addition',async({page})=>{
 await setup(page);await page.evaluate(()=>{window.played=[];window.playerApp.player.playTrack=(track)=>window.played.push(track.id);});
 await page.locator('.track-row[data-track-id="v2-0"] .track-name').click({modifiers:['Control']});await page.locator('.track-row[data-track-id="v2-2"] .track-name').click({modifiers:['Shift']});await expect(page.locator('.track-selected')).toHaveCount(3);expect(await page.evaluate(()=>window.played)).toEqual([]);
 await page.locator('.selection-remove').click();await expect(page.locator('.track-row')).toHaveCount(0);
 await page.evaluate(async()=>{const a=window.playerApp;await a.library.addTrackToPlaylist(window.v2Playlist,'v2-5');});await page.locator('.action-toast button').click();
 await expect(page.locator('.track-row')).toHaveCount(4);expect(await page.evaluate(()=>window.playerApp.library.getPlaylistById(window.v2Playlist).trackIds)).toEqual(['v2-5','v2-0','v2-1','v2-2']);
});
test('long press selects a phone row, suppresses its following click and leaves actions visible',async({page})=>{
 await setup(page,true);await page.evaluate(()=>{window.played=[];window.playerApp.player.playTrack=(track)=>window.played.push(track.id);});const row=page.locator('.track-row[data-track-id="v2-0"]');
 await row.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:3,clientX:80,clientY:400});await page.waitForTimeout(500);await row.dispatchEvent('pointerup',{pointerType:'touch',pointerId:3});await row.locator('.track-name').click();
 await expect(page.locator('.track-selected')).toHaveCount(1);await expect(page.locator('.selection-save')).toBeInViewport();expect(await page.evaluate(()=>window.played)).toEqual([]);
 await page.locator('.selection-cancel').click();await expect(page.locator('.track-selected')).toHaveCount(0);
});
test('composer adds a song and keyboard reorders without starting playback; order survives reopening',async({page})=>{
 await setup(page);await page.locator('.collection-add').click();await expect(page.locator('.playlist-composer')).toBeVisible();await page.locator('.playlist-composer').getByRole('button',{name:'Добавить: Fourth',exact:true}).click();await expect(page.locator('.track-row')).toHaveCount(4);
 await page.locator('.track-row[data-track-id="v2-3"]').focus();await page.keyboard.press('Control+Shift+ArrowUp');await expect.poll(()=>page.evaluate(()=>window.playerApp.library.getPlaylistById(window.v2Playlist).trackIds)).toEqual(['v2-0','v2-1','v2-3','v2-2']);
 await page.evaluate(()=>{const a=window.playerApp;a.ui.navigateTo({type:'home'});a.ui.navigateTo({type:'playlist',id:window.v2Playlist});});await expect(page.locator('.track-row .track-name')).toHaveText(['Signal','Second','Fourth','Third']);
 expect(await page.evaluate(()=>window.playerApp.player.currentTrack)).toBeNull();
});
test('search suggestions keep focus, choose by keyboard and dismiss without clearing the query',async({page})=>{
 await setup(page);const input=page.locator('#mainSearchInput');await input.fill('Sig');await expect(page.getByRole('listbox',{name:'Подсказки поиска'})).toBeVisible();await input.press('ArrowDown');await expect(input).toBeFocused();await expect(input).toHaveAttribute('aria-activedescendant','search-suggestion-0');await input.press('Enter');await expect(input).toHaveValue('Artist Signal');
 await input.fill('Sec');await input.press('Escape');await expect(page.locator('.search-suggestions')).toHaveCount(0);await expect(input).toHaveValue('Sec');
});
test('precise seek previews a smaller delta, commits once and Escape cancels',async({page})=>{
 await setup(page);await page.evaluate(()=>{const p=window.playerApp.player;p.currentTrack=window.playerApp.library.getTrackById('v2-0');p.getDuration=()=>200;p.getCurrentTime=()=>50;window.seekCalls=[];p.seek=value=>window.seekCalls.push(value);});
 const slider=page.locator('#progressSliderContainer'),b=await slider.boundingBox();await page.mouse.move(b.x+b.width*.25,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width*.75,b.y-70,{steps:4});await expect(slider).toHaveAttribute('data-fine-seek','true');expect(Number(await slider.getAttribute('aria-valuenow'))).toBeLessThan(70);expect(await page.evaluate(()=>window.seekCalls)).toEqual([]);await page.mouse.up();expect(await page.evaluate(()=>window.seekCalls.length)).toBe(1);
 await page.mouse.move(b.x+b.width*.3,b.y+2);await page.mouse.down();await page.mouse.move(b.x+b.width*.6,b.y+2);await page.keyboard.press('Escape');await page.mouse.up();expect(await page.evaluate(()=>window.seekCalls.length)).toBe(1);
});
test('manual queue groups clear independently and retain the current session',async({page})=>{
 await setup(page);await page.evaluate(()=>{const a=window.playerApp,p=a.player;p.currentTrack=a.library.getTrackById('v2-0');p.queue=a.library.getTracks().slice(0,3);p.originalQueue=[...p.queue];p.queueIndex=0;p.playbackContext={type:'playlist',title:'First list'};p.addToQueue(a.library.getTrackById('v2-4'));a.ui.openRightPanel('queue');});
 await expect(page.locator('.queue-origin-heading h3')).toHaveText(['Добавлено вами','Из «First list»']);await page.getByRole('button',{name:'Очистить добавленные вручную',exact:true}).click();await expect(page.locator('.queue-origin-heading h3')).toHaveText(['Из «First list»']);expect(await page.evaluate(()=>window.playerApp.player.queue.map(t=>t.id))).toEqual(['v2-0','v2-1','v2-2']);expect(await page.evaluate(()=>window.playerApp.player.currentTrack.id)).toBe('v2-0');
});
test('task sidebar resizes and remembers its width and selected task',async({page})=>{
 await setup(page);await page.evaluate(()=>window.playerApp.ui.openRightPanel('queue'));const separator=page.getByRole('separator',{name:'Ширина боковой панели'});await separator.focus();await separator.press('End');await expect(separator).toHaveAttribute('aria-valuenow','480');await page.reload();await page.waitForFunction(()=>window.playerApp?.ui.interfaceV2);await expect(page.locator('#rightPanel')).not.toHaveClass(/hidden/);await expect(separator).toHaveAttribute('aria-valuenow','480');await expect(page.locator('#rightPanelContent .queue-list')).toBeVisible();
});
for(const size of [{width:320,height:640},{width:390,height:844}])test(`phone full player exposes reachable controls at ${size.width}x${size.height}`,async({page},info)=>{
 await setup(page,true);await page.setViewportSize(size);await page.evaluate(()=>{const a=window.playerApp,p=a.player;p.currentTrack=a.library.getTrackById('v2-0');p.queue=a.library.getTracks();p.queueIndex=0;p.getDuration=()=>180;p.getCurrentTime=()=>30;a.ui.syncPlayerDisplay();});await page.locator('#mobileMiniPlayer').click();await expect(page.locator('#mobileFullscreenPlayer')).toHaveClass(/active/);
 for(const selector of ['#mobileFsSlider','.mobile-fs-play-btn','.mobile-output-row','#btnMobileFsQueue'])await expect(page.locator(selector)).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('full-player.png')});
});

test('artwork tint uses saved bytes and cover motion respects keyboard and reduced motion',async({page})=>{
 await setup(page);
 expect(await page.evaluate(async()=>{const {artworkTint,CoverTransition}=await import('/js/artwork-atmosphere.js'),canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='rgb(180,80,40)';ctx.fillRect(0,0,32,32);const pictureBlob=await new Promise(resolve=>canvas.toBlob(resolve));const tint=await artworkTint({pictureBlob});window.coverTest=new CoverTransition();for(const [id,left] of [['cover-a',20],['cover-b',200]]){const host=document.createElement('div');host.id=id;Object.assign(host.style,{position:'fixed',top:'150px',left:left+'px',width:'80px',height:'80px'});const img=new Image();img.src=canvas.toDataURL();await img.decode();host.append(img);document.body.append(host);}document.dispatchEvent(new PointerEvent('pointerdown'));window.coverTest.move(document.getElementById('cover-a'),document.getElementById('cover-b'));return tint;})).toBe('180 80 40');
 await expect(page.locator('.transitioning-artwork')).toHaveCount(1);await page.evaluate(()=>window.coverTest.cancel());await expect(page.locator('.transitioning-artwork')).toHaveCount(0);expect(await page.locator('#cover-b').evaluate(el=>el.style.visibility)).toBe('');
 await page.keyboard.press('Tab');await page.evaluate(()=>window.coverTest.move(document.getElementById('cover-a'),document.getElementById('cover-b')));await expect(page.locator('.transitioning-artwork')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{document.dispatchEvent(new PointerEvent('pointerdown'));window.coverTest.move(document.getElementById('cover-a'),document.getElementById('cover-b'));});await expect(page.locator('.transitioning-artwork')).toHaveCount(0);
});

test('inline download feedback follows pending work and offers retry after failure',async({page})=>{
 await setup(page);await page.evaluate(async()=>{const {decorateTrackState}=await import('/js/track-state.js'),a=window.playerApp;window.feedback=decorateTrackState;const track=a.library.getTrackById('v2-0');track.catalog=true;const row=document.querySelector('.track-row[data-track-id="v2-0"]');a.music.downloads.set(track.id,Promise.resolve());a.ui.experience.progressStates.set(track.id,{done:50,total:100});decorateTrackState(a.ui,row,track);});
 const status=page.locator('.track-row[data-track-id="v2-0"] .track-inline-state');await expect(status).toHaveAttribute('aria-busy','true');await expect(status).toHaveAttribute('aria-label','Сохранение: 50%');await expect(status.locator('.inline-spinner')).toHaveCount(1);
 await page.evaluate(()=>{const a=window.playerApp,track=a.library.getTrackById('v2-0');a.music.downloads.delete(track.id);a.ui.trackDownloadErrors.set(track.id,'Retry');window.feedback(a.ui,document.querySelector('.track-row[data-track-id="v2-0"]'),track);});await expect(status).toHaveAttribute('data-state','error');await expect(status).toBeEnabled();await expect(status).toHaveAttribute('aria-label','Не удалось сохранить. Повторить');
});

test('direct checkboxes and labels stay in sync with selected rows without starting playback',async({page})=>{
 await setup(page);await page.locator('.selection-entry').click();const row=page.locator('.track-row[data-track-id="v2-0"]'),box=row.locator('.track-select');await expect(box).toBeChecked();await box.uncheck();await expect(row).not.toHaveClass(/track-selected/);await expect(box).not.toBeChecked();await box.check();await expect(row).toHaveClass(/track-selected/);await expect(box).toBeChecked();expect(await page.evaluate(()=>window.playerApp.player.currentTrack)).toBeNull();
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Добавить выбранные треки в плейлисты',exact:true})).toBeVisible();
});

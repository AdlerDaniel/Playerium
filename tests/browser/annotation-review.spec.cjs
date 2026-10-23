const {test,expect}=require('@playwright/test');
async function ready(page,width=390){
 await page.setViewportSize({width,height:844});
 await page.route('https://api.github.com/**',r=>r.fulfill({json:{tag_name:'v1.7.50'}}));
 await page.route('https://aihorde.net/**',r=>r.fulfill({status:503,json:{}}));
 await page.addInitScript(()=>{
  localStorage.setItem('playerium_visual_density',JSON.stringify('compact'));
  localStorage.setItem('playerium_visual_waveform','true');
  localStorage.setItem('playerium_auto_update_check','false');
 });
 await page.goto('/');await page.waitForFunction(()=>window.playerApp?.albumArt);
 await page.evaluate(async()=>{
  const a=window.playerApp;a.albumArt.stop();
  for(let i=0;i<8;i++){const t={id:'review-'+i,title:'Song '+i,artist:'Artist '+i,duration:180,dateAdded:i,liked:true};a.library.tracks.set(t.id,t);await a.library.putInStore('tracks',t);}
  const p=await a.library.createPlaylist('Мой плейлист');p.trackIds=['review-0'];await a.library.putInStore('playlists',p);
  a.ui.renderSidebar();a.ui.refreshCurrentView();
 });
}
for(const width of [320,390,510])test(`annotation layout: aligned header, flat home and isolated dock at ${width}`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page,width);
 await expect(page.locator('.home-heading,.home-quick-section')).toHaveCount(0);
 await expect(page.locator('.shelf-heading')).not.toContainText(['Ваши исполнители']);
 const layout=await page.evaluate(()=>{
  const rect=n=>n.getBoundingClientRect(),avatar=rect(document.querySelector('.profile-avatar')),pill=rect(document.querySelector('.home-filters button')),feature=document.querySelector('.home-feature'),nav=document.querySelector('.mobile-nav-bar');
  return {centers:[avatar.y+avatar.height/2,pill.y+pill.height/2],backgrounds:['#mainTopbar','.main-view-container','.main-view','.home-dashboard'].map(s=>getComputedStyle(document.querySelector(s)).backgroundColor),feature:{gradient:getComputedStyle(feature).backgroundImage,border:getComputedStyle(feature).borderTopWidth,radius:getComputedStyle(feature).borderRadius},dock:{...rect(nav).toJSON(),gradient:getComputedStyle(nav).backgroundImage,radius:parseFloat(getComputedStyle(nav).borderRadius),mask:getComputedStyle(nav).maskImage},targets:[...nav.querySelectorAll('button')].map(b=>({w:rect(b).width,h:rect(b).height,opacity:getComputedStyle(b).opacity})),overflow:document.documentElement.scrollWidth>innerWidth};
 });
 expect(Math.abs(layout.centers[0]-layout.centers[1])).toBeLessThan(1);
 expect(new Set(layout.backgrounds).size).toBe(1);expect(layout.feature).toEqual({gradient:'none',border:'0px',radius:'0px'});
 expect(layout.dock.gradient).toBe('none');expect(layout.dock.mask).toBe('none');expect(layout.dock.radius).toBeGreaterThan(16);expect(layout.dock.x).toBe(12);expect(layout.dock.right).toBe(width-12);expect(layout.overflow).toBe(false);
 for(const t of layout.targets){expect(t.w).toBeGreaterThanOrEqual(44);expect(t.h).toBeGreaterThanOrEqual(44);expect(t.opacity).toBe('1');}
 await page.evaluate(()=>{const a=window.playerApp;a.player.currentTrack=a.library.getTracks()[0];a.ui.syncPlayerDisplay();});
 await expect(page.locator('#mobileMiniPlayer')).toBeVisible();await expect(page.locator('#mobileMiniLike,.mini-output-label,#btnMobileFsEq,#btnMobileFsLike,#btnPlayerLike')).toHaveCount(0);
 await expect.poll(async()=>{const mini=await page.locator('#mobileMiniPlayer').boundingBox(),nav=await page.locator('.mobile-nav-bar').boundingBox();return mini.y+mini.height<nav.y;}).toBe(true);
 expect((await page.locator('#mobileMiniPlayer').boundingBox()).height).toBe(64);
 await page.screenshot({path:info.outputPath('review-home.png')});expect(errors).toEqual([]);
});
test('removed settings stay fixed with old preferences; titles are inside cards and normalization still reports actions',async({page},info)=>{
 await ready(page);await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'settings'}));
 await expect(page.locator('#settingsEqToggle,#settingsEqPreset,#settingsTrackDensity,#settingsWaveform,#settingsAutoUpdateToggle,.visual-options')).toHaveCount(0);
 expect(await page.locator('.settings-section-title').evaluateAll(nodes=>nodes.every(n=>n.parentElement.classList.contains('settings-card')))).toBe(true);
 await expect(page.locator('.normalization-settings button')).toHaveCount(2);await expect(page.locator('.normalization-settings p:visible')).toHaveCount(0);
 expect(await page.evaluate(()=>window.playerApp.ui.updater.autoCheckEnabled)).toBe(true);
 await page.screenshot({path:info.outputPath('review-settings.png')});
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
 expect(await page.locator('.track-row').first().evaluate(n=>n.getBoundingClientRect().height)).toBe(64);
 await expect(page.locator('.track-like-btn')).toHaveCount(0);await expect(page.locator('.audio-waveform:visible')).toHaveCount(0);
 await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'liked'}));expect(await page.evaluate(()=>window.playerApp.ui.currentView.type)).toBe('allTracks');await expect(page.locator('.track-row')).toHaveCount(8);
});
test('search starts with a single field and microphone; browser speech fills a working search and cancels on navigation',async({page},info)=>{
 await ready(page);await page.evaluate(()=>{window.SpeechRecognition=class{constructor(){window.speech=this;}start(){window.speechStarts=(window.speechStarts||0)+1;}abort(){window.speechAborts=(window.speechAborts||0)+1;}};window.playerApp.ui.navigateTo({type:'search'});});
 await expect(page.locator('.mobile-search-view h1,.mobile-search-categories,.search-recent,.search-back')).toHaveCount(0);await expect(page.locator('.mobile-search-clear')).toBeHidden();
 await expect(page.getByRole('button',{name:'Голосовой поиск',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.speechStarts||0)).toBe(0);await page.screenshot({path:info.outputPath('review-search.png')});
 await page.getByRole('button',{name:'Голосовой поиск',exact:true}).click();await expect(page.getByRole('button',{name:'Остановить голосовой поиск'})).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>window.speech.onresult({results:[[{transcript:'Song 3'}]]}));await expect(page.locator('.mobile-search-input')).toHaveValue('Song 3');await expect(page.locator('.track-name')).toContainText(['Song 3']);
 await page.getByRole('button',{name:'Голосовой поиск',exact:true}).click();await page.locator('#mobileNavHome').click();expect(await page.evaluate(()=>window.speech.onresult)).toBe(null);
});
test('Android voice result survives the page becoming visible and unsupported recognition preserves typed input',async({page})=>{
 await ready(page);await page.evaluate(()=>{window.AndroidBridge={startVoiceSearch(){window.voiceOpened=true;}};window.playerApp.ui.navigateTo({type:'search'});});
 await page.getByRole('button',{name:'Голосовой поиск',exact:true}).click();
 await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new CustomEvent('playerium-voice-result',{detail:{text:'Song 4'}}));});
 await expect(page.locator('.mobile-search-input')).toHaveValue('Song 4');
 await page.getByRole('button',{name:'Голосовой поиск',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('playerium-voice-result',{detail:{error:'На устройстве недоступен голосовой ввод.'}})));
 await expect(page.locator('.mobile-search-input')).toHaveValue('Song 4');await expect(page.getByRole('button',{name:'Голосовой поиск',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.locator('.toast.error')).toContainText('недоступен');
});

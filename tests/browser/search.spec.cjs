const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function setup(page,mobile){
  if(mobile)await page.setViewportSize({width:390,height:844});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://covers.example.test/**',route=>route.request().url().endsWith('/missing.jpg')?route.fulfill({status:404}):route.fulfill({contentType:'image/svg+xml',body:fs.readFileSync('assets/icon.svg')}));
  await page.addInitScript(()=>{
    localStorage.setItem('playerium_auto_update_check','false');window.musicCalls=[];window.cspViolations=[];
    document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push({directive:e.violatedDirective,url:e.blockedURI}));
    window.electronAPI={musicRequest:async(op,payload)=>{
      window.musicCalls.push({op,payload});
      if(op==='restore')return [];
      if(op==='catalog'&&payload.provider==='itunes')return {results:Array.from({length:6},(_,i)=>({trackName:['Tenke','Aurora Centralis','Mystery of Pain (Original Mix)','Astero Ceras','Heavens Arena (Original Mix)','Pangea'][i],artistName:'747',collectionName:'Tenke',trackTimeMillis:452000,releaseDate:'2019-01-01',artworkUrl100:'https://covers.example.test/cover.jpg'}))};
      if(op==='catalog'&&payload.provider==='audius'){await new Promise(r=>setTimeout(r,1400));return {data:[{title:'Tenke',user:{name:'747'},duration:452,permalink:'/rchan747/tenke-355245',artwork:{'480x480':'https://covers.example.test/fallback.jpg'}}]};}
      if(op==='catalog')return payload.provider==='bandcamp'?'':{};
      if(op==='search')throw Error('HTTP 403');
      if(op==='download'){if(window.failDownload)throw Error('Аудиосервис ограничил доступ к этой записи. Попробуйте другую сеть или VPN.');return {name:'Tenke.mp3',fullPath:'/Music/Tenke.mp3',folderSource:'/Music',folderName:'Music',downloadId:'song_ab12',size:100,lastModified:1,metadata:{title:'Tenke',artist:'747',album:'Tenke',duration:452}};}
    },getMetadata:async()=>({}),getAudioSource:async()=>'',watchFolder:async()=>[],onFolderUpdated:()=>{}};
  });
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  if(mobile)await page.locator('#mobileNavSearch').click();else await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'search',title:'Поиск'}));
  return errors;
}
for(const mobile of [false,true])test(`search covers before audio, filters and functional nested menus on ${mobile?'phone':'desktop'}`,async({page},testInfo)=>{
  const errors=await setup(page,mobile),input=page.locator(mobile?'.mobile-search-input':'#mainSearchInput');
  await input.fill('747');await expect(page.locator('.song-search-results .track-row')).toHaveCount(4);
  const covers=page.locator('.song-search-results .track-mini-thumb img');await expect.poll(()=>covers.first().evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>window.musicCalls.some(c=>c.op==='download'))).toBe(false);
  expect(await page.evaluate(()=>window.cspViolations.filter(e=>e.directive.startsWith('img-src')))).toEqual([]);
  await page.getByRole('tab',{name:'Песни',exact:true}).click();await expect(page.locator('.song-search-results .track-row')).toHaveCount(6);
  await page.locator('.track-row .track-menu-btn').first().click();
  const menu=page.locator(mobile?'.track-options-sheet':'#appContextMenu');await expect(menu).toBeVisible();
  await page.locator(mobile?'#sheetOptCredits':'#ctxCredits').click();await expect(menu).toContainText('2019');await expect(menu).toContainText('747');
  await page.locator('#trackMenuBack').click();
  await page.locator(mobile?'#sheetOptAddToPlaylist':'#ctxAddToPlaylist').click();await expect(menu).toContainText('Новый плейлист');
  await page.locator('#trackMenuBack').click();
  await page.screenshot({path:testInfo.outputPath('search-menu.png')});
  await page.keyboard.press('Escape');await expect(menu).toBeHidden();
  // Simulate a blocked primary cover and exercise the merged HTTPS fallback.
  await page.evaluate(async()=>{const {mountCover}=await import('/js/artwork.js');mountCover(document.querySelector('.track-mini-thumb'),{pictureUrl:'https://covers.example.test/missing.jpg',pictureUrls:['https://covers.example.test/fallback.jpg']},true);});
  await expect(page.locator('.track-mini-thumb img').first()).toHaveAttribute('src','https://covers.example.test/fallback.jpg');await expect.poll(()=>page.locator('.track-mini-thumb img').first().evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(async()=>{const p=await window.playerApp.library.createPlaylist('Test playlist');window.testPlaylist=p.id;});
  await page.locator('.track-row .track-menu-btn').first().click();await page.locator(mobile?'#sheetOptAddToPlaylist':'#ctxAddToPlaylist').click();await menu.getByRole(mobile?'button':'menuitem',{name:'Test playlist',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.playerApp.library.getPlaylistTracks(window.testPlaylist).length)).toBe(1);
  expect(await page.evaluate(()=>window.musicCalls.filter(c=>c.op==='download').length)).toBe(1);
  expect(errors).toEqual([]);
});
test('mobile raw query preserves spaces, focus and readable text during partial results; swipe closes sheet',async({page},testInfo)=>{
  const errors=await setup(page,true);
  const input=page.locator('.mobile-search-input');
  const emptyColors=await input.evaluate(el=>({text:getComputedStyle(el).color,background:getComputedStyle(el.parentElement).backgroundColor}));expect(emptyColors.text).toBe('rgb(17, 37, 27)');expect(emptyColors.background).toBe('rgb(234, 248, 238)');
  await input.pressSequentially('747 Tenke',{delay:50});await expect(input).toHaveValue('747 Tenke');await expect(input).toBeFocused();
  await expect(page.locator('.song-search-results .track-row')).toHaveCount(1);
  await page.waitForTimeout(1700);await expect(input).toBeFocused();
  const activeColors=await input.evaluate(el=>({text:getComputedStyle(el).color,background:getComputedStyle(el.parentElement).backgroundColor}));expect(activeColors.text).toBe('rgb(234, 248, 238)');expect(activeColors.background).toBe('rgb(30, 58, 43)');
  await page.screenshot({path:testInfo.outputPath('search-phone.png')});
  await page.locator('.track-menu-btn').first().click();const handle=page.locator('.mobile-sheet-handle');await handle.hover();const box=await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+100,{steps:6});await page.mouse.up();
  await expect(page.locator('.track-options-sheet')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('failed downloads show a readable alert, leave no saved track and restore the download button',async({page})=>{
  await setup(page,true);await page.locator('.mobile-search-input').fill('747 Tenke');await expect(page.locator('.track-row')).toHaveCount(1);
  await page.evaluate(()=>window.failDownload=true);await page.locator('.track-download-btn').click();await expect(page.getByRole('alert')).toContainText('ограничил доступ');
  await expect(page.locator('.track-download-btn')).toBeEnabled();expect(await page.evaluate(()=>window.playerApp.library.getTracks().length)).toBe(0);
});
test('Дорофеева 747 shows its catalog cover before a song has been downloaded',async({page})=>{
  await setup(page,true);
  await page.evaluate(()=>{const original=window.electronAPI.musicRequest;window.electronAPI.musicRequest=async(op,p)=>op==='catalog'&&p.provider==='itunes'?{results:[{trackName:'747',artistName:'DOROFEEVA',trackTimeMillis:173963,artworkUrl100:'https://covers.example.test/747.jpg'}]}:original(op,p);});
  await page.locator('.mobile-search-input').fill('Дорофеева 747');await expect(page.locator('.song-search-results .track-row')).toHaveCount(1);await expect(page.locator('.track-name')).toHaveText('747');await expect(page.locator('.track-artist')).toHaveText('DOROFEEVA');
  await expect.poll(()=>page.locator('.track-mini-thumb img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);expect(await page.evaluate(()=>window.musicCalls.some(c=>c.op==='download'))).toBe(false);
});

for(const mobile of [false,true])test(`artist profile, guest credits, popularity without collection navigation on ${mobile?'phone':'desktop'}`,async({page})=>{
  const errors=await setup(page,mobile);
  await page.evaluate(()=>{
    const original=window.electronAPI.musicRequest;
    const track=(title,rank,artist='DOROFEEVA')=>({title,rank,duration:180,artist:{id:1,name:artist},album:{title:'Album',cover_big:'https://covers.example.test/artist.jpg'},contributors:artist==='Guest'?[{id:1,name:'DOROFEEVA'},{id:2,name:'Guest'}]:[]});
    window.electronAPI.musicRequest=async(op,p)=>{
      if(op==='catalog'){
        if(p.provider==='deezerArtists')return {data:[{id:1,name:'DOROFEEVA',picture_big:'https://covers.example.test/artist.jpg',nb_fan:100}]};
        if(p.provider==='itunesArtists')return {results:[{artistId:123,artistName:'DOROFEEVA'}]};
        if(p.provider==='itunesArtistAlbums')return {results:[{collectionId:456,collectionName:'Full Album',artistName:'DOROFEEVA',releaseDate:'2025-01-01',artworkUrl100:'https://covers.example.test/artist.jpg'}]};
        if(p.provider==='itunesArtistTracks')return {results:p.query==='456'?[{trackName:'Album track',artistName:'DOROFEEVA',collectionName:'Full Album',trackTimeMillis:180000,trackNumber:1}]:[]};
        if(p.provider==='deezer'||p.provider==='deezerArtistTop')return {data:[track('Rare song',100),track('Hit song',900000),track('Together (feat. DOROFEEVA)',500000,'Guest'),track('Unrelated',999999,'Other')]};
        return {};
      }
      return original(op,p);
    };
  });
  await page.locator(mobile?'.mobile-search-input':'#mainSearchInput').fill('DOROFEEVA');
  await expect(page.locator('.search-compact-table .track-name').first()).toHaveText('Hit song');
  await page.getByRole('tab',{name:'Исполнители',exact:true}).click();await page.locator('.search-entity-card.artists').filter({hasText:'DOROFEEVA'}).click();
  await expect(page.locator('.artist-profile .view-title')).toHaveText('DOROFEEVA');
  await expect(page.locator('.artist-profile .track-name').first()).toHaveText('Hit song');
  await expect(page.locator('.artist-profile')).toContainText('Совместные записи');await expect(page.locator('.artist-profile')).not.toContainText('Unrelated');
  await expect(page.locator('.artist-discography')).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Альбомы',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>window.musicCalls.some(c=>c.op==='download'))).toBe(false);expect(errors).toEqual([]);
});

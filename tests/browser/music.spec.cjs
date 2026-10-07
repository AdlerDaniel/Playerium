const {test,expect}=require('@playwright/test');
for(const android of [false,true])test(`search, save, metadata persistence and deletion on ${android?'Android':'Windows'}`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));if(android)await page.setViewportSize({width:390,height:844});
  await page.addInitScript(android=>{
    localStorage.setItem('playerium_auto_update_check','false');window.musicCalls=[];
    const metadata={title:'Повільне диско',artist:'KLER x OTOY',album:'Повільне диско',duration:253,year:'2026',genre:'Pop',trackNo:1,isrc:'XX1234567890'};
    const record={name:'KLER - Повільне диско.m4a',size:100,lastModified:1,metadata,downloadId:'song_fixture',folderName:'Music',folderSource:android?'content://music/tree':'/Music',...(android?{uri:'content://music/song'}:{fullPath:'/Music/song.m4a'})};
    const request=async(operation,payload)=>{
      window.musicCalls.push({operation,payload});
      if(operation==='restore')return localStorage.getItem('music_fixture')?[record]:[];
      if(operation==='delete'){localStorage.removeItem('music_fixture');return true;}
      if(operation==='download'){await new Promise(r=>setTimeout(r,80));localStorage.setItem('music_fixture','true');return record;}
      if(operation==='catalog')return payload.provider.startsWith('itunes')?{results:[{trackName:metadata.title,artistName:metadata.artist,collectionName:metadata.album,trackTimeMillis:253000,releaseDate:'2026-01-01',trackNumber:1}]}:payload.provider==='bandcamp'?'':{};
      return {entries:[{id:'abcdefghijk',title:'Повільне диско',artist:'KLER x OTOY',album:metadata.album,duration:253,webpage_url:'https://www.youtube.com/watch?v=abcdefghijk'},
        {id:'bbbbbbbbbbb',title:'Повільне диско (Live)',artist:'KLER x OTOY',duration:253,webpage_url:'https://www.youtube.com/watch?v=bbbbbbbbbbb'}]};
    };
    if(android)window.AndroidBridge={musicRequest:(id,operation,json)=>{request(operation,JSON.parse(json)).then(data=>window.onMusicResponse({id,data}));},getPlaybackState:()=> '{}',setPlaybackQueue:()=>{},rescanFolder:()=>{}};
    else window.electronAPI={musicRequest:request,getMetadata:async()=>metadata,onFolderUpdated:()=>{},watchFolder:async()=>[],getAudioSource:async()=>''};
  },android);
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  if(android){await page.locator('#mobileNavSearch').click();await page.locator('.mobile-search-input').fill('KLER Повільне диско');}
  else await page.locator('#mainSearchInput').fill('KLER Повільне диско');
  const results=page.locator('.song-search-results');await expect(results.locator('.track-row')).toHaveCount(1);
  await expect(results).not.toContainText(/YouTube|SoundCloud|интернет|источник/i);
  await results.locator('.track-download-btn').click();
  await expect.poll(()=>page.evaluate(()=>window.playerApp.library.getTracks().length)).toBe(1);
  await expect(results.locator('.track-download-btn')).toHaveCount(0);
  const metadata=await page.evaluate(()=>{const t=window.playerApp.library.getTracks()[0];return {title:t.title,artist:t.artist,album:t.album,genre:t.genre,isrc:t.isrc};});
  expect(metadata).toEqual({title:'Повільне диско',artist:'KLER x OTOY',album:'Повільне диско',genre:'Pop',isrc:'XX1234567890'});
  expect(await page.evaluate(()=>window.musicCalls.filter(c=>c.operation==='download').length)).toBe(1);
  await page.reload();await page.waitForFunction(()=>window.playerApp?.library.getTracks().length===1);
  await page.evaluate(()=>window.playerApp.ui.navigateTo({type:'allTracks',title:'Добавленные'}));
  await page.locator('.track-row .track-menu-btn').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator(android?'#sheetOptSaveOrRemove':'#ctxSaveOrRemove').click();
  await expect.poll(()=>page.evaluate(()=>window.playerApp.library.getTracks().length)).toBe(0);
  await page.reload();await page.waitForFunction(()=>window.playerApp?.library.db);expect(await page.evaluate(()=>window.playerApp.library.getTracks().length)).toBe(0);
  expect(errors).toEqual([]);
});

for(const android of [false,true])test(`Muzend merges with catalog metadata and supplies the full song on ${android?'Android':'Windows'}`,async({page})=>{
  await page.addInitScript(android=>{
    localStorage.setItem('playerium_auto_update_check','false');window.musicCalls=[];
    const request=async(operation,payload)=>{
      window.musicCalls.push({operation,payload});
      if(operation==='restore')return [];
      if(operation==='catalog'&&payload.provider==='muzend')return `<div data-track="https://muzend.net/uploads/music/2026/08/Dorofeeva_747.mp3" data-title="747" data-artist="Dorofeeva"><div class="track-time">2:54</div></div><div data-track="https://evil.test/audio.mp3" data-title="747" data-artist="Dorofeeva"></div><div data-track="https://muzend.net/uploads/music/remix.mp3" data-title="747 (Remix)" data-artist="Dorofeeva"><div class="track-time">3:04</div></div>`;
      if(operation==='catalog'&&payload.provider.startsWith('itunes'))return {results:[{trackName:'747',artistName:'DOROFEEVA',collectionName:'747 - Single',trackTimeMillis:173963,releaseDate:'2026-08-06',trackNumber:1}]};
      if(operation==='catalog')return payload.provider==='bandcamp'?'':{};
      if(operation==='search')throw Error('Аудиосервис ограничил доступ');
      if(operation==='download')return {name:'DOROFEEVA - 747.mp3',size:7041785,lastModified:1,downloadId:payload.track.id,metadata:{title:payload.track.title,artist:payload.track.artist,album:payload.track.album,duration:174},folderName:'Playerium',folderSource:android?'playerium-music':'/Music',...(android?{uri:'content://music/747'}:{fullPath:'/Music/747.mp3'})};
    };
    if(android)window.AndroidBridge={musicRequest:(id,op,json)=>request(op,JSON.parse(json)).then(data=>window.onMusicResponse({id,data}),error=>window.onMusicResponse({id,error:error.message})),getPlaybackState:()=>'{}',setPlaybackQueue:()=>{}};
    else window.electronAPI={musicRequest:request,getMetadata:async()=>({}),onFolderUpdated:()=>{}};
  },android);
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db);
  if(android){await page.setViewportSize({width:390,height:844});await page.locator('#mobileNavSearch').click();await page.locator('.mobile-search-input').fill('Дорофеева 747');}
  else await page.locator('#mainSearchInput').fill('Дорофеева 747');
  const rows=page.locator('.song-search-results .track-row');await expect(rows).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>window.musicCalls.some(c=>c.operation==='catalog'&&c.payload.provider==='muzend'))).toBe(true);
  await rows.locator('.track-download-btn').click();
  await expect.poll(()=>page.evaluate(()=>window.playerApp.library.getTracks().length)).toBe(1);
  const result=await page.evaluate(()=>({track:window.playerApp.library.getTracks()[0],sources:window.musicCalls.find(c=>c.operation==='download').payload.track.sources}));
  expect(result.track.title).toBe('747');expect(result.track.album).toBe('747 - Single');
  expect(result.sources).toHaveLength(1);expect(result.sources[0].provider).toBe('muzend');expect(result.sources[0].official).toBe(false);
  await expect(page.locator('.song-search-results')).not.toContainText(/Muzend|источник|интернет/i);
});

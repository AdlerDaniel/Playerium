const {test,expect}=require('@playwright/test');
test('direct catalogs retain exact recordings, durations and reject off-site files and sidebar suggestions',async({page})=>{
  await page.goto('/');
  const results=await page.evaluate(async()=>{
    const {catalogTracks}=await import('/js/music-catalog.js');
    return {
      musify:catalogTracks('musify',`<div class="tracklist__row" data-artist="Nirvana" data-name="About A Girl (Live)"><button data-url="/track/pl/123/nirvana-about-a-girl-live.mp3"></button><span data-duration="3:38"></span></div><div class="tracklist__row" data-artist="Nirvana" data-name="Song"><button data-url="https://evil.test/song.mp3"></button></div>`),
      topmusicua:catalogTracks('topmusicua',`<main><div class="music"><span class="ua-play" data-src="/uploads/files/2025-07/song.mp3" data-title="Саша Чемеров - Згоривниз"></span><table class="info"><tr><td>2:35</td></tr></table></div><aside><span class="ua-play" data-src="/uploads/files/unrelated.mp3" data-title="Other - Suggested"></span></aside><span class="ua-play" data-src="https://evil.test/song.mp3" data-title="Other - Song"></span></main>`),
      miyzvuk:catalogTracks('miyzvuk',['https://miyzvuk.net/uploads/public_files/2024-11/song.mp3','https://evil.test/song.mp3','https://miyzvuk.net/private/song.mp3'].map(url=>`<div data-src="/engine/go.php?url=${encodeURIComponent(btoa(url))}&amp;user_id=" data-title="ОМГ (Оболонь - Мінська - Героїв Дніпра)" data-subtitle="діти інженерів" data-duration="03:06"></div>`).join(''))
    };
  });
  expect(results.musify).toHaveLength(1);expect(results.musify[0].title).toBe('About A Girl (Live)');expect(results.musify[0].duration).toBe(218);
  expect(results.musify[0].sources[0].provider).toBe('musify');expect(results.musify[0].official).toBe(false);
  expect(results.topmusicua).toHaveLength(1);expect(results.topmusicua[0].duration).toBe(155);expect(results.topmusicua[0].title).toBe('Згоривниз');
  expect(results.miyzvuk).toHaveLength(1);expect(results.miyzvuk[0].duration).toBe(186);expect(results.miyzvuk[0].artist).toBe('діти інженерів');
});
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
  await page.reload();await page.waitForFunction(()=>window.playerApp?.library.getTracks().length===1&&window.playerApp.ui.history.length>0);
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

test('Android restores relocated downloads before rebuilding its paused playback queue',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('playerium_auto_update_check','false');window.nativeQueues=[];window.restoreFinished=false;
    window.AndroidBridge={
      musicRequest:(id,operation)=>setTimeout(()=>{
        const file=JSON.parse(localStorage.getItem('relocated_fixture')||'null');
        window.restoreFinished=true;window.onMusicResponse({id,data:operation==='restore'?(file?[file]:[]):file});
      },80),
      getPlaybackState:()=>localStorage.getItem('playback_fixture')||'{}',
      setPlaybackQueue:json=>window.nativeQueues.push({ready:window.restoreFinished,...JSON.parse(json)})
    };
  });
  await page.goto('/');await page.waitForFunction(()=>window.playerApp?.library.db&&window.restoreFinished);
  const expected=await page.evaluate(async()=>{
    const lib=window.playerApp.library;
    const old={name:'Artist - Song [ab12].mp3',uri:'content://music/old.mp3',folderName:'Music',folderSource:'content://music/tree',size:100,lastModified:1,downloadId:'song_ab12',metadata:{title:'Song',artist:'Artist',duration:120}};
    const track=await lib.addDownloaded(old,null);await lib.toggleLike(track.id);
    const playlist=await lib.createPlaylist('Saved');await lib.addTrackToPlaylist(playlist.id,track.id);
    localStorage.setItem('relocated_fixture',JSON.stringify({...old,uri:'content://music/PlayeriumDownloads/song.mp3',previousUri:old.uri}));
    localStorage.setItem('playback_fixture',JSON.stringify({queue:[track.id],id:track.id,index:0,playing:false,position:42000,duration:120000}));
    return {id:track.id,playlist:playlist.id};
  });
  await page.reload();await page.waitForFunction(()=>window.nativeQueues.length>0);
  const result=await page.evaluate(playlist=>({tracks:window.playerApp.library.getTracks(),playlist:window.playerApp.library.getPlaylistTracks(playlist).map(t=>t.id),queue:window.nativeQueues.at(-1),time:window.playerApp.player.getCurrentTime()}),expected.playlist);
  expect(result.tracks).toHaveLength(1);expect(result.tracks[0].id).toBe(expected.id);expect(result.tracks[0].liked).toBe(true);
  expect(result.playlist).toEqual([expected.id]);expect(result.queue.ready).toBe(true);expect(result.queue.play).toBe(false);expect(result.queue.reset).toBe(false);
  expect(result.queue.tracks[0].uri).toBe('content://music/PlayeriumDownloads/song.mp3');expect(result.time).toBe(42);
});

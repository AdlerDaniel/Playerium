const {test}=require('node:test');const assert=require('node:assert/strict');
const {indexedDB}=require('fake-indexeddb');
test('one original recording combines providers, metadata and offline copy without covers or clips',async()=>{
  const {mergeSongs,audioCandidate}=await import('../js/music-match.js');
  const official=audioCandidate({id:'abcdefghijk',title:'Повільне диско',artist:'KLER x OTOY',duration:253,uploader:'KLER - Topic'},'youtubeMusic');
  const other=audioCandidate({url:'https://soundcloud.com/kler/track',title:'KLER & OTOY — Повільне диско',uploader:'KLER',duration:252,release_timestamp:1788998400},'soundcloud');
  const metadata={title:'Повільне диско',artist:'KLER, OTOY',album:'Повільне диско',duration:253,metadataScore:3,pictureUrl:'https://cover.example/album.jpg',sources:[],catalog:true};
  const cover={...official,title:'Повільне диско (cover)',rawTitle:'Повільне диско (cover)',artist:'Somebody'};
  const clip={...official,rawTitle:'KLER - Повільне диско (Official Music Video)'};
  const rows=mergeSongs([[official,other,cover,clip],[metadata]],'KLER Повільне диско');
  assert.equal(rows.length,1);assert.equal(rows[0].sources.length,2);assert.equal(rows[0].album,metadata.album);assert.equal(rows[0].pictureUrl,metadata.pictureUrl);
  assert.match(rows[0].artist,/OTOY/);
  assert.match(mergeSongs([[official,{...metadata,artist:'KLER'}]],'KLER Повільне диско')[0].artist,/OTOY/);
  const local={id:'saved',title:'Повільне диско',artist:'KLER x OTOY',duration:253};
  const saved=mergeSongs([[official,metadata]],'KLER Повільне диско',[local]);assert.equal(saved.length,1);assert.equal(saved[0].id,'saved');assert.equal(saved[0].catalog,false);
});
test('repost titles cannot claim another performer as the recording author',async()=>{
  const {audioCandidate}=await import('../js/music-match.js');
  assert.equal(audioCandidate({title:'KLER & OTOY — Повільне диско',artists:['Ukrainian Music'],uploader:'Ukrainian Music',url:'https://soundcloud.com/repost/song'},'soundcloud'),null);
  assert.equal(audioCandidate({title:'Kevin Macleod Monkeys Spinning Monkeys',artists:['Other'],uploader:'Other',url:'https://soundcloud.com/repost/song'},'soundcloud'),null);
});
test('different performers and different recordings are not collapsed',async()=>{
  const {mergeSongs,isVariant}=await import('../js/music-match.js');
  assert.equal(isVariant('Live Forever'),false);assert.equal(isVariant('Long Live'),false);assert.equal(isVariant('Song (Live)'),true);
  const one={title:'Storm',artist:'GENER8ION',duration:210,sources:[]};
  const rows=mergeSongs([[one,{...one,artist:'Other'},{...one,duration:420}]],'Storm');assert.equal(rows.length,3);
});
test('removed song and playlist references stay removed after watcher events and database reopen',async()=>{
  global.indexedDB=indexedDB;global.window={};
  const {Library}=await import('../js/library.js');const lib=new Library();await lib.init();await lib.clearAll();lib.blockedSources.clear();
  const file={name:'song.opus',uri:'content://music/song',size:12,lastModified:1,metadata:{title:'Song',artist:'Artist',album:'Album',duration:120}};
  await lib.syncFolderToPlaylist('Music','content://music/tree',[file],true);const track=lib.getTracks()[0];
  const playlist=await lib.createPlaylist('Saved');await lib.addTrackToPlaylist(playlist.id,track.id);
  await lib.removeTrack(track.id);await lib.syncFolderToPlaylist('Music','content://music/tree',[file],true);
  assert.equal(lib.getTracks().length,0);assert.deepEqual(lib.getPlaylistTracks(playlist.id),[]);
  const reopened=new Library();await reopened.init();await reopened.syncFolderToPlaylist('Music','content://music/tree',[file],true);assert.equal(reopened.getTracks().length,0);
  await reopened.addDownloaded({...file,downloadId:'song_a123',folderName:'Music',folderSource:'content://music/tree'},null);
  assert.equal(reopened.getTracks().length,1);assert.equal(reopened.getTracks()[0].downloadId,'song_a123');
  assert.deepEqual(reopened.getPlaylistTracks(playlist.id),[]);
});
test('native requests cannot turn a catalog search into arbitrary file/network access',()=>{
  const {sourceURL,catalogURL}=require('../desktop-music');
  for(const url of ['file:///C:/secret','https://localhost/audio','https://soundcloud.com.evil.test/a','https://user:pass@youtube.com/a'])assert.throws(()=>sourceURL(url));
  assert.throws(()=>catalogURL('https://evil.test','song'));
  assert.ok(sourceURL('https://artist.bandcamp.com/track/song'));
});

test('catalog-only songs download through Audius when video services are unavailable, with duplicate clicks coalesced',async()=>{
  global.window={};global.document={querySelectorAll:()=>[]};global.DOMParser=class {parseFromString(){return {querySelectorAll:()=>[]};}};
  const calls=[];window.electronAPI={musicRequest:async(operation,payload)=>{
    calls.push({operation,payload});
    if(operation==='catalog'&&payload.provider==='audius')return {data:[{title:'Tenke',user:{name:'747'},duration:452,permalink:'/rchan747/tenke-355245'},{title:'Tenke',user:{name:'Repost'},duration:452,permalink:'/repost/tenke'}]};
    if(operation==='catalog')return '';
    if(operation==='search')throw Error('HTTP 403');
    if(operation==='download'){await new Promise(r=>setTimeout(r,20));return {name:'Tenke.mp3'};}
  }};
  const {MusicCatalog}=await import('../js/music-catalog.js');
  const song={id:'song_ab12',title:'Tenke',artist:'747',duration:452,catalog:true,sources:[]};let writes=0;
  const lib={getTracks:()=>[],folders:[],addDownloaded:async()=>{writes++;return {...song,catalog:false};}};
  const catalog=new MusicCatalog(lib,{renderSidebar:()=>{}});
  const [a,b]=await Promise.all([catalog.ensureTrack(song),catalog.ensureTrack(song)]);
  assert.equal(a,b);assert.equal(writes,1);assert.equal(calls.filter(c=>c.operation==='download').length,1);
  assert.equal(calls.filter(c=>c.operation==='search').length,0);
  assert.deepEqual(calls.find(c=>c.operation==='download').payload.track.sources.map(s=>s.url),['https://audius.co/rchan747/tenke-355245']);
});
test('unreachable sources are not retried after discovery and storage errors stop fallback',async()=>{
  global.window={};global.document={querySelectorAll:()=>[]};global.DOMParser=class {parseFromString(){return {querySelectorAll:()=>[]};}};
  const {MusicCatalog}=await import('../js/music-catalog.js');
  const lib={getTracks:()=>[],folders:[],addDownloaded:async()=>assert.fail('failed download must not enter library')};
  const song={id:'song_ab13',title:'Tenke',artist:'747',duration:452,catalog:true,sources:[{provider:'youtubeMusic',url:'https://www.youtube.com/watch?v=abcdefghijk'}]};
  let attempts=0;window.electronAPI={musicRequest:async(op,p)=>{if(op==='catalog')return p.provider==='bandcamp'?'':{};if(op==='search')return {entries:[{title:'Tenke',artist:'747',duration:452,webpage_url:song.sources[0].url}]};attempts++;throw Error('Аудиосервис ограничил доступ к этой записи.');}};
  const catalog=new MusicCatalog(lib,{renderSidebar:()=>{}});await assert.rejects(catalog.ensureTrack(song),/ограничил доступ/);assert.equal(attempts,1);assert.equal(catalog.downloads.size,0);
  window.electronAPI.musicRequest=async(op)=>{assert.equal(op,'download');throw Error('Недостаточно места для сохранения трека.');};
  await assert.rejects(catalog.ensureTrack({...song,sources:[{provider:'audius',url:'https://audius.co/artist/tenke'}]}),/места/);
});
test('download diagnostics distinguish access restrictions, networking and storage without leaking URLs',()=>{
  const {downloadError}=require('../desktop-music');
  assert.match(downloadError(Error('HTTP Error 403 https://secret.invalid/token')),/ограничил доступ/);
  assert.match(downloadError(Error('Timed out')),/соединиться/);
  assert.match(downloadError(Error('ENOSPC')),/места/);
  assert.match(downloadError(Error('EACCES')),/папке/);
  const protectedError=downloadError(Error('This video is DRM protected'));
  assert.match(protectedError,/защищена/);assert.equal(downloadError(Error(protectedError)),protectedError);
  assert.ok(!downloadError(Error('HTTP Error 403 https://secret.invalid/token')).includes('https://'));
});

test('music search retains official audio credits, album and duration while excluding videos',async()=>{
  const {youtubeMusicEntries}=await import('../js/music-youtube.js');
  const {audioCandidate,sameRecording,cleanTitle}=await import('../js/music-match.js');
  const browse=(text,pageType)=>({text,navigationEndpoint:{browseEndpoint:{browseEndpointContextSupportedConfigs:{browseEndpointContextMusicConfig:{pageType}}}}});
  const row=type=>({musicResponsiveListItemRenderer:{flexColumns:[
    {musicResponsiveListItemFlexColumnRenderer:{text:{runs:[{text:'747',navigationEndpoint:{watchEndpoint:{videoId:'abcdefghijk',watchEndpointMusicSupportedConfigs:{watchEndpointMusicConfig:{musicVideoType:type}}}}}]}}},
    {musicResponsiveListItemFlexColumnRenderer:{text:{runs:[browse('DOROFEEVA','MUSIC_PAGE_TYPE_ARTIST'),{text:' • '},browse('747 - Single','MUSIC_PAGE_TYPE_ALBUM'),{text:' • '},{text:'2:54'}]}}}
  ]}});
  const data={contents:[row('MUSIC_VIDEO_TYPE_ATV'),row('MUSIC_VIDEO_TYPE_OMV'),row('MUSIC_VIDEO_TYPE_ATV')]};
  const entries=youtubeMusicEntries(data);assert.equal(entries.length,1);
  const song=audioCandidate(entries[0],'youtubeMusic');assert.equal(song.artist,'DOROFEEVA');assert.equal(song.album,'747 - Single');assert.equal(song.duration,174);
  assert.ok(sameRecording(song,{title:'747',artist:'DOROFEEVA',duration:173.963}));
  assert.equal(cleanTitle('DOROFEEVA - різнокольорова (Lyric Video)'),'DOROFEEVA - різнокольорова');
});

test('known song audio is attempted before discovery, and discovery network errors reach the user',async()=>{
  global.window={};global.document={querySelectorAll:()=>[]};global.DOMParser=class {parseFromString(){return {querySelectorAll:()=>[]};}};
  const {MusicCatalog}=await import('../js/music-catalog.js');
  const song={id:'song_ab14',title:'747',artist:'DOROFEEVA',duration:174,catalog:true,sources:[{provider:'youtubeMusic',url:'https://www.youtube.com/watch?v=abcdefghijk'}]};
  const lib={getTracks:()=>[],folders:[],addDownloaded:async()=>song};
  window.electronAPI={musicRequest:async(op)=>{assert.equal(op,'download');return {};}};
  const catalog=new MusicCatalog(lib,{renderSidebar:()=>{}});await catalog.ensureTrack(song);
  window.electronAPI.musicRequest=async()=>{throw Error('Не удалось соединиться с аудиосервисом.');};
  await assert.rejects(catalog.ensureTrack({...song,sources:[]}),/соединиться/);
});
test('Cyrillic artist searches retain original Latin-script catalog recordings and find saved artist/title queries',async()=>{
  const {mergeSongs}=await import('../js/music-match.js');
  const original={title:'747',artist:'DOROFEEVA',duration:173.963,pictureUrl:'https://cover.example/747.jpg',sources:[],catalog:true};
  const other={...original,artist:'Eddie Rabbitt'};
  const rows=mergeSongs([[original,other]],'Дорофеева 747');assert.equal(rows.length,1);assert.equal(rows[0].artist,'DOROFEEVA');assert.equal(rows[0].pictureUrl,original.pictureUrl);
  const nirvana={title:'Smells Like Teen Spirit',artist:'Nirvana',duration:301,sources:[],catalog:true};assert.equal(mergeSongs([[nirvana]],'Нирвана Smells Like Teen Spirit').length,1);
  const {Library}=await import('../js/library.js');const lib=new Library();lib.tracks.set('saved',{...original,id:'saved'});assert.deepEqual(lib.search('Дорофеева 747').map(t=>t.id),['saved']);
});

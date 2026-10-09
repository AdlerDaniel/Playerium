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
  assert.equal(sourceURL('https://muzend.net/uploads/music/2026/08/Dorofeeva_747.mp3'),'https://muzend.net/uploads/music/2026/08/Dorofeeva_747.mp3');
  for(const url of ['https://muzend.net/323-song.html','https://muzend.net/uploads/music/song.mp3?url=https://localhost','https://muzend.net.evil.test/uploads/music/song.mp3'])assert.throws(()=>sourceURL(url));
  assert.ok(catalogURL('muzend','Dorofeeva 747').endsWith('story=Dorofeeva%20747'));
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
test('exact requested live and remaster versions survive while additional covers are excluded',async()=>{
  const {isVariant,sameRecording}=await import('../js/music-match.js');
  assert.equal(isVariant('About A Girl (Live)','About A Girl - Live'),false);
  assert.equal(isVariant('About A Girl (Live Cover)','About A Girl - Live'),true);
  assert.equal(isVariant('About A Girl (Live)','About A Girl'),true);
  assert.equal(sameRecording({title:'Song - 2023 Remaster',artist:'Artist'},{title:'Song (2023 Remaster)',artist:'Artist'}),true);
  assert.equal(sameRecording({title:'Song - 2023 Remaster',artist:'Artist'},{title:'Song',artist:'Artist'}),false);
});
test('verified alternate artist names match without accepting a different performer',async()=>{
  const {sameRecording,normalizeSearch}=await import('../js/music-match.js');
  assert.equal(sameRecording({title:'Морфін',artist:'Лилу45, МУЛЬТИТРЕК'},{title:'Морфін',artist:'Lely45 & МУЛЬТИТРЕК'}),true);
  assert.equal(sameRecording({title:'Пінаколада',artist:'Виталий Козловский'},{title:'Пінаколада',artist:'Віталій Козловський'}),true);
  assert.equal(sameRecording({title:'Song',artist:'Лилу45'},{title:'Song',artist:'Other'}),false);
  assert.equal(normalizeSearch('Лилу45 Морфін'),normalizeSearch('Lely45 Морфін'));
});
test('new direct sources accept only their fixed audio paths',()=>{
  const {sourceURL,catalogURL}=require('../desktop-music');
  assert.equal(sourceURL('https://musify.club/track/pl/2115/nirvana.mp3'),'https://musify.club/track/pl/2115/nirvana.mp3');
  assert.equal(sourceURL('https://topmusicua.com/uploads/files/2025-07/song.mp3'),'https://topmusicua.com/uploads/files/2025-07/song.mp3');
  assert.equal(sourceURL('https://miyzvuk.net/uploads/public_files/2024-11/song.mp3'),'https://miyzvuk.net/uploads/public_files/2024-11/song.mp3');
  for(const url of ['https://miyzvuk.net/engine/go.php?url=file:///private','https://miyzvuk.net/uploads/public_files/song.mp3?url=https://localhost','https://miyzvuk.net.evil.test/uploads/public_files/song.mp3'])assert.throws(()=>sourceURL(url));
  assert.throws(()=>sourceURL('https://musify.club/track/pl/123/song.mp3#other'));
  for(const url of ['https://musify.club/track/dl/2115/song.mp3','https://musify.club/track/pl/2115/song.mp3?url=https://localhost','https://musify.club.evil.test/track/pl/2115/song.mp3','https://topmusicua.com/search/song.mp3'])assert.throws(()=>sourceURL(url));
  assert.match(catalogURL('musify','Nirvana Song'),/SearchText=Nirvana%20Song$/);
  assert.match(catalogURL('topmusicua','Song'),/story=Song$/);
});
test('fallback tries candidates beyond the native eight-source limit',async()=>{
  global.window={};global.document={querySelectorAll:()=>[]};const batches=[];
  const {MusicCatalog}=await import('../js/music-catalog.js');
  const song={id:'song_ab17',title:'Song',artist:'Artist',catalog:true,sources:Array.from({length:10},(_,i)=>({provider:'musify',url:`https://musify.club/track/pl/${i}/song.mp3`}))};
  window.electronAPI={musicRequest:async(op,p)=>{assert.equal(op,'download');batches.push(p.track.sources);if(batches.length===1)throw Error('Аудиосервис ограничил доступ');return {};}};
  const lib={getTracks:()=>[],folders:[],addDownloaded:async()=>song};await new MusicCatalog(lib,{renderSidebar:()=>{}}).ensureTrack(song);
  assert.deepEqual(batches.map(b=>b.length),[8,2]);assert.equal(batches.flat().length,10);
});
test('reopening cached multi-provider search keeps the results',async()=>{
  global.window={electronAPI:{musicRequest:async()=>assert.fail('cached results must not request providers')}};
  const {MusicCatalog}=await import('../js/music-catalog.js');const lib={search:()=>[]};const catalog=new MusicCatalog(lib,{});
  catalog.cache.set('song',{time:Date.now(),groups:[[{title:'Song',artist:'Artist',sources:[],catalog:true}],[{title:'Song',artist:'Artist',album:'Album',sources:[],catalog:true}]]});
  let rows;catalog.schedule('Song',(results,busy)=>{rows=results;assert.equal(busy,false);});assert.equal(rows.length,1);assert.equal(rows[0].album,'Album');
});
test('decoded short previews are rejected before any download is published',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const {DesktopMusic}=require('../desktop-music');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-duration-test-'));
  try {
    const engine=new DesktopMusic({app:{getPath:()=>root,isPackaged:false},authorize:async p=>p});
    engine.run=async args=>{
      const metadata=args[args.indexOf('--load-info-json')+1],file=path.join(path.dirname(metadata),'audio.wav');
      const pcm=Buffer.alloc(16000),header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(8000,24);header.writeUInt32LE(16000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
      await fs.writeFile(file,Buffer.concat([header,pcm]));return file;
    };
    const track={id:'song_ab19',title:'Song',artist:'Artist',duration:180,sources:[{provider:'topmusicua',url:'https://topmusicua.com/uploads/files/song.mp3',title:'Song',artist:'Artist',duration:180}]};
    await assert.rejects(engine.request('download',{track,folderSource:path.join(root,'downloads')},'test-preview'),/не совпадает/);
    assert.deepEqual(await fs.readdir(path.join(root,'downloads')),[]);assert.deepEqual(await engine.records(),{});
  }finally{await fs.rm(root,{recursive:true,force:true});}
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
  const song={id:'song_ab14',title:'747',artist:'DOROFEEVA',album:'747 - Single',pictureUrl:'https://is1-ssl.mzstatic.com/image.jpg',duration:174,catalog:true,sources:[{provider:'youtubeMusic',url:'https://www.youtube.com/watch?v=abcdefghijk'}]};
  const lib={getTracks:()=>[],folders:[],addDownloaded:async()=>song};
  window.electronAPI={musicRequest:async(op)=>{assert.equal(op,'download');return {};}};
  const catalog=new MusicCatalog(lib,{renderSidebar:()=>{}});await catalog.ensureTrack(song);
  window.electronAPI.musicRequest=async()=>{throw Error('Не удалось соединиться с аудиосервисом.');};
  await assert.rejects(catalog.ensureTrack({...song,sources:[]}),/соединиться/);
});
test('direct audio receives missing album and cover metadata before saving, while catalog failures do not prevent a known download',async()=>{
  global.window={};global.document={querySelectorAll:()=>[]};
  const {MusicCatalog}=await import('../js/music-catalog.js');const calls=[];
  const song={id:'song_ab20',title:'Song',artist:'Artist',catalog:true,sources:[{provider:'musify',url:'https://musify.club/track/pl/123/song.mp3',title:'Song',artist:'Artist'}]};
  const lib={getTracks:()=>[],folders:[],addDownloaded:async(record,track)=>track};
  window.electronAPI={musicRequest:async(op,payload)=>{calls.push({op,payload});if(op==='download')return {};return {results:[{trackName:'Song',artistName:'Artist',collectionName:'Album',artworkUrl100:'https://is1-ssl.mzstatic.com/100x100bb.jpg',trackTimeMillis:180000,releaseDate:'2025-01-01'}]};}};
  const catalog=new MusicCatalog(lib,{renderSidebar:()=>{}});const saved=await catalog.ensureTrack(song);
  assert.equal(saved.album,'Album');assert.equal(saved.duration,180);assert.match(saved.pictureUrl,/600x600bb/);
  assert.equal(calls.at(-1).op,'download');assert.equal(calls.at(-1).payload.track.album,'Album');
  window.electronAPI.musicRequest=async(op)=>{if(op==='catalog')throw Error('Catalog unavailable');return {};};
  assert.equal((await catalog.ensureTrack(song)).title,'Song');
});
test('native audio transport streams the full body, rejects HTML and unsafe redirects, and settles stalled or cancelled requests',async(t)=>{
  const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{createAudioFetcher}=require('../desktop-music');let request;
  const net={request:()=>{request=new EventEmitter();request.end=()=>{};request.abort=()=>{request.aborted=true;request.emit('abort');request.emit('close');};request.followRedirect=()=>{request.followed=true;};return request;}};
  const fetcher=createAudioFetcher(net);
  let response=fetcher('https://musify.club/track/pl/1/song.mp3');const stream=new PassThrough();stream.statusCode=200;stream.headers={'content-type':'audio/mpeg'};request.emit('response',stream);stream.end(Buffer.from('complete audio'));
  let body='';for await(const chunk of (await response).body)body+=chunk;assert.equal(body,'complete audio');request.emit('close');
  response=fetcher('https://musify.club/track/pl/1/song.mp3');const html=new PassThrough();html.statusCode=200;html.headers={'content-type':'text/html'};request.emit('response',html);await assert.rejects(response,/полную запись/);assert.equal(request.aborted,true);
  response=fetcher('https://musify.club/track/pl/1/song.mp3');request.emit('redirect',302,'GET','file:///private.mp3');await assert.rejects(response,/Недопустимый/);
  const controller=new AbortController();response=fetcher('https://musify.club/track/pl/1/song.mp3',{signal:controller.signal});controller.abort();await assert.rejects(response,/загрузку/);assert.equal(request.aborted,true);
  const bodyController=new AbortController();response=fetcher('https://musify.club/track/pl/1/song.mp3',{signal:bodyController.signal});const stalledBody=new PassThrough();stalledBody.statusCode=200;stalledBody.headers={'content-type':'audio/mpeg'};request.emit('response',stalledBody);const bodyRead=(async()=>{for await(const chunk of (await response).body){void chunk;}})();bodyController.abort();await assert.rejects(bodyRead,/загрузку/);assert.equal(request.aborted,true);
  t.mock.timers.enable({apis:['setTimeout']});response=fetcher('https://musify.club/track/pl/1/song.mp3');t.mock.timers.tick(15001);await assert.rejects(response,/Время ожидания/);assert.equal(request.aborted,true);
});
test('Cyrillic artist searches retain original Latin-script catalog recordings and find saved artist/title queries',async()=>{
  const {mergeSongs}=await import('../js/music-match.js');
  const original={title:'747',artist:'DOROFEEVA',duration:173.963,pictureUrl:'https://cover.example/747.jpg',sources:[],catalog:true};
  const other={...original,artist:'Eddie Rabbitt'};
  const rows=mergeSongs([[original,other]],'Дорофеева 747');assert.equal(rows.length,1);assert.equal(rows[0].artist,'DOROFEEVA');assert.equal(rows[0].pictureUrl,original.pictureUrl);
  const nirvana={title:'Smells Like Teen Spirit',artist:'Nirvana',duration:301,sources:[],catalog:true};assert.equal(mergeSongs([[nirvana]],'Нирвана Smells Like Teen Spirit').length,1);
  const {Library}=await import('../js/library.js');const lib=new Library();lib.tracks.set('saved',{...original,id:'saved'});assert.deepEqual(lib.search('Дорофеева 747').map(t=>t.id),['saved']);
});

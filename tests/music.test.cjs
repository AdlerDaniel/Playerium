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
  const local={id:'saved',title:'Повільне диско',artist:'KLER x OTOY',duration:253};
  const saved=mergeSongs([[official,metadata]],'KLER Повільне диско',[local]);assert.equal(saved.length,1);assert.equal(saved[0].id,'saved');assert.equal(saved[0].catalog,false);
});
test('repost titles cannot claim another performer as the recording author',async()=>{
  const {audioCandidate}=await import('../js/music-match.js');
  assert.equal(audioCandidate({title:'KLER & OTOY — Повільне диско',artists:['Ukrainian Music'],uploader:'Ukrainian Music',url:'https://soundcloud.com/repost/song'},'soundcloud'),null);
  assert.equal(audioCandidate({title:'Kevin Macleod Monkeys Spinning Monkeys',artists:['Other'],uploader:'Other',url:'https://soundcloud.com/repost/song'},'soundcloud'),null);
});
test('different performers and different recordings are not collapsed',async()=>{
  const {mergeSongs}=await import('../js/music-match.js');
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
});
test('native requests cannot turn a catalog search into arbitrary file/network access',()=>{
  const {sourceURL,catalogURL}=require('../desktop-music');
  for(const url of ['file:///C:/secret','https://localhost/audio','https://soundcloud.com.evil.test/a','https://user:pass@youtube.com/a'])assert.throws(()=>sourceURL(url));
  assert.throws(()=>catalogURL('https://evil.test','song'));
  assert.ok(sourceURL('https://artist.bandcamp.com/track/song'));
});

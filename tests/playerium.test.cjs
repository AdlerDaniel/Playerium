const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
const { scanDirectory, isInside } = require('../desktop-files');
const storage = new Map();
class FakeAudio {
  constructor() { this.events = {}; this.duration = 100; this.currentTime = 0; this.volume = 1; this.src = ''; }
  addEventListener(name, fn) { this.events[name] = fn; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  load() {}
  async play() { this.events.play?.(); }
  pause() { this.events.pause?.(); }
}
async function modules() {
  // CommonJS Electron entry stays intact; browser ES modules are loaded natively.
  return { Library: (await import('../js/library.js')).Library, AudioPlayer: (await import('../js/audio-player.js')).AudioPlayer };
}
beforeEach(() => {
  global.indexedDB = indexedDB; global.IDBKeyRange = IDBKeyRange;
  global.window = {}; global.Audio = FakeAudio;
  global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value) };
  storage.clear();
});
async function library() {
  const { Library } = await modules();
  const lib = new Library(); await lib.init(); await lib.clearAll(); lib.blockedSources.clear(); return lib;
}
function descriptor(name, filePath, title = name) {
  return { name, fullPath: filePath, size: 100, lastModified: 1, metadata: { title, artist: 'Artist', duration: 42 } };
}
test('native restoration retains queue indices and metadata when library records are unavailable', async () => {
  const {AudioPlayer}=await modules(),writes=[];
  window.AndroidBridge={setPlaybackQueue:data=>writes.push(data)};
  const p=new AudioPlayer({getTrackById:()=>null,tracks:new Map()});
  const state={queue:['a','b'],tracks:[{uri:'content://a',title:'First',artist:'Artist'},{uri:'content://b',title:'Current',artist:'Other'}],index:1,id:'b',playing:true,position:83000,duration:210000};
  p.applyNativeState(state);
  assert.equal(p.currentTrack.title,'Current');assert.equal(p.queueIndex,1);assert.equal(p.queue.length,2);
  assert.equal(p.getCurrentTime(),83);assert.equal(p.isPlaying,true);assert.deepEqual(writes,[]);
  const imported={id:'b',nativeUri:'content://b',title:'Current',pictureUrl:'blob:restored-cover'};
  p.library.tracks.set(imported.id,imported);p.library.getTrackById=id=>p.library.tracks.get(id);
  p.applyNativeState(state);assert.equal(p.currentTrack,imported);assert.deepEqual(writes,[]);
});
test('native restoration matches imported recordings by URI without restarting playback',async()=>{
  const {AudioPlayer}=await modules(),track={id:'new-id',nativeUri:'content://a',title:'Song',pictureUrl:'blob:cover'};
  const p=new AudioPlayer({getTrackById:()=>null,tracks:new Map([[track.id,track]])});
  p.applyNativeState({queue:['old-id'],tracks:[{uri:'content://a',title:'Song'}],index:0,id:'old-id',playing:true,position:41000,duration:100000});
  assert.equal(p.currentTrack,track);assert.equal(p.getCurrentTime(),41);
});
test('native queue edits preserve playing or paused state', async () => {
  const { AudioPlayer } = await modules();
  const messages=[];
  window.AndroidBridge={setPlaybackQueue:json=>messages.push(JSON.parse(json))};
  const p=new AudioPlayer({});
  p.nativePlayback=true;p.isPlaying=true;
  p.currentTrack={id:'a',nativeUri:'content://music/a'};
  p.queue=[p.currentTrack];p.originalQueue=[p.currentTrack];p.queueIndex=0;
  p.addToQueue({id:'b',nativeUri:'content://music/b'});
  p.toggleShuffle();p.clearUpcomingQueue();
  assert.ok(messages.every(m=>m.play===true));
  assert.ok(messages.every(m=>m.reset===false));
  p.isPlaying=false;p.addToQueue({id:'c',nativeUri:'content://music/c'});
  assert.equal(messages.at(-1).play,false);
});
test('reordering future duplicate tracks preserves native playback and exact queue positions',async()=>{
  const {AudioPlayer}=await modules();const messages=[];
  window.AndroidBridge={setPlaybackQueue:json=>messages.push(JSON.parse(json))};
  const p=new AudioPlayer({}),a={id:'a',nativeUri:'content://music/a'},b={id:'b',nativeUri:'content://music/b'},c={id:'c',nativeUri:'content://music/c'};
  p.nativePlayback=true;p.isPlaying=false;p.currentTrack=a;p.queue=[a,b,c,b];p.originalQueue=p.queue.slice();p.queueIndex=0;
  p.moveUpcomingTrack(3,1);assert.deepEqual(p.queue,[a,b,b,c]);assert.equal(p.currentTrack,a);assert.equal(p.queueIndex,0);
  assert.equal(messages.at(-1).reset,false);assert.equal(messages.at(-1).play,false);
  p.moveUpcomingTrack(0,2);p.moveUpcomingTrack(1,-1);assert.deepEqual(p.queue,[a,b,b,c]);
  p.toggleShuffle();p.toggleShuffle();assert.deepEqual(p.queue,[a,b,b,c]);
});
test('row activation preserves shuffle and resumes current track without reloading',async()=>{
  const {playRow}=await import('../js/playback-controls.js');
  const a={id:'a'},b={id:'b'},c={id:'c'},context={type:'playlist',id:'pl'};
  const calls=[];
  const player={currentTrack:a,isPlaying:true,playbackContext:context,queue:[a,c,b],
    playTrack:(...args)=>calls.push(args),play:()=>calls.push('resume'),pause:()=>calls.push('pause')};
  const ui={player};
  playRow(ui,a,[a,b,c],context);assert.deepEqual(calls,[]);
  playRow(ui,b,[a,b,c],context);assert.deepEqual(calls.pop(),[b,2]);
  playRow(ui,a,[a,b,c],context,true);assert.equal(calls.pop(),'pause');
  player.isPlaying=false;playRow(ui,a,[a,b,c],context);assert.equal(calls.pop(),'resume');
});
test('starting a new collection clears the previous playback context',async()=>{
  const {AudioPlayer}=await modules();
  const p=new AudioPlayer({getAudioFile:async()=>new Blob(['audio'])});
  p.initWebAudio=()=>{};
  const track={id:'a'};
  await p.playTrack(track,0,[track],{type:'playlist',id:'old'});
  await p.playTrack(track,0,[track]);
  assert.equal(p.playbackContext,null);
});
test('folder import parses metadata, ignores .lrc and preserves likes/IDs', async () => {
  const lib = await library();
  window.electronAPI = { getMetadata: async () => ({title:'Tagged song',artist:'Tagged artist',duration:42}), readLyrics: async () => '[00:01]hello' };
  const files = [descriptor('song.mp3','/music/song.mp3'), {name:'song.lrc',fullPath:'/music/song.lrc',size:10}];
  const first = await lib.syncFolderToPlaylist('Music','/music', files);
  assert.equal(first.addedCount,1); const track = lib.getTracks()[0];
  assert.equal(track.title,'Tagged song'); assert.equal(track.lyrics,undefined);
  await lib.toggleLike(track.id);
  const again = await lib.syncFolderToPlaylist('Music','/music',files);
  assert.equal(again.addedCount,0); assert.equal(lib.getTracks()[0].liked,true);
  assert.equal(lib.getTracks()[0].id,track.id);
  await lib.syncFolderToPlaylist('Music','/music',[]);
  assert.deepEqual(lib.getPlaylistTracks(first.playlist.id),[]); assert.equal(lib.getTrackById(track.id).unavailable,true);
});
test('same file name and size in different folders never merge',async()=>{
  const lib=await library();
  await lib.syncFolderToPlaylist('A','/a',[descriptor('song.mp3','/a/song.mp3')]);
  await lib.syncFolderToPlaylist('B','/b',[descriptor('song.mp3','/b/song.mp3')]);
  assert.equal(lib.getTracks().length,2);
});
test('concurrent folder scans are serialized without duplicate playlists',async()=>{
  const lib=await library(); const files=[descriptor('song.mp3','/a/song.mp3')];
  await Promise.all([lib.syncFolderToPlaylist('A','/a',files),lib.syncFolderToPlaylist('A','/a',files)]);
  assert.equal(lib.getPlaylists().length,1); assert.equal(lib.getTracks().length,1);
});
test('audio and cover blobs remain readable after database reopen',async()=>{
  const lib=await library(); const id='persisted'; const blob=new Blob(['audio']); const pictureBlob=new Blob(['cover'],{type:'image/png'});
  await lib.putInStore('files',{id,blob}); await lib.putInStore('tracks',{id,title:'Track',pictureBlob,pictureUrl:'blob:expired'});
  const {Library}=await modules(); const reopened=new Library(); await reopened.init();
  assert.equal(await (await reopened.getAudioFile({id})).text(),'audio');
  assert.equal(await reopened.getTrackById(id).pictureBlob.text(),'cover');
  assert.notEqual(reopened.getTrackById(id).pictureUrl,'blob:expired');
});
async function player(lib={ getAudioFile:async()=>new Blob(['a']) }) {
  const {AudioPlayer}=await modules(); const p=new AudioPlayer(lib); p.initWebAudio=()=>{}; return p;
}
test('unavailable track clears old source and reports error instead of playing previous song',async()=>{
  const p=await player({getAudioFile:async()=>null}); p.audio.src='old'; let error;
  p.onError=message=>error=message;
  await p.playTrack({id:'missing',title:'Missing'});
  assert.equal(p.audio.src,''); assert.equal(p.isPlaying,false); assert.match(error,/доступ/i);
});
test('late file load cannot override newer selection',async()=>{
  let resolve; const slow=new Promise(r=>resolve=r);
  const p=await player({getAudioFile:t=>t.id==='slow'?slow:Promise.resolve(new Blob(['fast']))});
  const first=p.playTrack({id:'slow'});
  await p.playTrack({id:'fast'});
  const url=p.audio.src; resolve(new Blob(['slow'])); await first;
  assert.equal(p.currentTrack.id,'fast'); assert.equal(p.audio.src,url);
});
test('manual next ignores repeat-one while track ended repeats current song',async()=>{
  const p=await player(); const a={id:'a'},b={id:'b'};
  p.queue=[a,b];p.originalQueue=[a,b];p.queueIndex=0;p.currentTrack=a;p.repeatMode='one';
  p.next(); await new Promise(r=>setTimeout(r,0)); assert.equal(p.currentTrack.id,'b');
  let repeated=0;p.play=()=>repeated++;p.handleTrackEnded();assert.equal(repeated,1);
});
test('removing upcoming song and toggling shuffle cannot resurrect it',async()=>{
  const p=await player(); const tracks=[{id:'a'},{id:'b'},{id:'c'}];
  p.queue=[...tracks];p.originalQueue=[...tracks];p.currentTrack=tracks[0];p.queueIndex=0;
  p.removeFromQueue(1);p.toggleShuffle();p.toggleShuffle();assert.deepEqual(p.queue.map(t=>t.id),['a','c']);
  p.clearUpcomingQueue();p.toggleShuffle();p.toggleShuffle();assert.deepEqual(p.queue.map(t=>t.id),['a']);
});
test('native playback sends URI queue without reading audio into JavaScript',async()=>{
  let queue; window.AndroidBridge={setPlaybackQueue:s=>queue=JSON.parse(s),playbackCommand:()=>{},setEqualizer:()=>{}};
  const p=await player({getAudioFile:()=>{throw Error('must not read native files');}});
  await p.playTrack({id:'native',nativeUri:'content://music/1',title:'Native'});
  assert.equal(queue.tracks[0].uri,'content://music/1'); assert.equal(p.audio.src,'');
  assert.equal(queue.reset,true);
  p.applyNativeState({id:'native',playing:true,position:2000,duration:42000});assert.equal(p.getDuration(),42);assert.equal(p.isPlaying,true);
});

test('first desktop playback uses measured gain; stale analysis cannot change a newer selection and cached playback is immediate',async()=>{
  const pending=new Map(),calls=[];
  window.electronAPI={getAudioSource:async file=>'music://'+file,getLoudness:file=>{
    calls.push(file);return new Promise(resolve=>pending.set(file,resolve));
  }};
  const p=await player();
  p.audioCtx={currentTime:10};
  const gains=[];p.normalizationNode={gain:{cancelScheduledValues:()=>{},setValueAtTime:v=>gains.push(v),setTargetAtTime:v=>gains.push(v)}};
  const a={id:'a',filePath:'a.mp3'},b={id:'b',filePath:'b.mp3'};
  const first=p.playTrack(a);while(!pending.has('a.mp3'))await new Promise(r=>setTimeout(r,0));assert.equal(p.isPlaying,false);
  const second=p.playTrack(b,0,[b]);while(!pending.has('b.mp3'))await new Promise(r=>setTimeout(r,0));pending.get('b.mp3')({gain:.5});await second;
  assert.equal(p.isPlaying,true);assert.equal(p.normalizationGain,.5);
  pending.get('a.mp3')({gain:2});await first;assert.equal(p.normalizationGain,.5);assert.equal(p.currentTrack,b);
  p.pause();p.seekToTime(30);assert.equal(p.getCurrentTime(),30);
  await Promise.race([p.playTrack(a,0,[a]),new Promise((_,reject)=>setTimeout(()=>reject(Error('Cached playback waited')),200))]);assert.equal(p.normalizationGain,2);
  assert.deepEqual(calls,['a.mp3','b.mp3']);assert.equal(gains.at(-1),2);
});

test('Android selection sends measured gain before the native queue starts',async()=>{
  const messages=[];window.AndroidBridge={setPlaybackQueue:s=>messages.push(JSON.parse(s)),setEqualizer:()=>{}};
  const p=await player({getLoudness:async()=>({gain:.5})});
  const a={id:'a',nativeUri:'content://music/a'},b={id:'b',nativeUri:'content://music/b'};
  await p.playTrack(a,0,[a,b]);await p.playTrack(b,1);
  assert.equal(messages.length,2);assert.equal(messages[1].index,1);assert.equal(p.currentTrack,b);assert.equal(messages[1].tracks[1].normalizationGain,.5);
});
test('Android playlist selection reads saved and native cached gain without waiting for a busy analysis bridge',async()=>{
 const messages=[];let analysis=0,cachedReads=0;window.AndroidBridge={getCachedLoudness:()=>{cachedReads++;return '{"gain":0.5}';},setPlaybackQueue:s=>messages.push(JSON.parse(s)),setEqualizer:()=>{}};
 const p=await player({getLoudness:()=>{analysis++;return new Promise(()=>{});}}),a={id:'a',nativeUri:'content://music/a'},b={id:'b',nativeUri:'content://music/b',normalizationGain:.7};b.normalizationKey=p.loudnessKey(b);
 await Promise.race([p.playTrack(a,0,[a,b]),new Promise((_,reject)=>setTimeout(()=>reject(Error('Cached native selection waited')),200))]);await p.playTrack(b,1);
 assert.equal(analysis,0);assert.equal(cachedReads,1);assert.equal(messages[0].tracks[0].normalizationGain,.5);assert.equal(messages[1].tracks[1].normalizationGain,.7);
});

test('pausing during first loudness preparation cancels the start, while old native updates cannot replace a newly selected song',async()=>{
 let finish;const messages=[];window.AndroidBridge={setPlaybackQueue:s=>messages.push(JSON.parse(s)),setEqualizer:()=>{},playbackCommand:()=>{}};
 const p=await player({getLoudness:()=>new Promise(r=>finish=r)}),a={id:'old',nativeUri:'content://music/old'},b={id:'new',nativeUri:'content://music/new'};
 p.queue=[a];p.currentTrack=a;p.nativePlayback=true;p.queueIndex=0;
 const cancelled=p.playTrack(b,1,[a,b]);while(!finish)await new Promise(r=>setTimeout(r,0));p.pause();finish({gain:2});await cancelled;assert.equal(messages.length,0);
 p.browserLoudnessCache.clear();b.normalizationKey=null;finish=null;const start=p.playTrack(b,1,[a,b]);while(!finish)await new Promise(r=>setTimeout(r,0));p.applyNativeState({id:'old',index:0,playing:true,position:2000,duration:180000});finish({gain:2});await start;
 assert.equal(messages.length,1);assert.equal(messages[0].index,1);assert.equal(p.currentTrack,b);assert.equal(messages[0].tracks[1].normalizationGain,2);
});

test('Android notification artwork sends durable image bytes once and follows automatic native transitions',async()=>{
  const pictures=[],commands=[],queues=[];
  window.AndroidBridge={setPlaybackQueue:s=>queues.push(JSON.parse(s)),storePlaybackArtwork:(id,bytes)=>pictures.push({id,bytes}),playbackCommand:(...args)=>commands.push(args),setEqualizer:()=>{}};
  const a={id:'art-a',nativeUri:'content://music/a',pictureBlob:new Blob(['cover-a'],{type:'image/png'})};
  const b={id:'art-b',nativeUri:'content://music/b',pictureBlob:new Blob(['cover-b'],{type:'image/png'})};
  const c={id:'art-c',nativeUri:'content://music/c',pictureBlob:new Blob(['cover-c'],{type:'image/png'})};
  const p=await player();await p.playTrack(a,0,[a,b,c]);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(pictures.map(t=>[t.id,atob(t.bytes)]),[['art-a','cover-a'],['art-b','cover-b']]);
  p.syncNativeQueue();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(pictures.length,2);
  p.applyNativeState({id:'art-b',index:1,playing:true,position:500,duration:42000,shuffle:true,repeat:1});
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(pictures.at(-1).id,'art-c');
  assert.equal(p.currentTrack,b);assert.equal(p.isShuffle,true);assert.equal(p.repeatMode,'one');
  p.next();p.prev();p.toggleShuffle();
  assert.deepEqual(commands,[['next',0],['previous',0],['shuffle',0]]);
  p.syncNativeQueue();assert.equal(queues.at(-1).shuffle,false);
});
test('async directory scan handles nested audio/LRC and never traverses symlinks',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-'));
  try { await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'nested/song.mp3'),'a');await fs.writeFile(path.join(root,'nested/song.lrc'),'b');await fs.writeFile(path.join(root,'ignore.txt'),'c');
    await fs.symlink(os.tmpdir(),path.join(root,'link')); const files=await scanDirectory(root);assert.equal(files.length,1);assert.equal(files[0].relativePath.startsWith('nested/'),true);
    assert.equal(isInside(root,`${root}-outside/file`),false);assert.equal(isInside(root,path.join(root,'nested/song.mp3')),true);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
test('legacy Android library and preferences migrate before switching to secure origin',async()=>{
  const {Library}=await modules(); let completed=false;
  window.AndroidBridge={getLegacyLibrary:()=>JSON.stringify({tracks:[{id:'legacy',nativeUri:'content://music/old',liked:true}],playlists:[{id:'old-playlist',trackIds:['legacy']}],settings:{sp_audio_prefs:'{"volume":0.3}'}}),completeLegacyMigration:()=>completed=true};
  const lib=new Library();await lib.init();assert.equal(lib.getTrackById('legacy').liked,true);
  assert.equal(lib.getPlaylistTracks('old-playlist')[0].id,'legacy');assert.equal(completed,true);assert.equal(JSON.parse(localStorage.getItem('sp_audio_prefs')).volume,0.3);
});
test('changing ignored LRC files does not reparse audio metadata',async()=>{
  const lib=await library();let calls=0;
  window.electronAPI={getMetadata:async()=>{calls++;return {title:'Song',lyrics:'obsolete'};},readLyrics:()=>{throw Error('LRC must not be read');}};
  const files=[descriptor('song.mp3','/music/song.mp3'),{name:'song.lrc',fullPath:'/music/song.lrc',lastModified:1}];
  await lib.syncFolderToPlaylist('Music','/music',files);const id=lib.getTracks()[0].id;
  files[1].lastModified=2;await lib.syncFolderToPlaylist('Music','/music',files);
  assert.equal(lib.getTrackById(id).lyrics,undefined);assert.equal(calls,1);
});
test('version comparison honors prerelease ordering and rejects malformed tags',async()=>{
  const {AutoUpdater}=await import('../js/updater.js');const updater=new AutoUpdater();
  assert.equal(updater.compareVersions('1.1.0','1.1.0-beta.2'),1);
  assert.equal(updater.compareVersions('1.1.0-beta.10','1.1.0-beta.2'),1);
  assert.equal(updater.compareVersions('broken','1.1.0'),0);
});
test('removing one of two equally named folders removes only its tracks and references',async()=>{
  const lib=await library();
  await lib.syncFolderToPlaylist('Music','/a',[descriptor('song.mp3','/a/song.mp3')]);
  await lib.syncFolderToPlaylist('Music','/b',[descriptor('song.mp3','/b/song.mp3')]);
  const manual=await lib.createPlaylist('Manual');const first=lib.getTracks().find(t=>t.folderSource==='/a');
  await lib.addTrackToPlaylist(manual.id,first.id);
  const folder=lib.folders.find(f=>f.source==='/a');await lib.removeFolder(folder.id);
  assert.equal(lib.getTracks().length,1);assert.equal(lib.getTracks()[0].folderSource,'/b');
  assert.deepEqual(lib.getPlaylistTracks(manual.id),[]);
  const event=await lib.syncFolderToPlaylist('Music','/a',[descriptor('song.mp3','/a/song.mp3')]);
  assert.equal(event.ignored,true);assert.equal(lib.getTracks().length,1);
});
test('clearing library stops desktop watchers and ignores their late scan results',async()=>{
  const lib=await library();let unwatched;
  await lib.syncFolderToPlaylist('Music','/music',[descriptor('song.mp3','/music/song.mp3')]);
  window.electronAPI={unwatchFolder:async source=>unwatched=source};
  await lib.clearAll();assert.equal(unwatched,'/music');assert.equal(lib.getTracks().length,0);
  assert.equal((await lib.syncFolderToPlaylist('Music','/music',[descriptor('song.mp3','/music/song.mp3')])).ignored,true);
});
test('reimport of one unambiguous legacy file restores its ID, likes and playlist references',async()=>{
  const lib=await library();
  const old={id:'old-browser-track',title:'Old',fileName:'song.mp3',fileSize:100,folderName:'Music',liked:true};
  lib.tracks.set(old.id,old);await lib.putInStore('tracks',old);
  const playlist=await lib.createPlaylist('Saved');await lib.addTrackToPlaylist(playlist.id,old.id);
  await lib.syncFolderToPlaylist('Music','/music',[descriptor('song.mp3','/music/song.mp3')]);
  assert.equal(lib.getTracks().length,1);assert.equal(lib.getTracks()[0].id,old.id);
  assert.equal(lib.getPlaylistTracks(playlist.id)[0].liked,true);
});

test('moving a downloaded Android song keeps its ID, likes, playlist membership and new playback URI after restart',async()=>{
  const lib=await library();
  const old={name:'Artist - Song [ab12].mp3',uri:'content://music/old.mp3',folderName:'Music',folderSource:'content://music/tree',size:100,lastModified:1,downloadId:'song_ab12',metadata:{title:'Song',artist:'Artist',duration:42}};
  const song=await lib.addDownloaded(old,null);await lib.toggleLike(song.id);
  const playlist=await lib.createPlaylist('Saved');await lib.addTrackToPlaylist(playlist.id,song.id);
  const moved={...old,uri:'content://music/PlayeriumDownloads/song.mp3',previousUri:old.uri};
  await lib.addDownloaded(moved,null);
  assert.equal(lib.getTracks().length,1);assert.equal(lib.getTracks()[0].id,song.id);assert.equal(lib.getTracks()[0].nativeUri,moved.uri);
  assert.equal(lib.getTracks()[0].liked,true);assert.equal(lib.getPlaylistTracks(playlist.id)[0].id,song.id);
  const reopened=new (await modules()).Library();await reopened.init();
  assert.equal(reopened.getTrackById(song.id).nativeUri,moved.uri);assert.equal(reopened.getTrackById(song.id).liked,true);
  await reopened.syncFolderToPlaylist('Music',old.folderSource,[{...moved,downloadId:undefined}],true);
  assert.equal(reopened.getTracks().length,1);assert.equal(reopened.getPlaylistTracks(playlist.id)[0].id,song.id);
});
test('restoring unchanged downloaded files keeps artwork URL and does not flash import skeletons',async()=>{
 const lib=await library(),file={name:'Artist - Song.mp3',uri:'content://music/song.mp3',folderName:'Music',folderSource:'content://music/tree',size:100,lastModified:1,downloadId:'stable',metadata:{title:'Song',artist:'Artist',duration:42}};
 const song=await lib.addDownloaded(file,null);song.pictureUrl='blob:stable';song.normalizationGain=.7;await lib.putInStore('tracks',song);let updates=0;lib.onLibraryChanged=()=>updates++;
 for(let i=0;i<20;i++)assert.equal(await lib.addDownloaded(file,null),song);
 assert.equal(updates,0);assert.equal(song.pictureUrl,'blob:stable');assert.equal(song.normalizationGain,.7);assert.equal(lib.importing,false);
});

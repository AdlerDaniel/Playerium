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
  p.isPlaying=false;p.addToQueue({id:'c',nativeUri:'content://music/c'});
  assert.equal(messages.at(-1).play,false);
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
test('folder import parses metadata, attaches lyrics, skips .lrc and preserves likes/IDs', async () => {
  const lib = await library();
  window.electronAPI = { getMetadata: async () => ({title:'Tagged song',artist:'Tagged artist',duration:42}), readLyrics: async () => '[00:01]hello' };
  const files = [descriptor('song.mp3','/music/song.mp3'), {name:'song.lrc',fullPath:'/music/song.lrc',size:10}];
  const first = await lib.syncFolderToPlaylist('Music','/music', files);
  assert.equal(first.addedCount,1); const track = lib.getTracks()[0];
  assert.equal(track.title,'Tagged song'); assert.equal(track.lyrics,'[00:01]hello');
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
  p.applyNativeState({id:'native',playing:true,position:2000,duration:42000});assert.equal(p.getDuration(),42);assert.equal(p.isPlaying,true);
});
test('async directory scan handles nested audio/LRC and never traverses symlinks',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-'));
  try { await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'nested/song.mp3'),'a');await fs.writeFile(path.join(root,'nested/song.lrc'),'b');await fs.writeFile(path.join(root,'ignore.txt'),'c');
    await fs.symlink(os.tmpdir(),path.join(root,'link')); const files=await scanDirectory(root);assert.equal(files.length,2);assert.equal(files[0].relativePath.startsWith('nested/'),true);
    assert.equal(isInside(root,`${root}-outside/file`),false);assert.equal(isInside(root,path.join(root,'nested/song.mp3')),true);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
test('legacy Android library and preferences migrate before switching to secure origin',async()=>{
  const {Library}=await modules(); let completed=false;
  window.AndroidBridge={getLegacyLibrary:()=>JSON.stringify({tracks:[{id:'legacy',nativeUri:'content://music/old',liked:true}],playlists:[{id:'old-playlist',trackIds:['legacy']}],settings:{sp_audio_prefs:'{"volume":0.3}'}}),completeLegacyMigration:()=>completed=true};
  const lib=new Library();await lib.init();assert.equal(lib.getTrackById('legacy').liked,true);
  assert.equal(lib.getPlaylistTracks('old-playlist')[0].id,'legacy');assert.equal(completed,true);assert.equal(JSON.parse(localStorage.getItem('sp_audio_prefs')).volume,0.3);
});
test('changing only lyrics refreshes text without changing the track ID',async()=>{
  const lib=await library();let text='[00:01]old';
  window.electronAPI={getMetadata:async()=>({title:'Song'}),readLyrics:async()=>text};
  const files=[descriptor('song.mp3','/music/song.mp3'),{name:'song.lrc',fullPath:'/music/song.lrc',lastModified:1}];
  await lib.syncFolderToPlaylist('Music','/music',files);const id=lib.getTracks()[0].id;
  text='[00:01]new';files[1].lastModified=2;await lib.syncFolderToPlaylist('Music','/music',files);
  assert.equal(lib.getTrackById(id).lyrics,text);
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

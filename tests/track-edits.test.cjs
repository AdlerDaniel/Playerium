const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {indexedDB}=require('fake-indexeddb');

beforeEach(()=>{
 global.indexedDB=indexedDB;global.window={};
 global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
 global.Audio=class {constructor(){this.volume=1;}addEventListener(){} pause(){} removeAttribute(){} load(){}};
});
async function library(){const {Library}=await import('../js/library.js');const lib=new Library();await lib.init();await lib.clearAll();lib.blockedSources.clear();return lib;}
const source={name:'Artist - Song.mp3',uri:'content://music/song',size:100,lastModified:1,metadata:{title:'Song',artist:'Artist',album:'Source album',duration:40}};

test('manual metadata and cover survive rescan, native download restore and database reopen without touching audio or playlist identity',async()=>{
 const lib=await library();await lib.syncFolderToPlaylist('Music','content://music',[source],true);
 const track=lib.getTracks()[0],id=track.id,audio=new Blob(['original recording']);
 await lib.putInStore('files',{id,blob:audio});const pl=await lib.createPlaylist('Mix');await lib.addTrackToPlaylist(pl.id,id);
 const cover=new Blob(['my cover'],{type:'image/jpeg'});
 await lib.editTrack(id,{title:' New name - New name ',artist:' New artist ',album:'New album',volume:135,coverBlob:cover});
 await lib.syncFolderToPlaylist('Music','content://music',[{...source,size:120,lastModified:2}],true);
 await lib.addDownloaded({...source,size:120,lastModified:2,downloadId:'download'});
 lib.db.close();const {Library}=await import('../js/library.js'),reopened=new Library();await reopened.init();
 const actual=reopened.getTrackById(id);
 assert.equal(reopened.getTracks().length,1);assert.equal(actual.title,'New name - New name');assert.equal(actual.artist,'New artist');assert.equal(actual.album,'New album');
 assert.equal(actual.userEdits.volume,135);assert.equal(await actual.pictureBlob.text(),'my cover');assert.deepEqual(actual.pictureUrls,[]);
 assert.equal(actual.nativeUri,source.uri);assert.equal(actual.fileName,source.name);assert.equal(await(await reopened.getFromStore('files',id)).blob.text(),'original recording');
 assert.deepEqual(reopened.getPlaylistById(pl.id).trackIds,[id]);reopened.db.close();
});

test('invalid edits and a failed write preserve the live track; later edits recover after failure',async()=>{
 const lib=await library();await lib.syncFolderToPlaylist('Music','content://music',[source],true);const track=lib.getTracks()[0];
 for(const changes of [{title:' '},{artist:''},{album:'a'.repeat(201)},{volume:NaN},{volume:201},{volume:-1},{coverBlob:new Blob(['text'],{type:'text/plain'})}])await assert.rejects(lib.editTrack(track.id,changes));
 const put=lib.putInStore.bind(lib);lib.putInStore=async()=>{throw Error('Storage full');};
 await assert.rejects(lib.editTrack(track.id,{title:'Lost',volume:0}),/Storage full/);assert.equal(track.title,'Song');assert.equal(track.userEdits,undefined);
 lib.putInStore=put;await lib.editTrack(track.id,{title:'Saved',volume:0});assert.equal(track.title,'Saved');assert.equal(track.userEdits.volume,0);
 lib.db.close();
});

test('manual track gain multiplies master volume, previews restore on cancel, other songs retain their own gain',async()=>{
 const {AudioPlayer}=await import('../js/audio-player.js'),p=new AudioPlayer({});
 assert.equal(p.currentTrackVolume(),1);p.gainNode={gain:{value:1}};
 p.currentTrack={id:'a',userEdits:{volume:150}};p.setVolume(.4);assert.equal(p.volume,.4);assert.ok(Math.abs(p.gainNode.gain.value-.6)<1e-10);
 p.previewTrackVolume('a',25);assert.equal(p.gainNode.gain.value,.1);
 p.previewTrackVolume(null);assert.ok(Math.abs(p.gainNode.gain.value-.6)<1e-10);
 p.previewTrackVolume('b',0);assert.ok(Math.abs(p.gainNode.gain.value-.6)<1e-10);
 p.currentTrack={id:'b',userEdits:{volume:75}};p.previewTrackVolume(null);assert.ok(Math.abs(p.gainNode.gain.value-.3)<1e-10);
 p.toggleMute();assert.equal(p.gainNode.gain.value,0);p.toggleMute();assert.ok(Math.abs(p.gainNode.gain.value-.3)<1e-10);
});

test('native queue receives persistent gain while preview commands do not change it or manual occurrences',async()=>{
 const {AudioPlayer}=await import('../js/audio-player.js'),sent=[],commands=[];
 window.AndroidBridge={setPlaybackQueue:json=>sent.push(JSON.parse(json)),playbackCommand:(...args)=>commands.push(args)};
 const track={id:'a',nativeUri:'content://a',title:'Song',userEdits:{volume:140}},p=new AudioPlayer({getTrackById:()=>track});
 p.nativePlayback=true;p.queue=[{...track,queueOrigin:'manual',queueEntry:'entry-1'}];p.originalQueue=p.queue.slice();p.queueIndex=0;p.currentTrack=p.queue[0];p.syncNativeQueue(false,false);
 assert.equal(sent.at(-1).tracks[0].trackVolume,1.4);
 p.previewTrackVolume('a',30);assert.deepEqual(commands.at(-1),['trackVolume',.3]);assert.equal(track.userEdits.volume,140);
 p.refreshEditedTrack({...track,title:'Changed',userEdits:{volume:60}});p.previewTrackVolume(null);
 assert.equal(sent.at(-1).tracks[0].title,'Changed');assert.equal(sent.at(-1).tracks[0].trackVolume,.6);assert.equal(sent.at(-1).reset,false);
 assert.equal(p.queue[0].queueEntry,'entry-1');assert.equal(p.queue[0].queueOrigin,'manual');assert.deepEqual(commands.at(-1),['trackVolume',.6]);
});

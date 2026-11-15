const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {indexedDB}=require('fake-indexeddb');const {findRelocatedAudio,scanDirectory}=require('../desktop-files');
beforeEach(()=>{global.window={};global.indexedDB=indexedDB;global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};});
async function library(){const {Library}=await import('../js/library.js'),lib=new Library();await lib.init();await lib.clearAll();lib.blockedSources.clear();return lib;}
test('missing desktop audio relocates uniquely inside approved roots; duplicate or unrelated files are never selected',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-recovery-'));
 try{
  const a=path.join(root,'a'),b=path.join(root,'b');await fs.mkdir(a);await fs.mkdir(b);const original=path.join(a,'Пісня [abcd1234].mp3'),moved=path.join(b,'Пісня [abcd1234].mp3');await fs.writeFile(moved,'audio');
  const match=await findRelocatedAudio(original,[a,b],{downloadId:'song_abcd1234'});assert.equal(match.fullPath,moved);assert.equal(match.previousPath,original);
  assert.equal(await findRelocatedAudio(original,[a],{downloadId:'song_abcd1234'}),null);
  await fs.writeFile(path.join(b,'Другая [abcd1234].mp3'),'ambiguous');assert.equal(await findRelocatedAudio(original,[a,b],{downloadId:'song_abcd1234'}),null);
  const local=path.join(b,'Local.mp3');await fs.writeFile(local,'local');const stat=await fs.stat(local);
  assert.equal((await findRelocatedAudio(path.join(a,'Local.mp3'),[b],{fileSize:stat.size,lastModified:stat.mtimeMs})).fullPath,local);
  assert.equal(await findRelocatedAudio(path.join(a,'Local.mp3'),[b],{fileSize:99,lastModified:stat.mtimeMs}),null);
 }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
});
test('folder reselection relinks a known download while retaining edits, cover, playlist membership and recording ID',async()=>{
 const lib=await library(),old='C:/Old',fresh='C:/New',file={name:'Song [abcd1234].mp3',fullPath:old+'/Song [abcd1234].mp3',downloadId:'song_abcd1234',size:100,lastModified:1,metadata:{title:'Song',artist:'Artist'}};
 await lib.syncFolderToPlaylist('Old',old,[file]);const original=lib.getTracks()[0],pl=await lib.createPlaylist('Mix');await lib.addTrackToPlaylist(pl.id,original.id);
 await lib.editTrack(original.id,{title:'My title',volume:130,coverBlob:new Blob(['art'],{type:'image/jpeg'})});await lib.markFolderUnavailable(old);
 await lib.syncFolderToPlaylist('New',fresh,[{...file,downloadId:undefined,fullPath:fresh+'/'+file.name,size:120,lastModified:2}]);
 assert.equal(lib.getTracks().length,1);const t=lib.getTracks()[0];assert.equal(t.id,original.id);assert.equal(t.filePath,fresh+'/'+file.name);assert.equal(t.unavailable,false);assert.equal(t.title,'My title');assert.equal(t.userEdits.volume,130);assert.equal(await t.pictureBlob.text(),'art');assert.deepEqual(lib.getPlaylistById(pl.id).trackIds,[t.id]);
 await lib.syncFolderToPlaylist('Old',old,[]);assert.equal(t.unavailable,false);lib.db.close();
});
test('Android document identity survives a new tree grant with opaque IDs and respects removed recordings',async()=>{
 const lib=await library(),old='content://provider/tree/old',fresh='content://provider/tree/new';
 const file={name:'Song.mp3',uri:old+'/document/opaque-42',size:100,lastModified:1,metadata:{title:'Song',artist:'Artist'}};
 await lib.syncFolderToPlaylist('Old',old,[file],true);const id=lib.getTracks()[0].id;
 await lib.syncFolderToPlaylist('New',fresh,[{...file,uri:fresh+'/document/opaque-42'}],true);
 assert.equal(lib.getTracks().length,1);assert.equal(lib.getTracks()[0].id,id);assert.equal(lib.getTracks()[0].nativeUri,fresh+'/document/opaque-42');
 await lib.removeTrack(id);await lib.syncFolderToPlaylist('Old',old,[file],true);assert.equal(lib.getTracks().length,0);lib.db.close();
});
test('desktop imports every nested level and repeated recursive scans do not duplicate tracks',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-subfolders-')),lib=await library();
 try{
  await fs.mkdir(path.join(root,'one','two'),{recursive:true});
  for(const name of ['root.mp3','one/middle.mp3','one/two/deep.mp3'])await fs.writeFile(path.join(root,name),'fixture');
  const files=await scanDirectory(root);assert.deepEqual(files.map(f=>f.relativePath).sort(),['one/middle.mp3','one/two/deep.mp3','root.mp3']);
  await lib.syncFolderToPlaylist('Music',root,files);await lib.syncFolderToPlaylist('Music',root,await scanDirectory(root));
  assert.equal(lib.getTracks().length,3);assert.equal(lib.findPlaylistByFolderSource(root).trackIds.length,3);
 }finally{lib.db.close();assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
});

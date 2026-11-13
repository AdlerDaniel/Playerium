const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {indexedDB}=require('fake-indexeddb');
const {retireFeatures}=require('../desktop-retired-features');

test('desktop upgrade removes authorization while retaining every music and recovery file',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-local-only-'));
 try{
  const files={'google-drive/account.bin':'old token','google-drive/account.bin.tmp':'pending token','google-drive/jobs/audio/song.mp3':'saved recording','google-drive/jobs/track.json':'saved track metadata','normalized-audio/source.wav':'recovery recording','Music/Cloud/song.mp3':'downloaded recording','Music/Cloud/cover.jpg':'cover','music-roots.json':'["Music/Cloud"]'};
  for(const [name,bytes] of Object.entries(files)){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),bytes);}
  await retireFeatures(root);await retireFeatures(root);
  for(const [name,bytes] of Object.entries(files)){
   if(/account\.bin/.test(name))assert.equal(await fs.stat(path.join(root,name)).catch(()=>null),null);
   else assert.equal(await fs.readFile(path.join(root,name),'utf8'),bytes,name);
  }
 }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
});

test('library upgrade discards sync state and preserves offline audio, artwork, playlists and cover jobs across reopen',async()=>{
 global.indexedDB=indexedDB;global.window={};
 const values=new Map([['playerium_cloud_device','old-device'],['playerium_connect_target','old-phone'],['playerium_theme','ruby-dark'],['playerium_custom_avatar','custom-profile']]);
 global.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const {Library}=await import('../js/library.js');const lib=new Library();await lib.init();await lib.clearAll();
 const audio=new Blob(['unchanged audio'],{type:'audio/mpeg'}),cover=new Blob(['unchanged art'],{type:'image/png'});
 const track={id:'saved',title:'Дим',artist:'Время и Стекло',album:'Альбом',nativeUri:'file:///music/Cloud/song.mp3',pictureBlob:cover,metadataVersion:3};
 const playlist={id:'mix',name:'Мой плейлист',trackIds:['saved'],coverType:'custom',coverUrl:'data:image/png;base64,YQ=='};
 await lib.putInStore('tracks',track);await lib.putInStore('files',{id:'saved',blob:audio});await lib.putInStore('playlists',playlist);
 await lib.putInStore('settings',{key:'cloudSync',value:{old:{outbox:[{kind:'track',key:'saved'}]}}});
 await lib.putInStore('settings',{key:'artwork-job',value:{id:'pending-cover'}});lib.db.close();
 for(let i=0;i<2;i++){
  const reopened=new Library();await reopened.init();const actual=reopened.getTrackById('saved');
  for(const key of ['id','title','artist','album','nativeUri'])assert.equal(actual[key],track[key]);
  assert.equal(await actual.pictureBlob.text(),'unchanged art');assert.equal(await (await reopened.getFromStore('files','saved')).blob.text(),'unchanged audio');
  assert.deepEqual(reopened.getPlaylistById('mix'),playlist);assert.equal(await reopened.getFromStore('settings','cloudSync'),undefined);
  assert.deepEqual((await reopened.getFromStore('settings','artwork-job')).value,{id:'pending-cover'});reopened.db.close();
 }
 assert.equal(values.has('playerium_cloud_device'),false);assert.equal(values.has('playerium_connect_target'),false);
 assert.equal(values.get('playerium_theme'),'ruby-dark');assert.equal(values.get('playerium_custom_avatar'),'custom-profile');
});

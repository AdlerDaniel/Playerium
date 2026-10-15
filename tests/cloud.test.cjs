const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
let CloudSync,model;
beforeEach(async()=>{global.window={};global.localStorage={getItem:()=>null,setItem:()=>{}};model=await import('../js/cloud-model.js');({CloudSync}=await import('../js/cloud-sync.js'));});
const key=crypto.createHash('sha256').update('song').digest('hex');
const operation=(kind,fields={},clock=1,id=crypto.randomUUID())=>({version:1,id,device:'device',clock,kind,key,...fields});
const song=()=>operation('track',{track:{title:'Song',artist:'Artist',ext:'.mp3',size:4,audioId:'audio_1'}});
test('deletion converges under reordering; restore cannot acknowledge an unknown concurrent deletion',()=>{
 const add=song(),del=operation('delete',{},2),restore=operation('restore',{deletes:[del.id]},3),concurrent=operation('delete',{},2);
 for(const events of [[restore,add,del],[del,restore,add]])assert.equal(model.cloudView(events).tracks.get(key).deleted,false);
 assert.equal(model.cloudView([restore,add,del,concurrent]).tracks.get(key).deleted,true);
 assert.equal(model.mergeOperations([add],[add,del,del]).length,2);
});
test('likes and membership converge using logical clocks, independent of device wall clocks',()=>{
 const a=operation('like',{liked:true},5,'a'),b=operation('like',{liked:false},5,'b'),p=operation('playlist',{playlist:'pl',name:'Mix'},1),m=operation('member',{playlist:'pl',present:true},4),r=operation('member',{playlist:'pl',present:false},6);
 for(const events of [[a,b,p,m,r],[r,m,p,b,a]]){const view=model.cloudView(events);assert.equal(view.tracks.get(key).liked,false);assert.equal(view.playlists.get('pl').members.get(key).present,false);}
 assert.equal(model.validOperation(operation('like',{liked:'false'})),false);assert.equal(model.validOperation(operation('track',{track:{...song().track,ext:'.exe'}})),false);
});
class Library {
 constructor(){this.tracks=new Map();this.playlists=new Map();this.settings=new Map();}
 getTracks(){return [...this.tracks.values()];}getTrackById(id){return this.tracks.get(id);}getPlaylists(){return [...this.playlists.values()];}getPlaylistById(id){return this.playlists.get(id);}
 async getFromStore(_,key){return this.settings.get(key);}async putInStore(store,value){if(store==='settings')this.settings.set(value.key,structuredClone(value));}
 async addDownloaded(file){let t=this.getTracks().find(t=>t.filePath===file.fullPath);if(!t){t={id:crypto.randomUUID(),filePath:file.fullPath,...file.metadata};this.tracks.set(t.id,t);}return t;}
 async removeTrack(id){this.tracks.delete(id);for(const pl of this.playlists.values())pl.trackIds=pl.trackIds.filter(x=>x!==id);}
 async deletePlaylist(id){this.playlists.delete(id);}coverURL(){return 'blob:cover';}
}
function network(){const events=[],files=new Map(),requests=[];let offline=false;return {events,files,requests,setOffline:value=>offline=value,transport:async(name,payload)=>{
 requests.push(name);if(offline)throw Error('Offline');if(name==='status')return {connected:true,account:'account',email:'test@example.invalid'};
 if(name==='pull')return {events:structuredClone(events.slice(Number(payload.cursor)||0)),cursor:String(events.length)};
 if(name==='fingerprint'){const bytes=files.get(payload.source);assert.ok(bytes);return {key:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,ext:'.mp3'};}
 if(name==='publish'){if(!events.some(op=>op.id===payload.operation.id)){const op=structuredClone(payload.operation);if(op.kind==='track'){op.track.audioId='audio_'+op.key;files.set(op.track.audioId,files.get(payload.source));if(payload.cover){op.track.coverId='cover_'+crypto.createHash('sha256').update(payload.cover.base64).digest('hex');op.track.coverMime=payload.cover.mime;files.set(op.track.coverId,payload.cover.base64);}}events.push(op);}return {queued:true};}
 if(name==='download'){const bytes=files.get(payload.track.audioId);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),payload.key);const path='/cloud/'+payload.key+'.mp3';files.set(path,bytes);return {fullPath:path,metadata:payload.track,coverBase64:payload.track.coverId?files.get(payload.track.coverId):null,coverMime:payload.track.coverMime};}
 if(name==='cover')return {base64:files.get(payload.id)};if(name==='removeLocal')return true;throw Error(name);
 }};}
function peer(net){const lib=new Library(),cloud=new CloudSync(lib,{player:{stop(){},removeTrack(){}}},net.transport);cloud.states={};return {lib,cloud};}
function add(peer,net,name,bytes){const track={id:crypto.randomUUID(),title:name,artist:'Artist',filePath:'/music/'+crypto.randomUUID()+'.mp3',liked:false};peer.lib.tracks.set(track.id,track);net.files.set(track.filePath,Buffer.from(bytes));return track;}
test('PC and phone independently upload, download, deduplicate, preserve covers, likes and playlists',async()=>{
 const net=network(),pc=peer(net),phone=peer(net);const first=add(pc,net,'PC song','song');first.liked=true;first.pictureBlob=new Blob(['cover'],{type:'image/png'});
 pc.lib.playlists.set('mix',{id:'mix',name:'My mix',trackIds:[first.id]});await pc.cloud.sync();await phone.cloud.sync();
 assert.equal(phone.lib.getTracks().length,1);assert.equal(phone.lib.getTracks()[0].liked,true);assert.equal(await phone.lib.getTracks()[0].pictureBlob.text(),'cover');assert.equal(phone.lib.getPlaylistById('mix').trackIds.length,1);
 const second=add(phone,net,'Phone song','second');await phone.cloud.sync();await pc.cloud.sync();assert.equal(pc.lib.getTracks().length,2);assert.equal(phone.lib.getTracks().length,2);
 await pc.cloud.sync();await phone.cloud.sync();assert.equal(net.events.filter(op=>op.kind==='track').length,2);assert.equal(phone.lib.getTrackById(second.id).title,'Phone song');
 assert.equal(JSON.stringify(net.events).includes('/music/'),false);assert.equal(phone.lib.getTracks()[0].album,'');
  first.pictureBlob=new Blob(['updated cover'],{type:'image/png'});await pc.cloud.sync();await phone.cloud.sync();assert.equal(await phone.lib.getTracks().find(t=>t.title==='PC song').pictureBlob.text(),'updated cover');
});
test('offline phone cannot resurrect a PC deletion; restore propagates to both peers',async()=>{
 const net=network(),pc=peer(net),phone=peer(net),track=add(pc,net,'Song','song');await pc.cloud.sync();await phone.cloud.sync();
 await pc.lib.removeTrack(track.id);await pc.cloud.sync();await phone.cloud.sync();assert.equal(phone.lib.getTracks().length,0);assert.equal(pc.cloud.trash.length,1);
 await phone.cloud.restore(key);await pc.cloud.sync();assert.equal(phone.lib.getTracks().length,1);assert.equal(pc.lib.getTracks().length,1);
});
test('persistent outbox survives a failed publish and a restarted coordinator',async()=>{
 const net=network(),pc=peer(net);add(pc,net,'Song','song');let fail=true;const base=pc.cloud.transport;pc.cloud.transport=async(name,payload)=>{if(name==='publish'&&fail)throw Error('network lost');return base(name,payload);};
 await assert.rejects(pc.cloud.sync(),/network lost/);assert.ok(pc.lib.settings.get('cloudSync').value.account.outbox.length);
 fail=false;const restarted=new CloudSync(pc.lib,{player:{}},base);restarted.states=pc.lib.settings.get('cloudSync').value;await restarted.sync();assert.equal(restarted.outbox.length,0);assert.equal(net.events.filter(op=>op.kind==='track').length,1);
});
test('first login does not overwrite remote likes with a newly imported unliked duplicate',async()=>{
 const net=network(),pc=peer(net),phone=peer(net);const a=add(pc,net,'Song','song');a.liked=true;await pc.cloud.sync();add(phone,net,'Same song','song');await phone.cloud.sync();assert.equal(phone.lib.getTracks().length,1);assert.equal(phone.lib.getTracks()[0].liked,true);
});
test('a like changed during a native transfer is retained and sent on the next sync',async()=>{
 const net=network(),pc=peer(net),phone=peer(net),track=add(pc,net,'Song','song');const original=pc.cloud.transport;let edited=false;pc.cloud.transport=async(name,payload)=>{const result=await original(name,payload);if(name==='publish'&&!edited){track.liked=true;edited=true;}return result;};await pc.cloud.sync();assert.equal(track.liked,true);await pc.cloud.sync();await phone.cloud.sync();assert.equal(phone.lib.getTracks()[0].liked,true);
});
test('more than 30 songs finish around a failed file and resume without duplicate downloads',async()=>{
 const net=network(),pc=peer(net),phone=peer(net);
 for(let i=0;i<75;i++){const t=add(pc,net,'Song '+i,'audio-'+i);t.album='Album '+i;t.genre='Rock';t.year=2026;}
 await pc.cloud.sync();const base=phone.cloud.transport;let fail=true,downloaded=0;
 phone.cloud.transport=async(name,payload)=>{if(name==='download'){downloaded++;if(fail&&payload.track.title==='Song 30')throw Error('failed song');}return base(name,payload);};
 await assert.rejects(phone.cloud.sync(),/failed song/);assert.equal(phone.lib.getTracks().length,74);assert.equal(Object.keys(phone.lib.settings.get('cloudSync').value.account.links).length,74);
 fail=false;await phone.cloud.sync();assert.equal(phone.lib.getTracks().length,75);assert.equal(downloaded,76);
 assert.equal(phone.lib.getTracks().find(t=>t.title==='Song 30').album,'Album 30');
 const original=pc.lib.getTracks()[0];original.album='Corrected album';await pc.cloud.sync();await phone.cloud.sync();assert.equal(phone.lib.getTracks().find(t=>t.title===original.title).album,'Corrected album');
});
test('playlist deletion during an incoming transfer is saved before the old snapshot can recreate it',async()=>{
 const net=network(),pc=peer(net),phone=peer(net),track=add(pc,net,'Song','song');pc.lib.playlists.set('mix',{id:'mix',name:'Mix',trackIds:[track.id]});await pc.cloud.sync();await phone.cloud.sync();
 pc.lib.playlists.delete('mix');pc.cloud.captureDeletions();await pc.cloud.apply(model.cloudView(pc.cloud.events));assert.equal(pc.lib.getPlaylistById('mix'),undefined);assert.ok(pc.cloud.outbox.some(op=>op.kind==='playlist-delete'));
 await pc.cloud.sync();await phone.cloud.sync();assert.equal(phone.lib.getPlaylistById('mix'),undefined);
});
test('foreground sync waits for durable native uploads before its final pull so a new phone song reaches PC immediately',async()=>{
 const net=network(),pc=peer(net),phone=peer(net),base=phone.cloud.transport,staged=[];
 phone.cloud.transport=async(name,payload)=>{
  if(name==='status')return {...await base(name,payload),canFlush:true,pending:staged.length};
  if(name==='publish'){staged.push(payload);return {queued:true};}
  if(name==='flush'){for(const job of staged.splice(0))await base('publish',job);return true;}
  return base(name,payload);
 };
 add(phone,net,'New phone recording','new recording');await phone.cloud.sync();assert.equal(staged.length,0);assert.equal(phone.cloud.outbox.length,0);
 await pc.cloud.sync();assert.equal(pc.lib.getTracks()[0].title,'New phone recording');
});

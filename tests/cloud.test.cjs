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
for(const first of ['pc','phone'])test('legacy journals converge from 48 PC / 145 phone through an empty realtime journal, '+first+' first',async()=>{
 const net=network(),pc=peer(net),phone=peer(net);
 for(let i=0;i<145;i++)add(pc,net,'Song '+i,'song-'+i);
 await pc.cloud.sync();await phone.cloud.sync();
 for(const track of pc.lib.getTracks().slice(0,97))await pc.lib.removeTrack(track.id);
 await pc.cloud.sync();assert.equal(pc.lib.getTracks().length,48);assert.equal(phone.lib.getTracks().length,145);
 const rows=new Map();let posts=0;
 for(const p of [pc,phone]){
  const sync=p.cloud.realtime;sync.account='account';sync.session={account:'account',userId:'test-user',accessToken:'test-token'};sync.start=async()=>{};
  sync.fetcher=async(_url,options)=>{
   if(options.method==='POST'){posts++;for(const row of JSON.parse(options.body))if(!rows.has(row.op_id))rows.set(row.op_id,{seq:rows.size+1,operation:row.operation});return new Response(null,{status:201});}
   return new Response(JSON.stringify([...rows.values()]));
  };
  const native=p.cloud.transport;p.cloud.transport=async(name,payload)=>{if(name==='status')return {...await native(name,payload),realtimeAvailable:true};if(name==='pull')throw Error('Drive unavailable');return native(name,payload);};
 }
 const order=first==='pc'?[pc,phone]:[phone,pc];
 await order[0].cloud.sync();await order[1].cloud.sync();await phone.cloud.sync();await pc.cloud.sync();
 assert.equal(pc.lib.getTracks().length,48);assert.equal(phone.lib.getTracks().length,48);
 assert.equal([...rows.values()].filter(r=>r.operation.kind==='delete').length,97);
 assert.ok(posts>=4);const saved=rows.size;
 await pc.cloud.sync();await phone.cloud.sync();assert.equal(rows.size,saved);
});
test('an outgoing transfer failure does not block incoming deletions or independent downloads',async()=>{
 const net=network(),pc=peer(net),phone=peer(net);const track=add(pc,net,'Song','song');await pc.cloud.sync();await phone.cloud.sync();
 await pc.lib.removeTrack(track.id);add(pc,net,'Other','other');await pc.cloud.sync();
 const native=phone.cloud.transport;phone.cloud.transport=async(name,payload)=>{
  if(name==='status')return {...await native(name,payload),canFlush:true,pending:1};
  if(name==='flush')throw Error('Outgoing file temporarily unavailable');
  return native(name,payload);
 };
 await assert.rejects(phone.cloud.sync(),/Outgoing file temporarily unavailable/);
 assert.equal(phone.lib.getTracks().length,1);assert.equal(phone.lib.getTracks()[0].title,'Other');
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
 async addDownloaded(file){let t=this.getTracks().find(t=>t.filePath===file.fullPath);if(!t){t={id:crypto.randomUUID(),filePath:file.fullPath,fileSize:file.size,lastModified:file.lastModified,...file.metadata};this.tracks.set(t.id,t);}return t;}
 async removeTrack(id){this.tracks.delete(id);for(const pl of this.playlists.values())pl.trackIds=pl.trackIds.filter(x=>x!==id);}
 async deletePlaylist(id){this.playlists.delete(id);}coverURL(){return 'blob:cover';}
}
function network(){const events=[],files=new Map(),requests=[];let offline=false;return {events,files,requests,setOffline:value=>offline=value,transport:async(name,payload)=>{
 requests.push(name);if(offline)throw Error('Offline');if(name==='status')return {connected:true,account:'account',email:'test@example.invalid'};
 if(name==='pull')return {events:structuredClone(events.slice(Number(payload.cursor)||0)),cursor:String(events.length)};
 if(name==='fingerprint'){const bytes=files.get(payload.source);assert.ok(bytes);return {key:crypto.createHash('sha256').update(bytes).digest('hex'),size:bytes.length,ext:'.mp3'};}
 if(name==='publish'){if(!events.some(op=>op.id===payload.operation.id)){const op=structuredClone(payload.operation);if(op.kind==='track'){op.track.audioId='audio_'+(op.track.audioKey||op.key);files.set(op.track.audioId,Buffer.from(files.get(payload.source)));if(payload.cover){op.track.coverId='cover_'+crypto.createHash('sha256').update(payload.cover.base64).digest('hex');op.track.coverMime=payload.cover.mime;files.set(op.track.coverId,payload.cover.base64);}}events.push(op);}return {queued:true};}
 if(name==='download'){const bytes=files.get(payload.track.audioId);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),payload.track.audioKey||payload.key);const path=payload.destination||'/cloud/'+payload.key+'.mp3';files.set(path,Buffer.from(bytes));return {fullPath:path,size:bytes.length,lastModified:Date.now(),metadata:payload.track,coverBase64:payload.track.coverId?files.get(payload.track.coverId):null,coverMime:payload.track.coverMime};}
 if(name==='acceptAudioRevision')return crypto.createHash('sha256').update(files.get(payload.source)).digest('hex')===(payload.track.audioKey||payload.key);
 if(name==='cover')return {base64:files.get(payload.id)};if(name==='removeLocal')return true;throw Error(name);
 }};}
function peer(net){const lib=new Library(),cloud=new CloudSync(lib,{player:{stop(){},removeTrack(){}}},net.transport);cloud.states={};return {lib,cloud};}
function add(peer,net,name,bytes){const track={id:crypto.randomUUID(),title:name,artist:'Artist',filePath:'/music/'+crypto.randomUUID()+'.mp3',liked:false};peer.lib.tracks.set(track.id,track);net.files.set(track.filePath,Buffer.from(bytes));return track;}

test('an empty device reports synchronization stages and clears stale download progress on retry',async()=>{
 const net=network(),pc=peer(net),phone=peer(net);add(pc,net,'First','first');await pc.cloud.sync();
 const stages=[];phone.cloud.progress={done:30,total:30};phone.cloud.changed=()=>stages.push({stage:phone.cloud.stage,progress:phone.cloud.progress});
 await phone.cloud.sync();assert.equal(phone.lib.getTracks().length,1);
 assert.equal(stages[0].progress,null);assert.ok(stages.some(s=>s.stage==='Получение списка песен…'));
 assert.ok(stages.some(s=>s.progress?.total===1&&s.progress.done===1));assert.equal(phone.cloud.stage,null);assert.equal(phone.cloud.busy,false);
});
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

const normalization=()=>({profile:'constant-lufs7-tp1-original-v1',targetLUFS:-7,gainDb:6,integrated:-7,truePeak:-2,peakLimited:false});

test('manual playlist order converges from PC to phone and back without losing membership or likes',async()=>{
 const net=network(),pc=peer(net),phone=peer(net),songs=['One','Two','Three'].map(name=>add(pc,net,name,name));songs[1].liked=true;
 pc.lib.playlists.set('ordered',{id:'ordered',name:'Ordered',trackIds:songs.map(t=>t.id)});await pc.cloud.sync();await phone.cloud.sync();
 const pl=pc.lib.getPlaylistById('ordered');pl.manualOrder=true;pl.trackIds=[songs[2].id,songs[0].id,songs[1].id];await pc.cloud.sync();await phone.cloud.sync();
 const names=p=>p.lib.getPlaylistById('ordered').trackIds.map(id=>p.lib.getTrackById(id).title);
 assert.deepEqual(names(phone),['Three','One','Two']);assert.equal(phone.lib.getPlaylistById('ordered').manualOrder,true);
 const remote=phone.lib.getPlaylistById('ordered');remote.trackIds=[remote.trackIds[2],remote.trackIds[0],remote.trackIds[1]];await phone.cloud.sync();await pc.cloud.sync();
 assert.deepEqual(names(pc),['Two','Three','One']);assert.equal(pc.lib.getTrackById(songs[1].id).liked,true);
 assert.equal(model.validOperation(operation('member',{playlist:'ordered',present:true,position:-1})),false);
 assert.equal(model.validOperation(operation('playlist',{playlist:'ordered',name:'Ordered',manualOrder:'yes'})),false);
});
test('normalizing an original synchronizes its audio revision without duplicates or losing likes and playlist identity',async()=>{
 const net=network(),phone=peer(net),pc=peer(net),original=add(phone,net,'Song','original song');original.liked=true;
 phone.lib.playlists.set('mix',{id:'mix',name:'Mix',trackIds:[original.id]});await phone.cloud.sync();await pc.cloud.sync();
 const logicalKey=Object.keys(phone.cloud.links)[0],local=pc.lib.getTracks()[0],localId=local.id,localPath=local.filePath;
 const bytes=Buffer.from('the normalized original recording');net.files.set(original.filePath,bytes);
 Object.assign(original,{audioKey:crypto.createHash('sha256').update(bytes).digest('hex'),fileSize:bytes.length,normalization:normalization()});
 await phone.cloud.sync();await pc.cloud.sync();await phone.cloud.sync();await pc.cloud.sync();
 assert.equal(phone.lib.getTracks().length,1);assert.equal(pc.lib.getTracks().length,1);assert.equal(pc.lib.getTracks()[0].id,localId);assert.equal(local.filePath,localPath);
 assert.deepEqual(net.files.get(localPath),bytes);assert.equal(local.liked,true);assert.deepEqual(pc.lib.getPlaylistById('mix').trackIds,[localId]);
 assert.equal(Object.keys(phone.cloud.links)[0],logicalKey);assert.equal(net.events.filter(op=>op.kind==='track').length,2);
 assert.equal(model.cloudView(net.events).tracks.get(logicalKey).data.audioKey,original.audioKey);
 assert.equal(local.normalization.profile,normalization().profile);assert.equal(local.cloudAudioKey,original.audioKey);
});
test('a new normalized audio revision supersedes an unpublished stale-byte operation',async()=>{
 const net=network(),phone=peer(net),pc=peer(net),track=add(phone,net,'Song','before normalization'),base=phone.cloud.transport;let fail=true;
 phone.cloud.transport=async(name,payload)=>{if(name==='publish'&&fail)throw Error('offline');return base(name,payload);};
 await assert.rejects(phone.cloud.sync(),/offline/);const logical=Object.keys(phone.cloud.links)[0];
 const bytes=Buffer.from('after normalization');net.files.set(track.filePath,bytes);Object.assign(track,{audioKey:crypto.createHash('sha256').update(bytes).digest('hex'),fileSize:bytes.length,normalization:normalization()});
 fail=false;await phone.cloud.sync();await pc.cloud.sync();assert.equal(phone.cloud.outbox.length,0);assert.equal(net.events.filter(op=>op.kind==='track').length,1);
 assert.equal(net.events.find(op=>op.kind==='track').key,logical);assert.deepEqual(net.files.get(pc.lib.getTracks()[0].filePath),bytes);
 assert.equal(model.validOperation(operation('track',{track:{...song().track,audioKey:'../outside'}})),false);
 assert.equal(model.validOperation(operation('track',{track:{...song().track,normalization:{...normalization(),gainDb:Infinity}}})),false);
});

test('a verified unchanged original disables legacy attenuation on the receiving device without redownloading',async()=>{
 const net=network(),phone=peer(net),pc=peer(net),track=add(phone,net,'Peak constrained','unchanged-original');
 await phone.cloud.sync();await pc.cloud.sync();const local=pc.lib.getTracks()[0],id=local.id,source=local.filePath;
 track.audioKey=crypto.createHash('sha256').update(net.files.get(track.filePath)).digest('hex');
 track.normalization={profile:'constant-lufs7-tp1-original-v1',targetLUFS:-7,gainDb:0,integrated:-12,truePeak:0,peakLimited:true};
 track.fileSize=net.files.get(track.filePath).length;await phone.cloud.sync();net.requests.length=0;await pc.cloud.sync();
 assert.ok(net.requests.includes('acceptAudioRevision'));assert.equal(net.requests.includes('download'),false);
 assert.equal(pc.lib.getTracks().length,1);assert.equal(local.id,id);assert.equal(local.filePath,source);assert.equal(local.normalization.profile,track.normalization.profile);
 net.requests.length=0;await pc.cloud.sync();assert.equal(net.requests.includes('acceptAudioRevision'),false);
});


test('an offline playlist reorder cannot resurrect a concurrently removed member',async()=>{
 const net=network(),pc=peer(net),phone=peer(net),songs=['One','Two','Three'].map(name=>add(pc,net,name,name));
 pc.lib.playlists.set('ordered',{id:'ordered',name:'Ordered',manualOrder:true,trackIds:songs.map(t=>t.id)});await pc.cloud.sync();await phone.cloud.sync();
 phone.lib.getPlaylistById('ordered').trackIds=phone.lib.getPlaylistById('ordered').trackIds.filter(id=>phone.lib.getTrackById(id).title!=='Two');
 await phone.cloud.capture();
 const pl=pc.lib.getPlaylistById('ordered');pl.trackIds=[songs[2].id,songs[1].id,songs[0].id];await pc.cloud.sync();await phone.cloud.sync();await pc.cloud.sync();
 for(const peer of [pc,phone])assert.deepEqual(peer.lib.getPlaylistById('ordered').trackIds.map(id=>peer.lib.getTrackById(id).title),['Three','One']);
 const remove=operation('member',{playlist:'mix',present:false},5),move=operation('member',{playlist:'mix',present:true,position:0,orderOnly:true},99);
 assert.equal(model.cloudView([remove,move]).playlists.get('mix').members.get(key).present,false);
});

test('native journal progress updates its pending request without completing it prematurely',async()=>{
 const cloud=new CloudSync(new Library(),{});let id;window.AndroidBridge={cloudRequest:requestId=>{id=requestId;}};
 const pending=cloud.nativeRequest('pull',{});let completed=false;pending.then(()=>completed=true);
 window.onCloudResponse({id,progress:{done:10,total:1224}});await Promise.resolve();
 assert.equal(completed,false);assert.equal(cloud.pending.size,1);assert.equal(cloud.stage,'Чтение облачной медиатеки: 10 из 1224');
 window.onCloudResponse({id,data:{events:[],cursor:'next'}});assert.equal((await pending).cursor,'next');assert.equal(cloud.pending.size,0);
});

test('an incoming-only device downloads after a single pull without waiting for another journal read',async()=>{
 const net=network(),pc=peer(net),phone=peer(net);add(pc,net,'First','first');await pc.cloud.sync();
 const base=phone.cloud.transport;let pulls=0;
 phone.cloud.transport=async(name,payload)=>{
  if(name==='pull'&&++pulls>1)throw Error('Unnecessary journal read before download');
  return base(name,payload);
 };
 await phone.cloud.sync();assert.equal(pulls,1);assert.equal(phone.lib.getTracks().length,1);
 pulls=0;await phone.cloud.sync();assert.equal(pulls,1);
});

test('the complete journal including deletions is read before any audio is downloaded',async()=>{
 const net=network(),pc=peer(net),phone=peer(net),track=add(pc,net,'Deleted song','deleted');
 await pc.cloud.sync();await pc.lib.removeTrack(track.id);add(pc,net,'Kept song','kept');await pc.cloud.sync();
 const base=phone.cloud.transport;let pulls=0,downloads=0;
 phone.cloud.transport=async(name,payload)=>{
  if(name==='pull')pulls++;
  if(name==='download'){downloads++;assert.equal(pulls,1);assert.equal(payload.track.title,'Kept song');}
  return base(name,payload);
 };
 await phone.cloud.sync();assert.equal(downloads,1);assert.equal(phone.lib.getTracks()[0].title,'Kept song');
});

test('pending background downloads do not trigger outgoing flush or an extra pull',async()=>{
 const net=network(),pc=peer(net),phone=peer(net);add(pc,net,'First','first');await pc.cloud.sync();
 const base=phone.cloud.transport;let pulls=0;
 phone.cloud.transport=async(name,payload)=>{
  if(name==='status')return {...await base(name,payload),canFlush:true,pending:1224,outgoingPending:0};
  if(name==='flush')throw Error('Download backlog must not delay import');
  if(name==='pull'&&++pulls>1)throw Error('Unnecessary pull');
  return base(name,payload);
 };
 await phone.cloud.sync();assert.equal(pulls,1);assert.equal(phone.lib.getTracks().length,1);
});

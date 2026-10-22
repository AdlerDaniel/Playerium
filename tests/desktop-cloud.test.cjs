const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {DesktopCloud}=require('../desktop-cloud');
const {isInside}=require('../desktop-files');
function fakeDrive(){let count=0,failAfterChunk=false;const files=new Map(),sessions=new Map(),calls=[];const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers});return {files,sessions,calls,setFailure:value=>failAfterChunk=value,fetch:async(url,options={})=>{
 calls.push({url,range:options.headers?.['Content-Range'],byteRange:options.headers?.Range});const u=new URL(url);
 if(u.pathname.startsWith('/upload/drive/')){
  if(options.method==='POST'){const id='file_'+(++count),session='https://www.googleapis.com/upload/drive/session/'+id;sessions.set(session,{id,meta:JSON.parse(options.body),bytes:Buffer.alloc(0)});return json({},200,{Location:session});}
  const session=sessions.get(url);assert.ok(session);const range=options.headers['Content-Range'];if(range.startsWith('bytes */'))return session.complete?json({id:session.id}):new Response(null,{status:308,headers:session.bytes.length?{Range:'bytes=0-'+(session.bytes.length-1)}:{}});
  const offset=Number(range.match(/^bytes (\d+)-/)[1]);assert.equal(offset,session.bytes.length);if(failAfterChunk&&offset>0)throw Error('connection interrupted');session.bytes=Buffer.concat([session.bytes,Buffer.from(options.body)]);
  const total=Number(range.split('/')[1]);if(session.bytes.length===total){session.complete=true;files.set(session.id,{id:session.id,...session.meta,size:String(total),bytes:session.bytes});return json({id:session.id},201);}
  return new Response(null,{status:308,headers:{Range:'bytes=0-'+(session.bytes.length-1)}});
 }
 if(u.pathname.endsWith('/changes/startPageToken'))return json({startPageToken:String(files.size)});
 if(u.pathname.endsWith('/changes'))return json({newStartPageToken:String(files.size),changes:[...files.values()].slice(Number(u.searchParams.get('pageToken'))).map(file=>({file}))});
 if(u.pathname.endsWith('/files')){if(options.method==='POST'){const id='folder_'+(++count);files.set(id,{id,...JSON.parse(options.body)});return json({id});}const q=u.searchParams.get('q');const key=q.match(/key='key' and value='([^']+)'/)?.[1];const kind=q.match(/key='kind' and value='([^']+)'/)?.[1];const result=[...files.values()].filter(f=>(!key||f.appProperties?.key===key)&&(!kind||f.appProperties?.kind===kind)&&(!q.includes("mimeType =")||f.mimeType==='application/vnd.google-apps.folder'));return json({files:result});}
 const file=files.get(u.pathname.split('/').at(-1));if(!file)return json({},404);if(u.searchParams.get('alt')==='media'){const offset=Number(options.headers?.Range?.match(/bytes=(\d+)/)?.[1]||0);return new Response(file.bytes.subarray(offset),{status:offset?206:200});}return json({...file,bytes:undefined});
 }};}
async function fixture(){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'playerium-cloud-')));const net=fakeDrive(),allowed=new Set([root]);const cloud=new DesktopCloud({app:{getPath:name=>name==='userData'?path.join(root,'profile'):path.join(root,'music')},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},authorize:async source=>{const value=await fs.realpath(source);assert.ok([...allowed].some(p=>isInside(p,value)));return value;},onRoot:async root=>allowed.add(await fs.realpath(root)),openExternal:()=>{},fetcher:net.fetch});cloud.auth={enabled:true,account:'account',refreshToken:'test-refresh',accessToken:'test-token',expires:Date.now()+3600000};return {root,net,cloud,cleanup:async()=>{cloud.auth.enabled=false;clearTimeout(cloud.retry);while(cloud.running)await new Promise(r=>setTimeout(r,5));await fs.rm(root,{recursive:true,force:true});}};}
const settle=async cloud=>{while(cloud.running)await new Promise(r=>setTimeout(r,5));};
test('Windows advertises and routes its native journal reader through the cloud IPC contract',async()=>{
 const f=await fixture();try{
  f.cloud.runJobs=async()=>{};f.cloud.realtime.session=async()=>({account:'account',userId:'owner',accessToken:'scoped'});
  f.cloud.realtime.journalFetcher=async()=>new Response(JSON.stringify([{revision:7,operation:{id:'incoming'}}]));
  assert.equal((await f.cloud.request('status')).nativeJournal,true);
  assert.deepEqual(await f.cloud.request('realtimeChanges',{after:3}),{events:[{id:'incoming'}],journalCursor:7});
 }finally{await f.cleanup();}
});
test('revoked Google access exposes reconnect state without discarding the account or pending library changes',async()=>{
 const f=await fixture();try{
  f.cloud.auth.expires=0;f.cloud.fetcher=async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400});
  await assert.rejects(f.cloud.token(),/Войдите в Google Диск повторно/);
  f.cloud.runJobs=async()=>{};
  const status=await f.cloud.request('status');assert.equal(status.authRequired,true);assert.equal(status.connected,true);assert.equal(f.cloud.auth.account,'account');assert.equal(f.cloud.auth.refreshToken,'test-refresh');
  f.cloud.fetcher=async()=>new Response(JSON.stringify({access_token:'renewed',expires_in:3600}));
  assert.equal(await f.cloud.token(),'renewed');assert.equal((await f.cloud.request('status')).authRequired,false);
 }finally{await f.cleanup();}
});
test('temporary Google server errors do not incorrectly require another sign-in',async()=>{
 const f=await fixture();try{
  f.cloud.auth.expires=0;f.cloud.fetcher=async()=>new Response('{}',{status:503});
  await assert.rejects(f.cloud.token(),/Попробуйте позже/);assert.notEqual(f.cloud.authRequired,true);
 }finally{await f.cleanup();}
});
test('native upload resumes a durable session and commits its journal only after the complete audio',async()=>{
 const f=await fixture();try{
  const source=path.join(f.root,'Song.mp3'),bytes=Buffer.alloc(4*1024*1024+1234,7);await fs.writeFile(source,bytes);const fingerprint=await f.cloud.fingerprint(source);
  const operation={version:1,id:crypto.randomUUID(),device:'pc',clock:1,kind:'track',key:fingerprint.key,track:{title:'Song',artist:'Artist',ext:'.mp3',size:bytes.length,audioId:'pending'}};
  f.net.setFailure(true);await f.cloud.publish({operation,source});await settle(f.cloud);
  assert.equal([...f.net.files.values()].some(x=>x.appProperties?.kind==='event'),false);
  const jobFile=path.join(f.cloud.jobs,operation.id+'.json'),before=JSON.parse(await fs.readFile(jobFile));assert.ok(before.sessions['audio:'+fingerprint.key]);
  f.net.setFailure(false);await f.cloud.publish({operation,source});await settle(f.cloud);
  assert.equal(f.net.sessions.size,2);assert.equal((await f.cloud.pull(null)).events.length,1);
  const event=(await f.cloud.pull(null)).events[0],result=await f.cloud.download({key:fingerprint.key,track:event.track});assert.deepEqual(await fs.readFile(result.fullPath),bytes);
  assert.equal(JSON.stringify(event).includes(source),false);assert.equal((await f.cloud.request('status')).accessToken,undefined);
 }finally{await f.cleanup();}
});
test('download rejects a corrupt payload and foreign Drive metadata without importing it',async()=>{
 const f=await fixture();try{const bytes=Buffer.from('audio'),key=crypto.createHash('sha256').update(bytes).digest('hex');f.net.files.set('audio_1',{id:'audio_1',size:'5',appProperties:{playeriumCloud:'1',kind:'audio',key:'audio:'+key},bytes:Buffer.from('wrong')});
  await assert.rejects(f.cloud.download({key,track:{ext:'.mp3',size:5,audioId:'audio_1'}}),/ошибкой/);
  await assert.rejects(fs.stat(path.join(f.cloud.cache,key+'.mp3')),e=>e.code==='ENOENT');
  f.net.files.get('audio_1').appProperties.playeriumCloud='0';await assert.rejects(f.cloud.download({key,track:{ext:'.mp3',size:5,audioId:'audio_1'}}),/не принадлежит/);
 }finally{await f.cleanup();}
});
test('file-picker blobs are staged in bounded chunks; invalid offsets and path traversal are rejected',async()=>{
 const f=await fixture();try{const session=await f.cloud.request('stage',{ext:'.wav',size:4});await assert.rejects(f.cloud.request('stageChunk',{id:session.id,offset:2,base64:Buffer.from('song').toString('base64')}));await f.cloud.request('stageChunk',{id:session.id,offset:0,base64:Buffer.from('song').toString('base64')});const result=await f.cloud.request('stageComplete',{id:session.id});assert.equal((await f.cloud.fingerprint(result.source)).size,4);await assert.rejects(f.cloud.request('stage',{ext:'../../x.exe',size:4}));await assert.rejects(f.cloud.request('removeLocal',{key:'../outside'}));}finally{await f.cleanup();}
});
test('expired change cursor resets the snapshot and another account cannot send the old queue',async()=>{
 const f=await fixture();try{const original=f.cloud.fetcher;f.cloud.fetcher=async(url,opts)=>url.includes('pageToken=expired')?new Response('{}',{status:410}):original(url,opts);assert.ok((await f.cloud.pull('expired')).cursor);
  await fs.mkdir(f.cloud.jobs,{recursive:true});await fs.writeFile(path.join(f.cloud.jobs,'other.json'),JSON.stringify({account:'other',operation:{id:'old'}}));await f.cloud.runJobs();assert.equal(await f.cloud.pendingCount(),0);assert.equal(f.net.calls.filter(x=>x.url.includes('/upload/')).length,0);
 }finally{await f.cleanup();}
});

test('queued uploads retain their original bytes while normalization replaces the local file',async()=>{
 const f=await fixture();try{
  const source=path.join(f.root,'Song.mp3'),before=Buffer.alloc(4*1024*1024+32,7);await fs.writeFile(source,before);const fingerprint=await f.cloud.fingerprint(source);
  const operation={version:1,id:crypto.randomUUID(),device:'pc',clock:1,kind:'track',key:fingerprint.key,track:{title:'Song',artist:'Artist',ext:'.mp3',size:before.length,audioId:'pending'}};
  f.net.setFailure(true);await f.cloud.publish({operation,source});await settle(f.cloud);
  const jobFile=path.join(f.cloud.jobs,operation.id+'.json'),queued=JSON.parse(await fs.readFile(jobFile,'utf8'));assert.notEqual(queued.source,source);assert.deepEqual(await fs.readFile(queued.source),before);
  const after=Buffer.from('new normalized original');await fs.writeFile(source,after);f.net.setFailure(false);await f.cloud.runJobs();
  const event=(await f.cloud.pull(null)).events[0];assert.deepEqual(f.net.files.get(event.track.audioId).bytes,before);assert.deepEqual(await fs.readFile(source),after);
  await assert.rejects(fs.stat(queued.source),error=>error.code==='ENOENT');
 }finally{await f.cleanup();}
});
test('an audio revision atomically replaces the existing original and bypasses the old quiet-copy normalizer',async()=>{
 const f=await fixture();try{
  const source=path.join(f.root,'Song.mp3'),before=Buffer.from('original'),after=Buffer.from('normalized original'),key=crypto.createHash('sha256').update(before).digest('hex'),audioKey=crypto.createHash('sha256').update(after).digest('hex');await fs.writeFile(source,before);
  f.net.files.set('normalized',{id:'normalized',size:String(after.length),appProperties:{playeriumCloud:'1',kind:'audio',key:'audio:'+audioKey},bytes:after});
  const normalized={profile:'constant-lufs7-tp1-original-v1',targetLUFS:-7,gainDb:7,integrated:-7,truePeak:-2,peakLimited:false},track={ext:'.mp3',size:after.length,audioId:'normalized',audioKey,normalization:normalized};
  const prepared=new (require('../desktop-normalization').PreparedAudio)('missing-ffmpeg',path.join(f.root,'prepared'));f.cloud.onAudioRevision=(file,metadata)=>prepared.acceptOriginal(file,metadata);
  const result=await f.cloud.download({key,track,destination:source,expectedCurrentHash:key});assert.equal(result.fullPath,source);assert.deepEqual(await fs.readFile(source),after);assert.equal(await prepared.prepare(source),source);
  await assert.rejects(fs.stat(path.join(f.cloud.cache,key+'.mp3')),error=>error.code==='ENOENT');
  const edited=Buffer.from('user edited original');await fs.writeFile(source,edited);await assert.rejects(f.cloud.download({key,track,destination:source,expectedCurrentHash:key}),/изменилась/);assert.deepEqual(await fs.readFile(source),edited);
 }finally{await f.cleanup();}
});

test('three native file stores redistribute verified local recordings without Drive requests',async()=>{
 const peers=await Promise.all([fixture(),fixture(),fixture()]);
 try{
  for(let i=0;i<peers.length;i++){await peers[i].cloud.live.start();peers[i].cloud.live.publish({id:'device_'+i});}
  const learn=(to,from)=>to.live.learn({...from.live.local,lan:{...from.live.descriptor(),addresses:['127.0.0.1']}});
  const bytes=crypto.randomBytes(220123),source=path.join(peers[0].root,'Local.mp3');await fs.writeFile(source,bytes);
  const fingerprint=await peers[0].cloud.fingerprint(source),key=fingerprint.key,track={ext:'.mp3',size:bytes.length,audioId:'backup-not-reachable',title:'Local'};
  learn(peers[1].cloud,peers[0].cloud);const phone=await peers[1].cloud.download({key,track});
  assert.deepEqual(await fs.readFile(phone.fullPath),bytes);assert.equal(peers[1].net.calls.length,0);
  learn(peers[2].cloud,peers[1].cloud);const tablet=await peers[2].cloud.download({key,track});
  assert.deepEqual(await fs.readFile(tablet.fullPath),bytes);assert.equal(peers[2].net.calls.length,0);
  await peers[2].cloud.download({key,track});assert.equal(peers[2].net.calls.length,0);
 }finally{for(const peer of peers){peer.cloud.live.close();await peer.cleanup();}}
});

test('an interrupted peer prefix resumes from Drive, and corrupt peer bytes are discarded',async()=>{
 const f=await fixture();try{
  const bytes=crypto.randomBytes(190123),key=crypto.createHash('sha256').update(bytes).digest('hex'),track={ext:'.mp3',size:bytes.length,audioId:'audio_peer'};
  f.net.files.set('audio_peer',{id:'audio_peer',size:String(bytes.length),appProperties:{playeriumCloud:'1',kind:'audio',key:'audio:'+key},bytes});
  f.cloud.live.readFile=async(_key,offset)=>offset===0?{key,offset,size:bytes.length,base64:bytes.subarray(0,65536).toString('base64')}:null;
  const downloaded=await f.cloud.download({key,track});assert.deepEqual(await fs.readFile(downloaded.fullPath),bytes);
  assert.equal(f.net.calls.find(c=>c.url.includes('alt=media')).byteRange,'bytes=65536-');
  await fs.unlink(downloaded.fullPath);f.net.calls.length=0;
  f.cloud.live.readFile=async(_key,offset)=>({key,offset,size:bytes.length,base64:Buffer.alloc(Math.min(65536,bytes.length-offset),1).toString('base64')});
  assert.deepEqual(await fs.readFile((await f.cloud.download({key,track})).fullPath),bytes);
  assert.equal(f.net.calls.find(c=>c.url.includes('alt=media')).byteRange,undefined);
 }finally{await f.cleanup();}
});

test('switching accounts during peer receipt cannot import the old recording',async()=>{
 const f=await fixture();try{
  const bytes=Buffer.from('private recording'),key=crypto.createHash('sha256').update(bytes).digest('hex');
  f.cloud.live.readFile=async()=>{f.cloud.auth.account='different';return {key,offset:0,size:bytes.length,base64:bytes.toString('base64')};};
  await assert.rejects(f.cloud.download({key,track:{ext:'.mp3',size:bytes.length,audioId:'old'}}),/Аккаунт/);
  await assert.rejects(fs.stat(path.join(f.cloud.cache,key+'.mp3')),error=>error.code==='ENOENT');
  assert.equal(f.net.calls.length,0);
 }finally{await f.cleanup();}
});

test('peer source registry rejects paths, edited files, revoked access and other accounts',async()=>{
 const f=await fixture();try{
  const source=path.join(f.root,'Local.mp3');await fs.writeFile(source,'recording');const info=await f.cloud.fingerprint(source);
  assert.equal((await f.cloud.peerFiles.read({key:info.key,offset:0})).size,9);
  assert.equal(await f.cloud.peerFiles.read({key:source,offset:0}),null);
  f.cloud.auth.account='other';assert.equal(await f.cloud.peerFiles.read({key:info.key,offset:0}),null);f.cloud.auth.account='account';
  await fs.writeFile(source,'user edit changes size');assert.equal(await f.cloud.peerFiles.read({key:info.key,offset:0}),null);
 }finally{await f.cleanup();}
});
test('a prepared new recording is advertised before any Drive lookup can block it',async()=>{
 const f=await fixture();try{
  const bytes=Buffer.from('ready local recording'),source=path.join(f.root,'Ready.mp3');await fs.writeFile(source,bytes);
  const info=await f.cloud.fingerprint(source),published=[];f.cloud.realtime.enqueue=async op=>published.push(structuredClone(op));
  let release,entered;const blocked=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),find=f.cloud.find.bind(f.cloud);
  f.cloud.find=async(...args)=>{entered();await blocked;return find(...args);};
  const operation={version:1,id:crypto.randomUUID(),device:'pc',clock:1,kind:'track',key:info.key,track:{title:'Ready',artist:'Artist',ext:'.mp3',size:bytes.length,audioId:'pending',audioKey:info.key,normalization:{profile:'constant-lufs7-tp1-original-v1',targetLUFS:-7,gainDb:0,integrated:-7,truePeak:-1}}};
  await f.cloud.publish({operation,source});await started;
  try{assert.equal(published[0].kind,'track-preview');assert.equal(published[0].track.audioId,'peer');assert.equal(JSON.stringify(published[0]).includes(source),false);
   assert.equal((await f.cloud.peerFiles.read({key:info.key,offset:0})).base64,bytes.toString('base64'));
  }finally{release();await settle(f.cloud);}
  assert.equal(published.at(-1).kind,'track');assert.notEqual(published.at(-1).track.audioId,'pending');
 }finally{await f.cleanup();}
});

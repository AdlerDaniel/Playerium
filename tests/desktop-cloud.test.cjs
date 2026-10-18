const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {DesktopCloud}=require('../desktop-cloud');
function fakeDrive(){let count=0,failAfterChunk=false;const files=new Map(),sessions=new Map(),calls=[];const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers});return {files,sessions,calls,setFailure:value=>failAfterChunk=value,fetch:async(url,options={})=>{
 calls.push({url,range:options.headers?.['Content-Range']});const u=new URL(url);
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
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-cloud-'));const net=fakeDrive(),allowed=new Set([root]);const cloud=new DesktopCloud({app:{getPath:name=>name==='userData'?path.join(root,'profile'):path.join(root,'music')},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},authorize:async source=>{const value=await fs.realpath(source);assert.ok([...allowed].some(p=>value.startsWith(p+path.sep)));return value;},onRoot:async root=>allowed.add(root),openExternal:()=>{},fetcher:net.fetch});cloud.auth={enabled:true,account:'account',refreshToken:'test-refresh',accessToken:'test-token',expires:Date.now()+3600000};return {root,net,cloud,cleanup:async()=>{cloud.auth.enabled=false;clearTimeout(cloud.retry);while(cloud.running)await new Promise(r=>setTimeout(r,5));await fs.rm(root,{recursive:true,force:true});}};}
const settle=async cloud=>{while(cloud.running)await new Promise(r=>setTimeout(r,5));};
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

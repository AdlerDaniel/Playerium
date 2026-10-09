const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {DesktopUpdater,safeURL,newer,request}=require('../desktop-updater');
const {runUpdate}=require('../desktop-update-helper');
const repo='AdlerDaniel/Playerium';

test('update downloads follow validated GitHub redirects and reject unsafe or endless redirects',async()=>{
  const start=`https://github.com/${repo}/releases/download/v1.7.0/setup.exe`;
  const target='https://release-assets.githubusercontent.com/update.exe';
  const calls=[];
  const response=await request(async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'manual');
    return url===start?new Response(null,{status:302,headers:{location:target}}):new Response('verified bytes');
  },start);
  assert.deepEqual(calls,[start,target]);assert.equal(await response.text(),'verified bytes');
  for(const location of ['https://evil.test/update.exe','http://release-assets.githubusercontent.com/update.exe']) {
    let reads=0;
    await assert.rejects(request(async()=>{reads++;return new Response(null,{status:302,headers:{location}});},start),/Недопустимый/);
    assert.equal(reads,1,'An untrusted redirect must never be requested');
  }
  let loops=0;
  await assert.rejects(request(async()=>{loops++;return new Response(null,{status:307,headers:{location:start}});},start),/перенаправлений/);
  assert.equal(loops,6);
});

test('native updater rejects untrusted origins and invalid or older versions',()=>{
  assert.ok(newer('1.4.0','1.3.1'));assert.equal(newer('1.4.0-beta.1','1.3.1'),false);assert.equal(newer('1.3.0','1.3.1'),false);
  for(const url of ['http://github.com/AdlerDaniel/Playerium/releases/download/v1/test.exe','https://evil.test/update.exe','https://github.com/other/repo/releases/download/v1/test.exe','https://github.com@evil.test/AdlerDaniel/Playerium/releases/download/v1/test.exe'])assert.throws(()=>safeURL(url));
});

test('Windows updater verifies bytes before launching and duplicate clicks start one download',{skip:process.platform!=='win32'},async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-updater-'));let quits=0,launches=0,reads=0;
  const bytes=Buffer.from('MZ verified update fixture'),digest=createHash('sha256').update(bytes).digest('hex');
  const asset={name:'Playerium.Setup.1.4.0.exe',size:bytes.length,digest:'sha256:'+digest,browser_download_url:`https://github.com/${repo}/releases/download/v1.4.0/setup.exe`};
  const states=[];let launchedArgs;
  const app={isPackaged:true,getVersion:()=> '1.3.1',getAppPath:()=>path.join(folder,'app.asar'),getPath:key=>key==='exe'?path.join(folder,'installed','Playerium.exe'):folder,quit:()=>quits++};
  const fetcher=async url=>{reads++;return url.includes('api.github.com')?Response.json({tag_name:'v1.4.0',assets:[asset]}):new Response(bytes);};
  const launcher=(_exe,args)=>{launches++;launchedArgs=args;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
  try{
    const helperOptions={prepare:async()=>path.join(folder,'Playerium Update.exe'),waitReady:async()=>{}};
    const updater=new DesktopUpdater({app,fetcher,launcher,onState:s=>states.push(s),...helperOptions});
    await assert.rejects(updater.install({latestVersion:'1.4.0',repo:'other/repo'}),/недоступно/);
    await assert.rejects(updater.install({latestVersion:'1.3.0'}),/недоступно/);
    await Promise.all([updater.install({latestVersion:'1.4.0'}),updater.install({latestVersion:'1.4.0'})]);
    assert.equal(launches,1);assert.equal(reads,2);assert.equal(states.at(-1).state,'installing');
    assert.equal(launchedArgs[0],'--playerium-update-helper');
    const config=JSON.parse(await fs.readFile(launchedArgs[1],'utf8'));
    assert.equal(config.digest,digest);assert.equal(config.portable,false);
    await new Promise(r=>setTimeout(r,220));assert.equal(quits,1);
    const tampered=new DesktopUpdater({app,fetcher:async url=>url.includes('api.github.com')?Response.json({tag_name:'v1.4.0',assets:[asset]}):new Response(Buffer.alloc(bytes.length)),launcher,...helperOptions});
    await assert.rejects(tampered.install({latestVersion:'1.4.0'}),/повреждён/);assert.equal(launches,1);
    // A failed attempt can be retried, and stale/unsupported requests never spawn.
    tampered.fetcher=fetcher;await tampered.install({latestVersion:'1.4.0'});assert.equal(launches,2);
    await new Promise(r=>setTimeout(r,220));
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('portable helper verifies, replaces and restarts without a shell',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),"Playerium O'Brien "));
  const source=path.join(folder,'update.exe'),target=path.join(folder,'Playerium.exe'),result=path.join(folder,'result.json');
  const bytes=Buffer.from('new executable');const launches=[];
  try{
    await fs.writeFile(source,bytes);await fs.writeFile(target,'old executable');
    await runUpdate({parentId:123,source,target,portable:true,result,digest:createHash('sha256').update(bytes).digest('hex')},{parentAlive:()=>false,launchProcess:async(...args)=>launches.push(args)});
    assert.deepEqual(await fs.readFile(target),bytes);assert.deepEqual(launches,[[target,[],false]]);
    assert.equal(JSON.parse(await fs.readFile(result,'utf8')).state,'complete');
    await assert.rejects(fs.stat(source));
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('installer helper waits for installation then explicitly restarts the installed app',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-installer-')),source=path.join(folder,'setup.exe'),target=path.join(folder,'Playerium.exe'),result=path.join(folder,'result.json');
  const launches=[];try{
    await fs.writeFile(source,'installer');await fs.writeFile(target,'old app');
    await runUpdate({parentId:123,source,target,portable:false,result,digest:createHash('sha256').update('installer').digest('hex')},{parentAlive:()=>false,launchProcess:async(...args)=>launches.push(args)});
    assert.deepEqual(launches,[[source,['/S','--updated','/D='+folder],true],[target,[],false]]);
    assert.equal(JSON.parse(await fs.readFile(result,'utf8')).state,'complete');
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('portable restart failure restores the previous executable and reports failure',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-rollback-')),source=path.join(folder,'new.exe'),target=path.join(folder,'Playerium.exe'),result=path.join(folder,'result.json');let launches=0;
 try{
  await fs.writeFile(source,'new');await fs.writeFile(target,'previous');
  await assert.rejects(runUpdate({parentId:1,source,target,portable:true,result,digest:createHash('sha256').update('new').digest('hex')},{parentAlive:()=>false,launchProcess:async()=>{if(launches++===0)throw Error('cannot launch new executable');}}),/cannot launch/);
  assert.equal(await fs.readFile(target,'utf8'),'previous');assert.equal(JSON.parse(await fs.readFile(result,'utf8')).state,'failed');assert.equal(launches,2);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('failed helper startup leaves Playerium running and exposes a retry', {skip:process.platform!=='win32'},async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-helper-failed-'));let quits=0;
  const bytes=Buffer.from('installer'),digest=createHash('sha256').update(bytes).digest('hex');
  const app={isPackaged:true,getVersion:()=> '1.0.0',getPath:()=>folder,getAppPath:()=>folder,quit:()=>quits++};
  const child=new EventEmitter();child.unref=()=>{};
  const updater=new DesktopUpdater({app,prepare:async()=>folder,waitReady:async()=>{throw Error('helper unavailable');},launcher:()=>{queueMicrotask(()=>child.emit('spawn'));return child;},fetcher:async url=>url.includes('api.github.com')?Response.json({tag_name:'v2.0.0',assets:[{name:'setup.exe',size:bytes.length,digest:'sha256:'+digest,browser_download_url:`https://github.com/${repo}/releases/download/v2.0.0/setup.exe`}]}):new Response(bytes)});
  try{await assert.rejects(updater.install({latestVersion:'2.0.0'}),/helper unavailable/);assert.equal(quits,0);assert.equal(updater.state.state,'failed');assert.equal(updater.busy,false);}
  finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('ignored release stays hidden on startup but manual checks can show it',async()=>{
  const values=new Map();global.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};global.window={};
  const previous=global.fetch;global.fetch=async()=>Response.json({tag_name:'v9.0.0',body:'- Исправление',assets:[]});
  try{
    const {AutoUpdater}=await import('../js/updater.js');const u=new AutoUpdater();let shown=0;u.onUpdateFound=()=>shown++;
    u.ignoreVersion('9.0.0');await u.checkForUpdates();assert.equal(shown,0);await u.checkForUpdates(true);assert.equal(shown,1);
  }finally{global.fetch=previous;}
});

test('release dialog shows changes without release metadata and setup instructions',async()=>{
  const {releaseChanges}=await import('../js/update-controller.js');
  assert.deepEqual(releaseChanges('## Изменения\n- Новое обновление\n- Исправление\n\nДля перехода установите версию вручную.\nПроверено: 26 тестов'),['Новое обновление','Исправление']);
});

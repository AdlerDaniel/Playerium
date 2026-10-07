const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {DesktopUpdater,safeURL,newer,helperScript,request}=require('../desktop-updater');
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
  const app={isPackaged:true,getVersion:()=> '1.3.1',getPath:key=>key==='exe'?path.join(folder,'installed','Playerium.exe'):folder,quit:()=>quits++};
  const fetcher=async url=>{reads++;return url.includes('api.github.com')?Response.json({tag_name:'v1.4.0',assets:[asset]}):new Response(bytes);};
  const launcher=(_exe,args)=>{launches++;launchedArgs=args;const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
  try{
    const updater=new DesktopUpdater({app,fetcher,launcher,onState:s=>states.push(s)});
    await assert.rejects(updater.install({latestVersion:'1.4.0',repo:'other/repo'}),/недоступно/);
    await assert.rejects(updater.install({latestVersion:'1.3.0'}),/недоступно/);
    await Promise.all([updater.install({latestVersion:'1.4.0'}),updater.install({latestVersion:'1.4.0'})]);
    assert.equal(launches,1);assert.equal(reads,2);assert.equal(states.at(-1).state,'installing');
    const script=Buffer.from(launchedArgs.at(-1),'base64').toString('utf16le');
    assert.match(script,/\/S.*--updated.*--force-run/);assert.ok(script.includes(digest));
    await new Promise(r=>setTimeout(r,220));assert.equal(quits,1);
    const tampered=new DesktopUpdater({app,fetcher:async url=>url.includes('api.github.com')?Response.json({tag_name:'v1.4.0',assets:[asset]}):new Response(Buffer.alloc(bytes.length)),launcher});
    await assert.rejects(tampered.install({latestVersion:'1.4.0'}),/повреждён/);assert.equal(launches,1);
    // A failed attempt can be retried, and stale/unsupported requests never spawn.
    tampered.fetcher=fetcher;await tampered.install({latestVersion:'1.4.0'});assert.equal(launches,2);
    await new Promise(r=>setTimeout(r,220));
  }finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('portable helper escapes paths and replaces the launcher atomically',()=>{
  const script=helperScript({parentId:123,source:"C:\\temp\\O'Brien.exe",target:"C:\\Music Player\\Playerium.exe",portable:true,result:'C:\\temp\\result.json',digest:'a'.repeat(64)});
  assert.ok(script.includes("O''Brien.exe"));assert.match(script,/\[IO.File\]::Replace/);assert.match(script,/Security.Cryptography.SHA256/);assert.doesNotMatch(script,/\/S/);
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

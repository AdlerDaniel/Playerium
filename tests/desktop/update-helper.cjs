const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const {helperScript}=require('../../desktop-updater');
function run(exe,args){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true});let error='';child.stderr.on('data',d=>error+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(error||`Exit ${code}`)));});}
async function verifyHelper() {
  if(process.platform!=='win32')return;
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),"Playerium O'Brien "));
  const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const compiler=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const fixture=path.join(folder,'fixture.cs'),source=path.join(folder,'update.exe'),target=path.join(folder,'Playerium.exe');
  const result=path.join(folder,'result.json'),marker=path.join(folder,'launched.txt');
  try{
    await fs.writeFile(fixture,`using System;using System.IO;class Fixture{static void Main(string[] args){File.WriteAllText(@"${marker.replace(/"/g,'""')}",string.Join("|",args));}}`);
    await run(compiler,['/nologo','/target:winexe',`/out:${source}`,fixture]);
    const bytes=await fs.readFile(source),digest=createHash('sha256').update(bytes).digest('hex');
    // Wait for a real parent process, atomically replace a launcher and restart it.
    const parent=spawn(process.execPath,['-e','setTimeout(()=>{},500)'],{windowsHide:true,stdio:'ignore'});
    // Use a valid previous launcher so the recovery branch can also restart it.
    await fs.copyFile(source,target);
    const script=helperScript({parentId:parent.pid,source,target,portable:true,result,digest});
    await run(powershell,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')]);
    assert.equal(JSON.parse((await fs.readFile(result,'utf8')).replace(/^\uFEFF/,'' )).state,'complete');
    assert.equal(createHash('sha256').update(await fs.readFile(target)).digest('hex'),digest);
    for(let i=0;i<50;i++){if(await fs.stat(marker).catch(()=>null))break;await new Promise(r=>setTimeout(r,100));}
    assert.equal(await fs.readFile(marker,'utf8'),'');
    // The installer branch starts silently with automatic relaunch and a correctly quoted directory.
    await fs.copyFile(target,source);await fs.rm(marker);
    const installerScript=helperScript({parentId:99999999,source,target,portable:false,result,digest});
    await run(powershell,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(installerScript,'utf16le').toString('base64')]);
    const args=await fs.readFile(marker,'utf8');assert.ok(args.startsWith('/S|--updated|--force-run|/D='));assert.ok(args.endsWith(folder));
    assert.equal(JSON.parse((await fs.readFile(result,'utf8')).replace(/^\uFEFF/,'' )).state,'complete');
    console.log('Windows update helper: verified replacement, silent installer handoff and restart');
  }catch(error){
    const status=await fs.readFile(result,'utf8').catch(()=> 'No helper status was written');
    throw new Error(`${error.message}\nUpdate helper status: ${status}`,{cause:error});
  }finally{await fs.rm(folder,{recursive:true,force:true});}
}
module.exports=verifyHelper;
if(require.main===module)verifyHelper().catch(e=>{console.error(e);process.exitCode=1;});

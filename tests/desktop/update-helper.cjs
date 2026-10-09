const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const {runUpdate}=require('../../desktop-update-helper');
function run(exe,args){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{windowsHide:true});let error='';child.stderr.on('data',d=>error+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(error||`Exit ${code}`)));});}
async function verifyHelper() {
 if(process.platform!=='win32')return;
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),"Playerium O'Brien "));
 const compiler=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const fixture=path.join(folder,'fixture.cs'),source=path.join(folder,'update.exe'),target=path.join(folder,'Playerium.exe');
 const result=path.join(folder,'result.json'),marker=path.join(folder,'launched.txt');
 try{
  await fs.writeFile(fixture,`using System;using System.IO;class Fixture{static void Main(string[] args){string line=Environment.CommandLine;int start=line.IndexOf("/S --updated /D=");File.AppendAllText(@"${marker.replace(/"/g,'""')}",start<0?"\\n":line.Substring(start)+"\\n");}}`);
  await run(compiler,['/nologo','/target:winexe',`/out:${source}`,fixture]);
  const bytes=await fs.readFile(source),digest=createHash('sha256').update(bytes).digest('hex');
  const parent=spawn(process.execPath,['-e','setTimeout(()=>{},500)'],{windowsHide:true,stdio:'ignore'});
  await fs.copyFile(source,target);
  await runUpdate({parentId:parent.pid,source,target,portable:true,result,digest});
  assert.equal(JSON.parse(await fs.readFile(result,'utf8')).state,'complete');
  assert.equal(createHash('sha256').update(await fs.readFile(target)).digest('hex'),digest);
  for(let n=0;n<50;n++){if(await fs.stat(marker).catch(()=>null))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal((await fs.readFile(marker,'utf8')).trim(),'');
  await fs.copyFile(target,source);await fs.rm(marker);
  await runUpdate({parentId:99999999,source,target,portable:false,result,digest});
  for(let n=0;n<50;n++){if((await fs.readFile(marker,'utf8').catch(()=> '')).split('\n').length>=3)break;await new Promise(r=>setTimeout(r,100));}
  const args=await fs.readFile(marker,'utf8');assert.equal(args,'/S --updated /D='+folder+'\n\n');
  assert.equal(JSON.parse(await fs.readFile(result,'utf8')).state,'complete');
  console.log('Windows helper: real executable replacement, installer exit and automatic restart verified');
 }finally{await fs.rm(folder,{recursive:true,force:true});}
}
module.exports=verifyHelper;
if(require.main===module)verifyHelper().catch(e=>{console.error(e);process.exitCode=1;});

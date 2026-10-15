const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const PROFILE='fixed-lufs14-tp1-v1';
const FILTER='loudnorm=I=-14:TP=-1:LRA=11';
function run(executable,args){return new Promise((resolve,reject)=>{
 const child=spawn(executable,['-hide_banner','-nostdin','-y','-threads','1','-filter_threads','1',...args],{windowsHide:true,stdio:['ignore','ignore','pipe']});let output='';
 const timer=setTimeout(()=>{child.kill();reject(Error('Audio preparation timed out'));},240000);
 child.stderr.on('data',data=>{output=(output+data).slice(-65536);});
 child.on('error',error=>{clearTimeout(timer);reject(error);});
 child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('Unable to prepare audio: '+output.slice(-500)));});
});}
function stats(log){const json=log.match(/\{\s*"input_i"[\s\S]*?\}/g)?.at(-1);if(!json)throw Error('Missing loudness measurement');return JSON.parse(json);}
function secondPass(s){
 if(!Number.isFinite(Number(s.input_i)))return 'anull';
 for(const key of ['input_i','input_tp','input_lra','input_thresh','target_offset'])if(!Number.isFinite(Number(s[key])))throw Error('Invalid loudness measurement');
 return `${FILTER}:measured_I=${s.input_i}:measured_TP=${s.input_tp}:measured_LRA=${s.input_lra}:measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true`;
}
class PreparedAudio{
 constructor(executable,directory){this.executable=executable;this.directory=directory;this.pending=new Map();this.tail=Promise.resolve();this.errors=new Set();}
 async status(files){let ready=0,failed=0;for(const file of new Set(files)){try{if(await this.cached(file))ready++;else if(this.errors.has(file))failed++;}catch{failed++;}}return {total:new Set(files).size,ready,failed,pending:this.pending.size,active:this.pending.size>0};}
 async key(file){const s=await fs.stat(file);return createHash('sha256').update(`${file}|${s.size}|${s.mtimeMs}|${PROFILE}`).digest('hex');}
 async cached(file){const key=await this.key(file),target=path.join(this.directory,key+'.m4a');try{const s=await fs.stat(target);return s.size>32?target:null;}catch{return null;}}
 async prepare(file){
  const key=await this.key(file),ready=await this.cached(file);if(ready)return ready;if(this.pending.has(key))return this.pending.get(key);
  const target=path.join(this.directory,key+'.m4a');
  const task=this.tail.catch(()=>{}).then(async()=>{
   await fs.mkdir(this.directory,{recursive:true});const temporary=path.join(this.directory,key+'-'+randomUUID()+'.part.m4a');
   try{
    const first=stats(await run(this.executable,['-i',file,'-map','0:a:0','-vn','-af',FILTER+':print_format=json','-f','null','-']));
    await run(this.executable,['-i',file,'-map','0:a:0','-vn','-map_metadata','0','-af',secondPass(first),'-ar','48000','-c:a','aac','-b:a','256k','-movflags','+faststart',temporary]);
    if(key!==await this.key(file))throw Error('Audio changed during preparation');
    if((await fs.stat(temporary)).size<=32)throw Error('Empty prepared audio');
    await fs.rename(temporary,target);return target;
   }finally{await fs.rm(temporary,{force:true});}
  });
  this.tail=task;this.pending.set(key,task);try{const ready=await task;this.errors.delete(file);return ready;}catch(error){this.errors.add(file);throw error;}finally{this.pending.delete(key);}
 }
}
module.exports={PreparedAudio,PROFILE,FILTER,run,stats,secondPass};

const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createReadStream}=require('node:fs');
const {run,stats}=require('./desktop-normalization');
const PROFILE='constant-lufs18-tp1-original-v2',TARGET=-18,CEILING=-1;
const hashText=value=>crypto.createHash('sha256').update(value).digest('hex');
async function hash(file){const digest=crypto.createHash('sha256');for await(const bytes of createReadStream(file))digest.update(bytes);return digest.digest('hex');}
async function atomic(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const temporary=file+'.'+crypto.randomUUID()+'.tmp';try{const handle=await fs.open(temporary,'wx');try{await handle.writeFile(JSON.stringify(data));await handle.sync();}finally{await handle.close();}await fs.rename(temporary,file);}finally{await fs.rm(temporary,{force:true});}}
function gain(integrated,peak){const requested=TARGET-integrated,headroom=CEILING-peak;return Math.min(requested,headroom);}
function encoder(ext){return ({'.mp3':['-c:a','libmp3lame','-q:a','0','-id3v2_version','3'],'.flac':['-c:a','flac','-compression_level','5'],'.wav':['-c:a','pcm_s24le'],'.ogg':['-c:a','libvorbis','-q:a','8'],'.opus':['-c:a','libopus','-b:a','256k'],'.wma':['-c:a','wmav2','-b:a','192k'],'.m4a':['-c:a','aac','-b:a','320k','-movflags','+faststart'],'.aac':['-c:a','aac','-b:a','320k']})[ext];}

/** Constant gain is committed to the original once; opening a song never processes audio. */
class OriginalAudio {
 constructor(executable,directory,{beforeReplace=async()=>{}}={}){this.executable=executable;this.directory=directory;this.beforeReplace=beforeReplace;this.pending=new Map();this.errors=new Set();this.tail=Promise.resolve();}
 async stamp(file){const stat=await fs.stat(file);return hashText(file+'|'+stat.size+'|'+stat.mtimeMs+'|'+PROFILE);}
 marker(file){return path.join(this.directory,'verified-original-'+hashText(file)+'.json');}
 transaction(file){return path.join(this.directory,'transaction-original-'+hashText(file)+'.json');}
 async record(file){try{const record=JSON.parse(await fs.readFile(this.marker(file),'utf8'));return record.stamp===await this.stamp(file)&&record.normalization?.profile===PROFILE?record:null;}catch{return null;}}
 async cached(file){return await this.record(file)?file:null;}
 async acceptOriginal(file,track){if(track.normalization?.profile!==PROFILE)return;await this.commitRecord(file,{audioKey:track.audioKey,normalization:track.normalization});}
 async commitRecord(file,data){const stat=await fs.stat(file);await atomic(this.marker(file),{...data,filePath:file,stamp:await this.stamp(file),size:stat.size,lastModified:stat.mtimeMs});}
 async status(files){let ready=0,failed=0;const unique=[...new Set(files)],records=[];for(const file of unique){const record=await this.record(file);if(record){ready++;records.push(record);}else if(this.errors.has(file))failed++;}return {supported:true,writesOriginal:true,targetLUFS:TARGET,total:unique.length,ready,failed,pending:this.pending.size,active:this.pending.size>0,records};}
 async recover(file){
  let job;try{job=JSON.parse(await fs.readFile(this.transaction(file),'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(job.file!==file||![job.input,job.output].every(p=>path.dirname(p)===this.directory))throw Error('Invalid audio recovery record');
  const current=await hash(file);
  if(current===job.after)await this.commitRecord(file,job.result);
  else if(current!==job.before)throw Error('Исходный файл изменился. Резервная копия сохранена для восстановления.');
  await fs.rm(this.transaction(file),{force:true});await fs.rm(job.input,{force:true});await fs.rm(job.output,{force:true});
 }
 async measure(file){return stats(await run(this.executable,['-xerror','-i',file,'-map','0:a:0','-vn','-af','loudnorm=I=-18:TP=-1:LRA=50:print_format=json','-f','null','-']));}
 async prepareBackup(file,expected){await this.recover(file);const ready=await this.record(file);if(ready)return ready;if(await hash(file)!==expected)throw Error('Резервная копия изменилась.');await this.prepare(file);return this.record(file);}
 async prepare(file){
  if(this.pending.has(file))return this.pending.get(file);
  const task=this.tail.catch(()=>{}).then(()=>this.process(file));this.pending.set(file,task);this.tail=task;
  try{const result=await task;this.errors.delete(file);return result;}catch(error){this.errors.add(file);throw error;}finally{this.pending.delete(file);}
 }
 async process(file){
  await fs.mkdir(this.directory,{recursive:true});await this.recover(file);if(await this.cached(file))return file;
  const ext=path.extname(file).toLowerCase(),codec=encoder(ext);if(!codec)throw Error('Неподдерживаемый формат песни.');
  const stamp=await this.stamp(file),input=path.join(this.directory,'source-'+crypto.randomUUID()+ext),output=path.join(this.directory,'result-'+crypto.randomUUID()+ext);
  let transaction=false;const stage=path.join(path.dirname(file),'.playerium-'+crypto.randomUUID()+ext);
  try{
   await fs.copyFile(file,input);const before=await hash(input);if(stamp!==await this.stamp(file)||before!==await hash(file))throw Error('Песня изменилась во время подготовки.');
   const measurement=await this.measure(input),integrated=Number(measurement.input_i),peak=Number(measurement.input_tp);
   let correction=Number.isFinite(integrated)&&Number.isFinite(peak)?gain(integrated,peak):0,actual=measurement;
   const changed=Math.abs(correction)>=.05;if(!changed)correction=0;
   if(changed){let verified=false;
    for(let attempt=0;attempt<3;attempt++){
     const cover=['.mp3','.m4a','.flac'].includes(ext)?['-map','0:v?','-c:v','copy']:['-vn'];
     await run(this.executable,['-xerror','-i',input,'-map','0:a:0','-map_metadata','0',...cover,'-af','volume='+correction.toFixed(9)+'dB:precision=double',...codec,output]);
     actual=await this.measure(output);const outputPeak=Number(actual.input_tp),outputI=Number(actual.input_i);
     if(!Number.isFinite(outputPeak)||!Number.isFinite(outputI)||Math.abs(outputI-(integrated+correction))>1)throw Error('Не удалось подтвердить постоянную поправку громкости.');
     if(outputPeak<=CEILING+.1){verified=true;break;}correction-=outputPeak-CEILING+.15;
    }
    if(!verified||(await fs.stat(output)).size<=32)throw Error('Не удалось подтвердить безопасную громкость.');
   }
   const result={audioKey:await hash(changed?output:input),normalization:{profile:PROFILE,targetLUFS:TARGET,gainDb:correction,integrated:Number.isFinite(integrated)?Number(actual.input_i):null,truePeak:Number.isFinite(peak)?Number(actual.input_tp):null,peakLimited:Number.isFinite(integrated)&&correction<TARGET-integrated-.15}};
   if(changed)await this.beforeReplace(file,input);
   if(stamp!==await this.stamp(file)||before!==await hash(file))throw Error('Песня изменилась во время подготовки.');
   if(changed){
    await atomic(this.transaction(file),{file,input,output,before,after:result.audioKey,result});transaction=true;
    await fs.copyFile(output,stage);const handle=await fs.open(stage,'r+');try{await handle.sync();}finally{await handle.close();}
    await fs.rename(stage,file);if(await hash(file)!==result.audioKey)throw Error('Не удалось подтвердить сохранённый файл.');
   }
   await this.commitRecord(file,result);await fs.rm(this.transaction(file),{force:true});transaction=false;return file;
  }finally{await fs.rm(stage,{force:true});if(!transaction){await fs.rm(input,{force:true});await fs.rm(output,{force:true});}}
 }
}
module.exports={OriginalAudio,PROFILE,gain,hash};

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {OriginalAudio,PROFILE,hash}=require('../desktop-original-audio');
const {run,stats}=require('../desktop-normalization');
const executable=path.resolve('build/music-tools/ffmpeg.exe');
test('transient-rich and steady recordings converge at the common target without peak limiting',{timeout:120000},async t=>{
 if(!require('node:fs').existsSync(executable)){t.skip('Requires bundled FFmpeg');return;}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-crest-'));
 try{const processor=new OriginalAudio(executable,path.join(root,'records')),levels=[];
  for(const [name,source] of [['steady','aevalsrc=0.1*sin(2*PI*440*t):s=48000:d=8'],['transients','aevalsrc=(0.04+0.12*lt(mod(t\\,1)\\,0.02))*sin(2*PI*440*t):s=48000:d=8']]){
   const file=path.join(root,name+'.wav');await run(executable,['-f','lavfi','-i',source,'-c:a','pcm_s24le',file]);await processor.prepare(file);const record=await processor.record(file);levels.push(record.normalization.integrated);assert.ok(Math.abs(record.normalization.integrated+18)<.6);assert.ok(record.normalization.truePeak<=-.9);assert.equal(record.normalization.peakLimited,false);
  }assert.ok(Math.abs(levels[0]-levels[1])<.6);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Windows originals retain their path, use constant gain, preserve dynamics and reopen without processing',{timeout:120000},async t=>{
 if(!require('node:fs').existsSync(executable)){t.skip('Bundled FFmpeg is verified in desktop CI');return;}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-original-audio-'));
 try{
  const processor=new OriginalAudio(executable,path.join(root,'records')),levels=[];
  for(const [name,source] of [['quiet','sine=frequency=440:duration=8:sample_rate=48000,volume=0.03'],['loud','sine=frequency=440:duration=8:sample_rate=48000,volume=0.7']]){
   const file=path.join(root,name+'.wav');await run(executable,['-f','lavfi','-i',source,'-c:a','pcm_s24le',file]);const before=await hash(file);
   assert.equal(await processor.prepare(file),file);assert.notEqual(await hash(file),before);
   const record=await processor.record(file);assert.equal(record.normalization.profile,PROFILE);assert.equal(record.audioKey,await hash(file));
   const meter=stats(await run(executable,['-i',file,'-af','loudnorm=I=-18:TP=-1:LRA=50:print_format=json','-f','null','-']));levels.push(Number(meter.input_i));assert.ok(Math.abs(Number(meter.input_i)+18)<.6);assert.ok(Number(meter.input_tp)<=-.9);
   const reopened=new OriginalAudio('nonexistent-ffmpeg',path.join(root,'records'));assert.equal(await reopened.prepare(file),file);assert.equal((await reopened.status([file,file])).ready,1);
  }
  assert.ok(Math.abs(levels[0]-levels[1])<.4);
  const file=path.join(root,'dynamics.wav');await run(executable,['-f','lavfi','-i','aevalsrc=0.01*(1+2*gte(t\\,4))*sin(2*PI*440*t):s=48000:d=8','-c:a','pcm_s24le',file]);
  const pcm=()=>execFileSync(executable,['-hide_banner','-nostdin','-i',file,'-f','f32le','-ac','1','-ar','48000','pipe:1'],{stdio:['ignore','pipe','ignore'],maxBuffer:4*1024*1024});
  const rms=(bytes,start,end)=>{let sum=0,count=0;for(let i=Math.floor(start*48000);i<Math.floor(end*48000);i++){sum+=bytes.readFloatLE(i*4)**2;count++;}return Math.sqrt(sum/count);};
  const before=pcm();await processor.prepare(file);const after=pcm();const gainA=20*Math.log10(rms(after,.2,3.8)/rms(before,.2,3.8)),gainB=20*Math.log10(rms(after,4.2,7.8)/rms(before,4.2,7.8));assert.ok(Math.abs(gainA-gainB)<.05);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('interruption after original replacement recovers its verified marker without encoding again',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-original-recovery-'));
 try{
  const directory=path.join(root,'records');await fs.mkdir(directory);const file=path.join(root,'song.wav'),input=path.join(directory,'source.wav'),output=path.join(directory,'output.wav');
  await fs.writeFile(input,'before');await fs.writeFile(output,'after');await fs.copyFile(output,file);
  const processor=new OriginalAudio('nonexistent-ffmpeg',directory),result={audioKey:await hash(output),normalization:{profile:PROFILE,targetLUFS:-18,gainDb:5,integrated:-18,truePeak:-1,peakLimited:false}};
  await fs.writeFile(processor.transaction(file),JSON.stringify({file,input,output,before:await hash(input),after:result.audioKey,result}));
  assert.equal((await processor.prepareBackup(file,await hash(input))).audioKey,result.audioKey);assert.equal(await processor.cached(file),file);assert.equal(await fs.readFile(file,'utf8'),'after');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

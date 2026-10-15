const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {PreparedAudio,run,stats}=require('../desktop-normalization');
const executable=path.resolve('build/music-tools/ffmpeg.exe');
test('prepared recordings converge to -14 LUFS, preserve originals and skip processing on subsequent opens',{timeout:120000},async t=>{
 if(!require('node:fs').existsSync(executable)){t.skip('Bundled FFmpeg is checked in desktop CI');return;}
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-normalization-'));
 try{
  const prepare=new PreparedAudio(executable,path.join(root,'prepared')),results=[];
  for(const [name,source] of [['quiet','sine=frequency=440:duration=8:sample_rate=48000,volume=0.05'],['loud','sine=frequency=440:duration=8:sample_rate=48000,volume=0.8'],['transients','aevalsrc=0.02*sin(2*PI*440*t)+0.95*eq(mod(n\\,48000)\\,0):s=48000:d=8']]){
   const input=path.join(root,name+'.wav');await run(executable,['-f','lavfi','-i',source,'-c:a','pcm_s16le',input]);
   const before=await fs.readFile(input),output=await prepare.prepare(input);assert.notEqual(input,output);assert.deepEqual(await fs.readFile(input),before);
   const s=stats(await run(executable,['-i',output,'-af','loudnorm=I=-14:TP=-1:LRA=11:print_format=json','-f','null','-']));results.push(Number(s.input_i));
   assert.ok(Math.abs(Number(s.input_i)+14)<1,JSON.stringify(s));assert.ok(Number(s.input_tp)<=-.5,JSON.stringify(s));
   const reopened=new PreparedAudio('nonexistent-ffmpeg',path.join(root,'prepared'));assert.equal(await reopened.prepare(input),output);
   assert.deepEqual(await reopened.status([input,input]),{total:1,ready:1,failed:0,pending:0,active:false});
   await fs.appendFile(input,Buffer.from([0]));assert.equal(await reopened.cached(input),null);
  }
  assert.ok(Math.abs(results[0]-results[1])<.5);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');
function pcmPeaks(bytes,count=192){const peaks=[];const samples=Math.floor(bytes.length/2);for(let i=0;i<count;i++){let peak=0;for(let n=Math.floor(i*samples/count);n<Math.floor((i+1)*samples/count);n++)peak=Math.max(peak,Math.abs(bytes.readInt16LE(n*2))/32768);peaks.push(peak);}return peaks;}
class WaveformAnalyzer{
 constructor(executable,directory){this.executable=executable;this.directory=directory;this.pending=new Map();this.tail=Promise.resolve();}
 async analyze(file){const stat=await fs.stat(file),key=createHash('sha256').update(file+'|'+stat.size+'|'+stat.mtimeMs+'|wave-v1').digest('hex');if(this.pending.has(key))return this.pending.get(key);const target=path.join(this.directory,key+'.json');try{const saved=JSON.parse(await fs.readFile(target,'utf8'));if(saved.peaks?.length===192)return saved;}catch{}
 const task=this.tail.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const process=spawn(this.executable,['-v','error','-nostdin','-i',file,'-vn','-ac','1','-ar','8000','-f','s16le','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','ignore']});const chunks=[];let size=0,tooLarge=false;const timer=setTimeout(()=>{process.kill();reject(Error('Audio analysis timed out'));},90000);process.stdout.on('data',chunk=>{size+=chunk.length;if(size>16*1024*1024){tooLarge=true;process.kill();}else chunks.push(chunk);});process.on('error',e=>{clearTimeout(timer);reject(e);});process.on('close',async code=>{clearTimeout(timer);try{if(code!==0||tooLarge||!size)throw Error('Waveform unavailable');const result={peaks:pcmPeaks(Buffer.concat(chunks))};await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(target,JSON.stringify(result));resolve(result);}catch(e){reject(e);}});}));this.tail=task;this.pending.set(key,task);try{return await task;}finally{this.pending.delete(key);}
 }
}

// Sounder uses the loudest channel, a -45 dBFS threshold and 240 frames of padding at 48 kHz.
async function analyzeTrim(executable,file){
 const process=spawn(executable,['-v','error','-nostdin','-i',file,'-vn','-ac','2','-ar','48000','-f','s16le','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','ignore']});
 const closed=new Promise(resolve=>{process.once('error',()=>resolve(-1));process.once('close',resolve);});
 const timeout=setTimeout(()=>process.kill(),90000);
 let frame=0,first=-1,last=0,remainder=Buffer.alloc(0);
 try{
  for await(const chunk of process.stdout){
   const bytes=remainder.length?Buffer.concat([remainder,chunk]):chunk;
   const end=bytes.length-bytes.length%4;
   for(let i=0;i<end;i+=4,frame++)if(Math.max(Math.abs(bytes.readInt16LE(i)),Math.abs(bytes.readInt16LE(i+2)))>184){
    if(first<0)first=frame;
    last=frame+1;
   }
   remainder=bytes.subarray(end);
  }
  if(await closed!==0||!frame)throw Error('Не удалось проанализировать звук.');
  return {start:first<0?0:Math.max(0,first-240)/48000,end:first<0?frame/48000:Math.min(frame,last+240)/48000,duration:frame/48000};
 }finally{clearTimeout(timeout);process.kill();}
}
module.exports={WaveformAnalyzer,pcmPeaks,analyzeTrim};

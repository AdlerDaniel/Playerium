const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');
function loudnessGain(stats){
 const integrated=Number(stats.input_i),peak=Number(stats.input_tp);
 if(!Number.isFinite(integrated)||!Number.isFinite(peak)||integrated<-60)return 1;
 return Math.pow(10,Math.max(-30,Math.min(18,-18-integrated,-1-peak))/20);
}
function measure(executable,file){return new Promise((resolve,reject)=>{
 const child=spawn(executable,['-hide_banner','-nostdin','-i',file,'-vn','-af','loudnorm=I=-18:TP=-1:LRA=11:print_format=json','-f','null','-'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let output='',finished=false;const timer=setTimeout(()=>{child.kill();reject(Error('Loudness analysis timed out'));},90000);
 child.stderr.on('data',data=>{output=(output+data.toString()).slice(-65536);});
 child.on('error',error=>{clearTimeout(timer);reject(error);});
 child.on('close',code=>{clearTimeout(timer);if(finished)return;finished=true;try{if(code!==0)throw Error('Unable to analyze audio');const json=output.match(/\{\s*"input_i"[\s\S]*?\}/g)?.at(-1);if(!json)throw Error('Missing loudness measurement');const stats=JSON.parse(json);resolve({gain:loudnessGain(stats),integrated:Number.isFinite(Number(stats.input_i))?Number(stats.input_i):null,peak:Number.isFinite(Number(stats.input_tp))?Number(stats.input_tp):null});}catch(e){reject(e);}});
});}
class LoudnessAnalyzer{
 constructor(executable,directory){this.executable=executable;this.directory=directory;this.pending=new Map();this.tail=Promise.resolve();}
 async analyze(file){
  const stat=await fs.stat(file),key=createHash('sha256').update(file+'|'+stat.size+'|'+stat.mtimeMs+'|lufs-v1').digest('hex');
  if(this.pending.has(key))return this.pending.get(key);
  const target=path.join(this.directory,key+'.json');
  try{const cached=JSON.parse(await fs.readFile(target,'utf8'));if(Number.isFinite(cached.gain)&&cached.gain>0&&cached.gain<=8)return cached;}catch{}
  const task=this.tail.catch(()=>{}).then(async()=>{const result=await measure(this.executable,file);await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(target,JSON.stringify(result));return result;});
  this.tail=task;this.pending.set(key,task);try{return await task;}finally{this.pending.delete(key);}
 }
}
module.exports={LoudnessAnalyzer,loudnessGain,measure};

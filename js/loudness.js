// Gated integrated loudness for local browser files; native apps use FFmpeg's true-peak measurement.
export function integratedLoudness(channels,rate){
 const block=Math.round(rate*.4),hop=Math.round(rate*.1),length=channels[0]?.length||0,energies=[];
 if(!length)return -Infinity;
 const weights=channels.length===6?[1,1,1,0,1.41,1.41]:channels.map(()=>1);
 const prefix=new Float64Array(length+1);
 for(let i=0;i<length;i++){let sum=0;for(let c=0;c<channels.length;c++)sum+=channels[c][i]**2*weights[c];prefix[i+1]=prefix[i]+sum;}
 for(let start=0;start+block<=length;start+=hop)energies.push((prefix[start+block]-prefix[start])/block);
 if(!energies.length)energies.push(prefix[length]/length);
 const loud=e=>-.691+10*Math.log10(e),absolute=energies.filter(e=>loud(e)>=-70);
 if(!absolute.length)return -Infinity;
 const relative=loud(absolute.reduce((a,b)=>a+b,0)/absolute.length)-10,accepted=absolute.filter(e=>loud(e)>=relative);
 return loud(accepted.reduce((a,b)=>a+b,0)/accepted.length);
}
export function normalizationGain(integrated,peak){if(!Number.isFinite(integrated)||!Number.isFinite(peak)||integrated<-60)return 1;return 10**(Math.max(-30,Math.min(18,-18-integrated,-1-peak))/20);}
export async function browserLoudness(file,context){
 const decoded=await context.decodeAudioData(await file.arrayBuffer());
 const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext,offline=new Offline(decoded.numberOfChannels,decoded.length,decoded.sampleRate);
 const source=offline.createBufferSource();source.buffer=decoded;
 const shelf=offline.createBiquadFilter();shelf.type='highshelf';shelf.frequency.value=1681.974;shelf.gain.value=4;
 const highpass=offline.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=38.135;highpass.Q.value=.500327;
 source.connect(shelf);shelf.connect(highpass);highpass.connect(offline.destination);source.start();
 const weighted=await offline.startRendering(),channels=[];let peak=0;
 for(let c=0;c<decoded.numberOfChannels;c++){channels.push(weighted.getChannelData(c));const input=decoded.getChannelData(c);for(let i=0;i<input.length;i++)peak=Math.max(peak,Math.abs(input[i]));}
 const integrated=integratedLoudness(channels,weighted.sampleRate);
 return {gain:normalizationGain(integrated,20*Math.log10(peak)+1),integrated};
}

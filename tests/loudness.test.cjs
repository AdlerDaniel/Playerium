const {test}=require('node:test'),assert=require('node:assert/strict');
const {loudnessGain}=require('../desktop-loudness');
test('normalization matches integrated loudness, protects peaks and leaves silence unamplified',()=>{
 const quiet={input_i:'-30',input_tp:'-20'},loud={input_i:'-6',input_tp:'-1'};
 assert.ok(Math.abs((-30+20*Math.log10(loudnessGain(quiet)))-(-6+20*Math.log10(loudnessGain(loud))))<.01);
 assert.equal(loudnessGain({input_i:'-inf',input_tp:'-inf'}),1);
 assert.equal(loudnessGain({input_i:'-70',input_tp:'-65'}),1);
 assert.ok(-.1+20*Math.log10(loudnessGain({input_i:'-30',input_tp:'-.1'}))<=-1);
 assert.ok(loudnessGain({input_i:'-55',input_tp:'-40'})<=8);
});
test('browser integrated measurement gates silence and normalizes a 24 dB recording difference',async()=>{
 const {integratedLoudness,normalizationGain}=await import('../js/loudness.js');
 const tone=amplitude=>Float32Array.from({length:8000*5},(_,i)=>Math.sin(i*2*Math.PI*440/8000)*amplitude);
 const q=integratedLoudness([tone(.05)],8000),l=integratedLoudness([tone(.8)],8000);
 assert.ok(Math.abs(q+20*Math.log10(normalizationGain(q,-25))-l-20*Math.log10(normalizationGain(l,-1)))<.01);
 assert.equal(integratedLoudness([new Float32Array(8000)],8000),-Infinity);
 const silentIntro=new Float32Array(8000*15);silentIntro.set(tone(.05),8000*10);assert.ok(Math.abs(integratedLoudness([silentIntro],8000)-q)<1);
});

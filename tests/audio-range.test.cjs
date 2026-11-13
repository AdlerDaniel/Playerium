const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {audioResponse,byteRange}=require('../desktop-audio');
test('audio byte ranges support bounded, open and suffix intervals and reject invalid intervals',()=>{
 assert.deepEqual(byteRange('bytes=10-19',100),{start:10,end:19});assert.deepEqual(byteRange('bytes=90-',100),{start:90,end:99});assert.deepEqual(byteRange('bytes=-5',100),{start:95,end:99});assert.deepEqual(byteRange('bytes=99-500',100),{start:99,end:99});
 for(const value of ['bytes=100-','bytes=20-10','bytes=-0','bytes=0-1,4-5','bytes=9007199254740993-','bytes=-'])assert.equal(byteRange(value,100),false);
});
test('audio response streams exactly requested bytes, preserves MIME and provides HEAD and 416 metadata',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'playerium-range-')),file=path.join(dir,'song.m4a');try{
 await fs.writeFile(file,Buffer.from(Array.from({length:100},(_,i)=>i)));
 let r=await audioResponse(file,new Request('https://example.test',{headers:{Range:'bytes=10-19'}}));assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 10-19/100');assert.equal(r.headers.get('content-type'),'audio/mp4');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[10,11,12,13,14,15,16,17,18,19]);
 r=await audioResponse(file,new Request('https://example.test',{method:'HEAD'}));assert.equal(r.headers.get('content-length'),'100');assert.equal((await r.arrayBuffer()).byteLength,0);
 r=await audioResponse(file,new Request('https://example.test',{headers:{Range:'bytes=100-'}}));assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */100');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

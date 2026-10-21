const fs=require('node:fs/promises');
const valid=key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key);
// Only files whose bytes were fingerprinted by the native cloud layer are served.
class PeerFiles {
 constructor(account,authorize){this.account=account;this.authorize=authorize;this.sources=new Map();this.files=new Map();}
 async remember(file,key){
  const account=this.account();if(!account||!valid(key))return;
  const stat=await fs.stat(file);if(account!==this.account()||!stat.isFile())return;
  const record={file,size:stat.size,modified:stat.mtimeMs};
  this.sources.set(account+':'+key,record);this.files.set(account+':'+file,record);
  if(this.sources.size>10000)this.sources.delete(this.sources.keys().next().value);
 }
 async ensure(file,fingerprint){
  const account=this.account(),stat=await fs.stat(file),record=this.files.get(account+':'+file);
  if(record&&record.size===stat.size&&record.modified===stat.mtimeMs)return;
  await fingerprint(file);
 }
 async read({key,offset}){
  if(!valid(key)||!Number.isSafeInteger(offset)||offset<0)return null;
  const account=this.account(),source=this.sources.get(account+':'+key);if(!account||!source||offset>=source.size)return null;
  try{
   const file=await this.authorize(source.file),handle=await fs.open(file,'r');
   try{
    const stat=await handle.stat();if(stat.size!==source.size||stat.mtimeMs!==source.modified||account!==this.account())return null;
    const bytes=Buffer.alloc(Math.min(65536,source.size-offset)),result=await handle.read(bytes,0,bytes.length,offset);
    const after=await handle.stat();if(result.bytesRead!==bytes.length||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||account!==this.account())return null;
    return {key,offset,size:source.size,base64:bytes.toString('base64')};
   }finally{await handle.close();}
  }catch{return null;}
 }
}
// A disconnected peer leaves a resumable prefix for the authenticated Drive fallback.
async function receivePeer(live,{key,size,file,check}){
 let offset=await fs.stat(file).then(s=>s.size).catch(()=>0);
 if(offset>=size){await fs.rm(file,{force:true});offset=0;}
 const output=await fs.open(file,offset?'a':'w');
 try{
  while(offset<size){
   check();const chunk=await live?.readFile(key,offset);check();if(!chunk)return false;
   const bytes=Buffer.from(chunk.base64,'base64');
   if(chunk.key!==key||chunk.offset!==offset||chunk.size!==size||bytes.length<1||bytes.length>65536||offset+bytes.length>size)throw Error('Invalid peer recording');
   await output.write(bytes);offset+=bytes.length;
  }
  await output.sync();return true;
 }finally{await output.close();}
}
module.exports={PeerFiles,receivePeer};

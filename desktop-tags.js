const fs=require('node:fs/promises'),{createReadStream,createWriteStream}=require('node:fs'),{pipeline}=require('node:stream/promises');
const syncSafe=value=>Buffer.from([(value>>21)&127,(value>>14)&127,(value>>7)&127,value&127]);
async function embedMp3Lyrics(file,plain){
  if(typeof plain!=='string'||!plain.trim())return;
  plain=plain.replace(/\0/g,'').slice(0,100000);
  const input=await fs.open(file,'r');let version=3,offset=0,frames=[];
  try{
    const header=Buffer.alloc(10);const {bytesRead}=await input.read(header,0,10,0);
    if(bytesRead===10&&header.toString('ascii',0,3)==='ID3'){
      version=header[3];if(![3,4].includes(version)||header[5]!==0)throw Error('Unsupported ID3 layout');
      const size=(header[6]<<21)|(header[7]<<14)|(header[8]<<7)|header[9];if(size>8*1024*1024)throw Error('ID3 tag too large');offset=10+size;
      const data=Buffer.alloc(size);let read=0;while(read<size){const n=(await input.read(data,read,size-read,10+read)).bytesRead;if(!n)throw Error('Incomplete ID3 tag');read+=n;}
      for(let at=0;at+10<=size;){const id=data.toString('ascii',at,at+4);if(!/^[A-Z0-9]{4}$/.test(id))break;const length=version===4?((data[at+4]<<21)|(data[at+5]<<14)|(data[at+6]<<7)|data[at+7]):data.readUInt32BE(at+4);if(length<0||at+10+length>size)throw Error('Invalid ID3 frame');if(id!=='USLT')frames.push(data.subarray(at,at+10+length));at+=10+length;}
    }
  }finally{await input.close();}
  const content=Buffer.concat([Buffer.from([1,117,110,100,255,254,0,0,255,254]),Buffer.from(plain,'utf16le'),Buffer.from([0,0])]),frame=Buffer.alloc(10);frame.write('USLT');(version===4?syncSafe(content.length):Buffer.alloc(4)).copy(frame,4);if(version===3)frame.writeUInt32BE(content.length,4);frames.push(frame,content);
  const body=Buffer.concat(frames),header=Buffer.concat([Buffer.from([73,68,51,version,0,0]),syncSafe(body.length)]),temporary=file+'.lyrics-'+require('node:crypto').randomUUID()+'.tmp';
  try{
    await fs.writeFile(temporary,Buffer.concat([header,body]),{flag:'wx'});
    await pipeline(createReadStream(file,{start:offset}),createWriteStream(temporary,{flags:'a'}));await fs.rename(temporary,file);
  }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
}
module.exports={embedMp3Lyrics};

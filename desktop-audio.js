const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {Readable}=require('node:stream');
const types={'.mp3':'audio/mpeg','.m4a':'audio/mp4','.mp4':'audio/mp4','.aac':'audio/aac','.wav':'audio/wav','.flac':'audio/flac','.ogg':'audio/ogg','.opus':'audio/ogg','.aiff':'audio/aiff','.aif':'audio/aiff'};
function byteRange(value,size) {
  if(!value)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if(!match||(!match[1]&&!match[2])||!size)return false;
  let start,end;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return false;start=Math.max(0,size-suffix);end=size-1;}
  else {start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
  return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start<size&&start<=end?{start,end}:false;
}
async function audioResponse(file,request) {
  const stat=await fsp.stat(file);if(!stat.isFile())return new Response('Not found',{status:404});
  const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'};
  const range=byteRange(request.headers.get('range'),stat.size);
  if(range===false)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${stat.size}`}});
  const start=range?.start||0,end=range?.end??stat.size-1;
  headers['Content-Length']=String(range?end-start+1:stat.size);
  if(range)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  const status=range?206:200;
  if(request.method==='HEAD'||!stat.size)return new Response(null,{status,headers});
  const stream=fs.createReadStream(file,{start,end});
  return new Response(Readable.toWeb(stream),{status,headers});
}
async function preserveSources(sources,file,before,directory){
  if(![...sources.values()].some(source=>source.playable===file))return;
  await fsp.mkdir(directory,{recursive:true});
  const snapshot=path.join(directory,'playback-'+require('node:crypto').randomUUID()+path.extname(file));
  await fsp.copyFile(before,snapshot);let retained=false;
  for(const source of sources.values())if(source.playable===file){source.playable=snapshot;source.snapshot=snapshot;retained=true;}
  if(!retained)await fsp.rm(snapshot,{force:true});
}
function releaseSource(sources,id){
  const source=sources.get(id);sources.delete(id);
  if(source?.snapshot&&![...sources.values()].some(other=>other.snapshot===source.snapshot))fsp.rm(source.snapshot,{force:true}).catch(()=>{});
}
async function cleanPlaybackSnapshots(directory){
  let names;try{names=await fsp.readdir(directory);}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const name of names)if(/^playback-[a-f0-9-]{36}\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)$/i.test(name))await fsp.rm(path.join(directory,name),{force:true});
}
module.exports={audioResponse,byteRange,preserveSources,releaseSource,cleanPlaybackSnapshots};

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
module.exports={audioResponse,byteRange};

// Chromium uses the system network configuration. Upload checkpoints return 308,
// which net.fetch otherwise treats as a cancelled redirect.
function createCloudFetcher(net){return (url,options={})=>{
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!['www.googleapis.com','oauth2.googleapis.com'].includes(parsed.hostname)||parsed.port)throw Error('Invalid Google address');
 if(options.redirect!=='manual')return net.fetch(url,options);
 return new Promise((resolve,reject)=>{
  const request=net.request({url,method:options.method||'GET',redirect:'manual'});
  let settled=false;const finish=(error,response)=>{if(settled)return;settled=true;options.signal?.removeEventListener('abort',abort);error?reject(error):resolve(response);};
  const abort=()=>{request.abort();finish(Error('Google request cancelled'));};
  request.on('error',error=>finish(error));
  const headers=raw=>{const result=new Headers();for(const [key,value] of Object.entries(raw||{}))result.set(key,Array.isArray(value)?value.join(', '):value);return result;};
  request.on('redirect',(status,_method,_url,raw)=>finish(null,new Response(null,{status,headers:headers(raw)})));
  request.on('response',response=>{const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>262144){abort();return;}chunks.push(chunk);});response.on('error',error=>finish(error));response.on('end',()=>finish(null,new Response([204,205,304].includes(response.statusCode)?null:Buffer.concat(chunks),{status:response.statusCode,headers:headers(response.headers)})));});
  for(const [key,value] of new Headers(options.headers))if(key!=='content-length')request.setHeader(key,value);
  options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted){abort();return;}
  let body=options.body;if(body instanceof URLSearchParams){request.setHeader('Content-Type','application/x-www-form-urlencoded;charset=UTF-8');body=body.toString();}request.end(body);
 });
};}
module.exports={createCloudFetcher};

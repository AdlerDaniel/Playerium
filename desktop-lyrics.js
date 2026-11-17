const SOURCES={pisni:'https://pisni.in.ua',tekst:'https://tekst-pisni.com'};
function lyricsPageURL({provider,query,path}={}){
  const origin=SOURCES[provider];if(!origin)throw Error('Недопустимый источник текста');
  if(path!==undefined){
    const pattern=provider==='pisni'?/^\/[a-z0-9][a-z0-9-]{0,99}\/[a-z0-9][a-z0-9-]{0,199}\/?$/:/^\/[a-z0-9][a-z0-9-]{0,239}\/$/;
    if(typeof path!=='string'||!pattern.test(path))throw Error('Недопустимая страница текста');
    return origin+path;
  }
  if(typeof query!=='string'||!query.trim()||query.length>200)throw Error('Недопустимый поиск текста');
  return origin+(provider==='pisni'?'/search?q=':'/?s=')+encodeURIComponent(query.trim());
}
function samePage(actual,expected){
  try{const a=new URL(actual),b=new URL(expected);return a.origin===b.origin&&!a.username&&!a.password&&a.pathname.replace(/\/$/,'')===b.pathname.replace(/\/$/,'')&&[...b.searchParams].every(([key,value])=>a.searchParams.get(key)===value);}catch{return false;}
}
async function fetchLyricsPage(payload,{fetcher=fetch,signal,timeout=15000}={}){
  const url=lyricsPageURL(payload),controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const timer=setTimeout(abort,timeout);
  try{
    const response=await fetcher('https://r.jina.ai/'+url,{signal:controller.signal,credentials:'omit',redirect:'error',headers:{Accept:'application/json','X-Respond-With':'html'}});
    if(!response.ok)return {status:response.status,retryAfter:response.headers.get('Retry-After'),html:'',url};
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024){controller.abort();throw Error('Ответ источника текста слишком большой');}chunks.push(chunk);}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8')),data=result.data;
    if(result.code!==200||!data||!samePage(data.url,url)||!samePage(data.finalUrl||data.url,url))throw Error('Источник вернул другую страницу');
    const status=Number(data.httpStatus)||200;
    return {status,html:status===200&&typeof data.html==='string'?data.html:'',url};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
module.exports={lyricsPageURL,fetchLyricsPage};

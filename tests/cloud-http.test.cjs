const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createCloudFetcher}=require('../desktop-cloud-http');
test('Chromium resumable checkpoints expose 308 without following a redirect or cancelling the upload',async()=>{
 let request;const fetcher=createCloudFetcher({request:()=>{request=new EventEmitter();request.setHeader=()=>{};request.abort=()=>{};request.end=()=>queueMicrotask(()=>{request.emit('redirect',308,'PUT','https://www.googleapis.com/upload/drive/next',{range:['bytes=0-4194303']});request.emit('error',Error('Redirect was cancelled'));});return request;},fetch:()=>{throw Error('net.fetch cannot expose manual redirects');}});
 const response=await fetcher('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',{method:'PUT',redirect:'manual'});assert.equal(response.status,308);assert.equal(response.headers.get('range'),'bytes=0-4194303');
 assert.throws(()=>fetcher('https://example.com/',{}),/Invalid cloud address/);
});
test('production cloud transport permits the Playerium journal and session endpoint while rejecting other projects',async()=>{
 const calls=[],fetcher=createCloudFetcher({fetch:async(url,options)=>{calls.push({url,options});return new Response('{}');}});
 for(const url of ['https://cjmdgrstuaxaimpgxsmv.supabase.co/functions/v1/playerium-session','https://cjmdgrstuaxaimpgxsmv.supabase.co/rest/v1/playerium_events?select=revision,operation','https://oauth2.googleapis.com/token','https://www.googleapis.com/drive/v3/files'])await fetcher(url,{redirect:'error'});
 assert.equal(calls.length,4);
 for(const url of ['https://adyfbxbmfrdetzdxdmmh.supabase.co/rest/v1/playerium_events','https://cjmdgrstuaxaimpgxsmv.supabase.co.example.com/','http://cjmdgrstuaxaimpgxsmv.supabase.co/','https://cjmdgrstuaxaimpgxsmv.supabase.co:8443/','https://user:password@cjmdgrstuaxaimpgxsmv.supabase.co/'])assert.throws(()=>fetcher(url),/Invalid cloud address/);
 assert.equal(calls.length,4);
});

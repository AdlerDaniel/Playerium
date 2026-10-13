const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createCloudFetcher}=require('../desktop-cloud-http');
test('Chromium resumable checkpoints expose 308 without following a redirect or cancelling the upload',async()=>{
 let request;const fetcher=createCloudFetcher({request:()=>{request=new EventEmitter();request.setHeader=()=>{};request.abort=()=>{};request.end=()=>queueMicrotask(()=>{request.emit('redirect',308,'PUT','https://www.googleapis.com/upload/drive/next',{range:['bytes=0-4194303']});request.emit('error',Error('Redirect was cancelled'));});return request;},fetch:()=>{throw Error('net.fetch cannot expose manual redirects');}});
 const response=await fetcher('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',{method:'PUT',redirect:'manual'});assert.equal(response.status,308);assert.equal(response.headers.get('range'),'bytes=0-4194303');
 assert.throws(()=>fetcher('https://example.com/',{}),/Invalid Google address/);
});

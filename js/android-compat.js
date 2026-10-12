// Only loaded by the Android asset build. Modern WebViews retain native APIs.
if (!Promise.allSettled) Promise.allSettled = values => Promise.all(Array.from(values, value => Promise.resolve(value).then(
  value => ({status:'fulfilled',value}), reason => ({status:'rejected',reason})
)));
if (!Array.prototype.at) Object.defineProperty(Array.prototype,'at',{configurable:true,writable:true,value:function(index){
  const n=Math.trunc(Number(index)||0),i=n<0?this.length+n:n;return this[i];
}});
if (!crypto.randomUUID) crypto.randomUUID = () => {
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
for (const prototype of [Element.prototype,DocumentFragment.prototype]) {
  if (!prototype.replaceChildren) Object.defineProperty(prototype,'replaceChildren',{configurable:true,writable:true,value:function(...children){
    while(this.firstChild)this.removeChild(this.firstChild);
    for(const child of children)this.appendChild(child instanceof Node?child:document.createTextNode(String(child)));
  }});
}
for (const method of ['arrayBuffer','text']) {
  if (!Blob.prototype[method]) Object.defineProperty(Blob.prototype,method,{configurable:true,writable:true,value:function(){
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);
      if(method==='text')reader.readAsText(this);else reader.readAsArrayBuffer(this);
    });
  }});
}
if (!AbortSignal.timeout) AbortSignal.timeout = milliseconds => {
  const controller=new AbortController();setTimeout(()=>controller.abort(),milliseconds);return controller.signal;
};

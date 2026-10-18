const cache=new Map();
export async function artworkTint(track){
  const key=track?.pictureBlob||track?.pictureUrl;if(!key)return null;if(cache.has(key))return cache.get(key);
  const job=(async()=>{let image,bitmap=false;
    try{
      if(track.pictureBlob&&globalThis.createImageBitmap){image=await createImageBitmap(track.pictureBlob);bitmap=true;}
      else{image=[...document.images].find(img=>img.complete&&img.naturalWidth>0&&(img.currentSrc===track.pictureUrl||img.src===track.pictureUrl));if(!image)return null;}
      const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,16,16);const data=context.getImageData(0,0,16,16).data;let red=0,green=0,blue=0,total=0;
      for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b),weight=(max-min+16)*data[i+3]/255;if(max<24||min>235)continue;red+=r*weight;green+=g*weight;blue+=b*weight;total+=weight;}
      return total?`${Math.round(red/total)} ${Math.round(green/total)} ${Math.round(blue/total)}`:null;
    }catch{return null;}finally{if(bitmap)image?.close();}
  })();cache.set(key,job);if(cache.size>48)cache.delete(cache.keys().next().value);const tint=await job;if(tint===null)cache.delete(key);return tint;
}

// Only the artwork moves: the page itself stays fixed and readable.
export class CoverTransition{
  constructor(){this.pointer=false;document.addEventListener('pointerdown',()=>this.pointer=true,true);document.addEventListener('keydown',()=>this.pointer=false,true);}
  cancel(){this.cleanup?.();this.cleanup=null;}
  move(source,target){this.cancel();if(!this.pointer||matchMedia('(prefers-reduced-motion:reduce)').matches||!source||!target)return;
    const img=source.querySelector('img'),a=source.getBoundingClientRect(),b=target.getBoundingClientRect();if(!img?.complete||a.width<1||b.width<1)return;
    const clone=img.cloneNode();clone.className='transitioning-artwork';Object.assign(clone.style,{width:a.width+'px',height:a.height+'px'});clone.removeAttribute('id');clone.setAttribute('aria-hidden','true');document.body.append(clone);
    const previous=target.style.visibility;target.style.visibility='hidden';const animation=clone.animate([{transform:`translate(${a.left}px,${a.top}px) scale(1)`,opacity:1},{transform:`translate(${b.left}px,${b.top}px) scale(${b.width/a.width},${b.height/a.height})`,opacity:1}],{duration:220,easing:getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim()||'cubic-bezier(0.23,1,0.32,1)',fill:'both'});
    let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;animation.cancel();clone.remove();target.style.visibility=previous;if(this.cleanup===cleanup)this.cleanup=null;};this.cleanup=cleanup;animation.finished.then(cleanup,cleanup);
  }
}

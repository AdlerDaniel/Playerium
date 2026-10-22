import {icons} from './design-icons.js';

// Enhance shared controls once; audio, queue and sync keep their existing owners.
export function installInterfaceRefresh(ui){
 document.body.classList.add('interface-refresh');
 const queue=document.getElementById('btnToggleQueue');if(queue)queue.innerHTML=icons.queue;
 const fullscreen=document.getElementById('btnCinema');if(fullscreen)fullscreen.innerHTML=icons.expand;
 let pointer=false,animation;
 document.addEventListener('pointerdown',()=>{pointer=true;},{passive:true});
 document.addEventListener('keydown',()=>{pointer=false;});
 const load=ui.loadView.bind(ui);
 ui.loadView=(view,preserveScroll=false)=>{
  animation?.cancel();const previous=ui.currentView,result=load(view,preserveScroll);
  const changed=previous?.type!==view?.type||previous?.id!==view?.id;
  if(pointer&&changed&&!preserveScroll&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   // Opacity does not create a containing block for the viewport's floating controls.
   animation=document.getElementById('mainViewContent').animate([{opacity:.45},{opacity:1}],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
  }
  return result;
 };
 ui.interfaceRefresh={version:150};
 ui.refreshCurrentView();
}

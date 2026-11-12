// Programmatic focus after a click must not draw a keyboard ring.
document.addEventListener('pointerdown',()=>document.body.classList.remove('keyboard-focus'),true);
document.addEventListener('keydown',event=>{if(event.key==='Tab')document.body.classList.add('keyboard-focus');},true);

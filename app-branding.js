(function(root,factory){
  const branding=factory();
  if(typeof module==='object'&&module.exports)module.exports=branding;
  else root.PlayeriumBranding=branding;
})(globalThis,function(){
  function resolveName(language='',region=''){
    const parts=String(language).replace(/_/g,'-').split('-');
    const country=String(region||parts.slice(1).find(part=>/^[A-Za-z]{2}$/.test(part))||'').toUpperCase();
    return parts[0].toLowerCase()==='ru'||country==='RU'?'Проигрыватель':'Playerium';
  }
  let name='Playerium';
  function applyName(value){
    if(!['Playerium','Проигрыватель'].includes(value))return;
    name=value;
    if(typeof document==='undefined')return;
    document.title=name;
    document.querySelectorAll('[data-app-name]').forEach(node=>{if(['Playerium','Проигрыватель'].includes(node.textContent))node.textContent=name;});
    document.querySelectorAll('[data-app-home]').forEach(node=>node.setAttribute('aria-label',name+' — главная'));
  }
  async function refresh(){
    const language=globalThis.navigator?.languages?.[0]||globalThis.navigator?.language||'en';
    applyName(resolveName(language,new Intl.Locale(new Intl.DateTimeFormat().resolvedOptions().locale).region));
    try{
      if(globalThis.AndroidBridge?.getAppName)applyName(globalThis.AndroidBridge.getAppName());
      else if(globalThis.electronAPI?.getWindowState)applyName((await globalThis.electronAPI.getWindowState()).appName);
    }catch{/* Native startup must never block the library. */}
  }
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
    globalThis.addEventListener('languagechange',refresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  }
  return {resolveName,applyName,refresh,getName:()=>name};
});

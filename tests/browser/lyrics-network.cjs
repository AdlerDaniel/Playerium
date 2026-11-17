// Existing catalog tests isolate audio providers; lyrics availability is separate.
module.exports=test=>test.beforeEach(async({page})=>{
 await page.route(/https:\/\/(lrclib\.net|api\.lrcmux\.dev|api\.lyrics\.ovh)\//,route=>route.fulfill({status:404,json:{}}));
 await page.addInitScript(()=>window.addEventListener('load',()=>{
  const catalogs=window.playerApp?.lyrics?.catalogs;
  if(catalogs){catalogs.pageRequest=async()=>({status:404,html:''});catalogs.spacing=0;}
 }));
});

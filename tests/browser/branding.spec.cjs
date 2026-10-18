const {test,expect}=require('@playwright/test');
for(const locale of ['ru-RU','en-US'])test('system branding follows '+locale+' without replacing the current artist',async({browser})=>{
  const context=await browser.newContext({locale});const page=await context.newPage();await page.goto('/');
  const name=locale==='ru-RU'?'Проигрыватель':'Playerium';
  await expect(page).toHaveTitle(name);
  await expect(page.locator('#btnBrandHome')).toHaveAttribute('aria-label',name+' — главная');
  await page.evaluate(()=>{document.getElementById('mobileMiniArtist').textContent='Nirvana';window.dispatchEvent(new Event('languagechange'));});
  await expect(page.locator('#mobileMiniArtist')).toHaveText('Nirvana');
  await context.close();
});

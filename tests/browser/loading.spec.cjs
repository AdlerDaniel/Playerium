const {test,expect}=require('@playwright/test');
test('startup shows themed skeletons before JavaScript loads and removes them when ready',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 let release;const ready=new Promise(resolve=>release=resolve);await page.route('**/js/app.js',async route=>{await ready;await route.continue();});
 await page.goto('/',{waitUntil:'commit'});await expect(page.locator('.boot-skeleton')).toBeVisible();
 const placeholder=page.locator('.boot-skeleton .skeleton').first();expect(await placeholder.evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
 release();await page.waitForFunction(()=>window.playerApp?.ui.history.length);await expect(page.locator('.boot-skeleton')).toHaveCount(0);
});

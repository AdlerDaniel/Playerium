// Existing catalog tests isolate audio providers; lyrics availability is separate.
module.exports=test=>test.beforeEach(async({page})=>{await page.route(/https:\/\/(lrclib\.net|api\.lrcmux\.dev|api\.lyrics\.ovh)\//,route=>route.fulfill({status:404,json:{}}));});

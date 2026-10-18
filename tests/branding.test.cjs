const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveName}=require('../app-branding');
const {systemName}=require('../desktop-branding');
test('application display name follows Russian language or region without treating secondary languages as primary',()=>{
  for(const [language,region,name] of [
    ['ru-RU','RU','Проигрыватель'],['ru-UA','UA','Проигрыватель'],
    ['en-US','RU','Проигрыватель'],['de-RU','','Проигрыватель'],
    ['en-US','US','Playerium'],['uk-UA','UA','Playerium'],['de-DE','DE','Playerium'],
    ['ru_KZ','KZ','Проигрыватель']
  ])assert.equal(resolveName(language,region),name);
  const app={getPreferredSystemLanguages:()=>['en-US','ru-RU'],getSystemLocale:()=> 'en-US',getLocaleCountryCode:()=> 'US'};
  assert.equal(systemName(app,{platform:'test'}),'Playerium');
  app.getLocaleCountryCode=()=> 'RU';assert.equal(systemName(app,{platform:'test'}),'Проигрыватель');
});

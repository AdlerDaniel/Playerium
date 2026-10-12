const fs = require('node:fs');
const {transformSync} = require('esbuild');
const target = 'android/app/src/main/assets';
fs.mkdirSync(target, { recursive: true });
for (const removed of ['js/lyrics.js', 'css/lyrics.css']) fs.rmSync(`${target}/${removed}`, { force: true });
for (const file of ['index.html','migration.html','js','css','assets']) fs.cpSync(file, `${target}/${file}`, { recursive: true });
fs.copyFileSync('MUSIC-NOTICES.md',`${target}/MUSIC-NOTICES.md`);
// Android 10's bundled WebView predates optional chaining and nullish assignment.
// Keep the editable modules while lowering their syntax for supported devices.
for (const name of fs.readdirSync(`${target}/js`).filter(name => name.endsWith('.js'))) {
  const path = `${target}/js/${name}`;
  const {code} = transformSync(fs.readFileSync(path,'utf8'), {target:'chrome74',format:'esm',charset:'utf8'});
  fs.writeFileSync(path,code);
}
const index = `${target}/index.html`;
fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('<script type="module" src="js/app.js">','<script src="js/android-compat.js"></script>\n  <script type="module" src="js/app.js">'));

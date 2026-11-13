const fs = require('node:fs');
const {transformSync} = require('esbuild');
const target = 'android/app/src/main/assets';
fs.mkdirSync(target, { recursive: true });
const retiredAssets = [
  "js/lyrics.js",
  "css/lyrics.css",
  "js/equalizer.js",
  "js/native-equalizer.js",
  "js/cloud-model.js",
  "js/cloud-settings.js",
  "js/cloud-sync.js",
  "js/connect-controller.js",
  "js/connect-rtc.js",
  "js/realtime-config.js",
  "js/realtime-sync.js",
  "js/audio-preparation.js",
  "js/normalization-settings.js",
  "js/loudness.js",
  "js/loudness-worker.js",
  "js/vendor/realtime.js",
  "js/vendor/realtime.LICENSE.txt",
  "css/cloud.css",
  "css/connect.css",
];
for (const removed of retiredAssets) fs.rmSync(`${target}/${removed}`, { force: true });
for (const file of ['index.html','migration.html','app-branding.js','js','css','assets']) fs.cpSync(file, `${target}/${file}`, { recursive: true });
fs.rmSync(`${target}/assets/icon-master.png`,{force:true});
fs.copyFileSync('MUSIC-NOTICES.md',`${target}/MUSIC-NOTICES.md`);
fs.writeFileSync(`${target}/app-branding.js`,transformSync(fs.readFileSync('app-branding.js','utf8'),{target:'chrome74',charset:'utf8'}).code);
// Android 10's bundled WebView predates optional chaining and nullish assignment.
// Keep the editable modules while lowering their syntax for supported devices.
for (const name of fs.readdirSync(`${target}/js`).filter(name => name.endsWith('.js'))) {
  const path = `${target}/js/${name}`;
  const {code} = transformSync(fs.readFileSync(path,'utf8'), {target:'chrome74',format:'esm',charset:'utf8'});
  fs.writeFileSync(path,code);
}
const index = `${target}/index.html`;
fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('<script type="module" src="js/app.js">','<script src="js/android-compat.js"></script>\n  <script type="module" src="js/app.js">'));

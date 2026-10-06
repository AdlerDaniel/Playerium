const fs = require('node:fs');
const target = 'android/app/src/main/assets';
fs.mkdirSync(target, { recursive: true });
for (const removed of ['js/lyrics.js', 'css/lyrics.css']) fs.rmSync(`${target}/${removed}`, { force: true });
for (const file of ['index.html','migration.html','js','css','assets']) fs.cpSync(file, `${target}/${file}`, { recursive: true });
fs.copyFileSync('MUSIC-NOTICES.md',`${target}/MUSIC-NOTICES.md`);

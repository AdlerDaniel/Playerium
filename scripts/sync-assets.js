const fs = require('node:fs');
const target = 'android/app/src/main/assets';
fs.mkdirSync(target, { recursive: true });
for (const file of ['index.html','migration.html','js','css','assets']) fs.cpSync(file, `${target}/${file}`, { recursive: true });

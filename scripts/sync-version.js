const fs = require('node:fs');
const version = require('../package.json').version;
const gradle = 'android/app/build.gradle';
fs.writeFileSync(gradle, fs.readFileSync(gradle, 'utf8').replace(/versionName "[^"]+"/, `versionName "${version}"`));
const updater = 'js/updater.js';
fs.writeFileSync(updater, fs.readFileSync(updater, 'utf8').replace(/CURRENT_VERSION = "[^"]+"/, `CURRENT_VERSION = "${version}"`));

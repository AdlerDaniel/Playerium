const { readdirSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
for (const file of ['main.js', 'preload.js', 'desktop-files.js', 'desktop-updater.js', 'desktop-music.js', ...readdirSync('scripts').filter(x => x.endsWith('.js')).map(x => `scripts/${x}`)]) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
for (const file of readdirSync('js').filter(x => x.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(`js/${file}`), stdio: ['pipe', 'inherit', 'inherit'] });
  if (result.status) process.exit(result.status);
}
const version = require('../package.json').version;
if (!readFileSync('js/updater.js','utf8').includes(`CURRENT_VERSION = "${version}"`) || !readFileSync('android/app/build.gradle','utf8').includes(`versionName "${version}"`)) throw new Error('Run npm run version:sync');
console.log('Syntax and version checks passed');
